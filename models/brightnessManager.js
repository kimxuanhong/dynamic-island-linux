const Gio = imports.gi.Gio;

var BrightnessManager = class BrightnessManager {
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

    /**
     * Set brightness theo percentage (0-100)
     * @param {number} percentage - Brightness percentage (0-100)
     * @returns {boolean} True nếu thành công
     */
    setBrightness(percentage) {
        if (!this._control) return false;

        try {
            const targetBrightness = Math.round(percentage);
            this._control.Brightness = targetBrightness;
            return true;
        } catch (e) {
            log(`[DynamicIsland] BrightnessManager: Error setting brightness: ${e.message || e}`);
            return false;
        }
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