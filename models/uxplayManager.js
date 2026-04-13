const Gio = imports.gi.Gio;

var UxplayManager = class UxplayManager {
    constructor() {
        this._callbacks = [];
        this._isSharing = false;
        this._appName = 'Uxplay';
        this._serverProxy = null;
        this._destroyed = false;
        this._isInitializing = true;

        this._initServerConnection();
    }

    _initServerConnection() {
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

        this._serverProxy = new ServerProxy(
            Gio.DBus.session,
            'com.github.dynamic_island.Server',
            '/com/github/dynamic_island/Server',
            (proxy, error) => {
                if (error) return;

                this._serverProxy.connectSignal('EventOccurred', (proxy, senderName, [eventType, appName, pid, timestamp, metadata]) => {
                    this._onServerEvent(eventType, appName, pid, timestamp, metadata);
                });

                imports.mainloop.timeout_add(500, () => {
                    this._isInitializing = false;
                    return false;
                });
            }
        );
    }

    _onServerEvent(eventType, appName, pid, timestamp, metadata) {
        if (this._destroyed || this._isInitializing) return;

        // Chỉ xử lý sự kiện từ Uxplay
        if (eventType !== 'uxplay_sharing') return;

        let metadataObj = {};
        try {
            if (metadata && typeof metadata === 'string') {
                metadataObj = JSON.parse(metadata);
            }
        } catch (e) {}

        // Đọc trạng thái isSharing từ map metadata mà server Go gửi sang
        this._isSharing = metadataObj.isSharing === true || metadataObj.isSharing === 'true';

        const info = {
            isSharing: this._isSharing,
            appName: this._appName
        };
        this._notifyCallbacks(info);
    }

    _notifyCallbacks(info) {
        this._callbacks.forEach(callback => {
            try {
                callback(info);
            } catch (e) {}
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

    isSharing() {
        return this._isSharing;
    }

    getSharingInfo() {
        if (!this._isSharing) return null;

        return {
            isSharing: true,
            appName: this._appName
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
