const Gio = imports.gi.Gio;

var CameraManager = class CameraManager {
    constructor() {
        this._callbacks = [];
        this._isCameraInUse = false;
        this._appName = '';
        this._startTime = null;
        this._serverProxy = null;
        this._destroyed = false;
        this._isInitializing = true;

        this._initServerConnection();
    }

    _initServerConnection() {
        // Interface definition for DBus Server Signal
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

        // Connect to Server via Session Bus
        this._serverProxy = new ServerProxy(
            Gio.DBus.session,
            'com.github.dynamic_island.Server',
            '/com/github/dynamic_island/Server',
            (proxy, error) => {
                if (error) {
                    return;
                }

                // Listen for EventOccurred signal
                this._serverProxy.connectSignal('EventOccurred', (proxy, senderName, [eventType, appName, pid, timestamp, metadata]) => {
                    this._onServerEvent(eventType, appName, pid, timestamp, metadata);
                });

                // Mark initialization complete after a short delay
                imports.mainloop.timeout_add(500, () => {
                    this._isInitializing = false;
                    return false;
                });
            }
        );
    }

    _onServerEvent(eventType, appName, pid, timestamp, metadata) {
        if (this._destroyed) return;

        // Only handle camera events
        if (eventType !== 'camera_start' && eventType !== 'camera_stop') {
            return;
        }

        // Ignore events during initialization if needed
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
            log(`[DynamicIsland] CameraManager: Failed to parse metadata: ${e.message || e}`);
        }

        if (eventType === 'camera_start') {
            this._isCameraInUse = true;
            this._appName = appName || metadataObj.app_name || 'Camera';
            this._startTime = Date.now();
        } else {
            this._isCameraInUse = false;
            this._startTime = null;
        }

        // Notify callbacks
        const info = {
            isCameraInUse: this._isCameraInUse,
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
                log(`[DynamicIsland] CameraManager: Callback error: ${e.message || e}`);
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

    isCameraInUse() {
        return this._isCameraInUse;
    }

    getCameraInfo() {
        if (!this._isCameraInUse) {
            return null;
        }

        const elapsed = this._startTime ? Math.floor((Date.now() - this._startTime) / 1000) : 0;
        return {
            isCameraInUse: true,
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
