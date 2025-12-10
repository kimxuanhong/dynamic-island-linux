const Gio = imports.gi.Gio;

var BatteryManager = class BatteryManager {
    constructor() {
        this._serverProxy = null;
        this._callbacks = [];
        this._wasCharging = false;
        this._currentPercentage = 0;
        this._isCharging = false;
        this._isPresent = false;
        this._isInitializing = true;
        this._hasReceivedValue = false; // Flag để biết đã nhận được giá trị từ server chưa

        this._initServerConnection();
    }

    _initServerConnection() {
        // Định nghĩa Interface cho Server DBus Signal và Methods
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
                    <method name="GetBatteryInfo">
                        <arg name="percentage" type="i" direction="out"/>
                        <arg name="isCharging" type="b" direction="out"/>
                        <arg name="isPresent" type="b" direction="out"/>
                    </method>
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
                    log(`[DynamicIsland] BatteryManager: Failed to connect to server: ${error.message || error}`);
                    return;
                }

                // Lắng nghe signal EventOccurred
                this._serverProxy.connectSignal('EventOccurred', (proxy, senderName, [eventType, appName, pid, timestamp, metadata]) => {
                    this._onServerEvent(eventType, appName, pid, timestamp, metadata);
                });

                // Gọi GetBatteryInfo để lấy giá trị ban đầu
                this._fetchInitialBatteryInfo();
            }
        );
    }

    _fetchInitialBatteryInfo() {
        if (!this._serverProxy) return;

        try {
            this._serverProxy.GetBatteryInfoRemote((result, error) => {
                if (error) {
                    log(`[DynamicIsland] BatteryManager: Failed to get initial battery info: ${error.message || error}`);
                    // Đánh dấu đã khởi tạo xong dù có lỗi
                    imports.mainloop.timeout_add(500, () => {
                        this._isInitializing = false;
                        return false;
                    });
                    return;
                }

                // result là array [percentage, isCharging, isPresent]
                const percentage = result[0] || 0;
                const isCharging = Boolean(result[1]);
                const isPresent = Boolean(result[2]);

                // Cập nhật giá trị
                this._currentPercentage = Math.round(percentage);
                this._isCharging = isCharging;
                this._isPresent = isPresent;
                this._hasReceivedValue = true;
                this._isInitializing = false;

                // Notify với giá trị ban đầu
                this._notifyCallbacks();
            });
        } catch (e) {
            log(`[DynamicIsland] BatteryManager: Error calling GetBatteryInfo: ${e.message || e}`);
            // Đánh dấu đã khởi tạo xong dù có lỗi
            imports.mainloop.timeout_add(500, () => {
                this._isInitializing = false;
                return false;
            });
        }
    }

    _onServerEvent(eventType, appName, pid, timestamp, metadata) {
        // Chỉ xử lý các events battery
        if (eventType !== 'battery_changed') {
            return;
        }

        // Parse metadata JSON
        let metadataObj = {};
        try {
            if (metadata && typeof metadata === 'string') {
                metadataObj = JSON.parse(metadata);
            }
        } catch (e) {
            log(`[DynamicIsland] BatteryManager: Failed to parse metadata: ${e.message || e}`);
            return;
        }

        // Cập nhật trạng thái pin
        const percentage = metadataObj.percentage !== undefined ? Math.round(metadataObj.percentage) : this._currentPercentage;
        const isCharging = metadataObj.isCharging !== undefined ? Boolean(metadataObj.isCharging) : this._isCharging;
        const isPresent = metadataObj.isPresent !== undefined ? Boolean(metadataObj.isPresent) : this._isPresent;

        // Kiểm tra xem có thay đổi không
        const hasChanged = this._currentPercentage !== percentage || 
            this._isCharging !== isCharging || 
            this._isPresent !== isPresent;

        // Cập nhật giá trị
        this._currentPercentage = percentage;
        this._isCharging = isCharging;
        this._isPresent = isPresent;

        // Đánh dấu đã nhận được giá trị từ server
        this._hasReceivedValue = true;

        // Chỉ notify nếu:
        // 1. Lần đầu nhận được giá trị từ server (để có giá trị ban đầu)
        // 2. Hoặc có thay đổi sau đó
        if (this._isInitializing) {
            // Lần đầu nhận được giá trị từ server, đánh dấu đã khởi tạo xong và notify
            this._isInitializing = false;
            this._notifyCallbacks();
        } else if (hasChanged) {
            // Các lần sau chỉ notify khi có thay đổi
            this._notifyCallbacks();
        }
    }

    addCallback(callback) {
        this._callbacks.push(callback);
    }

    _notifyCallbacks() {
        const info = this.getBatteryInfo();
        
        // Nếu không có thông tin, không notify
        if (!info) {
            return;
        }
        
        // Detect charging state change for auto-expand
        const wasCharging = this._wasCharging;
        this._wasCharging = info.isCharging;
        info.shouldAutoExpand = info.isCharging && !wasCharging;
        
        this._callbacks.forEach(cb => cb(info));
    }

    getBatteryInfo() {
        // Nếu chưa nhận được giá trị từ server, trả về null để không hiển thị gì
        if (!this._hasReceivedValue) {
            return null;
        }
        return {
            percentage: this._currentPercentage,
            isCharging: this._isCharging,
            isPresent: this._isPresent
        };
    }

    destroy() {
        if (this._serverProxy) {
            this._serverProxy = null;
        }
        this._callbacks = [];
    }
}