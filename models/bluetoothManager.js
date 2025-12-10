const Gio = imports.gi.Gio;

var BluetoothManager = class BluetoothManager {
    constructor() {
        this._callbacks = [];
        // Map để track các thiết bị đã kết nối: deviceName -> {isConnected, deviceType, address}
        this._connectedDevices = new Map();
        this._serverProxy = null;
        this._destroyed = false;
        this._isInitializing = true;

        this._initServerConnection();
    }

    _initServerConnection() {
        // Định nghĩa Interface cho Server DBus Signal
        const ServerInterface = `
            <node>
                <interface name="com.github.dynamic_island.Server">
                    <signal name="EventOccurred">
                        <arg name="event_type" type="s" direction="out"/>
                        <arg name="app_name" type="s" direction="out"/>
                        <arg name="pid" type="i" direction="out"/>
                        <arg name="timestamp" type="s" direction="out"/>
                        <arg name="metadata" type="s" direction="out"/>
                    </signal>
                </interface>
            </node>
        `;
        const ServerProxy = Gio.DBusProxy.makeProxyWrapper(ServerInterface);

        // Kết nối tới Server qua Session Bus
        this._serverProxy = new ServerProxy(
            Gio.DBus.session,
            'com.github.dynamic_island.Server',
            '/com/github/dynamic_island/Server',
            (proxy, error) => {
                if (error) {
                    log(`[DynamicIsland] BluetoothManager: Failed to connect to server: ${error.message || error}`);
                    return;
                }

                // Lắng nghe signal EventOccurred
                this._serverProxy.connectSignal('EventOccurred', (proxy, senderName, [eventType, appName, pid, timestamp, metadata]) => {
                    this._onServerEvent(eventType, appName, pid, timestamp, metadata);
                });

                // Đánh dấu đã khởi tạo xong sau một khoảng thời gian ngắn
                imports.mainloop.timeout_add(500, () => {
                    this._isInitializing = false;
                    return false;
                });
            }
        );
    }

    _onServerEvent(eventType, appName, pid, timestamp, metadata) {
        if (this._destroyed) return;

        // Chỉ xử lý các events bluetooth
        if (eventType !== 'bluetooth_connected' && eventType !== 'bluetooth_disconnected') {
            return;
        }

        // Bỏ qua notifications trong lúc khởi tạo
        if (this._isInitializing) {
            return;
        }

        // Parse metadata JSON
        let metadataObj = {};
        try {
            if (metadata && typeof metadata === 'string') {
                metadataObj = JSON.parse(metadata);
            }
        } catch (e) {
            log(`[DynamicIsland] BluetoothManager: Failed to parse metadata: ${e.message || e}`);
        }

        const isConnected = eventType === 'bluetooth_connected';
        const deviceName = appName || 'Unknown Device';
        const deviceType = metadataObj.device_type || metadataObj.icon || '';
        const address = metadataObj.address || '';

        // Cập nhật trạng thái thiết bị
        if (isConnected) {
            this._connectedDevices.set(deviceName, {
                isConnected: true,
                deviceType: deviceType,
                address: address
            });
        } else {
            // Khi disconnect, vẫn giữ thông tin thiết bị nhưng đánh dấu disconnected
            if (this._connectedDevices.has(deviceName)) {
                const device = this._connectedDevices.get(deviceName);
                device.isConnected = false;
            } else {
                // Nếu chưa có trong map, thêm vào với trạng thái disconnected
                this._connectedDevices.set(deviceName, {
                    isConnected: false,
                    deviceType: deviceType,
                    address: address
                });
            }
        }

        // Gọi callback với format tương tự như trước
        this._notifyCallbacks({
            deviceName: deviceName,
            isConnected: isConnected,
            deviceType: deviceType
        });
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
        this._connectedDevices.forEach((device) => {
            if (hasHeadset) return; // Đã tìm thấy

            if (device.isConnected) {
                const deviceType = device.deviceType || '';
                // Kiểm tra các loại thiết bị audio
                if (deviceType.includes('headset') ||
                    deviceType.includes('headphone') ||
                    deviceType.includes('earbud') ||
                    deviceType.includes('audio-card') ||
                    deviceType.includes('speaker')) {
                    hasHeadset = true;
                }
            }
        });
        return hasHeadset;
    }

    destroy() {
        this._destroyed = true;

        if (this._serverProxy) {
            this._serverProxy = null;
        }

        this._connectedDevices.clear();
        this._callbacks = [];
    }
}