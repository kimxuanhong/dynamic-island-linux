const Gio = imports.gi.Gio;

var RecordingManager = class RecordingManager {
    constructor() {
        this._callbacks = [];
        this._isRecording = false;
        this._appName = '';
        this._startTime = null;
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
                    log(`[DynamicIsland] RecordingManager: Failed to connect to server: ${error.message || error}`);
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

        // log(`[DynamicIsland] RecordingManager: Received event: ${eventType}, appName: ${appName}`);

        // Chỉ xử lý các events recording (server emit microphone_start/microphone_stop)
        if (eventType !== 'microphone_start' && eventType !== 'microphone_stop' &&
            eventType !== 'recording_started' && eventType !== 'recording_stopped') {
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
            log(`[DynamicIsland] RecordingManager: Failed to parse metadata: ${e.message || e}`);
        }

        const isStarted = eventType === 'recording_started' || eventType === 'microphone_start';

        if (isStarted) {
            this._isRecording = true;
            this._appName = appName || metadataObj.app_name || 'Microphone';
            this._startTime = Date.now();
        } else {
            this._isRecording = false;
            this._startTime = null;
        }

        // Gọi callback với format tương tự như các manager khác
        const info = {
            isRecording: this._isRecording,
            appName: this._appName,
            startTime: this._startTime
        };
        this._notifyCallbacks(info);
    }

    _notifyCallbacks(info) {
        this._callbacks.forEach(callback => {
            try {
                callback(info);
            } catch (e) {
                log(`[DynamicIsland] RecordingManager: Callback error: ${e.message || e}`);
            }
        });
    }

    addCallback(callback) {
        this._callbacks.push(callback);
    }

    removeCallback(callback) {
        const index = this._callbacks.indexOf(callback);
        if (index > -1) {
            this._callbacks.splice(index, 1);
        }
    }

    isRecording() {
        return this._isRecording;
    }

    getRecordingInfo() {
        if (!this._isRecording) {
            return null;
        }

        const elapsed = this._startTime ? Math.floor((Date.now() - this._startTime) / 1000) : 0;
        return {
            isRecording: true,
            appName: this._appName,
            elapsedSeconds: elapsed,
            startTime: this._startTime
        };
    }

    destroy() {
        this._destroyed = true;
        this._callbacks = [];
        if (this._serverProxy) {
            this._serverProxy = null;
        }
    }
};
