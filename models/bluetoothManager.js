const Gio = imports.gi.Gio;

var BluetoothManager = class BluetoothManager {
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