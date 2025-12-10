const Gio = imports.gi.Gio;

var BrightnessManager = class BrightnessManager {
    constructor() {
        this._callbacks = [];
        this._currentBrightness = 0;
        this._serverProxy = null;
        this._methodsProxy = null;
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
                    <method name="SetBrightness">
                        <arg name="level" type="i" direction="in"/>
                    </method>
                </interface>
            </node>
        `;
        const ServerProxy = Gio.DBusProxy.makeProxyWrapper(ServerInterface);

        // Kết nối tới Server qua Session Bus để lắng nghe signals
        this._serverProxy = new ServerProxy(
            Gio.DBus.session,
            'com.github.dynamic_island.Server',
            '/com/github/dynamic_island/Server',
            (proxy, error) => {
                if (error) {
                    log(`[DynamicIsland] BrightnessManager: Failed to connect to server: ${error.message || error}`);
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

        // Tạo proxy riêng để gọi methods (có thể dùng chung với _serverProxy nhưng tách ra cho rõ ràng)
        this._methodsProxy = new ServerProxy(
            Gio.DBus.session,
            'com.github.dynamic_island.Server',
            '/com/github/dynamic_island/Server',
            (proxy, error) => {
                if (error) {
                    log(`[DynamicIsland] BrightnessManager: Failed to connect methods proxy: ${error.message || error}`);
                }
            }
        );
    }

    _onServerEvent(eventType, appName, pid, timestamp, metadata) {
        if (this._destroyed) return;

        // Chỉ xử lý các events brightness
        if (eventType !== 'brightness_changed') {
            return;
        }

        // Bỏ qua notifications trong lúc khởi tạo (trừ lần đầu để có giá trị ban đầu)
        if (this._isInitializing && this._currentBrightness > 0) {
            return;
        }

        // Parse metadata JSON
        let metadataObj = {};
        try {
            if (metadata && typeof metadata === 'string') {
                metadataObj = JSON.parse(metadata);
            }
        } catch (e) {
            log(`[DynamicIsland] BrightnessManager: Failed to parse metadata: ${e.message || e}`);
            return;
        }

        // Cập nhật brightness
        const level = metadataObj.level !== undefined ? Math.round(metadataObj.level) : this._currentBrightness;
        const oldLevel = metadataObj.old_level !== undefined ? Math.round(metadataObj.old_level) : this._currentBrightness;

        // Chỉ notify nếu có thay đổi và diff <= 5 (giống logic cũ)
        const diff = Math.abs(level - oldLevel);
        if ((this._currentBrightness !== level || this._isInitializing) && diff <= 5) {
            this._currentBrightness = level;
            this._notifyCallbacks({
                brightness: level
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
        if (!this._methodsProxy) return false;

        try {
            const targetBrightness = Math.round(Math.max(0, Math.min(100, percentage)));
            
            // Gọi method SetBrightness qua server
            this._methodsProxy.SetBrightnessRemote(targetBrightness, (result, error) => {
                if (error) {
                    log(`[DynamicIsland] BrightnessManager: Error setting brightness: ${error.message || error}`);
                }
            });
            
            return true;
        } catch (e) {
            log(`[DynamicIsland] BrightnessManager: Error setting brightness: ${e.message || e}`);
            return false;
        }
    }

    destroy() {
        this._destroyed = true;

        if (this._serverProxy) {
            this._serverProxy = null;
        }
        if (this._methodsProxy) {
            this._methodsProxy = null;
        }

        this._callbacks = [];
    }
}