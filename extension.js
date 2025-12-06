const St = imports.gi.St;
const Main = imports.ui.main;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const UPower = imports.gi.UPowerGlib;
const Soup = imports.gi.Soup;
const MessageTray = imports.ui.messageTray;
const Shell = imports.gi.Shell;

// --- BIẾN TOÀN CỤC ---
let notchController;
let dateMenuActor = null;
let dateMenuOriginalParent = null;

// ============================================
// 1. MODEL - Xử lý Dữ liệu (BatteryManager)
// ============================================
/**
 * Quản lý thông tin pin (Model).
 * Tương tác với D-Bus của UPower để lấy trạng thái pin.
 */
class BatteryManager {
    constructor() {
        this._proxy = null;
        this._signalId = null;
        this._callbacks = [];

        this._initProxy();
    }

    _initProxy() {
        // Định nghĩa interface D-Bus cho UPower Device
        let BatteryProxyInterface = `
            <node>
                <interface name="org.freedesktop.UPower.Device">
                    <property name="Percentage" type="d" access="read"/>
                    <property name="State" type="u" access="read"/>
                    <property name="IsPresent" type="b" access="read"/>
                </interface>
            </node>
        `;

        const BatteryProxy = Gio.DBusProxy.makeProxyWrapper(BatteryProxyInterface);

        // Tạo Proxy tới Display Device của UPower qua System Bus
        this._proxy = new BatteryProxy(
            Gio.DBus.system,
            'org.freedesktop.UPower',
            '/org/freedesktop/UPower/devices/DisplayDevice'
        );

        // Lắng nghe thay đổi thuộc tính
        this._signalId = this._proxy.connect('g-properties-changed', () => {
            this._notifyCallbacks();
        });
    }

    addCallback(callback) {
        this._callbacks.push(callback);
    }

    _notifyCallbacks() {
        const info = this.getBatteryInfo();
        this._callbacks.forEach(cb => cb(info));
    }

    getBatteryInfo() {
        if (!this._proxy) {
            return {percentage: 0, isCharging: false, isPresent: false};
        }

        const percentage = Math.round(this._proxy.Percentage || 0);
        const state = this._proxy.State || 0;
        const isPresent = this._proxy.IsPresent || false;

        const isCharging = (state === UPower.DeviceState.CHARGING || state === UPower.DeviceState.FULLY_CHARGED);

        return {
            percentage: percentage,
            isCharging: isCharging,
            isPresent: isPresent
        };
    }

    destroy() {
        if (this._signalId && this._proxy) {
            this._proxy.disconnect(this._signalId);
            this._signalId = null;
        }
        this._proxy = null;
        this._callbacks = [];
    }
}

// ============================================
// 1B. MODEL - Xử lý Bluetooth (BluetoothManager)
// ============================================
/**
 * Quản lý thông tin Bluetooth (Model).
 * Tương tác với D-Bus của BlueZ sử dụng XML Interface và ObjectManager.
 */
class BluetoothManager {
    constructor() {
        this._callbacks = [];
        this._devices = new Map();
        this._objectManager = null;
        this._destroyed = false;
        this._isInitializing = true; // FIX: Cờ để bỏ qua notifications khi khởi tạo

        this._initProxies();
    }

    _initProxies() {
        // 1. Định nghĩa Interface cho Device
        const DeviceInterface = `
            <node>
                <interface name="org.bluez.Device1">
                    <property name="Connected" type="b" access="read"/>
                    <property name="Alias" type="s" access="read"/>
                    <property name="Icon" type="s" access="read"/>
                    <property name="Paired" type="b" access="read"/>
                    <property name="Trusted" type="b" access="read"/>
                </interface>
            </node>
        `;
        this.DeviceProxy = Gio.DBusProxy.makeProxyWrapper(DeviceInterface);

        // 2. Định nghĩa Interface cho ObjectManager
        const ObjectManagerInterface = `
            <node>
                <interface name="org.freedesktop.DBus.ObjectManager">
                    <method name="GetManagedObjects">
                        <arg type="a{oa{sa{sv}}}" name="objects" direction="out"/>
                    </method>
                    <signal name="InterfacesAdded">
                        <arg type="o" name="object_path"/>
                        <arg type="a{sa{sv}}" name="interfaces_and_properties"/>
                    </signal>
                    <signal name="InterfacesRemoved">
                        <arg type="o" name="object_path"/>
                        <arg type="as" name="interfaces"/>
                    </signal>
                </interface>
            </node>
        `;
        const ObjectManagerProxy = Gio.DBusProxy.makeProxyWrapper(ObjectManagerInterface);

        // 3. Kết nối tới ObjectManager của BlueZ
        this._objectManager = new ObjectManagerProxy(
            Gio.DBus.system,
            'org.bluez',
            '/'
        );

        // 4. Lắng nghe tín hiệu thêm/xóa thiết bị
        this._objectManager.connectSignal('InterfacesAdded', (proxy, senderName, [objectPath, interfaces]) => {
            this._onInterfacesAdded(objectPath, interfaces);
        });

        this._objectManager.connectSignal('InterfacesRemoved', (proxy, senderName, [objectPath, interfaces]) => {
            this._onInterfacesRemoved(objectPath, interfaces);
        });

        // 5. Lấy danh sách thiết bị hiện tại
        this._syncDevices();


    }

    _syncDevices() {
        if (!this._objectManager) return;

        this._objectManager.GetManagedObjectsRemote((result, error) => {
            if (this._destroyed) return;
            if (error) {
                return;
            }

            const objects = result[0];
            for (const path in objects) {
                this._onInterfacesAdded(path, objects[path]);
            }

            // FIX: Sau khi sync xong tất cả devices, mới bật notifications
            imports.mainloop.timeout_add(1000, () => {
                this._isInitializing = false;
                return false;
            });
        });
    }

    _onInterfacesAdded(objectPath, interfaces) {
        if (this._destroyed) return;
        const deviceProps = interfaces['org.bluez.Device1'];
        if (deviceProps) {
            // FIX: Chỉ add device nếu đã Paired hoặc Trusted
            const getValue = (prop) => (prop && prop.deep_unpack) ? prop.deep_unpack() : prop;

            const isPaired = deviceProps['Paired'] ? Boolean(getValue(deviceProps['Paired'])) : false;
            const isTrusted = deviceProps['Trusted'] ? Boolean(getValue(deviceProps['Trusted'])) : false;

            if (isPaired || isTrusted) {
                this._addDevice(objectPath);
            }
        }
    }

    _onInterfacesRemoved(objectPath, interfaces) {
        if (this._destroyed) return;
        if (interfaces.includes('org.bluez.Device1')) {
            this._removeDevice(objectPath);
        }
    }

    _addDevice(path) {
        if (this._devices.has(path)) return;

        const deviceProxy = new this.DeviceProxy(
            Gio.DBus.system,
            'org.bluez',
            path,
            (proxy, error) => {
                if (error) {
                }
            }
        );

        // Lắng nghe thay đổi thuộc tính
        const signalId = deviceProxy.connect('g-properties-changed', (proxy, changed, invalidated) => {
            this._onDevicePropertiesChanged(proxy, changed);
        });

        deviceProxy._signalId = signalId;
        this._devices.set(path, deviceProxy);
    }

    _removeDevice(path) {
        const deviceProxy = this._devices.get(path);
        if (deviceProxy) {
            if (deviceProxy._signalId) {
                deviceProxy.disconnect(deviceProxy._signalId);
            }
            this._devices.delete(path);
        }
    }

    _onDevicePropertiesChanged(proxy, changedProperties) {
        if (this._destroyed) return;

        // FIX: Bỏ qua notifications trong lúc khởi tạo
        if (this._isInitializing) {
            return;
        }

        // changedProperties là GLib.Variant (a{sv})
        const changed = changedProperties.deep_unpack();
        if ('Connected' in changed) {

            // FIX: Chỉ notify cho device đã paired hoặc trusted
            const isPaired = proxy.Paired || false;
            const isTrusted = proxy.Trusted || false;

            if (!isPaired && !isTrusted) {
                return;
            }

            let rawConnected = changed['Connected'];

            // FIX: Xử lý đúng cả GVariant và boolean thô
            let isConnected;
            if (rawConnected && typeof rawConnected.deep_unpack === 'function') {
                isConnected = Boolean(rawConnected.deep_unpack());
            } else {
                isConnected = Boolean(rawConnected);
            }

            const alias = proxy.Alias || 'Unknown Device';
            const deviceIcon = proxy.Icon || ''; // Lấy loại thiết bị từ BlueZ

            // LUÔN gọi callback cho cả connect và disconnect
            this._notifyCallbacks({
                deviceName: alias,
                isConnected: isConnected,
                deviceType: deviceIcon // Thêm thông tin loại thiết bị
            });
        }
    }

    addCallback(callback) {
        this._callbacks.push(callback);
    }

    _notifyCallbacks(info) {
        this._callbacks.forEach(cb => cb(info));
    }

    /**
     * Kiểm tra xem có tai nghe nào đang kết nối không
     * @returns {boolean}
     */
    hasConnectedHeadset() {
        let hasHeadset = false;
        this._devices.forEach((proxy) => {
            if (hasHeadset) return; // Đã tìm thấy

            // Kiểm tra kết nối
            let isConnected = false;
            if (proxy.Connected) {
                // Xử lý GVariant hoặc boolean
                const rawConnected = proxy.Connected;
                if (rawConnected && typeof rawConnected.deep_unpack === 'function') {
                    isConnected = Boolean(rawConnected.deep_unpack());
                } else {
                    isConnected = Boolean(rawConnected);
                }
            }

            if (isConnected) {
                const icon = proxy.Icon || '';
                if (icon.includes('headset') ||
                    icon.includes('headphones') ||
                    icon.includes('earbuds') ||
                    icon.includes('audio-card')) { // Một số tai nghe hiện là audio-card
                    hasHeadset = true;
                }
            }
        });
        return hasHeadset;
    }

    destroy() {
        this._destroyed = true;

        this._devices.forEach((proxy) => {
            if (proxy._signalId) proxy.disconnect(proxy._signalId);
        });
        this._devices.clear();

        if (this._objectManager) {
            this._objectManager = null;
        }

        this._callbacks = [];
    }
}

// ============================================
// 2. VIEW - Xử lý Giao diện (BatteryView)
// ============================================
class BatteryView {
    constructor() {
        this._buildCompactView();
        this._buildExpandedView();
        this._buildMinimalView();
    }

    _buildMinimalView() {
        this.secondaryIcon = new St.Icon({
            icon_name: 'battery-good-symbolic',
            icon_size: 24,
            style_class: 'battery-icon-secondary',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });

        this.secondaryContainer = new St.Bin({
            child: this.secondaryIcon,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'battery-minimal-container'
        });
    }

    _buildCompactView() {
        this.iconLeft = new St.Icon({
            icon_name: 'battery-good-symbolic',
            icon_size: 24,
            x_align: Clutter.ActorAlign.START
        });

        this.iconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            style: 'padding-left: 16px;',
        });
        this.iconWrapper.set_child(this.iconLeft);

        this.percentageLabel = new St.Label({
            text: '0%',
            style: 'color: white; font-size: 14px; font-weight: bold; padding-right: 16px;',
            x_align: Clutter.ActorAlign.END
        });

        this.percentageWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true
        });
        this.percentageWrapper.set_child(this.percentageLabel);

        this.compactContainer = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: true,
        });
        this.compactContainer.add_child(this.iconWrapper);
        this.compactContainer.add_child(this.percentageWrapper);
    }

    _buildExpandedView() {
        this.iconExpanded = new St.Icon({
            icon_name: 'battery-good-symbolic',
            icon_size: 64,
        });

        this.statusLabel = new St.Label({
            text: 'Charging...',
            style: 'color: white; font-size: 18px; font-weight: bold; margin-top: 10px;'
        });

        this.expandedContainer = new St.BoxLayout({
            style_class: 'battery-expanded',
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            visible: false
        });
        this.expandedContainer.add_child(this.iconExpanded);
        this.expandedContainer.add_child(this.statusLabel);
    }

    updateBattery(batteryInfo) {
        const {percentage, isCharging, isPresent} = batteryInfo;
        let iconName;

        if (!isPresent) {
            this.percentageLabel.set_text('AC');
            this.iconLeft.icon_name = 'battery-missing-symbolic';
            this.iconExpanded.icon_name = 'battery-missing-symbolic';
            this.iconLeft.set_style(`color: #ffffff;`);
            this.iconExpanded.set_style(`color: #ffffff;`);
            this.statusLabel.set_text('AC Power');
            return;
        }

        this.percentageLabel.set_text(`${percentage}%`);

        if (isCharging) {
            iconName = 'battery-charging-symbolic';
        } else if (percentage === 100) {
            iconName = 'battery-full-charged-symbolic';
        } else if (percentage >= 90) {
            iconName = 'battery-full-symbolic';
        } else if (percentage >= 60) {
            iconName = 'battery-good-symbolic';
        } else if (percentage >= 30) {
            iconName = 'battery-low-symbolic';
        } else {
            iconName = 'battery-empty-symbolic';
        }

        this.iconLeft.icon_name = iconName;
        this.iconExpanded.icon_name = iconName;
        if (this.secondaryIcon) this.secondaryIcon.icon_name = iconName;

        const color = this._getBatteryColor(percentage);
        const statusClass = this._getBatteryStatusClass(percentage, isCharging);

        this.iconLeft.set_style(`color: ${color};`);
        this.iconExpanded.set_style(`color: ${color};`);
        if (this.secondaryIcon) this.secondaryIcon.set_style(`color: ${color};`);

        this.percentageLabel.style_class = `text-shadow ${statusClass}`;

        if (isCharging) {
            this.statusLabel.set_text(`⚡ Charging - ${percentage}%`);
            this.iconExpanded.style_class = 'icon-glow battery-charging';
        } else {
            this.statusLabel.set_text(`Battery: ${percentage}%`);
            this.iconExpanded.style_class = statusClass;
        }
    }

    _getBatteryColor(percentage) {
        if (percentage > 60) return '#00ff00';
        if (percentage > 30) return '#ffff00';
        return '#ff0000';
    }

    _getBatteryStatusClass(percentage, isCharging) {
        if (isCharging) return 'battery-charging';
        if (percentage <= 20) return 'battery-low';
        if (percentage === 100) return 'battery-full';
        return '';
    }

    destroy() {
        if (this.compactContainer) {
            this.compactContainer.destroy();
        }
        if (this.expandedContainer) {
            this.expandedContainer.destroy();
        }
    }
}

// ============================================
// 2B. VIEW - Xử lý Giao diện Bluetooth (BluetoothView)
// ============================================
class BluetoothView {
    constructor() {
        this._buildCompactView();
        this._buildExpandedView();
    }

    _buildCompactView() {
        this.icon = new St.Icon({
            icon_name: 'bluetooth-active-symbolic',
            icon_size: 20,
        });

        this.compactContainer = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            visible: false,
        });
        this.compactContainer.set_child(this.icon);
    }

    _buildExpandedView() {
        // Icon lớn
        this.expandedIcon = new St.Icon({
            icon_name: 'bluetooth-active-symbolic',
            icon_size: 64,
        });

        this.expandedIconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.expandedIconWrapper.set_child(this.expandedIcon);

        // Text
        this.statusLabel = new St.Label({
            text: 'Connected',
            style: 'color: white; font-size: 18px; font-weight: bold;'
        });

        this.deviceLabel = new St.Label({
            text: '',
            style: 'color: rgba(255,255,255,0.8); font-size: 14px; margin-top: 5px;'
        });

        const textBox = new St.BoxLayout({
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.START,
        });
        textBox.add_child(this.statusLabel);
        textBox.add_child(this.deviceLabel);

        this.textWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.textWrapper.set_child(textBox);

        // ✅ TẠO SẴN EXPANDED CONTAINER NGAY TẠY ĐÂY
        this.expandedContainer = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: true,
            style: 'spacing: 20px; padding: 20px;',
            visible: false  // Ẩn mặc định
        });
        this.expandedContainer.add_child(this.expandedIconWrapper);
        this.expandedContainer.add_child(this.textWrapper);
    }

    /**
     * Cập nhật UI với thông tin Bluetooth mới.
     * @param {{deviceName: string, isConnected: boolean, deviceType: string}} bluetoothInfo
     */
    updateBluetooth(bluetoothInfo) {
        const {deviceName, isConnected, deviceType} = bluetoothInfo;

        // Xác định icon dựa trên loại thiết bị
        let iconName = this._getDeviceIcon(deviceType, isConnected);

        // FIX: Hiển thị rõ ràng cả trạng thái connected và disconnected
        if (isConnected) {
            this.statusLabel.set_text('✓ Connected!');
            this.expandedIcon.icon_name = iconName;
            this.expandedIcon.set_style('color: #00aaff;'); // Xanh dương
            this.icon.icon_name = iconName;
            this.icon.set_style('color: #00aaff;');
        } else {
            this.statusLabel.set_text('✗ Disconnected!');
            // Khi disconnect, vẫn giữ icon phù hợp nhưng chuyển sang disabled
            if (deviceType && deviceType.includes('audio')) {
                iconName = 'audio-headphones-symbolic';
            } else if (deviceType && deviceType.includes('mouse')) {
                iconName = 'input-mouse-symbolic';
            } else {
                iconName = 'bluetooth-disabled-symbolic';
            }
            this.expandedIcon.icon_name = iconName;
            this.expandedIcon.set_style('color: #ff6666;'); // Đỏ nhạt
            this.icon.icon_name = iconName;
            this.icon.set_style('color: #ff6666;');
        }

        this.deviceLabel.set_text(deviceName);
    }

    /**
     * Lấy icon phù hợp dựa trên loại thiết bị
     * @param {string} deviceType - Loại thiết bị từ BlueZ (vd: "audio-headset", "input-mouse")
     * @param {boolean} isConnected - Trạng thái kết nối
     * @returns {string} Tên icon
     */
    _getDeviceIcon(deviceType, isConnected) {
        if (!deviceType) {
            return isConnected ? 'bluetooth-active-symbolic' : 'bluetooth-disabled-symbolic';
        }

        // Phân biệt theo loại thiết bị
        if (deviceType.includes('mouse')) {
            return 'input-mouse-symbolic'; // Icon chuột
        } else if (deviceType.includes('audio-headset') ||
            deviceType.includes('audio-headphones') ||
            deviceType.includes('audio-earbuds')) {
            return 'audio-headphones-symbolic'; // Icon tai nghe/earpod
        } else if (deviceType.includes('audio')) {
            return 'audio-speakers-symbolic'; // Icon loa cho các thiết bị audio khác
        } else {
            // Các thiết bị khác (bàn phím, điện thoại, v.v.)
            return isConnected ? 'bluetooth-active-symbolic' : 'bluetooth-disabled-symbolic';
        }
    }

    show() {
        this.compactContainer.show();
        this.expandedContainer.show();  // Show cả expanded container
    }

    hide() {
        this.compactContainer.hide();
        this.expandedContainer.hide();  // Hide cả expanded container
    }

    destroy() {
        if (this.compactContainer) {
            this.compactContainer.destroy();
        }
        if (this.expandedContainer) {  // Destroy expanded container
            this.expandedContainer.destroy();
        }
    }
}

// ============================================
// 1C. MODEL - Xử lý Media Player (MediaManager)
// ============================================
/**
 * Quản lý thông tin Media Player (Model).
 * Tương tác với D-Bus của MPRIS để lấy thông tin media player.
 * Sử dụng XML interface definitions để giảm callback.
 */
class MediaManager {
    constructor() {
        this._callbacks = [];
        this._playerProxy = null;
        this._playerProxySignal = null;
        this._dbusProxy = null;
        this._dbusSignalId = null;
        this._playbackStatus = null;
        this._currentMetadata = null;
        this._currentArtPath = null;
        this._checkTimeoutId = null;
        this._httpSession = new Soup.Session();
        this._artCache = new Map(); // URL -> local path
        this._destroyed = false;
        this._pendingUpdate = null; // Batch updates
        this._playerListeners = [];
        this._currentPlayer = null;

        // Define XML interfaces
        this._defineInterfaces();
        this._setupDBusNameOwnerChanged();
        this._watchForMediaPlayers();
    }

    _defineInterfaces() {
        // MPRIS Player Interface
        const MPRIS_PLAYER_INTERFACE = `
        <node>
            <interface name="org.mpris.MediaPlayer2.Player">
                <property name="PlaybackStatus" type="s" access="read"/>
                <property name="Metadata" type="a{sv}" access="read"/>
                <method name="PlayPause"/>
                <method name="Next"/>
                <method name="Previous"/>
            </interface>
        </node>`;

        // DBus Interface for NameOwnerChanged
        const DBUS_INTERFACE = `
        <node>
            <interface name="org.freedesktop.DBus">
                <signal name="NameOwnerChanged">
                    <arg type="s" name="name"/>
                    <arg type="s" name="old_owner"/>
                    <arg type="s" name="new_owner"/>
                </signal>
            </interface>
        </node>`;

        this.MprisPlayerProxy = Gio.DBusProxy.makeProxyWrapper(MPRIS_PLAYER_INTERFACE);
        this.DBusProxy = Gio.DBusProxy.makeProxyWrapper(DBUS_INTERFACE);
    }

    _setupDBusNameOwnerChanged() {
        this._dbusProxy = new this.DBusProxy(
            Gio.DBus.session,
            'org.freedesktop.DBus',
            '/org/freedesktop/DBus',
            (proxy, error) => {
                if (error) {
                    return;
                }

                this._dbusSignalId = proxy.connectSignal('NameOwnerChanged', (proxy, sender, [name, oldOwner, newOwner]) => {
                    if (name && name.startsWith('org.mpris.MediaPlayer2.')) {
                        // Filter out invalid MPRIS services (like Bluetooth devices that register as MPRIS)
                        const invalidPatterns = ['bluetooth', 'mouse', 'keyboard', 'input', 'device'];
                        const nameLower = name.toLowerCase();
                        const isInvalid = invalidPatterns.some(pattern => nameLower.includes(pattern));

                        if (isInvalid) {
                            // Skip invalid services silently
                            return;
                        }

                        if (newOwner && !oldOwner) {
                            log(`[DynamicIsland] New player appeared: ${name}`);
                            this._disconnectPlayer();
                            this._connectToPlayer(name);
                            this._playerListeners.push(name);
                        } else if (oldOwner && !newOwner) {
                            log(`[DynamicIsland] Player disappeared: ${name}`);
                            // If the disconnected player was our current one
                            this._disconnectPlayer();
                            this._playerListeners = this._playerListeners.filter(player => player !== name);
                            if (this._playerListeners.length > 0) {
                                this._connectToPlayer(this._playerListeners[0]);
                            }

                        }
                    }
                });
            }
        );
    }

    _watchForMediaPlayers() {
        Gio.DBus.session.call(
            'org.freedesktop.DBus',
            '/org/freedesktop/DBus',
            'org.freedesktop.DBus',
            'ListNames',
            null,
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null,
            (conn, res) => {
                try {
                    const reply = conn.call_finish(res);
                    const names = reply.deep_unpack()[0];
                    // Filter out invalid MPRIS services (like Bluetooth devices)
                    const invalidPatterns = ['bluetooth', 'mouse', 'keyboard', 'input', 'device'];
                    this._playerListeners = names.filter(n => {
                        if (!n.includes('org.mpris.MediaPlayer2.')) return false;
                        const nLower = n.toLowerCase();
                        return !invalidPatterns.some(pattern => nLower.includes(pattern));
                    });
                    log(`[DynamicIsland] MediaManager: Found ${this._playerListeners.length} media player(s)`);
                    if (this._playerListeners.length > 0) {
                        this._connectToPlayer(this._playerListeners[0]);
                    }
                } catch (e) {
                    log(`[DynamicIsland] _watchForMediaPlayers error: ${e}`);
                }
            }
        );
    }

    _connectToPlayer(busName) {
        log(`[DynamicIsland] MediaManager: Connecting to player ${busName}...`);
        this._currentPlayer = busName
        // Use XML-defined proxy wrapper
        this._playerProxy = new this.MprisPlayerProxy(
            Gio.DBus.session,
            busName,
            '/org/mpris/MediaPlayer2',
            (proxy, error) => {
                if (error) {
                    log(`[DynamicIsland] Failed to connect to player: ${error.message}`);
                    return;
                }

                log(`[DynamicIsland] MediaManager: Connected to player ${busName}, setting up property change listener`);
                // Single callback for all property changes
                this._playerProxySignal = proxy.connect('g-properties-changed', (proxy, changed, invalidated) => {
                    if (this._destroyed) return;
                    this._handlePropertiesChanged(changed);
                });

                // Initial update - batch both metadata and playback status
                this._performInitialUpdate();
            }
        );
    }

    _performInitialUpdate() {
        if (!this._playerProxy) return;

        const metadata = this._playerProxy.Metadata;
        const playbackStatus = this._playerProxy.PlaybackStatus;

        if (metadata || playbackStatus) {
            this._batchUpdate({
                metadata: metadata,
                playbackStatus: playbackStatus
            });
        }
    }

    _handlePropertiesChanged(changed) {
        if (!changed) return;

        try {
            const changedProps = changed.deep_unpack ? changed.deep_unpack() : changed;
            log(`[DynamicIsland] MediaManager: Properties changed - ${JSON.stringify(Object.keys(changedProps))}`);

            // Batch all changes into a single update
            const updates = {};

            if ('Metadata' in changedProps) {
                updates.metadata = changedProps.Metadata;
            }

            if ('PlaybackStatus' in changedProps) {
                updates.playbackStatus = changedProps.PlaybackStatus;
            }

            if (Object.keys(updates).length > 0) {
                this._batchUpdate(updates);
            }
        } catch (e) {
            // Ignore errors if destroyed
        }
    }

    _batchUpdate(updates) {
        // Cancel pending update if exists
        if (this._pendingUpdate) {
            imports.mainloop.source_remove(this._pendingUpdate);
            this._pendingUpdate = null;
        }

        // Merge updates
        if (updates.metadata) {
            const unpackedMetadata = updates.metadata.deep_unpack ? updates.metadata.deep_unpack() : updates.metadata;
            this._currentMetadata = unpackedMetadata;

            // Handle art URL
            const artUrl = this._extractArtUrl(unpackedMetadata);
            if (artUrl) {
                if (artUrl.startsWith('http')) {
                    if (this._artCache.has(artUrl)) {
                        this._currentArtPath = this._artCache.get(artUrl);
                    } else {
                        // Download async but don't notify yet
                        this._downloadImage(artUrl, (data) => {
                            const path = this._saveAndCacheImage(artUrl, data);
                            if (path) {
                                this._currentArtPath = path;
                                this._scheduleNotify();
                            }
                        });
                        this._currentArtPath = null;
                    }
                } else {
                    this._currentArtPath = artUrl;
                }
            } else {
                this._currentArtPath = null;
            }
        }

        if (updates.playbackStatus) {
            const unpackedStatus = updates.playbackStatus.deep_unpack ?
                updates.playbackStatus.deep_unpack() :
                (updates.playbackStatus.unpack ? updates.playbackStatus.unpack() : updates.playbackStatus);
            this._playbackStatus = unpackedStatus;
        }

        // Schedule a single notification
        this._scheduleNotify();
    }

    _scheduleNotify() {
        // Debounce notifications - wait 50ms for more updates
        if (this._pendingUpdate) {
            imports.mainloop.source_remove(this._pendingUpdate);
        }

        this._pendingUpdate = imports.mainloop.timeout_add(50, () => {
            this._pendingUpdate = null;
            this._notifyCallbacks({
                isPlaying: this._playbackStatus === 'Playing',
                metadata: this._currentMetadata,
                playbackStatus: this._playbackStatus,
                artPath: this._currentArtPath
            });
            return false;
        });
    }

    _disconnectPlayer() {
        if (this._playerProxy) {
            if (this._playerProxySignal) {
                this._playerProxy.disconnect(this._playerProxySignal);
                this._playerProxySignal = null;
            }
            this._playerProxy = null;
        }

        this._playbackStatus = null;
        this._currentMetadata = null;
        this._currentArtPath = null;

        // Clear pending update
        if (this._pendingUpdate) {
            imports.mainloop.source_remove(this._pendingUpdate);
            this._pendingUpdate = null;
        }

        // Notify với metadata và artPath = null để trigger switch về battery
        this._notifyCallbacks({
            isPlaying: false,
            metadata: null,
            playbackStatus: null,
            artPath: null
        });
    }

    _extractMetadataValue(metadata, keys) {
        try {
            if (!metadata) return null;
            for (const key of keys) {
                if (metadata[key]) {
                    const value = metadata[key];
                    return value.unpack ? value.unpack() : value.toString();
                }
            }
        } catch (e) {
            // Ignore extraction errors
        }
        return null;
    }

    _extractArtUrl(metadata) {
        return this._extractMetadataValue(metadata, ['mpris:artUrl', 'xesam:artUrl', 'mpris:arturl']);
    }

    _extractTitle(metadata) {
        return this._extractMetadataValue(metadata, ['xesam:title', 'mpris:title']);
    }

    getMediaUrl(metadata) {
        const url = this._extractMetadataValue(metadata, [
            'xesam:url',
            'mpris:url'
        ]);
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            return url;
        }
        return null;
    }

    _extractArtist(metadata) {
        try {
            if (!metadata) return null;

            // Try xesam:artist first (most common)
            const keys = ['xesam:artist', 'xesam:albumArtist'];
            for (const key of keys) {
                const value = metadata[key];

                if (value !== undefined && value !== null) {
                    // Unpack the GVariant
                    const unpacked = value.unpack ? value.unpack() : value;

                    // xesam:artist is usually an array of strings
                    if (Array.isArray(unpacked)) {
                        // Each item might still be a GVariant, need to unpack
                        const artists = unpacked.map(item => {
                            if (item && typeof item === 'object' && (item.unpack || item.deep_unpack)) {
                                return item.unpack ? item.unpack() : item.deep_unpack();
                            }
                            return item;
                        }).filter(a => typeof a === 'string' && a.length > 0);

                        if (artists.length > 0) {
                            return artists.join(', ');
                        }
                    } else if (typeof unpacked === 'string') {
                        return unpacked;
                    }
                }
            }
        } catch (e) {
            // Silently fail
        }
        return null;
    }

    _downloadImage(url, callback) {

        const msg = Soup.Message.new('GET', url);

        // Nếu session có send_and_read_async → Soup 3
        if (this._httpSession.send_and_read_async) {
            this._httpSession.send_and_read_async(
                msg,
                GLib.PRIORITY_DEFAULT,
                null,
                (session, result) => {
                    try {
                        const bytes = session.send_and_read_finish(result);
                        const data = bytes.get_data();   // Uint8Array
                        callback(data);
                    } catch (e) {
                        callback(null);
                    }
                }
            );
            return;
        }

        // Còn lại là Soup 2
        this._httpSession.queue_message(msg, (session, message) => {
            try {
                if (message.status_code === 200 && message.response_body?.data) {
                    callback(message.response_body.data);
                } else {
                    callback(null);
                }
            } catch (e) {
                callback(null);
            }
        });
    }


    _saveAndCacheImage(url, data) {
        try {
            const dir = GLib.get_user_cache_dir() + '/dynamic-island-art';
            if (GLib.mkdir_with_parents(dir, 0o755) !== 0) return;

            const checksum = new GLib.Checksum(GLib.ChecksumType.MD5);
            checksum.update(url);
            const filename = checksum.get_string() + '.jpg';
            const path = dir + '/' + filename;

            const file = Gio.File.new_for_path(path);
            file.replace_contents(data, null, false, Gio.FileCreateFlags.NONE, null);

            this._artCache.set(url, path);
            return path;
        } catch (e) {
            return null;
        }
    }

    getArtUrl(metadata) {
        if (!metadata) return null;
        const artUrl = this._extractArtUrl(metadata);
        if (!artUrl) return null;

        if (artUrl.startsWith('http')) {
            if (this._artCache.has(artUrl)) {
                return this._artCache.get(artUrl);
            }
            // Download async
            this._downloadImage(artUrl, (data) => {
                const path = this._saveAndCacheImage(artUrl, data);
                if (path) {
                    this._notifyCallbacks({
                        isPlaying: this._playbackStatus === 'Playing',
                        metadata: metadata,
                        playbackStatus: this._playbackStatus,
                        artPath: path
                    });
                }
            });
            return null; // Will be updated via callback
        }
        return artUrl; // Local file
    }

    getTitle(metadata) {
        if (!metadata) return null;
        return this._extractTitle(metadata);
    }

    getArtist(metadata) {
        if (!metadata) return null;
        return this._extractArtist(metadata);
    }

    hasArtUrl(metadata) {
        if (!metadata) return false;
        const artUrl = this._extractArtUrl(metadata);
        return !!artUrl;
    }

    sendPlayerCommand(method) {
        if (!this._playerProxy) return;
        try {
            // Use the methods defined in XML interface
            if (method === 'PlayPause') {
                this._playerProxy.PlayPauseRemote();
            } else if (method === 'Next') {
                this._playerProxy.NextRemote();
            } else if (method === 'Previous') {
                this._playerProxy.PreviousRemote();
            }
        } catch (e) {
            log(`[DynamicIsland] Failed to send ${method}: ${e.message}`);
        }
    }

    addCallback(callback) {
        this._callbacks.push(callback);
    }

    _notifyCallbacks(info) {
        this._callbacks.forEach(cb => cb(info));
    }

    isMediaPlaying() {
        return this._playerProxy !== null && this._playbackStatus === 'Playing';
    }

    getCurrentPlayer() {
        return this._currentPlayer;
    }

    destroy() {
        this._destroyed = true;

        if (this._checkTimeoutId) {
            imports.mainloop.source_remove(this._checkTimeoutId);
            this._checkTimeoutId = null;
        }

        if (this._pendingUpdate) {
            imports.mainloop.source_remove(this._pendingUpdate);
            this._pendingUpdate = null;
        }

        if (this._playerProxy && this._playerProxySignal) {
            try {
                this._playerProxy.disconnect(this._playerProxySignal);
            } catch (e) {
                // Ignore disconnect errors
            }
            this._playerProxySignal = null;
        }

        if (this._dbusSignalId && this._dbusProxy) {
            try {
                this._dbusProxy.disconnect(this._dbusSignalId);
            } catch (e) {
                // Ignore disconnect errors
            }
            this._dbusSignalId = null;
        }

        this._httpSession?.abort();

        this._playerProxy = null;
        this._dbusProxy = null;
        this._httpSession = null;
        this._artCache.clear();
        this._callbacks = [];
    }
}

// ============================================
// 1D. MODEL - Xử lý Volume (VolumeManager)
// ============================================
/**
 * Quản lý thông tin âm lượng (Model).
 * Tương tác với GNOME Shell's Volume Control.
 */
class VolumeManager {
    constructor() {
        this._callbacks = [];
        this._currentVolume = 0;
        this._isMuted = false;
        this._control = null;
        this._streamChangedId = null;
        this._destroyed = false;
        this._isInitializing = true; // Flag để skip notification khi khởi tạo
        this._lastStreamId = null; // Lưu stream ID để phân biệt stream mới vs volume change

        this._initVolumeControl();
    }

    _initVolumeControl() {
        // Sử dụng Volume Control của GNOME Shell
        const Volume = imports.ui.status.volume;

        // Lấy MixerControl từ Volume indicator
        this._control = Volume.getMixerControl();

        if (!this._control) {
            return;
        }

        // Lấy giá trị ban đầu TRƯỚC khi setup listener (để không trigger notification)
        this._updateVolume();

        // Sau đó mới setup listener
        this._streamChangedId = this._control.connect('stream-changed', () => {
            this._onVolumeChanged();
        });

        // Đánh dấu đã khởi tạo xong
        this._isInitializing = false;
    }

    _onVolumeChanged() {
        if (this._destroyed) return;
        this._updateVolume();
    }

    _updateVolume() {
        if (!this._control) return;

        const stream = this._control.get_default_sink();
        if (!stream) return;

        const oldVolume = this._currentVolume;
        const oldMuted = this._isMuted;
        const newStreamId = stream.id;

        this._currentVolume = Math.round(stream.volume / this._control.get_vol_max_norm() * 100);
        // Đảm bảo isMuted là boolean
        this._isMuted = Boolean(stream.is_muted);

        const volumeChanged = (this._currentVolume !== oldVolume || this._isMuted !== oldMuted);
        const streamChanged = (newStreamId !== this._lastStreamId);

        // Cập nhật stream ID
        if (streamChanged) {
            this._lastStreamId = newStreamId;
        }

        // Chỉ notify khi:
        // 1. Không phải đang khởi tạo
        // 2. Volume thực sự thay đổi
        // 3. Stream ID không đổi (không phải stream mới được tạo)
        if (!this._isInitializing && volumeChanged && !streamChanged) {
            this._notifyCallbacks({
                volume: this._currentVolume,
                isMuted: this._isMuted
            });
        }
    }

    addCallback(callback) {
        this._callbacks.push(callback);
    }

    _notifyCallbacks(info) {
        this._callbacks.forEach(cb => cb(info));
    }

    destroy() {
        this._destroyed = true;

        if (this._streamChangedId && this._control) {
            this._control.disconnect(this._streamChangedId);
            this._streamChangedId = null;
        }

        this._control = null;
        this._callbacks = [];
    }
}

// ============================================
// 1E. MODEL - Xử lý Brightness (BrightnessManager)
// ============================================
/**
 * Quản lý thông tin độ sáng (Model).
 * Tương tác với GNOME Shell's Brightness Control.
 */
class BrightnessManager {
    constructor() {
        this._callbacks = [];
        this._currentBrightness = 0;
        this._control = null;
        this._changedId = null;
        this._destroyed = false;
        this._isInitializing = true;

        this._initBrightnessControl();
    }

    _initBrightnessControl() {
        // Định nghĩa interface D-Bus cho Brightness
        // Lưu ý: Brightness là kiểu int (i), không phải unsigned (u)
        const BrightnessProxyInterface = `
            <node>
                <interface name="org.gnome.SettingsDaemon.Power.Screen">
                    <property name="Brightness" type="i" access="readwrite"/>
                </interface>
            </node>
        `;

        const BrightnessProxy = Gio.DBusProxy.makeProxyWrapper(BrightnessProxyInterface);

        // Tạo Proxy tới Screen của gnome-settings-daemon qua Session Bus
        this._control = new BrightnessProxy(
            Gio.DBus.session,
            'org.gnome.SettingsDaemon.Power',
            '/org/gnome/SettingsDaemon/Power',
            (proxy, error) => {
                if (error) {
                    return;
                }

                // Lấy giá trị ban đầu TRƯỚC khi setup listener
                this._updateBrightness();

                // Sau đó mới setup listener
                this._changedId = this._control.connect('g-properties-changed', () => {
                    this._onBrightnessChanged();
                });

                // Đánh dấu đã khởi tạo xong
                this._isInitializing = false;
            }
        );
    }

    _onBrightnessChanged() {
        if (this._destroyed) return;
        this._updateBrightness();
    }

    _updateBrightness() {
        if (!this._control) return;

        const oldBrightness = this._currentBrightness;
        this._currentBrightness = Math.round(this._control.Brightness || 0);

        const diff = Math.abs(this._currentBrightness - oldBrightness);

        if (!this._isInitializing && diff <= 5) {
            this._notifyCallbacks({
                brightness: this._currentBrightness
            });
        }
    }


    addCallback(callback) {
        this._callbacks.push(callback);
    }

    _notifyCallbacks(info) {
        this._callbacks.forEach(cb => cb(info));
    }

    destroy() {
        this._destroyed = true;

        if (this._changedId && this._control) {
            this._control.disconnect(this._changedId);
            this._changedId = null;
        }

        this._control = null;
        this._callbacks = [];
    }
}

// ============================================
// 1E. MODEL - Xử lý Notification (NotificationManager)
// ============================================
class NotificationManager {
    constructor() {
        this._callbacks = [];
        this._sources = new Map(); // Map<Source, SignalId>
        this._sourceAddedId = 0;
        this._destroyed = false;

        this._initNotificationListener();
    }

    _initNotificationListener() {
        // Lắng nghe khi có nguồn thông báo mới (App vừa mở hoặc gửi thông báo lần đầu)
        this._sourceAddedId = Main.messageTray.connect('source-added', (tray, source) => {
            this._onSourceAdded(source);
        });

        // Đăng ký cho các nguồn hiện có
        const sources = Main.messageTray.getSources();
        sources.forEach(source => {
            this._onSourceAdded(source);
        });
    }

    _onSourceAdded(source) {
        if (this._sources.has(source)) return;

        // Lắng nghe khi nguồn này gửi thông báo
        const signalId = source.connect('notification-added', (source, notification) => {
            this._onNotificationAdded(source, notification);
        });

        // Lắng nghe khi nguồn bị xóa (để cleanup)
        source.connect('destroy', () => {
            this._onSourceRemoved(source);
        });

        this._sources.set(source, signalId);
    }

    _onSourceRemoved(source) {
        this._sources.delete(source);
    }

    _onNotificationAdded(source, notification) {
        if (this._destroyed) return;
        const info = {
            title: notification.title || '',
            body: notification.body || notification.bannerBodyText || '',
            appName: source.title,
            gicon: source.icon, // GIcon object
            isUrgent: notification.urgency === MessageTray.Urgency.CRITICAL
        };

        this._notifyCallbacks(info);
    }

    addCallback(callback) {
        this._callbacks.push(callback);
    }

    _notifyCallbacks(info) {
        this._callbacks.forEach(cb => cb(info));
    }


    destroy() {
        this._destroyed = true;

        if (this._sourceAddedId) {
            Main.messageTray.disconnect(this._sourceAddedId);
            this._sourceAddedId = 0;
        }

        // Disconnect tất cả sources
        this._sources.forEach((signalId, source) => {
            try {
                source.disconnect(signalId);
            } catch (e) {
                // Ignore
            }
        });
        this._sources.clear();
        this._callbacks = [];
    }
}

// ============================================
// 1F. MODEL - Xử lý Window Tracking (WindowManager)
// ============================================
/**
 * Quản lý theo dõi cửa sổ mới (Model).
 * Tương tác với Shell.WindowTracker để phát hiện app launch.
 */
class WindowManager {
    constructor() {
        this._callbacks = [];
        this._windowTracker = null;
        this._windowCreatedId = null;
        this._destroyed = false;
        this._isInitializing = true;
        this._trackedWindows = new Set(); // Theo dõi các window đã xử lý

        this._initWindowTracker();
    }

    _initWindowTracker() {
        // Lấy WindowTracker từ Shell
        this._windowTracker = Shell.WindowTracker.get_default();

        if (!this._windowTracker) {
            log('[DynamicIsland] WindowTracker not available');
            return;
        }

        // Lấy danh sách window hiện tại để không trigger notification cho chúng
        const existingWindows = global.get_window_actors();
        existingWindows.forEach(windowActor => {
            const metaWindow = windowActor.get_meta_window();
            if (metaWindow) {
                this._trackedWindows.add(metaWindow);
            }
        });

        // Lắng nghe sự kiện window-created từ display
        const display = global.display;
        this._windowCreatedId = display.connect('window-created', (display, metaWindow) => {
            this._onWindowCreated(metaWindow);
        });

        // Đánh dấu đã khởi tạo xong sau 1 giây
        imports.mainloop.timeout_add(1000, () => {
            this._isInitializing = false;
            return false;
        });
    }

    _onWindowCreated(metaWindow) {
        if (this._destroyed || this._isInitializing) return;

        // Bỏ qua nếu đã track window này
        if (this._trackedWindows.has(metaWindow)) return;
        this._trackedWindows.add(metaWindow);

        // Bỏ qua các loại window không cần thiết
        const windowType = metaWindow.get_window_type();
        if (windowType !== 0) { // 0 = META_WINDOW_NORMAL
            return;
        }

        // Lấy thông tin app
        const app = this._windowTracker.get_window_app(metaWindow);
        if (!app) return;

        const appName = app.get_name();
        const appIcon = app.get_icon();
        const windowTitle = metaWindow.get_title();

        // Cleanup khi window bị destroy
        metaWindow.connect('unmanaged', () => {
            this._trackedWindows.delete(metaWindow);
        });

        // Notify callbacks
        this._notifyCallbacks({
            appName: appName || 'Unknown App',
            windowTitle: windowTitle || '',
            appIcon: appIcon,
            metaWindow: metaWindow
        });
    }

    addCallback(callback) {
        this._callbacks.push(callback);
    }

    _notifyCallbacks(info) {
        this._callbacks.forEach(cb => cb(info));
    }

    destroy() {
        this._destroyed = true;

        if (this._windowCreatedId) {
            global.display.disconnect(this._windowCreatedId);
            this._windowCreatedId = null;
        }

        this._windowTracker = null;
        this._trackedWindows.clear();
        this._callbacks = [];
    }
}


// ============================================
// 2C. VIEW - Xử lý Giao diện Media (MediaView)
// ============================================
class MediaView {
    constructor() {
        this._lastMetadata = null;
        this._lastArtPath = null;
        this._buildCompactView();
        this._buildExpandedView();
        this._buildMinimalView();
    }

    _buildMinimalView() {
        this._secondaryThumbnail = new St.Icon({
            style_class: 'media-thumbnail-secondary',
            icon_name: 'audio-x-generic-symbolic',
            icon_size: 24,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });

        this._secondaryThumbnailWrapper = new St.Bin({
            child: this._secondaryThumbnail,
            style_class: 'media-thumbnail-wrapper-secondary',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            clip_to_allocation: true
        });

        this.secondaryContainer = new St.Bin({
            child: this._secondaryThumbnailWrapper,
            x_expand: true,
            y_expand: true,
            style_class: 'media-minimal-container'
        });
    }

    _buildCompactView() {
        // Thumbnail on the left (album art)
        this._thumbnail = new St.Icon({
            style_class: 'media-thumbnail',
            icon_name: 'audio-x-generic-symbolic',
            icon_size: 24,
        });

        // Thumbnail on the left (giống battery iconWrapper)
        this._thumbnail = new St.Icon({
            style_class: 'media-thumbnail',
            icon_name: 'audio-x-generic-symbolic',
            icon_size: 24,
            x_align: Clutter.ActorAlign.START
        });

        this._thumbnailWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            style_class: 'media-thumbnail-wrapper',
            style: 'padding-left: 16px;',
            visible: false,
            clip_to_allocation: true,
        });
        this._thumbnailWrapper.set_child(this._thumbnail);

        // Audio icon on the right
        this._audioIcon = new St.Icon({
            style_class: 'media-audio-icon',
            icon_name: 'sound-wave-symbolic', // Mặc định là thanh nhạc
            icon_size: 20,
            x_align: Clutter.ActorAlign.END
        });

        this._audioIconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        this._audioIconWrapper.set_child(this._audioIcon);

        // Compact container giống hệt battery
        this.compactContainer = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: true,
            style_class: 'media-compact-container',
        });
        this.compactContainer.add_child(this._thumbnailWrapper);
        this.compactContainer.add_child(this._audioIconWrapper);
    }

    /**
     * Cập nhật icon dựa trên trạng thái tai nghe
     * @param {boolean} hasHeadset
     */
    updateIcon(hasHeadset) {
        if (hasHeadset) {
            this._audioIcon.icon_name = 'audio-headphones-symbolic';
            if (this._audioDeviceIcon) {
                this._audioDeviceIcon.icon_name = 'audio-headphones-symbolic';
            }
        } else {
            this._audioIcon.icon_name = 'sound-wave-symbolic';
            if (this._audioDeviceIcon) {
                this._audioDeviceIcon.icon_name = 'audio-speakers-symbolic';
            }
        }
    }

    _buildExpandedView() {
        // ============================================
        // TOP TIER: Thumbnail, Title, Artist (horizontal)
        // ============================================
        
        // Small thumbnail (left)
        this._expandedThumbnail = new St.Icon({
            style_class: 'media-expanded-art',
            icon_name: 'audio-x-generic-symbolic',
            icon_size: 48,
        });

        this._expandedThumbnailWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'media-expanded-thumbnail-wrapper',
            visible: true,
            reactive: true,
            clip_to_allocation: true,
        });
        this._expandedThumbnailWrapper.set_child(this._expandedThumbnail);
        this._expandedThumbnailWrapper.connect('scroll-event', () => Clutter.EVENT_STOP);
        this._expandedThumbnailWrapper.connect('button-press-event', () => {
            this._onArtClick();
            return Clutter.EVENT_STOP;
        });

        // Title and Artist (right of thumbnail)
        this._titleLabel = new St.Label({
            style_class: 'media-title-label',
            text: '',
            x_align: Clutter.ActorAlign.START,
        });

        this._artistLabel = new St.Label({
            style_class: 'media-artist-label',
            text: '',
            x_align: Clutter.ActorAlign.START,
            style: 'color: rgba(255,255,255,0.7); font-size: 12px; margin-top: 2px;',
        });

        this._titleWrapper = new St.BoxLayout({
            style_class: 'media-title-wrapper',
            vertical: true,
            x_expand: true,
            y_expand: false,
            visible: true,
            reactive: true,
        });
        this._titleWrapper.connect('scroll-event', () => Clutter.EVENT_STOP);
        this._titleWrapper.add_child(this._titleLabel);
        this._titleWrapper.add_child(this._artistLabel);

        // Top tier container (horizontal: thumbnail + title/artist)
        const topTier = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: false,
            style: 'spacing: 12px;',
        });
        topTier.add_child(this._expandedThumbnailWrapper);
        topTier.add_child(this._titleWrapper);


        // ============================================
        // BOTTOM TIER: Control Buttons
        // ============================================

        var bottomBox = new St.BoxLayout({
            x_expand: true,
            y_expand: false,
            visible: true,
            reactive: true,
        });
        bottomBox.connect('scroll-event', () => Clutter.EVENT_STOP);

        this._controlsBox = new St.BoxLayout({
            style_class: 'media-controls-box',
            x_expand: true,
            y_expand: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            visible: true,
            reactive: true,
        });
        this._controlsBox.connect('scroll-event', () => Clutter.EVENT_STOP);

        // Sharing button
        this._shareButton = new St.Button({
            style_class: 'share-audio-button',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            can_focus: true,
        });
        const shareIcon = new St.Icon({
            style_class: 'share-audio-icon',
            icon_name: 'emblem-shared-symbolic',
        });
        this._shareButton.set_child(shareIcon);
        this._shareButton.connect('clicked', () => this._onShare());
        this._shareButton.connect('scroll-event', () => Clutter.EVENT_STOP);
        bottomBox.add_child(this._shareButton);

        // Main control buttons: Previous, Play/Pause, Next
        const controlConfig = [
            {icon: 'media-skip-backward-symbolic', handler: () => this._onPrevious()},
            {icon: 'media-playback-start-symbolic', handler: () => this._onPlayPause(), playPause: true},
            {icon: 'media-skip-forward-symbolic', handler: () => this._onNext()},
        ];

        controlConfig.forEach(config => {
            const button = new St.Button({
                style_class: 'media-control-button',
                reactive: true,
                can_focus: true,
            });
            const icon = new St.Icon({
                style_class: 'media-control-icon',
                icon_name: config.icon,
            });
            button.set_child(icon);
            button.connect('clicked', () => config.handler());
            button.connect('scroll-event', () => Clutter.EVENT_STOP);

            if (config.playPause) {
                this._playPauseIcon = icon;
            }
            this._controlsBox.add_child(button);
        });
        bottomBox.add_child(this._controlsBox);

        // Audio device button (speaker/headphones)
        this._audioDeviceButton = new St.Button({
            style_class: 'share-audio-button',
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            can_focus: true,
        });
        this._audioDeviceIcon = new St.Icon({
            style_class: 'share-audio-icon',
            icon_name: 'audio-speakers-symbolic',
        });
        this._audioDeviceButton.set_child(this._audioDeviceIcon);
        this._audioDeviceButton.connect('clicked', () => this._onAudioDevice());
        this._audioDeviceButton.connect('scroll-event', () => Clutter.EVENT_STOP);
        bottomBox.add_child(this._audioDeviceButton);

        // ============================================
        // MAIN CONTAINER: Vertical layout
        // ============================================
        
        this.expandedContainer = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_expand: true,
            style: 'spacing: 0px; padding: 20px;',
            visible: false,
        });
        // Separator between top and bottom sections
        const separator = new St.Widget({
            style: 'background-color: rgba(255,255,255,0.15); height: 2px; margin: 15px 0;',
            x_expand: true,
            y_expand: false,
        });

        this.expandedContainer.add_child(topTier);
        this.expandedContainer.add_child(separator);
        this.expandedContainer.add_child(bottomBox);
    }

    updateMedia(mediaInfo) {
        const {isPlaying, metadata, playbackStatus, artPath, position, duration} = mediaInfo;

        // Kiểm tra xem có chuyển nguồn phát không bằng cách so sánh title
        let metadataChanged = false;
        if (metadata && this._lastMetadata && this._mediaManager) {
            const currentTitle = this._mediaManager.getTitle(metadata);
            const lastTitle = this._mediaManager.getTitle(this._lastMetadata);
            metadataChanged = currentTitle !== lastTitle;
        } else if (metadata && !this._lastMetadata) {
            metadataChanged = true; // Lần đầu có metadata
        }

        // Lưu lại metadata và artPath cuối cùng để restore khi play lại
        if (metadata) {
            this._lastMetadata = metadata;
        }

        // Cập nhật artPath cache:
        // - Nếu có artPath: lưu vào cache
        // - Nếu artPath là null (không có art): xóa cache để không dùng art cũ khi chuyển nguồn
        // - Chỉ giữ cache khi metadata không thay đổi (cùng bài hát)
        if (metadataChanged) {
            // Chuyển nguồn mới: cập nhật cache theo artPath hiện tại
            if (artPath) {
                this._lastArtPath = artPath;
            } else {
                // Nguồn mới không có art, xóa cache art cũ
                this._lastArtPath = null;
            }
        } else if (artPath !== undefined) {
            // Cùng nguồn nhưng artPath thay đổi (ví dụ: download xong)
            if (artPath) {
                this._lastArtPath = artPath;
            } else {
                this._lastArtPath = null;
            }
        }

        // Update visibility for compact view
        const shouldShow = isPlaying;
        if (shouldShow) {
            this._thumbnailWrapper.show();
            this._audioIconWrapper.show();
        } else {
            this._thumbnailWrapper.hide();
            this._audioIconWrapper.hide();
        }

        // Always show expanded components when expanded
        if (this.expandedContainer && this.expandedContainer.visible) {
            if (this._expandedThumbnailWrapper) this._expandedThumbnailWrapper.show();
            this._controlsBox.show();
            this._titleWrapper.show();
        }

        // Sử dụng metadata/artPath hiện tại hoặc đã lưu
        // Chỉ dùng _lastArtPath nếu metadata không thay đổi (cùng nguồn)
        const currentMetadata = metadata || this._lastMetadata;
        const currentArtPath = artPath !== undefined ? artPath :
            (metadataChanged ? null : this._lastArtPath);

        if (!currentMetadata && !currentArtPath) {
            // Reset to default
            this._thumbnail.icon_name = 'audio-x-generic-symbolic';
            if (this._secondaryThumbnail) this._secondaryThumbnail.icon_name = 'audio-x-generic-symbolic';

            if (this._expandedThumbnailWrapper) {
                this._expandedThumbnailWrapper.style = null;
                this._expandedThumbnail.icon_name = 'audio-x-generic-symbolic';
                this._expandedThumbnail.opacity = 255;
                this._expandedThumbnail.visible = true;
            }
            if (this._thumbnailWrapper) {
                this._thumbnailWrapper.style = null;
                this._thumbnail.icon_name = 'audio-x-generic-symbolic';
                this._thumbnail.opacity = 255;
                this._thumbnail.visible = true;
            }
            if (this._secondaryThumbnailWrapper) {
                this._secondaryThumbnailWrapper.style = null;
                if (this._secondaryThumbnail) {
                    this._secondaryThumbnail.opacity = 255;
                    this._secondaryThumbnail.visible = true;
                }
            }
            return;
        }

        // Update art - sử dụng metadata/artPath hiện tại hoặc đã lưu
        let artUrl = currentArtPath;
        let isDownloading = false;
        if (!artUrl && currentMetadata && this._mediaManager) {
            // Try to get art URL from metadata using public method
            const artUrlFromMeta = this._mediaManager.getArtUrl(currentMetadata);
            if (artUrlFromMeta) {
                artUrl = artUrlFromMeta;
            } else {
                // Check if there's an HTTP URL being downloaded
                if (this._mediaManager.hasArtUrl(currentMetadata)) {
                    isDownloading = true;
                }
            }
        }

        if (artUrl) {
            if (artUrl.startsWith('http')) {
                // Will be updated via callback when downloaded
                return;
            } else if (artUrl.startsWith('file://') || artUrl.startsWith('/')) {
                // Local file
                const path = artUrl.replace('file://', '');
                const file = Gio.File.new_for_path(path);
                const gicon = new Gio.FileIcon({file: file});
                this._thumbnail.set_gicon(gicon);
                if (this._secondaryThumbnail) this._secondaryThumbnail.set_gicon(gicon);

                if (this._expandedThumbnailWrapper) {
                    this._expandedThumbnailWrapper.style = `background-image: url("file://${path}"); background-size: cover; border-radius: 8px;`;
                    this._expandedThumbnail.opacity = 0;
                    this._expandedThumbnail.visible = true;
                }
                if (this._thumbnailWrapper) {
                    this._thumbnailWrapper.style = `background-image: url("file://${path}"); background-size: cover; border-radius: 99px;`;
                    this._thumbnail.opacity = 0;
                    this._thumbnail.visible = true;
                }
                if (this._secondaryThumbnailWrapper) {
                    this._secondaryThumbnailWrapper.style = `background-image: url("file://${path}"); background-size: cover; border-radius: 99px;`;
                    if (this._secondaryThumbnail) {
                        this._secondaryThumbnail.opacity = 0;
                        this._secondaryThumbnail.visible = true;
                    }
                }
            } else {
                try {
                    // Other URI
                    const gicon = Gio.icon_new_for_string(artUrl);
                    this._thumbnail.set_gicon(gicon);
                    if (this._secondaryThumbnail) this._secondaryThumbnail.set_gicon(gicon);

                    if (this._expandedThumbnailWrapper) {
                        const cssUrl = artUrl.replace(/'/g, "\\'");
                        this._expandedThumbnailWrapper.style = `background-image: url("${cssUrl}"); background-size: cover; border-radius: 8px;`;
                        this._expandedThumbnail.opacity = 0;
                        this._expandedThumbnail.visible = true;

                        if (this._thumbnailWrapper) {
                            this._thumbnailWrapper.style = `background-image: url("${cssUrl}"); background-size: cover; border-radius: 99px;`;
                            this._thumbnail.opacity = 0;
                            this._thumbnail.visible = true;
                        }
                        if (this._secondaryThumbnailWrapper) {
                            this._secondaryThumbnailWrapper.style = `background-image: url("${cssUrl}"); background-size: cover; border-radius: 99px;`;
                            if (this._secondaryThumbnail) {
                                this._secondaryThumbnail.opacity = 0;
                                this._secondaryThumbnail.visible = true;
                            }
                        }
                    }
                } catch (e) {
                    // Fallback
                    this._thumbnail.icon_name = 'audio-x-generic-symbolic';
                    if (this._secondaryThumbnail) this._secondaryThumbnail.icon_name = 'audio-x-generic-symbolic';

                    if (this._expandedArtWrapper) {
                        this._expandedArtWrapper.style = null;
                        this._expandedArt.icon_name = 'audio-x-generic-symbolic';
                        this._expandedArt.opacity = 255;
                        this._expandedArt.visible = true;
                    }
                    if (this._thumbnailWrapper) {
                        this._thumbnailWrapper.style = null;
                        this._thumbnail.icon_name = 'audio-x-generic-symbolic';
                        this._thumbnail.opacity = 255;
                        this._thumbnail.visible = true;
                    }
                    if (this._secondaryThumbnailWrapper) {
                        this._secondaryThumbnailWrapper.style = null;
                        if (this._secondaryThumbnail) {
                            this._secondaryThumbnail.opacity = 255;
                            this._secondaryThumbnail.visible = true;
                        }
                    }
                }
            }
        } else if (!isDownloading) {
            // Reset if no art
            this._thumbnail.icon_name = 'audio-x-generic-symbolic';
            if (this._secondaryThumbnail) this._secondaryThumbnail.icon_name = 'audio-x-generic-symbolic';

            if (this._expandedThumbnailWrapper) {
                this._expandedThumbnailWrapper.style = null;
                this._expandedThumbnail.icon_name = 'audio-x-generic-symbolic';
                this._expandedThumbnail.opacity = 255;
                this._expandedThumbnail.visible = true;
            }
            if (this._thumbnailWrapper) {
                this._thumbnailWrapper.style = null;
                this._thumbnail.icon_name = 'audio-x-generic-symbolic';
                this._thumbnail.opacity = 255;
                this._thumbnail.visible = true;
            }
            if (this._secondaryThumbnailWrapper) {
                this._secondaryThumbnailWrapper.style = null;
                if (this._secondaryThumbnail) {
                    this._secondaryThumbnail.opacity = 255;
                    this._secondaryThumbnail.visible = true;
                }
            }
        }

        // Update title and artist - sử dụng metadata hiện tại hoặc đã lưu
        if (currentMetadata) {
            const manager = this._mediaManager;
            if (manager) {
                const title = manager.getTitle(currentMetadata);
                const artist = manager.getArtist(currentMetadata);

                if (this._titleLabel) {
                    this._titleLabel.text = title || 'Unknown Title';
                }
                if (this._artistLabel) {
                    this._artistLabel.text = artist || '';
                    // Ẩn artist label nếu không có artist
                    this._artistLabel.visible = !!artist;
                }
            }
        }

        // Update play/pause icon
        this._updatePlayPauseIcon(playbackStatus);
    }

    _updatePlayPauseIcon(playbackStatus) {
        if (!this._playPauseIcon) return;
        const iconName = playbackStatus === 'Playing'
            ? 'media-playback-pause-symbolic'
            : 'media-playback-start-symbolic';
        this._playPauseIcon.icon_name = iconName;
    }

    setMediaManager(manager) {
        this._mediaManager = manager;
    }

    _onPrevious() {
        if (this._mediaManager) {
            this._mediaManager.sendPlayerCommand('Previous');
        }
    }

    _onPlayPause() {
        if (this._mediaManager) {
            this._mediaManager.sendPlayerCommand('PlayPause');
        }
    }

    _onNext() {
        if (this._mediaManager) {
            this._mediaManager.sendPlayerCommand('Next');
        }
    }

    _onShare() {
        if (!this._mediaManager || !this._lastMetadata) {
            return;
        }
        // Lấy URL từ metadata
        const url = this._mediaManager.getMediaUrl(this._lastMetadata);
        if (!url) {
            return;
        }
        // Copy vào clipboard
        const clipboard = St.Clipboard.get_default();
        clipboard.set_text(St.ClipboardType.CLIPBOARD, url);
    }

    _onAudioDevice() {
        // TODO: Implement audio device selection
        // Could open audio device selection dialog
        log('[DynamicIsland] Audio device button clicked');
    }

    _onArtClick() {
        if (!this._mediaManager) return;

        const busName = this._mediaManager.getCurrentPlayer();
        if (!busName) return;

        this._focusMediaPlayerWindow(busName, this._mediaManager.getTitle(this._lastMetadata));
    }

    _focusMediaPlayerWindow(busName, mediaTitle = null) {
        const appSystem = Shell.AppSystem.get_default();

        // Rút gọn xử lý tên app từ MPRIS bus name
        const appName = busName.replace('org.mpris.MediaPlayer2.', '')
            .split('.')[0]
            .toLowerCase();

        // Set để check nhanh trình duyệt
        const browserSet = new Set(['chrome', 'chromium', 'firefox', 'edge', 'brave', 'opera', 'vivaldi']);
        const isBrowser = [...browserSet].some(b => appName.includes(b));

        // Cache list windows
        const windowActors = global.get_window_actors();
        const runningApps = appSystem.get_running();

        // Quick helpers
        const focusWindow = (window) => {
            const ws = window.get_workspace();
            ws.activate_with_focus(window, global.get_current_time());
        };

        const findWindowByTitle = (actors, title, appFilter = null) => {
            if (!title) return null;

            for (let actor of actors) {
                const w = actor.get_meta_window();
                const wTitle = w.get_title();
                const wmClass = w.get_wm_class() || '';

                if (wTitle?.includes(title)) {
                    if (!appFilter || wmClass.toLowerCase().includes(appFilter))
                        return w;
                }
            }
            return null;
        };

        for (let app of runningApps) {
            const appId = app.get_id().toLowerCase();
            const appNameLower = app.get_name().toLowerCase();

            if (appId.includes(appName) || appNameLower.includes(appName)) {

                // 🟦 SPECIAL CASE: Browser
                if (isBrowser) {
                    // 1. Try match correct tab/window
                    const matchedWindow = findWindowByTitle(windowActors, mediaTitle, appName);
                    if (matchedWindow) {
                        focusWindow(matchedWindow);
                        return;
                    }

                }

                // 🟦 NORMAL APPS
                const windows = app.get_windows();

                const matched = mediaTitle
                    ? windows.find(w => w.get_title()?.includes(mediaTitle))
                    : null;

                if (matched) {
                    focusWindow(matched);
                    return;
                }

                if (windows.length > 0) {
                    focusWindow(windows[0]);
                    return;
                }
            }
        }
    }

    show() {
        this.compactContainer.show();
        this.expandedContainer.show();
    }

    hide() {
        this.compactContainer.hide();
        this.expandedContainer.hide();
    }

    destroy() {
        if (this.compactContainer) {
            this.compactContainer.destroy();
        }
        if (this.expandedContainer) {
            this.expandedContainer.destroy();
        }
    }
}

// ============================================
// 2D. VIEW - Xử lý Giao diện Volume (VolumeView)
// ============================================
class VolumeView {
    constructor() {
        this._buildExpandedView();
    }

    _buildExpandedView() {
        // Icon lớn ở giữa
        this.expandedIcon = new St.Icon({
            icon_name: 'audio-volume-high-symbolic',
            icon_size: 64,
            style: 'color: white;'
        });

        this.expandedIconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.expandedIconWrapper.set_child(this.expandedIcon);

        // Volume percentage label
        this.volumeLabel = new St.Label({
            text: '0%',
            style: 'color: white; font-size: 18px; font-weight: bold; margin-top: 10px;'
        });

        // Progress bar lớn hơn
        this.expandedProgressBarBg = new St.Widget({
            style_class: 'volume-progress-bg-expanded',
            style: 'background-color: rgba(255,255,255,0.2); border-radius: 8px; height: 12px; width: 300px;',
            y_align: Clutter.ActorAlign.CENTER
        });

        this.expandedProgressBarFill = new St.Widget({
            style_class: 'volume-progress-fill-expanded',
            style: 'background-color: white; border-radius: 8px; height: 12px;',
            y_align: Clutter.ActorAlign.CENTER
        });

        this.expandedProgressBarBg.add_child(this.expandedProgressBarFill);

        this.expandedProgressWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'margin-top: 15px;'
        });
        this.expandedProgressWrapper.set_child(this.expandedProgressBarBg);

        // Container expanded
        this.expandedContainer = new St.BoxLayout({
            style_class: 'volume-expanded',
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            visible: false
        });
        this.expandedContainer.add_child(this.expandedIconWrapper);
        this.expandedContainer.add_child(this.volumeLabel);
        this.expandedContainer.add_child(this.expandedProgressWrapper);
    }

    updateVolume(volumeInfo) {
        const {volume, isMuted} = volumeInfo;

        // Cập nhật icon
        let iconName;
        if (isMuted || volume === 0) {
            iconName = 'audio-volume-muted-symbolic';
        } else if (volume < 33) {
            iconName = 'audio-volume-low-symbolic';
        } else if (volume < 66) {
            iconName = 'audio-volume-medium-symbolic';
        } else {
            iconName = 'audio-volume-high-symbolic';
        }
        this.expandedIcon.icon_name = iconName;

        // Cập nhật progress bar expanded (300px width)
        const percentage = isMuted ? 0 : volume;
        const expandedBarWidth = Math.round(300 * percentage / 100);
        this.expandedProgressBarFill.set_width(expandedBarWidth);

        // Cập nhật label
        this.volumeLabel.set_text(`${percentage}%`);
    }

    show() {
        this.expandedContainer.show();
    }

    hide() {
        this.expandedContainer.hide();
    }

    destroy() {
        if (this.expandedContainer) {
            this.expandedContainer.destroy();
        }
    }
}

// ============================================
// 2E. VIEW - Xử lý Giao diện Brightness (BrightnessView)
// ============================================
class BrightnessView {
    constructor() {
        this._buildExpandedView();
    }

    _buildExpandedView() {
        // Icon lớn ở giữa
        this.expandedIcon = new St.Icon({
            icon_name: 'display-brightness-symbolic',
            icon_size: 64,
            style: 'color: white;'
        });

        this.expandedIconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.expandedIconWrapper.set_child(this.expandedIcon);

        // Brightness percentage label
        this.brightnessLabel = new St.Label({
            text: '0%',
            style: 'color: white; font-size: 18px; font-weight: bold; margin-top: 10px;'
        });

        // Progress bar lớn hơn
        this.expandedProgressBarBg = new St.Widget({
            style_class: 'brightness-progress-bg-expanded',
            style: 'background-color: rgba(255,255,255,0.2); border-radius: 8px; height: 12px; width: 300px;',
            y_align: Clutter.ActorAlign.CENTER
        });

        this.expandedProgressBarFill = new St.Widget({
            style_class: 'brightness-progress-fill-expanded',
            style: 'background-color: white; border-radius: 8px; height: 12px;',
            y_align: Clutter.ActorAlign.CENTER
        });

        this.expandedProgressBarBg.add_child(this.expandedProgressBarFill);

        this.expandedProgressWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'margin-top: 15px;'
        });
        this.expandedProgressWrapper.set_child(this.expandedProgressBarBg);

        // Container expanded
        this.expandedContainer = new St.BoxLayout({
            style_class: 'brightness-expanded',
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            visible: false
        });
        this.expandedContainer.add_child(this.expandedIconWrapper);
        this.expandedContainer.add_child(this.brightnessLabel);
        this.expandedContainer.add_child(this.expandedProgressWrapper);
    }

    updateBrightness(brightnessInfo) {
        const {brightness} = brightnessInfo;

        // Cập nhật icon dựa trên brightness level
        let iconName;
        if (brightness === 0) {
            iconName = 'display-brightness-off-symbolic';
        } else if (brightness < 33) {
            iconName = 'display-brightness-low-symbolic';
        } else if (brightness < 66) {
            iconName = 'display-brightness-medium-symbolic';
        } else {
            iconName = 'display-brightness-symbolic';
        }
        this.expandedIcon.icon_name = iconName;

        // Cập nhật progress bar expanded (300px width)
        const expandedBarWidth = Math.round(300 * brightness / 100);
        this.expandedProgressBarFill.set_width(expandedBarWidth);

        // Cập nhật label
        this.brightnessLabel.set_text(`${brightness}%`);
    }

    show() {
        this.expandedContainer.show();
    }

    hide() {
        this.expandedContainer.hide();
    }

    destroy() {
        if (this.expandedContainer) {
            this.expandedContainer.destroy();
        }
    }
}


// ============================================
// 2E. VIEW - Xử lý Giao diện Notification (NotificationView)
// ============================================
class NotificationView {
    constructor() {
        this._buildExpandedView();
    }

    _buildExpandedView() {
        this.compactContainer = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: true,
            visible: false
        });
    }

    show() {
        this.compactContainer.show();
    }

    hide() {
        this.compactContainer.hide();
    }

    destroy() {
        if (this.compactContainer) {
            this.compactContainer.destroy();
        }
    }
}

// ============================================
// 2F. VIEW - Xử lý Giao diện Window Launch (WindowView)
// ============================================
class WindowView {
    constructor() {
        this._buildCompactView();
        this._buildExpandedView();
    }

    _buildCompactView() {
        // Icon app bên trái
        this.appIcon = new St.Icon({
            icon_size: 24,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER
        });

        this.iconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            style: 'padding-left: 16px;',
        });
        this.iconWrapper.set_child(this.appIcon);

        // Label tên app bên phải
        this.appLabel = new St.Label({
            text: '',
            style: 'color: white; font-size: 14px; font-weight: bold; padding-right: 16px;',
            x_align: Clutter.ActorAlign.END
        });

        this.labelWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true
        });
        this.labelWrapper.set_child(this.appLabel);

        this.compactContainer = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: true,
            visible: false
        });
        this.compactContainer.add_child(this.iconWrapper);
        this.compactContainer.add_child(this.labelWrapper);
    }

    _buildExpandedView() {
        // Icon lớn
        this.expandedIcon = new St.Icon({
            icon_size: 64,
        });

        this.expandedIconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.expandedIconWrapper.set_child(this.expandedIcon);

        // Text
        this.statusLabel = new St.Label({
            text: 'App Launched',
            style: 'color: white; font-size: 18px; font-weight: bold;'
        });

        this.appNameLabel = new St.Label({
            text: '',
            style: 'color: rgba(255,255,255,0.8); font-size: 14px; margin-top: 5px;'
        });

        const textBox = new St.BoxLayout({
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.START,
        });
        textBox.add_child(this.statusLabel);
        textBox.add_child(this.appNameLabel);

        this.textWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.textWrapper.set_child(textBox);

        this.expandedContainer = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: true,
            style: 'spacing: 20px; padding: 20px;',
            visible: false
        });
        this.expandedContainer.add_child(this.expandedIconWrapper);
        this.expandedContainer.add_child(this.textWrapper);
    }

    updateWindow(windowInfo) {
        const {appName, appIcon} = windowInfo;

        // Update compact view
        this.appLabel.set_text(appName);
        if (appIcon) {
            this.appIcon.set_gicon(appIcon);
        }

        // Update expanded view
        this.appNameLabel.set_text(appName);
        if (appIcon) {
            this.expandedIcon.set_gicon(appIcon);
        }
    }

    show() {
        this.compactContainer.show();
        this.expandedContainer.show();
    }

    hide() {
        this.compactContainer.hide();
        this.expandedContainer.hide();
    }

    destroy() {
        if (this.compactContainer) {
            this.compactContainer.destroy();
        }
        if (this.expandedContainer) {
            this.expandedContainer.destroy();
        }
    }
}


// ============================================
// 3. CONTROLLER - Xử lý Logic (NotchController)
// ============================================

// ============================================
// 3.0. CONSTANTS - Các hằng số
// ============================================
const NotchConstants = {
    // Dimensions
    COMPACT_WIDTH: 180,
    COMPACT_HEIGHT: 40,
    EXPANDED_WIDTH: 440,
    EXPANDED_HEIGHT: 160,
    SECONDARY_WIDTH: 40,
    SECONDARY_HEIGHT: 40,

    // Split mode dimensions
    SPLIT_MAIN_WIDTH: 160,
    SPLIT_GAP: 10,
    SPLIT_SECONDARY_WIDTH: 40,

    // Positions
    NOTCH_Y_POSITION: 5,

    // Animation durations (ms)
    ANIMATION_EXPAND_DURATION: 200,
    ANIMATION_COMPACT_DURATION: 200,
    ANIMATION_SQUEEZE_DURATION: 150,
    ANIMATION_SQUEEZE_RETURN_DURATION: 200,
    ANIMATION_NOTIFICATION_MOVE: 800,

    // Timeout delays (ms)
    TIMEOUT_COLLAPSE: 300,
    TIMEOUT_VOLUME: 2000,
    TIMEOUT_BRIGHTNESS: 2000,
    TIMEOUT_BATTERY_AUTO_COLLAPSE: 3000,
    TIMEOUT_BLUETOOTH: 3000,
    TIMEOUT_MEDIA_SWITCH: 10000,
    TIMEOUT_PRESENTER_SWITCH: 300,
    TIMEOUT_WINDOW: 3000,

    // Animation scales
    SQUEEZE_SCALE_X: 0.75,
    SQUEEZE_SECONDARY_SCALE_X: 1.3,
    ORIGINAL_SCALE: 1.0,

    // Notification animation
    NOTIFICATION_ICON_SIZE: 24,
    NOTIFICATION_ICON_PADDING: 16,

    // Window animation
    ANIMATION_WINDOW_MOVE: 800
};

// ============================================
// 3.1. STATE MACHINE - Quản lý trạng thái
// ============================================
class NotchStateMachine {
    constructor() {
        this._state = 'compact'; // compact, expanded, animating
        this._listeners = [];
    }

    getState() {
        return this._state;
    }

    isCompact() {
        return this._state === 'compact';
    }

    isExpanded() {
        return this._state === 'expanded';
    }

    isAnimating() {
        return this._state === 'animating';
    }

    transitionTo(newState) {
        if (this._state === newState) return false;
        const oldState = this._state;
        this._state = newState;
        this._notifyListeners(oldState, newState);
        return true;
    }

    _notifyListeners(oldState, newState) {
        this._listeners.forEach(cb => cb(oldState, newState));
    }
}

// ============================================
// 3.2. TIMEOUT MANAGER - Quản lý timeouts tập trung
// ============================================
class TimeoutManager {
    constructor() {
        this._timeouts = new Map();
    }

    set(key, delay, callback) {
        this.clear(key);
        const id = imports.mainloop.timeout_add(delay, () => {
            this._timeouts.delete(key);
            callback();
            return false;
        });
        this._timeouts.set(key, id);
        return id;
    }

    clear(key) {
        const id = this._timeouts.get(key);
        if (id) {
            imports.mainloop.source_remove(id);
            this._timeouts.delete(key);
        }
    }

    clearAll() {
        this._timeouts.forEach((id, key) => {
            imports.mainloop.source_remove(id);
        });
        this._timeouts.clear();
    }

    has(key) {
        return this._timeouts.has(key);
    }
}

// ============================================
// 3.3. PRESENTER REGISTRY - Strategy Pattern cho Presenters
// ============================================
class PresenterRegistry {
    constructor(controller) {
        this.controller = controller;
        this._currentPresenter = null;
        this._presenters = new Map();
    }

    register(name, presenter) {
        this._presenters.set(name, presenter);
    }

    getCurrent() {
        return this._currentPresenter;
    }

    switchTo(name) {
        if (this._currentPresenter === name) return false;

        const oldPresenter = this._currentPresenter;
        this._currentPresenter = name;
        const presenter = this._presenters.get(name);

        if (presenter && presenter.onActivate) {
            presenter.onActivate(oldPresenter);
        }

        return true;
    }

    getPresenter(name) {
        return this._presenters.get(name);
    }

}

// ============================================
// 3.4. LAYOUT MANAGER - Quản lý layout logic
// ============================================
class LayoutManager {
    constructor(controller) {
        this.controller = controller;
    }

    updateLayout() {
        if (!this.controller.notch) return; // Notch chưa được tạo

        const state = this.controller.stateMachine.getState();
        const presenter = this.controller.presenterRegistry.getCurrent();
        const hasMedia = this.controller.hasMedia;
        const isSwapped = this.controller.isSwapped;

        if (state === 'expanded') {
            this._updateExpandedLayout(presenter);
        } else {
            this._updateCompactLayout(presenter, hasMedia, isSwapped);
        }
    }

    _updateExpandedLayout(presenter) {
        if (!this.controller.notch) return;

        if (this.controller.secondaryNotch) {
            this.controller.secondaryNotch.hide();
        }
        this.controller.notch.set_width(this.controller.expandedWidth);
    }

    _updateCompactLayout(presenter, hasMedia, isSwapped) {
        if (hasMedia) {
            this._updateSplitModeLayout(isSwapped);
        } else {
            this._updateDefaultLayout(presenter);
        }
    }

    _updateSplitModeLayout(isSwapped) {
        if (!this.controller.notch) return;

        // Show secondary notch
        if (this.controller.secondaryNotch) {
            this.controller.secondaryNotch.show();
            this.controller.secondaryNotch.set_opacity(255);
        }

        // Calculate positions using constants
        const mainWidth = NotchConstants.SPLIT_MAIN_WIDTH;
        const gap = NotchConstants.SPLIT_GAP;
        const secWidth = NotchConstants.SPLIT_SECONDARY_WIDTH;
        const groupWidth = mainWidth + gap + secWidth;
        const startX = Math.floor((this.controller.monitorWidth - groupWidth) / 2);

        this.controller.notch.set_width(mainWidth);
        this.controller.notch.set_position(startX, NotchConstants.NOTCH_Y_POSITION);
        if (this.controller.secondaryNotch) {
            this.controller.secondaryNotch.set_position(startX + mainWidth + gap, NotchConstants.NOTCH_Y_POSITION);
        }

        // Update content
        this._updateSplitModeContent(isSwapped);
    }

    _updateSplitModeContent(isSwapped) {
        if (!this.controller.notch) return;

        this.controller.notch.remove_all_children();
        if (this.controller.secondaryNotch) {
            this.controller.secondaryNotch.remove_all_children();
        }

        const presenter = this.controller.presenterRegistry.getCurrent();
        const batteryPresenter = this.controller.presenterRegistry.getPresenter('battery');
        const mediaPresenter = this.controller.presenterRegistry.getPresenter('media');
        const notificationPresenter = this.controller.presenterRegistry.getPresenter('notification');

        let mainContent, secContent;

        if (presenter === 'notification' || presenter === 'window') {
            mainContent = notificationPresenter?.getCompactContainer();
            if (isSwapped) {
                secContent = mediaPresenter?.getSecondaryContainer();
            } else {
                secContent = batteryPresenter?.getSecondaryContainer();
            }
        } else {
            if (isSwapped) {
                mainContent = batteryPresenter?.getCompactContainer();
                secContent = mediaPresenter?.getSecondaryContainer();
            } else {
                mainContent = mediaPresenter?.getCompactContainer();
                secContent = batteryPresenter?.getSecondaryContainer();
            }
        }

        if (mainContent) {
            this.controller.notch.add_child(mainContent);
            mainContent.show();
            mainContent.remove_style_class_name('in-secondary');
        }

        if (secContent && this.controller.secondaryNotch) {
            this.controller.secondaryNotch.add_child(secContent);
            secContent.show();
            secContent.add_style_class_name('in-secondary');
        }
    }

    _updateDefaultLayout(presenter) {
        if (!this.controller.notch) return;

        // Hide secondary notch
        if (this.controller.secondaryNotch) {
            this.controller.secondaryNotch.hide();
            this.controller.secondaryNotch.set_opacity(0);
        }

        // Set position
        this.controller.notch.set_width(this.controller.width);
        const startX = Math.floor((this.controller.monitorWidth - this.controller.width) / 2);
        this.controller.notch.set_position(startX, NotchConstants.NOTCH_Y_POSITION);

        // Update content
        this.controller.notch.remove_all_children();

        const presenterObj = this.controller.presenterRegistry.getPresenter(presenter);
        const mainContent = presenterObj?.getCompactContainer();

        if (mainContent) {
            this.controller.notch.add_child(mainContent);
            mainContent.show();
            mainContent.remove_style_class_name('in-secondary');
        }

        // Clean up style classes
        this.controller.batteryView.compactContainer.remove_style_class_name('in-secondary');
        this.controller.mediaView.compactContainer.remove_style_class_name('in-secondary');
    }

    calculateCompactGeometry(hasMedia) {
        if (hasMedia) {
            const mainWidth = NotchConstants.SPLIT_MAIN_WIDTH;
            const gap = NotchConstants.SPLIT_GAP;
            const secWidth = NotchConstants.SPLIT_SECONDARY_WIDTH;
            const groupWidth = mainWidth + gap + secWidth;
            return {
                width: mainWidth,
                x: Math.floor((this.controller.monitorWidth - groupWidth) / 2)
            };
        } else {
            return {
                width: this.controller.width,
                x: Math.floor((this.controller.monitorWidth - this.controller.width) / 2)
            };
        }
    }
}

// ============================================
// 3.5. ANIMATION CONTROLLER - Quản lý animations
// ============================================
class AnimationController {
    constructor(controller) {
        this.controller = controller;
    }

    expand() {
        if (!this.controller.notch) return;

        const notch = this.controller.notch;
        const monitorWidth = this.controller.monitorWidth;
        const expandedWidth = this.controller.expandedWidth;
        const expandedHeight = this.controller.expandedHeight;

        notch.remove_all_transitions();
        notch.add_style_class_name('expanded-state');
        notch.remove_style_class_name('compact-state');

        const newX = Math.floor((monitorWidth - expandedWidth) / 2);

        notch.ease({
            width: expandedWidth,
            height: expandedHeight,
            x: newX,
            duration: NotchConstants.ANIMATION_EXPAND_DURATION,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.controller.stateMachine.transitionTo('expanded');
            }
        });
    }

    compact() {
        if (!this.controller.notch) return;

        const notch = this.controller.notch;
        const layoutManager = this.controller.layoutManager;
        const hasMedia = this.controller.hasMedia;

        notch.remove_all_transitions();
        notch.add_style_class_name('compact-state');
        notch.remove_style_class_name('expanded-state');

        const geometry = layoutManager.calculateCompactGeometry(hasMedia);

        notch.ease({
            width: geometry.width,
            height: this.controller.height,
            x: geometry.x,
            duration: NotchConstants.ANIMATION_COMPACT_DURATION,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.controller.layoutManager.updateLayout();
                this.squeeze();
            }
        });
    }

    squeeze() {
        if (!this.controller.notch) return;

        const notch = this.controller.notch;
        const originalScale = this.controller.originalScale;

        // Transition to animating state for squeeze
        this.controller.stateMachine.transitionTo('animating');
        notch.remove_all_transitions();

        notch.ease({
            scale_x: NotchConstants.SQUEEZE_SCALE_X,
            scale_y: NotchConstants.ORIGINAL_SCALE,
            duration: NotchConstants.ANIMATION_SQUEEZE_DURATION,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                notch.ease({
                    scale_x: originalScale,
                    scale_y: originalScale,
                    duration: NotchConstants.ANIMATION_SQUEEZE_RETURN_DURATION,
                    mode: Clutter.AnimationMode.EASE_OUT_BACK,
                    onComplete: () => {
                        this.controller.stateMachine.transitionTo('compact');
                    }
                });
            }
        });

        this.squeezeSecondary();
    }

    squeezeSecondary() {
        const secondaryNotch = this.controller.secondaryNotch;
        if (!secondaryNotch) return;

        const originalScale = this.controller.originalScale;

        secondaryNotch.remove_all_transitions();

        secondaryNotch.ease({
            scale_x: NotchConstants.SQUEEZE_SECONDARY_SCALE_X,
            scale_y: NotchConstants.ORIGINAL_SCALE,
            duration: NotchConstants.ANIMATION_SQUEEZE_DURATION,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                secondaryNotch.ease({
                    scale_x: originalScale,
                    scale_y: originalScale,
                    duration: NotchConstants.ANIMATION_SQUEEZE_RETURN_DURATION,
                    mode: Clutter.AnimationMode.EASE_OUT_BACK
                });
            }
        });
    }
}

// ============================================
// 3.6. NOTCH CONTROLLER - Refactored với patterns rõ ràng
// ============================================
class NotchController {
    constructor() {
        // Dimensions - sử dụng constants
        this.width = NotchConstants.COMPACT_WIDTH;
        this.height = NotchConstants.COMPACT_HEIGHT;
        this.expandedWidth = NotchConstants.EXPANDED_WIDTH;
        this.expandedHeight = NotchConstants.EXPANDED_HEIGHT;
        this.originalScale = NotchConstants.ORIGINAL_SCALE;

        // UI Actors
        this.notch = null;
        this.secondaryNotch = null;

        // Split mode state
        this.hasMedia = false;
        this.isSwapped = false;

        // Animation tracking
        this._animatedIcons = new Map();

        // Monitor info
        const monitor = Main.layoutManager.primaryMonitor;
        this.monitorWidth = monitor.width;

        // Initialize core systems
        this.stateMachine = new NotchStateMachine();
        this.timeoutManager = new TimeoutManager();
        this.presenterRegistry = new PresenterRegistry(this);
        this.layoutManager = new LayoutManager(this);
        this.animationController = new AnimationController(this);

        // Initialize managers and views
        this._initializeManagers();
        this._initializeViews();
        this._registerPresenters();

        // Create UI
        this._createNotchActor();

        // Setup monitoring
        this._setupMonitoring();

        // Setup events
        this._setupMouseEvents();

        // Initial state
        this._wasCharging = false;
        this._updateUI();
    }

    _initializeManagers() {
        this.batteryManager = new BatteryManager();
        this.bluetoothManager = new BluetoothManager();
        this.mediaManager = new MediaManager();
        this.volumeManager = new VolumeManager();
        this.brightnessManager = new BrightnessManager();
        this.notificationManager = new NotificationManager();
        this.windowManager = new WindowManager();
    }

    _initializeViews() {
        this.batteryView = new BatteryView();
        this.bluetoothView = new BluetoothView();
        this.mediaView = new MediaView();
        this.volumeView = new VolumeView();
        this.brightnessView = new BrightnessView();
        this.notificationView = new NotificationView();
        this.windowView = new WindowView();

        // Setup media view
        this.mediaView.setMediaManager(this.mediaManager);
    }

    _registerPresenters() {
        // Battery Presenter
        this.presenterRegistry.register('battery', {
            getCompactContainer: () => this.batteryView.compactContainer,
            getExpandedContainer: () => this.batteryView.expandedContainer,
            getSecondaryContainer: () => this.batteryView.secondaryContainer,
            onActivate: (oldPresenter) => {
                if (oldPresenter !== 'battery') {
                    this.hasMedia = false;
                    this.layoutManager.updateLayout();
                }
            }
        });

        // Media Presenter
        this.presenterRegistry.register('media', {
            getCompactContainer: () => this.mediaView.compactContainer,
            getExpandedContainer: () => this.mediaView.expandedContainer,
            getSecondaryContainer: () => this.mediaView.secondaryContainer,
            onActivate: (oldPresenter) => {
                this.hasMedia = true;
                this.layoutManager.updateLayout();
            }
        });

        // Bluetooth Presenter
        this.presenterRegistry.register('bluetooth', {
            getCompactContainer: () => this.bluetoothView.compactContainer,
            getExpandedContainer: () => this.bluetoothView.expandedContainer,
            getSecondaryContainer: () => null,
            onActivate: (oldPresenter) => {
                this.batteryView.compactContainer.hide();
                this.mediaView.hide();
                this.volumeView.hide();
                this.brightnessView.hide();
                this.bluetoothView.show();
            }
        });

        // Volume Presenter
        this.presenterRegistry.register('volume', {
            getCompactContainer: () => null,
            getExpandedContainer: () => this.volumeView.expandedContainer,
            getSecondaryContainer: () => null,
            onActivate: (oldPresenter) => {
                this.batteryView.compactContainer.hide();
                this.bluetoothView.hide();
                this.mediaView.hide();
                this.brightnessView.hide();
                this.volumeView.show();
            }
        });

        // Brightness Presenter
        this.presenterRegistry.register('brightness', {
            getCompactContainer: () => null,
            getExpandedContainer: () => this.brightnessView.expandedContainer,
            getSecondaryContainer: () => null,
            onActivate: (oldPresenter) => {
                this.batteryView.compactContainer.hide();
                this.bluetoothView.hide();
                this.mediaView.hide();
                this.volumeView.hide();
                this.brightnessView.show();
            }
        });

        this.presenterRegistry.register('notification', {
            getCompactContainer: () => null,
            getExpandedContainer: () => null,
            getSecondaryContainer: () => null,
            onActivate: (oldPresenter) => {
                this.batteryView.compactContainer.hide();
                this.bluetoothView.hide();
                this.mediaView.hide();
                this.volumeView.hide();
                this.brightnessView.hide();
                this.notificationView.show();
            }
        });

        this.presenterRegistry.register('window', {
            //TODO: getCompactContainer: () => this.windowView.compactContainer,
            //TODO: getExpandedContainer: () => this.windowView.expandedContainer,
            getCompactContainer: () => null,
            getExpandedContainer: () => null,
            getSecondaryContainer: () => null,
            onActivate: (oldPresenter) => {
                this.batteryView.compactContainer.hide();
                this.bluetoothView.hide();
                this.mediaView.hide();
                this.volumeView.hide();
                this.brightnessView.hide();
                this.notificationView.hide();
                this.windowView.show();
            }
        });

        // Set default presenter
        this.presenterRegistry.switchTo('battery');
    }


    _createNotchActor() {
        this.notch = new St.BoxLayout({
            style_class: 'notch compact-state',
            vertical: false,
            reactive: true,
            track_hover: true,
            x_expand: false,
            can_focus: true,
            clip_to_allocation: true
        });

        this.notch.set_width(this.width);
        this.notch.set_height(this.height);
        this.originalScale = 1.0;
        this.notch.set_scale(this.originalScale, this.originalScale);
        this.notch.set_pivot_point(0.5, 0.5)

        const initialX = Math.floor((this.monitorWidth - this.width) / 2);
        this.notch.set_position(initialX, NotchConstants.NOTCH_Y_POSITION);

        this.notch.add_child(this.batteryView.compactContainer);
        this.notch.add_child(this.bluetoothView.compactContainer);
        this.notch.add_child(this.mediaView.compactContainer);

        Main.layoutManager.addChrome(this.notch, {
            affectsInputRegion: true,
            trackFullscreen: false
        });

        // Create Secondary Notch (Circular)
        this.secondaryNotch = new St.BoxLayout({
            style_class: 'notch-secondary',
            vertical: false,
            reactive: true,
            track_hover: false,
            x_expand: false,
            can_focus: true,
            clip_to_allocation: true,
            visible: false,
            opacity: 0
        });

        this.secondaryNotch.set_width(NotchConstants.SECONDARY_WIDTH);
        this.secondaryNotch.set_height(NotchConstants.SECONDARY_HEIGHT);
        this.secondaryNotch.set_pivot_point(0.5, 0.5);

        // Click to swap
        this.secondaryNotch.connect('button-press-event', () => {
            this.isSwapped = !this.isSwapped;
            this.layoutManager.updateLayout();

            if (this.stateMachine.isCompact()) {
                this.squeeze();
            }
            return Clutter.EVENT_STOP;
        });

        Main.layoutManager.addChrome(this.secondaryNotch, {
            affectsInputRegion: true,
            trackFullscreen: false
        });
    }

    _setupMonitoring() {
        this.batteryManager.addCallback((info) => this._onBatteryChanged(info));
        this.bluetoothManager.addCallback((info) => this._onBluetoothChanged(info));
        this.mediaManager.addCallback((info) => this._onMediaChanged(info));
        this.volumeManager.addCallback((info) => this._onVolumeChanged(info));
        this.brightnessManager.addCallback((info) => this._onBrightnessChanged(info));
        this.notificationManager.addCallback((info) => this._onNotificationReceived(info));
        this.windowManager.addCallback((info) => this._onWindowLaunched(info));

        // Cập nhật trạng thái ban đầu cho media icon
        const hasHeadset = this.bluetoothManager.hasConnectedHeadset();
        this.mediaView.updateIcon(hasHeadset);
    }

    _setupMouseEvents() {
        this._motionEventId = this.notch.connect('motion-event', () => {
            this._cancelAutoCollapse();
            if (this.stateMachine.isCompact()) {
                this.expandNotch(false);
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this._leaveEventId = this.notch.connect('leave-event', () => {
            if (this.stateMachine.isExpanded() && !this.timeoutManager.has('collapse')) {
                this.timeoutManager.set('collapse', NotchConstants.TIMEOUT_COLLAPSE, () => {
                    this.compactNotch();
                });
            }
        });
    }

    _onVolumeChanged(info) {
        this.volumeView.updateVolume(info);

        // Cancel all temporary presenter timeouts before switching
        this._cancelTemporaryPresenterTimeouts();

        this.presenterRegistry.switchTo('volume');
        this.expandNotch(true);

        // Auto collapse with presenter switch
        this._scheduleAutoCollapse('volume', NotchConstants.TIMEOUT_VOLUME);
    }

    _onBrightnessChanged(info) {
        this.brightnessView.updateBrightness(info);

        // Cancel all temporary presenter timeouts before switching
        this._cancelTemporaryPresenterTimeouts();

        this.presenterRegistry.switchTo('brightness');
        this.expandNotch(true);

        // Auto collapse with presenter switch
        this._scheduleAutoCollapse('brightness', NotchConstants.TIMEOUT_BRIGHTNESS);
    }

    _onNotificationReceived(info) {
        if (this.stateMachine.isCompact()) {
            this._animateNotificationIcon(info);
        }
    }

    _onWindowLaunched(info) {
        // Update window view với thông tin app
        this.windowView.updateWindow(info);

        // Nếu đang ở compact state, hiển thị animation
        if (this.stateMachine.isCompact()) {
            this._animateWindowIcon(info);
        }
        //TODO: else {
        //     // Nếu đang expanded, chỉ cần switch presenter
        //     this._cancelTemporaryPresenterTimeouts();
        //     this.presenterRegistry.switchTo('window');
        //     this._scheduleAutoCollapse('window', NotchConstants.TIMEOUT_WINDOW);
        // }
    }

    _animateWindowIcon(info) {
        if (!this.notch) return;

        this.presenterRegistry.switchTo('window');
        this.layoutManager.updateLayout();

        const [notchX, notchY] = this.notch.get_transformed_position();
        const notchWidth = this.notch.width;
        const notchHeight = this.notch.height;
        const iconSize = NotchConstants.NOTIFICATION_ICON_SIZE;
        const padding = NotchConstants.NOTIFICATION_ICON_PADDING;

        // Icon bay từ TRÁI sang PHẢI (ngược với notification)
        const startX = notchX + padding;
        const endX = notchX + notchWidth - padding - iconSize;
        const iconY = notchY + (notchHeight / 2) - (iconSize / 2);

        this._animateIconMove('window-launch', {
            startX,
            startY: iconY,
            endX,
            iconConfig: {
                icon_name: 'application-x-executable-symbolic',
                icon_size: iconSize,
                style: 'color: #00aaff;',
                gicon: info.appIcon
            },
            moveDuration: NotchConstants.ANIMATION_WINDOW_MOVE,
            onComplete: () => {
                this._switchToAppropriatePresenter();
                this.layoutManager.updateLayout();
                this.squeeze();

                //TODO: Sau khi animation xong, expand notch để hiển thị thông tin
                // this._cancelTemporaryPresenterTimeouts();
                // this.presenterRegistry.switchTo('window');
                // this.expandNotch(true);
                // this._scheduleAutoCollapse('window', NotchConstants.TIMEOUT_WINDOW);
            }
        });
    }

    /**
     * Generic method để animate icon di chuyển từ vị trí này sang vị trí khác
     * @param {string} animationId - Unique ID để track animation (để cleanup khi cần)
     * @param {Object} config - Configuration object
     * @param {number} config.startX - Vị trí X bắt đầu
     * @param {number} config.startY - Vị trí Y bắt đầu
     * @param {number} config.endX - Vị trí X kết thúc
     * @param {number} config.endY - Vị trí Y kết thúc (optional, nếu không có thì giữ nguyên startY)
     * @param {Object} config.iconConfig - Config cho St.Icon ({icon_name, icon_size, style, gicon})
     * @param {number} config.moveDuration - Thời gian di chuyển (ms)
     * @param {number} config.fadeDuration - Thời gian fade out (ms, optional)
     * @param {Function} config.onComplete - Callback khi animation hoàn thành
     * @param {boolean} config.fadeOut - Có fade out sau khi di chuyển không (default: true)
     * @returns {St.Icon|null} - Icon được tạo hoặc null nếu fail
     */
    _animateIconMove(animationId, config) {
        if (!this.notch || !config) return null;

        this._cleanupAnimatedIcon(animationId);

        const {
            startX,
            startY,
            endX,
            endY = startY,
            iconConfig = {},
            moveDuration = NotchConstants.ANIMATION_NOTIFICATION_MOVE,
            fadeDuration = 200,
            onComplete = null,
            fadeOut = true
        } = config;

        const animatedIcon = new St.Icon({
            icon_name: iconConfig.icon_name || 'mail-unread-symbolic',
            icon_size: iconConfig.icon_size || NotchConstants.NOTIFICATION_ICON_SIZE,
            style: iconConfig.style || 'color: white;'
        });

        if (iconConfig.gicon) {
            animatedIcon.set_gicon(iconConfig.gicon);
        }

        animatedIcon.set_position(startX, startY);
        animatedIcon.set_opacity(255);

        Main.uiGroup.add_child(animatedIcon);
        this._animatedIcons.set(animationId, animatedIcon);

        const cleanupAndCallback = () => {
            this._cleanupAnimatedIcon(animationId);
            if (onComplete) {
                onComplete();
            }
        };

        animatedIcon.ease({
            x: endX,
            y: endY,
            duration: moveDuration,
            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
            onComplete: () => {
                if (fadeOut) {
                    animatedIcon.ease({
                        opacity: 0,
                        duration: fadeDuration,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                        onComplete: cleanupAndCallback
                    });
                } else {
                    cleanupAndCallback();
                }
            }
        });

        return animatedIcon;
    }

    _cleanupAnimatedIcon(animationId) {
        const icon = this._animatedIcons.get(animationId);
        if (icon) {
            try {
                icon.remove_all_transitions();
                if (icon.get_parent()) {
                    Main.uiGroup.remove_child(icon);
                }
                icon.destroy();
            } catch (e) {
                // Ignore cleanup errors
            }
            this._animatedIcons.delete(animationId);
        }
    }

    _cleanupAllAnimatedIcons() {
        for (const animationId of this._animatedIcons.keys()) {
            this._cleanupAnimatedIcon(animationId);
        }
    }

    _animateNotificationIcon(info) {
        if (!this.notch) return;

        this.presenterRegistry.switchTo('notification');
        this.layoutManager.updateLayout();

        const [notchX, notchY] = this.notch.get_transformed_position();
        const notchWidth = this.notch.width;
        const notchHeight = this.notch.height;
        const iconSize = NotchConstants.NOTIFICATION_ICON_SIZE;
        const padding = NotchConstants.NOTIFICATION_ICON_PADDING;

        const startX = notchX + padding;
        const endX = notchX + notchWidth - padding - iconSize;
        const iconY = notchY + (notchHeight / 2) - (iconSize / 2);

        this._animateIconMove('notification', {
            startX,
            startY: iconY,
            endX,
            iconConfig: {
                icon_name: 'mail-unread-symbolic',
                icon_size: iconSize,
                style: 'color: white;',
                gicon: info.gicon
            },
            moveDuration: NotchConstants.ANIMATION_NOTIFICATION_MOVE,
            onComplete: () => {
                this._switchToAppropriatePresenter();
                this.layoutManager.updateLayout();
                this.squeeze();
            }
        });
    }

    _onBatteryChanged(info) {
        this.batteryView.updateBattery(info);

        if (info.isCharging) {
            this.notch.add_style_class_name('charging');
        } else {
            this.notch.remove_style_class_name('charging');
        }

        const shouldAutoExpand = info.isCharging && !this._wasCharging;
        this._wasCharging = info.isCharging;

        if (shouldAutoExpand && this.stateMachine.isCompact()) {
            this.presenterRegistry.switchTo('battery');
            this.expandNotch(true);

            this._scheduleAutoCollapse('battery-auto-collapse', NotchConstants.TIMEOUT_BATTERY_AUTO_COLLAPSE);
        }
    }

    _onBluetoothChanged(info) {
        this.bluetoothView.updateBluetooth(info);

        // Cập nhật icon media nếu có tai nghe
        const hasHeadset = this.bluetoothManager.hasConnectedHeadset();
        this.mediaView.updateIcon(hasHeadset);

        // Cancel all temporary presenter timeouts before switching
        this._cancelTemporaryPresenterTimeouts();

        this.presenterRegistry.switchTo('bluetooth');
        this.expandNotch(true);

        this._scheduleAutoCollapse('bluetooth', NotchConstants.TIMEOUT_BLUETOOTH);
    }

    /**
     * Helper method để schedule auto collapse với presenter switch
     * @param {string} timeoutKey - Key cho timeout
     * @param {number} delay - Delay trong ms
     */
    _scheduleAutoCollapse(timeoutKey, delay) {
        this.timeoutManager.set(timeoutKey, delay, () => {
            this._switchToAppropriatePresenter();
            if (this.stateMachine.isExpanded()) {
                this.compactNotch();
            }
        });
    }

    _onMediaChanged(info) {
        this.mediaView._updatePlayPauseIcon(info.isPlaying);

        this.timeoutManager.clear('media-switch');

        if (info.isPlaying) {
            this.mediaView.updateMedia(info);
            this.presenterRegistry.switchTo('media');

            if (this.stateMachine.isCompact()) {
                this.squeeze();
            }
        } else if (!info.isPlaying) {
            this.timeoutManager.set('media-switch', NotchConstants.TIMEOUT_MEDIA_SWITCH, () => {
                this.presenterRegistry.switchTo('battery');
                if (this.stateMachine.isCompact()) {
                    this.squeeze();
                }
            });
        }
    }

    _switchToAppropriatePresenter() {
        if (this.mediaManager.isMediaPlaying()) {
            this.presenterRegistry.switchTo('media');
        } else {
            this.presenterRegistry.switchTo('battery');
        }
    }

    _updateUI() {
        const info = this.batteryManager.getBatteryInfo();
        this.batteryView.updateBattery(info);
        this.layoutManager.updateLayout();
    }

    _cancelAutoCollapse() {
        this.timeoutManager.clear('collapse');
        this.timeoutManager.clear('battery-auto-collapse');
    }

    /**
     * Cancel all temporary presenter timeouts (volume, brightness, bluetooth, window)
     * This prevents the old presenter from switching back when a new temporary presenter is shown
     */
    _cancelTemporaryPresenterTimeouts() {
        this.timeoutManager.clear('volume');
        this.timeoutManager.clear('brightness');
        this.timeoutManager.clear('bluetooth');
        this.timeoutManager.clear('bluetooth-defer');
        this.timeoutManager.clear('window');
    }

    expandNotch(isAuto = false) {
        if (!this.notch) return; // Notch chưa được tạo

        // Hide secondary notch immediately
        if (this.secondaryNotch) {
            this.secondaryNotch.hide();
        }

        const currentPresenter = this.presenterRegistry.getCurrent();
        const presenter = this.presenterRegistry.getPresenter(currentPresenter);

        // If already expanded and auto-expand, just update view
        if (this.stateMachine.isExpanded() && isAuto) {
            this._hideAllExpandedViews();
            this._showExpandedView(presenter);
            return;
        }

        // Prevent expansion if already expanded or animating
        if (this.stateMachine.isExpanded()) return;
        if (!isAuto && this.stateMachine.isAnimating()) return;

        // Transition to animating state
        this.stateMachine.transitionTo('animating');

        // Hide all compact views
        this._hideAllCompactViews();

        // Show expanded view
        this._showExpandedView(presenter);

        // Start animation
        this.animationController.expand();
    }

    _hideAllExpandedViews() {
        this.batteryView.expandedContainer.hide();
        this.bluetoothView.expandedContainer.hide();
        this.mediaView.expandedContainer.hide();
        this.volumeView.expandedContainer.hide();
        this.brightnessView.expandedContainer.hide();
        this.windowView.expandedContainer.hide();
    }

    _hideAllCompactViews() {
        this.batteryView.compactContainer.hide();
        this.bluetoothView.compactContainer.hide();
        this.mediaView.compactContainer.hide();
        this.notificationView.compactContainer.hide();
        this.windowView.compactContainer.hide();
    }

    _showExpandedView(presenter) {
        if (!presenter) return;
        const container = presenter.getExpandedContainer();
        if (!container) return;

        if (!container.get_parent()) {
            this.notch.add_child(container);
        }
        container.show();
    }

    compactNotch() {
        if (!this.notch) return; // Notch chưa được tạo
        if (!this.stateMachine.isExpanded()) return;
        if (this.stateMachine.isAnimating()) return;

        // Transition to animating state
        this.stateMachine.transitionTo('animating');

        // Hide all expanded views
        this._hideAllExpandedViews();

        // Handle presenter switching for temporary presenters
        const currentPresenter = this.presenterRegistry.getCurrent();
        if (currentPresenter === 'bluetooth' || currentPresenter === 'volume' || currentPresenter === 'brightness') {
            this._switchToAppropriatePresenter();
        }

        // Show compact view
        const presenter = this.presenterRegistry.getPresenter(this.presenterRegistry.getCurrent());
        let mainContent = null;

        if (this.hasMedia) {
            const batteryPresenter = this.presenterRegistry.getPresenter('battery');
            const mediaPresenter = this.presenterRegistry.getPresenter('media');
            mainContent = this.isSwapped
                ? batteryPresenter?.getCompactContainer()
                : mediaPresenter?.getCompactContainer();
        } else {
            mainContent = presenter?.getCompactContainer();
        }

        if (mainContent) {
            if (!mainContent.get_parent()) {
                this.notch.add_child(mainContent);
            }
            mainContent.show();
            mainContent.remove_style_class_name('in-secondary');
        }

        // Start animation
        this.animationController.compact();
    }

    squeeze() {
        this.animationController.squeeze();
    }

    destroy() {
        // Clear all timeouts
        this.timeoutManager.clearAll();

        // Disconnect events
        if (this.notch) {
            if (this._motionEventId) {
                this.notch.disconnect(this._motionEventId);
                this._motionEventId = null;
            }
            if (this._leaveEventId) {
                this.notch.disconnect(this._leaveEventId);
                this._leaveEventId = null;
            }
        }

        // Destroy managers
        if (this.batteryManager) {
            this.batteryManager.destroy();
            this.batteryManager = null;
        }
        if (this.bluetoothManager) {
            this.bluetoothManager.destroy();
            this.bluetoothManager = null;
        }
        if (this.mediaManager) {
            this.mediaManager.destroy();
            this.mediaManager = null;
        }
        if (this.volumeManager) {
            this.volumeManager.destroy();
            this.volumeManager = null;
        }
        if (this.brightnessManager) {
            this.brightnessManager.destroy();
            this.brightnessManager = null;
        }
        if (this.notificationManager) {
            this.notificationManager.destroy();
            this.notificationManager = null;
        }
        if (this.windowManager) {
            this.windowManager.destroy();
            this.windowManager = null;
        }

        this._cleanupAllAnimatedIcons();

        // Destroy views
        if (this.batteryView) {
            this.batteryView.destroy();
            this.batteryView = null;
        }
        if (this.bluetoothView) {
            this.bluetoothView.destroy();
            this.bluetoothView = null;
        }
        if (this.mediaView) {
            this.mediaView.destroy();
            this.mediaView = null;
        }
        if (this.volumeView) {
            this.volumeView.destroy();
            this.volumeView = null;
        }
        if (this.brightnessView) {
            this.brightnessView.destroy();
            this.brightnessView = null;
        }
        if (this.notificationView) {
            this.notificationView.destroy();
            this.notificationView = null;
        }
        if (this.windowView) {
            this.windowView.destroy();
            this.windowView = null;
        }

        // Destroy actors
        if (this.notch) {
            Main.layoutManager.removeChrome(this.notch);
            this.notch.destroy();
            this.notch = null;
        }
        if (this.secondaryNotch) {
            Main.layoutManager.removeChrome(this.secondaryNotch);
            this.secondaryNotch.destroy();
            this.secondaryNotch = null;
        }

        // Clear references
        this.stateMachine = null;
        this.timeoutManager = null;
        this.presenterRegistry = null;
        this.layoutManager = null;
        this.animationController = null;
    }
}


// ============================================
// GNOME SHELL EXTENSION API
// ============================================

function init() {
    // Không làm gì nhiều ở đây theo quy ước
}

function enable() {
    notchController = new NotchController();

    // Di chuyển date panel của GNOME sang góc phải
    _moveDatePanelToRight();
}

function disable() {
    if (notchController) {
        notchController.destroy();
        notchController = null;
    }

    // Khôi phục date panel về vị trí ban đầu
    _restoreDatePanel();
}

function _moveDatePanelToRight() {
    const panel = Main.panel;
    if (!panel) {
        return;
    }

    // Tìm date menu trong statusArea
    let dateMenu = null;
    if (panel.statusArea && panel.statusArea.dateMenu) {
        dateMenu = panel.statusArea.dateMenu;
    }

    // Nếu không tìm thấy, thử tìm trong _centerBox
    if (!dateMenu) {
        if (panel._centerBox) {
            const children = panel._centerBox.get_children();
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                // Kiểm tra nếu có dateMenu trong child
                if (child._delegate && child._delegate.constructor &&
                    child._delegate.constructor.name === 'DateMenuButton') {
                    dateMenuActor = child;
                    dateMenuOriginalParent = panel._centerBox;
                    break;
                }
            }
        }
    } else {
        // Lấy actor của date menu
        dateMenuActor = dateMenu.actor || dateMenu;
        if (!dateMenuActor) {
            return;
        }
    }

    if (!dateMenuActor) {
        return;
    }

    // Lưu parent ban đầu nếu chưa có
    if (!dateMenuOriginalParent) {
        dateMenuOriginalParent = dateMenuActor.get_parent();
    }

    // Xóa khỏi vị trí hiện tại
    if (dateMenuOriginalParent && dateMenuActor.get_parent() === dateMenuOriginalParent) {
        dateMenuOriginalParent.remove_child(dateMenuActor);
    }

    // Thêm vào right box của panel
    if (panel._rightBox) {
        panel._rightBox.add_child(dateMenuActor);
    } else {
        // Khôi phục nếu không tìm thấy right box
        if (dateMenuOriginalParent) {
            dateMenuOriginalParent.add_child(dateMenuActor);
        }
    }
}

function _restoreDatePanel() {
    if (!dateMenuActor || !dateMenuOriginalParent) {
        return;
    }

    // Xóa khỏi right box
    const panel = Main.panel;
    if (panel && panel._rightBox && dateMenuActor.get_parent() === panel._rightBox) {
        panel._rightBox.remove_child(dateMenuActor);
    }

    // Khôi phục về vị trí ban đầu
    if (dateMenuOriginalParent) {
        dateMenuOriginalParent.add_child(dateMenuActor);
    }

    dateMenuActor = null;
    dateMenuOriginalParent = null;
}