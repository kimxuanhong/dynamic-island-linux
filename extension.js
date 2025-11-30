const St = imports.gi.St;
const Main = imports.ui.main;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const UPower = imports.gi.UPowerGlib;
const Soup = imports.gi.Soup;

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
        log('[DynamicIsland] BatteryManager: Initializing proxy...');
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
        log('[DynamicIsland] BatteryManager: Proxy initialized successfully');
    }

    addCallback(callback) {
        this._callbacks.push(callback);
    }

    _notifyCallbacks() {
        const info = this.getBatteryInfo();
        log(`[DynamicIsland] BatteryManager: Notifying callbacks - ${JSON.stringify(info)}`);
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

        try {
            // 3. Kết nối tới ObjectManager của BlueZ
            this._objectManager = new ObjectManagerProxy(
                Gio.DBus.system,
                'org.bluez',
                '/'
            );

            // 4. Lắng nghe tín hiệu thêm/xóa thiết bị
            this._objectManager.connectSignal('InterfacesAdded', (proxy, senderName, [objectPath, interfaces]) => {
                log(`[DynamicIsland] InterfacesAdded: ${objectPath}`);
                this._onInterfacesAdded(objectPath, interfaces);
            });

            this._objectManager.connectSignal('InterfacesRemoved', (proxy, senderName, [objectPath, interfaces]) => {
                log(`[DynamicIsland] InterfacesRemoved: ${objectPath}`);
                this._onInterfacesRemoved(objectPath, interfaces);
            });

            // 5. Lấy danh sách thiết bị hiện tại
            this._syncDevices();

            log('[DynamicIsland] BluetoothManager initialized successfully');
        } catch (e) {
            log(`[DynamicIsland] Error initializing BluetoothManager: ${e.message}`);
        }
    }

    _syncDevices() {
        if (!this._objectManager) return;

        this._objectManager.GetManagedObjectsRemote((result, error) => {
            if (this._destroyed) return;
            if (error) {
                log(`[DynamicIsland] Error getting managed objects: ${error.message}`);
                return;
            }

            const objects = result[0];
            for (const path in objects) {
                this._onInterfacesAdded(path, objects[path]);
            }

            // FIX: Sau khi sync xong tất cả devices, mới bật notifications
            imports.mainloop.timeout_add(1000, () => {
                this._isInitializing = false;
                log('[DynamicIsland] BluetoothManager initialization complete, notifications enabled');
                return false;
            });
        });
    }

    _onInterfacesAdded(objectPath, interfaces) {
        if (this._destroyed) return;
        if (interfaces['org.bluez.Device1']) {
            this._addDevice(objectPath);
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

        try {
            log(`[DynamicIsland] Adding Bluetooth device: ${path}`);
            const deviceProxy = new this.DeviceProxy(
                Gio.DBus.system,
                'org.bluez',
                path,
                (proxy, error) => {
                    if (error) {
                        log(`[DynamicIsland] Error creating proxy for ${path}: ${error.message}`);
                    }
                }
            );

            // Lắng nghe thay đổi thuộc tính
            const signalId = deviceProxy.connect('g-properties-changed', (proxy, changed, invalidated) => {
                this._onDevicePropertiesChanged(proxy, changed);
            });

            deviceProxy._signalId = signalId;
            this._devices.set(path, deviceProxy);
        } catch (e) {
            log(`[DynamicIsland] Error adding device ${path}: ${e.message}`);
        }
    }

    _removeDevice(path) {
        const deviceProxy = this._devices.get(path);
        if (deviceProxy) {
            log(`[DynamicIsland] Removing Bluetooth device: ${path}`);
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
            log(`[DynamicIsland] Skipping notification during initialization for ${proxy.g_object_path}`);
            return;
        }

        // changedProperties là GLib.Variant (a{sv})
        const changed = changedProperties.deep_unpack();

        log(`[DynamicIsland] Properties changed for ${proxy.g_object_path}: ${JSON.stringify(changed)}`);

        if ('Connected' in changed) {
            try {
                let rawConnected = changed['Connected'];
                log(`[DynamicIsland] Raw Connected value: ${rawConnected} (Type: ${typeof rawConnected})`);

                // FIX: Xử lý đúng cả GVariant và boolean thô
                let isConnected;
                if (rawConnected && typeof rawConnected.deep_unpack === 'function') {
                    isConnected = Boolean(rawConnected.deep_unpack());
                } else {
                    isConnected = Boolean(rawConnected);
                }

                const alias = proxy.Alias || 'Unknown Device';

                log(`[DynamicIsland] Bluetooth Device ${alias} Connected status changed to: ${isConnected}`);

                // LUÔN gọi callback cho cả connect và disconnect
                this._notifyCallbacks({
                    deviceName: alias,
                    isConnected: isConnected
                });
            } catch (e) {
                log(`[DynamicIsland] Error handling Bluetooth property change: ${e.message}`);
            }
        }
    }

    addCallback(callback) {
        this._callbacks.push(callback);
    }

    _notifyCallbacks(info) {
        log(`[DynamicIsland] Notifying Bluetooth callbacks: ${JSON.stringify(info)}`);
        this._callbacks.forEach(cb => cb(info));
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
    }

    _buildCompactView() {
        log('[DynamicIsland] BatteryView: Building compact view...');
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
        log('[DynamicIsland] BatteryView: Building expanded view...');
        this.iconExpanded = new St.Icon({
            icon_name: 'battery-good-symbolic',
            icon_size: 64,
        });

        this.statusLabel = new St.Label({
            text: 'Đang sạc...',
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
            this.percentageLabel.set_text('N/A');
            this.iconLeft.icon_name = 'battery-missing-symbolic';
            this.iconExpanded.icon_name = 'battery-missing-symbolic';
            this.iconLeft.set_style(`color: #ffffff;`);
            this.iconExpanded.set_style(`color: #ffffff;`);
            this.statusLabel.set_text('Không có pin');
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

        const color = this._getBatteryColor(percentage);
        const statusClass = this._getBatteryStatusClass(percentage, isCharging);

        this.iconLeft.set_style(`color: ${color};`);
        this.iconExpanded.set_style(`color: ${color};`);
        this.percentageLabel.style_class = `text-shadow ${statusClass}`;

        if (isCharging) {
            this.statusLabel.set_text(`⚡ Đang sạc - ${percentage}%`);
            this.iconExpanded.style_class = 'icon-glow battery-charging';
        } else {
            this.statusLabel.set_text(`Pin: ${percentage}%`);
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
        log('[DynamicIsland] BluetoothView: Building compact view...');
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
        log('[DynamicIsland] BluetoothView: Building expanded view...');
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

        // ✅ TẠO SẴN EXPANDED CONTAINER NGAY TẠI ĐÂY
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
     * @param {{deviceName: string, isConnected: boolean}} bluetoothInfo
     */
    updateBluetooth(bluetoothInfo) {
        const {deviceName, isConnected} = bluetoothInfo;

        log(`[DynamicIsland] View updating Bluetooth: ${deviceName}, Connected: ${isConnected}`);

        // FIX: Hiển thị rõ ràng cả trạng thái connected và disconnected
        if (isConnected) {
            this.statusLabel.set_text('✓ Connected!');
            this.expandedIcon.icon_name = 'bluetooth-active-symbolic';
            this.expandedIcon.set_style('color: #00aaff;'); // Xanh dương
            this.icon.icon_name = 'bluetooth-active-symbolic';
            this.icon.set_style('color: #00aaff;');
        } else {
            this.statusLabel.set_text('✗ Disconnected!');
            this.expandedIcon.icon_name = 'bluetooth-disabled-symbolic';
            this.expandedIcon.set_style('color: #ff6666;'); // Đỏ nhạt
            this.icon.icon_name = 'bluetooth-disabled-symbolic';
            this.icon.set_style('color: #ff6666;');
        }

        this.deviceLabel.set_text(deviceName);
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

        // Define XML interfaces
        this._defineInterfaces();
        this._setupDBusNameOwnerChanged();
        this._watchForMediaPlayers();
    }

    _defineInterfaces() {
        log('[DynamicIsland] MediaManager: Defining interfaces...');
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
        log('[DynamicIsland] MediaManager: Interfaces defined successfully');
    }

    _setupDBusNameOwnerChanged() {
        log('[DynamicIsland] MediaManager: Setting up DBus NameOwnerChanged...');
        this._dbusProxy = new this.DBusProxy(
            Gio.DBus.session,
            'org.freedesktop.DBus',
            '/org/freedesktop/DBus',
            (proxy, error) => {
                if (error) {
                    log(`[DynamicIsland] Failed to connect to DBus: ${error.message}`);
                    return;
                }

                log('[DynamicIsland] MediaManager: DBus proxy connected, listening for NameOwnerChanged');
                this._dbusSignalId = proxy.connectSignal('NameOwnerChanged', (proxy, sender, [name, oldOwner, newOwner]) => {
                    if (name && name.startsWith('org.mpris.MediaPlayer2.')) {
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
        log('[DynamicIsland] MediaManager: Watching for media players...');
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
                    this._playerListeners = names.filter(n => n.includes('org.mpris.MediaPlayer2'));
                    log(`[DynamicIsland] MediaManager: Found ${this._playerListeners.length} media player(s)`);
                    if(this._playerListeners.length > 0) {
                        log(`[DynamicIsland] MediaManager: Connecting to ${this._playerListeners[0]}`);
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

        log('[DynamicIsland] MediaManager: Performing initial update...');
        const metadata = this._playerProxy.Metadata;
        const playbackStatus = this._playerProxy.PlaybackStatus;

        if (metadata || playbackStatus) {
            log(`[DynamicIsland] MediaManager: Initial playback status: ${playbackStatus}`);
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
                log('[DynamicIsland] MediaManager: Metadata changed');
            }

            if ('PlaybackStatus' in changedProps) {
                updates.playbackStatus = changedProps.PlaybackStatus;
                log(`[DynamicIsland] MediaManager: PlaybackStatus changed to: ${changedProps.PlaybackStatus}`);
            }

            if (Object.keys(updates).length > 0) {
                this._batchUpdate(updates);
            }
        } catch (e) {
            if (!this._destroyed) {
                log(`[DynamicIsland] Error in properties-changed callback: ${e.message}`);
            }
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
            log(`[DynamicIsland] Error extracting metadata: ${e.message}`);
        }
        return null;
    }

    _extractArtUrl(metadata) {
        return this._extractMetadataValue(metadata, ['mpris:artUrl', 'xesam:artUrl', 'mpris:arturl']);
    }

    _extractTitle(metadata) {
        return this._extractMetadataValue(metadata, ['xesam:title', 'mpris:title']);
    }

    _downloadImage(url, callback) {
        log(`[DynamicIsland] Download image: ${url}`);

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
                        log(`Image download failed (Soup3): ${e}`);
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
                    log(`Image download failed (Soup2): ${message.status_code}`);
                    callback(null);
                }
            } catch (e) {
                log(`Image download error (Soup2): ${e}`);
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
            log(`[DynamicIsland] Failed to save image: ${e.message}`);
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
        log(`[DynamicIsland] MediaManager: Notifying callbacks - isPlaying: ${info.isPlaying}, playbackStatus: ${info.playbackStatus}`);
        this._callbacks.forEach(cb => cb(info));
    }

    isMediaPlaying() {
        return this._playerProxy !== null && this._playbackStatus === 'Playing';
    }

    hasPlayer() {
        return this._playerProxy !== null;
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
                log(`[DynamicIsland] Error disconnecting player proxy: ${e.message}`);
            }
            this._playerProxySignal = null;
        }

        if (this._dbusSignalId && this._dbusProxy) {
            try {
                this._dbusProxy.disconnectSignal(this._dbusSignalId);
            } catch (e) {
                log(`[DynamicIsland] Error disconnecting DBus signal: ${e.message}`);
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
        try {
            // Sử dụng Volume Control của GNOME Shell
            const Volume = imports.ui.status.volume;

            // Lấy MixerControl từ Volume indicator
            this._control = Volume.getMixerControl();

            if (!this._control) {
                log('[DynamicIsland] Failed to get MixerControl');
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

            log('[DynamicIsland] VolumeManager initialized successfully');
        } catch (e) {
            log(`[DynamicIsland] Error initializing VolumeManager: ${e.message}`);
        }
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
            log(`[DynamicIsland] VolumeManager: Stream changed (ID: ${this._lastStreamId} -> ${newStreamId})`);
            this._lastStreamId = newStreamId;
        }

        // Chỉ notify khi:
        // 1. Không phải đang khởi tạo
        // 2. Volume thực sự thay đổi
        // 3. Stream ID không đổi (không phải stream mới được tạo)
        if (!this._isInitializing && volumeChanged && !streamChanged) {
            log(`[DynamicIsland] VolumeManager: Volume changed - volume: ${this._currentVolume}% (was ${oldVolume}%), muted: ${this._isMuted} (was ${oldMuted})`);
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
        log(`[DynamicIsland] VolumeManager: Notifying callbacks - volume: ${info.volume}%, isMuted: ${info.isMuted}`);
        this._callbacks.forEach(cb => cb(info));
    }

    getVolumeInfo() {
        return {
            volume: this._currentVolume,
            isMuted: this._isMuted
        };
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
// 2C. VIEW - Xử lý Giao diện Media (MediaView)
// ============================================
class MediaView {
    constructor() {
        this._lastMetadata = null;
        this._lastArtPath = null;
        this._buildCompactView();
        this._buildExpandedView();
    }

    _buildCompactView() {
        log('[DynamicIsland] MediaView: Building compact view...');
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
            icon_name: 'audio-volume-high-symbolic',
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

    _buildExpandedView() {
        log('[DynamicIsland] MediaView: Building expanded view...');
        // Expanded album art (left side)
        this._expandedArt = new St.Icon({
            style_class: 'media-expanded-art',
            icon_name: 'audio-x-generic-symbolic',
            icon_size: 96,
        });

        this._expandedArtWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            style_class: 'media-expanded-art-wrapper',
            visible: true,
            reactive: true,
            clip_to_allocation: true,
        });
        this._expandedArtWrapper.set_child(this._expandedArt);
        this._expandedArtWrapper.connect('scroll-event', () => Clutter.EVENT_STOP);

        // Expanded controls (right side - top)
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

        // Expanded song title (right side - bottom)
        this._titleLabel = new St.Label({
            style_class: 'media-title-label',
            text: '',
            x_align: Clutter.ActorAlign.START,
        });

        this._titleWrapper = new St.BoxLayout({
            style_class: 'media-title-wrapper',
            x_expand: true,
            y_expand: false,
            visible: true,
            reactive: true,
        });
        this._titleWrapper.connect('scroll-event', () => Clutter.EVENT_STOP);
        this._titleWrapper.add_child(this._titleLabel);

        // Expanded container layout (2 columns: left = art, right = controls + title)
        const leftColumn = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        leftColumn.add_child(this._expandedArtWrapper);

        // Right column: controls on top, title on bottom
        const rightColumn = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'spacing: 15px;',
        });

        // Controls box wrapper
        const controlsWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: false,
        });
        controlsWrapper.set_child(this._controlsBox);
        rightColumn.add_child(controlsWrapper);

        // Title wrapper
        const titleWrapperBin = new St.Bin({
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: false,
        });
        titleWrapperBin.set_child(this._titleWrapper);
        rightColumn.add_child(titleWrapperBin);

        this.expandedContainer = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: true,
            style: 'spacing: 20px; padding: 20px;',
            visible: false,
        });
        this.expandedContainer.add_child(leftColumn);
        this.expandedContainer.add_child(rightColumn);
    }

    setCommandCallbacks(callbacks) {
        this._onPrevious = callbacks.onPrevious || (() => {
        });
        this._onPlayPause = callbacks.onPlayPause || (() => {
        });
        this._onNext = callbacks.onNext || (() => {
        });
    }

    updateMedia(mediaInfo) {
        const {isPlaying, metadata, playbackStatus, artPath} = mediaInfo;

        // Lưu lại metadata và artPath cuối cùng để restore khi play lại
        if (metadata) {
            this._lastMetadata = metadata;
        }
        if (artPath) {
            this._lastArtPath = artPath;
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
            this._expandedArtWrapper.show();
            this._controlsBox.show();
            this._titleWrapper.show();
        }

        // Sử dụng metadata/artPath hiện tại hoặc đã lưu
        const currentMetadata = metadata || this._lastMetadata;
        const currentArtPath = artPath || this._lastArtPath;

        if (!currentMetadata && !currentArtPath) {
            // Reset to default
            this._thumbnail.icon_name = 'audio-x-generic-symbolic';
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

                if (this._expandedArtWrapper) {
                    this._expandedArtWrapper.style = `background-image: url("file://${path}"); background-size: cover; border-radius: 16px;`;
                    this._expandedArt.opacity = 0;
                    this._expandedArt.visible = true;
                }
                if (this._thumbnailWrapper) {
                    this._thumbnailWrapper.style = `background-image: url("file://${path}"); background-size: cover; border-radius: 99px;`;
                    this._thumbnail.opacity = 0;
                    this._thumbnail.visible = true;
                }
            } else {
                try {
                    // Other URI
                    const gicon = Gio.icon_new_for_string(artUrl);
                    this._thumbnail.set_gicon(gicon);

                    if (this._expandedArtWrapper) {
                        const cssUrl = artUrl.replace(/'/g, "\\'");
                        this._expandedArtWrapper.style = `background-image: url("${cssUrl}"); background-size: cover; border-radius: 16px;`;
                        this._expandedArt.opacity = 0;
                        this._expandedArt.visible = true;

                        if (this._thumbnailWrapper) {
                            this._thumbnailWrapper.style = `background-image: url("${cssUrl}"); background-size: cover; border-radius: 99px;`;
                            this._thumbnail.opacity = 0;
                            this._thumbnail.visible = true;
                        }
                    }
                } catch (e) {
                    // Fallback
                    this._thumbnail.icon_name = 'audio-x-generic-symbolic';
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
                }
            }
        } else if (!isDownloading) {
            // Only reset to default if not downloading
            this._thumbnail.icon_name = 'audio-x-generic-symbolic';
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
        }

        // Update title - sử dụng metadata hiện tại hoặc đã lưu
        if (currentMetadata) {
            const manager = this._mediaManager;
            if (manager) {
                const title = manager.getTitle(currentMetadata);
                if (this._titleLabel) {
                    this._titleLabel.text = title || 'Unknown Title';
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
        log('[DynamicIsland] VolumeView: Building expanded view...');
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
// 3. CONTROLLER - Xử lý Logic (NotchController)
// ============================================
class NotchController {
    constructor() {
        log('[DynamicIsland] NotchController: Initializing...');
        this.width = 220;
        this.height = 40;
        this.expandedWidth = 440;
        this.expandedHeight = 160;

        this.isExpanded = false;
        this._isAnimating = false;

        this._collapseTimeoutId = null;
        this._autoExpandTimeoutId = null;
        this._wasCharging = false;
        this._bluetoothNotificationTimeoutId = null;
        this._currentPresenter = 'battery';

        log('[DynamicIsland] NotchController: Creating managers and views...');
        this.batteryManager = new BatteryManager();
        this.batteryView = new BatteryView();
        this.bluetoothManager = new BluetoothManager();
        this.bluetoothView = new BluetoothView();
        this.mediaManager = new MediaManager();
        this.mediaView = new MediaView();
        this.volumeManager = new VolumeManager();
        this.volumeView = new VolumeView();

        // Setup media view callbacks
        this.mediaView.setMediaManager(this.mediaManager);
        this.mediaView.setCommandCallbacks({
            onPrevious: () => this.mediaManager.sendPlayerCommand('Previous'),
            onPlayPause: () => this.mediaManager.sendPlayerCommand('PlayPause'),
            onNext: () => this.mediaManager.sendPlayerCommand('Next')
        });

        const monitor = Main.layoutManager.primaryMonitor;
        this.monitorWidth = monitor.width;

        this._createNotchActor();
        this._setupBatteryMonitoring();
        this._setupBluetoothMonitoring();
        this._setupMediaMonitoring();
        this._setupVolumeMonitoring();
        this._setupMouseEvents();

        this._updateUI();
        log('[DynamicIsland] NotchController: Initialization complete');
    }

    _createNotchActor() {
        log('[DynamicIsland] NotchController: Creating notch actor...');
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
        this.notch.set_position(initialX, 0);

        this.notch.add_child(this.batteryView.compactContainer);
        this.notch.add_child(this.bluetoothView.compactContainer);
        this.notch.add_child(this.mediaView.compactContainer);

        Main.layoutManager.addChrome(this.notch, {
            affectsInputRegion: true,
            trackFullscreen: false
        });
        log('[DynamicIsland] NotchController: Notch actor created and added to layout');
    }

    _setupMouseEvents() {
        this._motionEventId = this.notch.connect('motion-event', () => {
            this._cancelAutoCollapse();
            if (!this.isExpanded) {
                this.expandNotch(false);
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this._leaveEventId = this.notch.connect('leave-event', () => {
            if (this.isExpanded && !this._collapseTimeoutId) {
                this._collapseTimeoutId = imports.mainloop.timeout_add(300, () => {
                    this.compactNotch();
                    this._collapseTimeoutId = null;
                    return false;
                });
            }
        });
    }

    _setupBatteryMonitoring() {
        this.batteryManager.addCallback((info) => {
            this._onBatteryChanged(info);
        });
    }

    _setupBluetoothMonitoring() {
        this.bluetoothManager.addCallback((info) => {
            this._onBluetoothChanged(info);
        });
    }

    _setupMediaMonitoring() {
        this.mediaManager.addCallback((info) => {
            this._onMediaChanged(info);
        });
    }

    _setupVolumeMonitoring() {
        this._volumeTimeoutId = null;

        this.volumeManager.addCallback((info) => {
            this._onVolumeChanged(info);
        });
    }

    _onVolumeChanged(info) {
        log(`[DynamicIsland] NotchController: Volume changed - ${JSON.stringify(info)}`);
        this.volumeView.updateVolume(info);

        // Chuyển sang volume presenter
        this._switchToVolumePresenter();

        // Auto expand để hiển thị volume expanded view
        if (!this.isExpanded) {
            this.expandNotch(true);
        }

        // Tự động collapse và quay về presenter phù hợp sau 2 giây
        if (this._volumeTimeoutId) {
            imports.mainloop.source_remove(this._volumeTimeoutId);
        }

        this._volumeTimeoutId = imports.mainloop.timeout_add(2000, () => {
            if (this.isExpanded) {
                this.compactNotch();
            }

            imports.mainloop.timeout_add(300, () => {
                this._switchToAppropriatePresenter();
                if (!this.isExpanded) {
                    this.squeeze();
                }
                return false;
            });

            this._volumeTimeoutId = null;
            return false;
        });
    }

    _onBatteryChanged(info) {
        log(`[DynamicIsland] NotchController: Battery changed - ${JSON.stringify(info)}`);
        this.batteryView.updateBattery(info);

        if (info.isCharging) {
            this.notch.add_style_class_name('charging');
        } else {
            this.notch.remove_style_class_name('charging');
        }

        const shouldAutoExpand = info.isCharging && !this._wasCharging;
        this._wasCharging = info.isCharging;

        if (shouldAutoExpand && !this.isExpanded) {
            // Chuyển sang battery presenter để hiển thị charging notification
            this._switchToBatteryPresenter();

            this.expandNotch(true);

            if (this._autoExpandTimeoutId) {
                imports.mainloop.source_remove(this._autoExpandTimeoutId);
            }
            this._autoExpandTimeoutId = imports.mainloop.timeout_add(3000, () => {
                if (this.isExpanded) {
                    this.compactNotch();
                }

                // Sau khi collapse, quay về presenter phù hợp
                imports.mainloop.timeout_add(300, () => {
                    this._switchToAppropriatePresenter();
                    return false;
                });

                this._autoExpandTimeoutId = null;
                return false;
            });
        }
    }

    _onBluetoothChanged(info) {
        log(`[DynamicIsland] Controller received Bluetooth change: ${JSON.stringify(info)}`);

        // 1. Cập nhật View
        this.bluetoothView.updateBluetooth(info);

        // 2. Chuyển sang Bluetooth presenter
        this._switchToBluetoothPresenter();

        // 3. Expand notch để hiển thị thông báo (luôn gọi để cập nhật view)
        this.expandNotch(true);

        // 4. Tự động collapse và quay lại presenter phù hợp sau 3 giây
        if (this._bluetoothNotificationTimeoutId) {
            imports.mainloop.source_remove(this._bluetoothNotificationTimeoutId);
        }
        this._bluetoothNotificationTimeoutId = imports.mainloop.timeout_add(3000, () => {
            if (this.isExpanded) {
                this.compactNotch();
            }

            imports.mainloop.timeout_add(300, () => {
                // Quay về presenter phù hợp (media hoặc battery)
                this._switchToAppropriatePresenter();
                return false;
            });

            this._bluetoothNotificationTimeoutId = null;
            return false;
        });
    }

    _switchToBatteryPresenter() {
        if (this._currentPresenter === 'battery') return;

        this._currentPresenter = 'battery';
        this.bluetoothView.hide();
        this.mediaView.hide();
        this.volumeView.hide();

        // CHỈ show compact khi KHÔNG expanded
        if (!this.isExpanded) {
            this.batteryView.compactContainer.show();
        }
    }


    _onMediaChanged(info) {
        this.mediaView._updatePlayPauseIcon(info.isPlaying);

        // Clear timeout cũ nếu có
        if (this._mediaSwitchTimeoutId) {
            imports.mainloop.source_remove(this._mediaSwitchTimeoutId);
            this._mediaSwitchTimeoutId = null;
        }

        if (info.isPlaying && info.artPath) {
            this.mediaView.updateMedia(info);
            log(`[DynamicIsland] _onMediaChanged: ${JSON.stringify(info)}`);

            this._switchToMediaPresenter();
            if (!this.isExpanded) {
                this.squeeze();
            }
        } else if (!info.isPlaying) {
            // Chờ 500ms trước khi chuyển về battery (tránh flicker khi next/back)
            this._mediaSwitchTimeoutId = imports.mainloop.timeout_add(10000, () => {
                this._switchToBatteryPresenter();
                if (!this.isExpanded) {
                    this.squeeze();
                }
                this._mediaSwitchTimeoutId = null;
                return false;
            });
        }
    }

    _switchToBluetoothPresenter() {
        if (this._currentPresenter === 'bluetooth') return;

        this._currentPresenter = 'bluetooth';
        this.batteryView.compactContainer.hide();
        this.mediaView.hide();
        this.volumeView.hide();
        this.bluetoothView.show();
    }

    _switchToMediaPresenter() {
        if (this._currentPresenter === 'media') return;

        this._currentPresenter = 'media';
        this.batteryView.compactContainer.hide();
        this.bluetoothView.hide();
        this.volumeView.hide();

        // CHỈ show compact khi KHÔNG expanded
        if (!this.isExpanded) {
            this.mediaView.compactContainer.show();
        }
        // Nếu đang expanded thì giữ nguyên expanded view
    }

    _switchToVolumePresenter() {
        if (this._currentPresenter === 'volume') return;

        this._currentPresenter = 'volume';
        this.batteryView.compactContainer.hide();
        this.bluetoothView.hide();
        this.mediaView.hide();
        // Volume chỉ có expanded view, không có compact
    }

    /**
     * Tự động chuyển về presenter phù hợp (media nếu đang playing, không thì battery)
     */
    _switchToAppropriatePresenter() {
        if (this.mediaManager.isMediaPlaying()) {
            this._switchToMediaPresenter();
        } else {
            this._switchToBatteryPresenter();
        }
    }

    _updateUI() {
        const info = this.batteryManager.getBatteryInfo();
        this.mediaView.hide();
        this.bluetoothView.hide();
        this.volumeView.hide();
        this.batteryView.updateBattery(info);
    }

    _cancelAutoCollapse() {
        if (this._collapseTimeoutId) {
            imports.mainloop.source_remove(this._collapseTimeoutId);
            this._collapseTimeoutId = null;
        }
        if (this._autoExpandTimeoutId) {
            imports.mainloop.source_remove(this._autoExpandTimeoutId);
            this._autoExpandTimeoutId = null;
        }
    }

    expandNotch(isAuto = false) {
        // Nếu đang expanded và là auto expand, chỉ cập nhật presenter/view
        if (this.isExpanded && isAuto) {
            // Ẩn TẤT CẢ expanded views
            this.batteryView.expandedContainer.hide();
            this.bluetoothView.expandedContainer.hide();
            this.mediaView.expandedContainer.hide();
            this.volumeView.expandedContainer.hide();

            // Hiện expanded view tương ứng với presenter hiện tại
            if (this._currentPresenter === 'battery') {
                if (!this.batteryView.expandedContainer.get_parent()) {
                    this.notch.add_child(this.batteryView.expandedContainer);
                }
                this.batteryView.expandedContainer.show();
            } else if (this._currentPresenter === 'bluetooth') {
                if (!this.bluetoothView.expandedContainer.get_parent()) {
                    this.notch.add_child(this.bluetoothView.expandedContainer);
                }
                this.bluetoothView.expandedContainer.show();
            } else if (this._currentPresenter === 'media') {
                if (!this.mediaView.expandedContainer.get_parent()) {
                    this.notch.add_child(this.mediaView.expandedContainer);
                }
                this.mediaView.expandedContainer.show();
            } else if (this._currentPresenter === 'volume') {
                if (!this.volumeView.expandedContainer.get_parent()) {
                    this.notch.add_child(this.volumeView.expandedContainer);
                }
                this.volumeView.expandedContainer.show();
            }
            return;
        }

        if (this.isExpanded) return;
        // Chỉ chặn nếu không phải auto expand và đang có animation chạy
        if (!isAuto && this._isAnimating) return;
        this.isExpanded = true;
        this._isAnimating = true;
        this.notch.remove_all_transitions();

        // Ẩn TẤT CẢ compact views
        this.batteryView.compactContainer.hide();
        this.bluetoothView.compactContainer.hide();
        this.mediaView.compactContainer.hide();

        // Hiện expanded view tương ứng
        if (this._currentPresenter === 'battery') {
            if (!this.batteryView.expandedContainer.get_parent()) {
                this.notch.add_child(this.batteryView.expandedContainer);
            }
            this.batteryView.expandedContainer.show();
        } else if (this._currentPresenter === 'bluetooth') {
            if (!this.bluetoothView.expandedContainer.get_parent()) {
                this.notch.add_child(this.bluetoothView.expandedContainer);
            }
            this.bluetoothView.expandedContainer.show();
        } else if (this._currentPresenter === 'media') {
            if (!this.mediaView.expandedContainer.get_parent()) {
                this.notch.add_child(this.mediaView.expandedContainer);
            }
            this.mediaView.expandedContainer.show();
        } else if (this._currentPresenter === 'volume') {
            if (!this.volumeView.expandedContainer.get_parent()) {
                this.notch.add_child(this.volumeView.expandedContainer);
            }
            this.volumeView.expandedContainer.show();
        }

        // Animation...
        this.notch.add_style_class_name('expanded-state');
        this.notch.remove_style_class_name('compact-state');

        const newX = Math.floor((this.monitorWidth - this.expandedWidth) / 2);

        this.notch.ease({
            width: this.expandedWidth,
            height: this.expandedHeight,
            x: newX,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._isAnimating = false;
            }
        });
    }

    compactNotch() {
        if (!this.isExpanded) return;
        if (this._isAnimating) return; // Chặn nếu đang có animation chạy
        this.isExpanded = false;
        this._isAnimating = true;
        this.notch.remove_all_transitions();

        // ✅ ĐƠN GIẢN: Ẩn expanded views
        this.batteryView.expandedContainer.hide();
        this.bluetoothView.expandedContainer.hide();
        this.mediaView.expandedContainer.hide();
        this.volumeView.expandedContainer.hide();

        // Hiện compact view tương ứng
        if (this._currentPresenter === 'battery') {
            this.batteryView.compactContainer.show();
        } else if (this._currentPresenter === 'bluetooth') {
            // Volume không có compact view, switch về presenter phù hợp
            this._switchToAppropriatePresenter();
        } else if (this._currentPresenter === 'media') {
            this.mediaView.compactContainer.show();
        } else if (this._currentPresenter === 'volume') {
            // Volume không có compact view, switch về presenter phù hợp
            this._switchToAppropriatePresenter();
        }

        // Animation...
        this.notch.add_style_class_name('compact-state');
        this.notch.remove_style_class_name('expanded-state');

        const originalX = Math.floor((this.monitorWidth - this.width) / 2);

        this.notch.ease({
            width: this.width,
            height: this.height,
            x: originalX,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.squeeze();
            }
        });
    }

    squeeze() {
        this.notch.remove_all_transitions();

        this.notch.ease({
            scale_x: 0.75,
            scale_y: 1.0,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.notch.ease({
                    scale_x: this.originalScale,
                    scale_y: this.originalScale,
                    duration: 200,
                    mode: Clutter.AnimationMode.EASE_OUT_BACK,
                    onComplete: () => {
                        this._isAnimating = false;
                    }
                });
            }
        });
    }

    destroy() {
        this._cancelAutoCollapse();

        // Hủy media switch timeout
        if (this._mediaSwitchTimeoutId) {
            imports.mainloop.source_remove(this._mediaSwitchTimeoutId);
            this._mediaSwitchTimeoutId = null;
        }

        // Hủy Bluetooth notification timeout
        if (this._bluetoothNotificationTimeoutId) {
            imports.mainloop.source_remove(this._bluetoothNotificationTimeoutId);
            this._bluetoothNotificationTimeoutId = null;
        }

        // Hủy volume timeout
        if (this._volumeTimeoutId) {
            imports.mainloop.source_remove(this._volumeTimeoutId);
            this._volumeTimeoutId = null;
        }

        // Hủy Model
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

        // Hủy View
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

        // Hủy Bluetooth expanded container
        if (this._bluetoothExpandedContainer) {
            this._bluetoothExpandedContainer.destroy();
            this._bluetoothExpandedContainer = null;
        }

        // Hủy Actor chính và sự kiện
        if (this.notch) {
            if (this._motionEventId) {
                this.notch.disconnect(this._motionEventId);
            }
            if (this._leaveEventId) {
                this.notch.disconnect(this._leaveEventId);
            }

            Main.layoutManager.removeChrome(this.notch);
            this.notch.destroy();
            this.notch = null;
        }
    }
}


// ============================================
// GNOME SHELL EXTENSION API
// ============================================

function init() {
    log('[DynamicIsland] Extension: init() called');
    // Không làm gì nhiều ở đây theo quy ước
}

function enable() {
    log('[DynamicIsland] Extension: enable() called');
    notchController = new NotchController();

    // Di chuyển date panel của GNOME sang góc phải
    _moveDatePanelToRight();
    log('[DynamicIsland] Extension: enable() complete');
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
    try {
        const panel = Main.panel;
        if (!panel) {
            log('[DynamicIsland] Panel not found');
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
                log('[DynamicIsland] Date menu actor not found');
                return;
            }
        }

        if (!dateMenuActor) {
            log('[DynamicIsland] Date menu not found');
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
            log('[DynamicIsland] Date panel moved to right side');
        } else {
            log('[DynamicIsland] Panel right box not found');
            // Khôi phục nếu không tìm thấy right box
            if (dateMenuOriginalParent) {
                dateMenuOriginalParent.add_child(dateMenuActor);
            }
        }
    } catch (e) {
        log(`[DynamicIsland] Error moving date panel: ${e.message}`);
    }
}

function _restoreDatePanel() {
    try {
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
            log('[DynamicIsland] Date panel restored to original position');
        }

        dateMenuActor = null;
        dateMenuOriginalParent = null;
    } catch (e) {
        log(`[DynamicIsland] Error restoring date panel: ${e.message}`);
    }
}