import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export class BatteryManager {
    constructor() {
        this._serverProxy = null;
        this._callbacks = [];
        this._currentPercentage = 0;
        this._isCharging = false;
        this._isPresent = false;
        this._timeToEmpty = 0;
        this._timeToFull = 0;
        this._isInitializing = true;
        this._hasReceivedValue = false; // Flag để biết đã nhận được giá trị từ server chưa

        this._hasPowerState = false;
        this._powerSignal = 0;
        this._destroyed = false;
        this._initPowerConnection();
        this._initServerConnection();
    }

    _initPowerConnection() {
        const PowerProxy = Gio.DBusProxy.makeProxyWrapper(`<node>
            <interface name="org.freedesktop.UPower">
                <property name="OnBattery" type="b" access="read"/>
            </interface></node>`);
        this._powerProxy = new PowerProxy(Gio.DBus.system, 'org.freedesktop.UPower',
            '/org/freedesktop/UPower', (proxy, error) => {
                if (error || this._destroyed) return;
                const update = () => {
                    if (typeof proxy.OnBattery !== 'boolean') return;
                    const plugged = !proxy.OnBattery;
                    if (this._hasPowerState && plugged === this._isPlugged) return;
                    this._hasPowerState = true;
                    this._isPlugged = plugged;
                    this._notifyCallbacks();
                };
                this._powerSignal = proxy.connect('g-properties-changed', update);
                update();
            });
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
                        <arg name="timeToEmpty" type="x" direction="out"/>
                        <arg name="timeToFull" type="x" direction="out"/>
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
                    // log(`[DynamicIsland] BatteryManager: Failed to connect to server: ${error.message || error}`);
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
                    // log(`[DynamicIsland] BatteryManager: Failed to get initial battery info: ${error.message || error}`);
                    // Đánh dấu đã khởi tạo xong dù có lỗi
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                        this._isInitializing = false;
                        return false;
                    });
                    return;
                }

                // result là array [percentage, isCharging, isPresent, timeToEmpty, timeToFull]
                const percentage = result[0] || 0;
                const isCharging = Boolean(result[1]);
                const isPresent = Boolean(result[2]);
                const timeToEmpty = result[3] || 0;
                const timeToFull = result[4] || 0;

                // Cập nhật giá trị
                this._currentPercentage = Math.round(percentage);
                this._isCharging = isCharging;
                this._isPresent = isPresent;
                this._timeToEmpty = timeToEmpty;
                this._timeToFull = timeToFull;
                this._hasReceivedValue = true;
                this._isInitializing = false;

                // Notify với giá trị ban đầu
                this._notifyCallbacks();
            });
        } catch (e) {
            // log(`[DynamicIsland] BatteryManager: Error calling GetBatteryInfo: ${e.message || e}`);
            // Đánh dấu đã khởi tạo xong dù có lỗi
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
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
            // log(`[DynamicIsland] BatteryManager: Failed to parse metadata: ${e.message || e}`);
            return;
        }

        // Cập nhật trạng thái pin
        const percentage = metadataObj.percentage !== undefined ? Math.round(metadataObj.percentage) : this._currentPercentage;
        const isCharging = metadataObj.isCharging !== undefined ? Boolean(metadataObj.isCharging) : this._isCharging;
        const isPresent = metadataObj.isPresent !== undefined ? Boolean(metadataObj.isPresent) : this._isPresent;
        const timeToEmpty = metadataObj.timeToEmpty !== undefined ? metadataObj.timeToEmpty : (this._timeToEmpty || 0);
        const timeToFull = metadataObj.timeToFull !== undefined ? metadataObj.timeToFull : (this._timeToFull || 0);

        // Kiểm tra xem có thay đổi không
        const hasChanged = this._currentPercentage !== percentage ||
            this._isCharging !== isCharging ||
            this._isPresent !== isPresent;

        // Cập nhật giá trị
        this._currentPercentage = percentage;
        this._isCharging = isCharging;
        this._isPresent = isPresent;
        this._timeToEmpty = timeToEmpty;
        this._timeToFull = timeToFull;

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
            isPresent: this._isPresent,
            isPlugged: this._hasPowerState ? this._isPlugged : null,
            timeToEmpty: this._timeToEmpty || 0,
            timeToFull: this._timeToFull || 0
        };
    }

    destroy() {
        this._destroyed = true;
        if (this._powerSignal) this._powerProxy.disconnect(this._powerSignal);
        this._powerSignal = 0;
        this._powerProxy = null;
        if (this._serverProxy) {
            this._serverProxy = null;
        }
        this._callbacks = [];
    }
}
