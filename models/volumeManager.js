const Gio = imports.gi.Gio;

var VolumeManager = class VolumeManager {
    constructor() {
        this._callbacks = [];
        this._currentVolume = 0;
        this._isMuted = false;
        this._serverProxy = null;
        this._methodsProxy = null;
        this._destroyed = false;
        this._isInitializing = true;

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
                    <method name="SetVolume">
                        <arg name="level" type="i" direction="in"/>
                    </method>
                    <method name="ToggleMute">
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
                    log(`[DynamicIsland] VolumeManager: Failed to connect to server: ${error.message || error}`);
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

        // Tạo proxy riêng để gọi methods
        this._methodsProxy = new ServerProxy(
            Gio.DBus.session,
            'com.github.dynamic_island.Server',
            '/com/github/dynamic_island/Server',
            (proxy, error) => {
                if (error) {
                    log(`[DynamicIsland] VolumeManager: Failed to connect methods proxy: ${error.message || error}`);
                }
            }
        );
    }

    _onServerEvent(eventType, appName, pid, timestamp, metadata) {
        if (this._destroyed) return;

        // Chỉ xử lý các events volume
        if (eventType !== 'volume_changed' && eventType !== 'volume_muted' && eventType !== 'volume_unmuted') {
            return;
        }

        // Bỏ qua notifications trong lúc khởi tạo (trừ lần đầu để có giá trị ban đầu)
        if (this._isInitializing && this._currentVolume > 0) {
            return;
        }

        // Parse metadata JSON
        let metadataObj = {};
        try {
            if (metadata && typeof metadata === 'string') {
                metadataObj = JSON.parse(metadata);
            }
        } catch (e) {
            log(`[DynamicIsland] VolumeManager: Failed to parse metadata: ${e.message || e}`);
            return;
        }

        // Cập nhật volume và mute state
        const level = metadataObj.level !== undefined ? Math.round(metadataObj.level) : this._currentVolume;
        const muted = metadataObj.muted !== undefined ? Boolean(metadataObj.muted) : this._isMuted;

        // Chỉ notify nếu có thay đổi hoặc đang khởi tạo
        if (this._currentVolume !== level || this._isMuted !== muted || this._isInitializing) {
            this._currentVolume = level;
            this._isMuted = muted;

            this._notifyCallbacks({
                volume: level,
                isMuted: muted
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
     * Kiểm tra xem audio có đang bị mute không
     * @returns {boolean}
     */
    isMuted() {
        return this._isMuted;
    }

    /**
     * Lấy default sink stream
     * @returns {object|null}
     * @deprecated Không còn sử dụng control trực tiếp, trả về null
     */
    getDefaultSink() {
        return null;
    }

    /**
     * Lấy giá trị volume max normalized
     * @returns {number}
     * @deprecated Không còn sử dụng control trực tiếp, trả về 0
     */
    getVolMaxNorm() {
        return 0;
    }

    /**
     * Toggle mute/unmute
     * @returns {boolean} Trạng thái mute mới (dự đoán, sẽ được cập nhật khi nhận event từ server)
     */
    toggleMute() {
        if (!this._methodsProxy) return this._isMuted;

        try {
            // Gọi method ToggleMute qua server
            this._methodsProxy.ToggleMuteRemote((result, error) => {
                if (error) {
                    log(`[DynamicIsland] VolumeManager: Error toggling mute: ${error.message || error}`);
                }
            });

            // Dự đoán trạng thái mới (sẽ được cập nhật khi nhận event từ server)
            return !this._isMuted;
        } catch (e) {
            log(`[DynamicIsland] VolumeManager: Error toggling mute: ${e.message || e}`);
            return this._isMuted;
        }
    }

    /**
     * Set volume theo percentage (0-100)
     * @param {number} percentage - Volume percentage (0-100)
     * @returns {boolean} True nếu thành công
     */
    setVolume(percentage) {
        if (!this._methodsProxy) return false;

        try {
            const targetVolume = Math.round(Math.max(0, Math.min(120, percentage)));
            
            // Gọi method SetVolume qua server
            this._methodsProxy.SetVolumeRemote(targetVolume, (result, error) => {
                if (error) {
                    log(`[DynamicIsland] VolumeManager: Error setting volume: ${error.message || error}`);
                }
            });
            
            return true;
        } catch (e) {
            log(`[DynamicIsland] VolumeManager: Error setting volume: ${e.message || e}`);
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