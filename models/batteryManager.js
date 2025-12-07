const Gio = imports.gi.Gio;
const UPower = imports.gi.UPowerGlib;

var BatteryManager = class BatteryManager {
    constructor() {
        this._proxy = null;
        this._signalId = null;
        this._callbacks = [];
        this._wasCharging = false;

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
        
        // Detect charging state change for auto-expand
        const wasCharging = this._wasCharging;
        this._wasCharging = info.isCharging;
        info.shouldAutoExpand = info.isCharging && !wasCharging;
        
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