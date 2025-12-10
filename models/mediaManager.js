const Gio = imports.gi.Gio;

var MediaManager = class MediaManager {
    constructor() {
        this._callbacks = [];
        this._serverProxy = null;
        this._methodsProxy = null;
        this._playbackStatus = null;
        this._currentMetadata = null;
        this._currentArtPath = null;
        this._currentPlayer = null;
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
                    <method name="MediaNext">
                    </method>
                    <method name="MediaPrevious">
                    </method>
                    <method name="MediaPlayPause">
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
                    log(`[DynamicIsland] MediaManager: Failed to connect to server: ${error.message || error}`);
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
                    log(`[DynamicIsland] MediaManager: Failed to connect methods proxy: ${error.message || error}`);
                }
            }
        );
    }

    _onServerEvent(eventType, appName, pid, timestamp, metadata) {
        if (this._destroyed) return;

        // Chỉ xử lý các events media
        if (eventType !== 'media_changed') {
            return;
        }

        // Parse metadata JSON
        let metadataObj = {};
        try {
            if (metadata && typeof metadata === 'string') {
                metadataObj = JSON.parse(metadata);
            }
        } catch (e) {
            log(`[DynamicIsland] MediaManager: Failed to parse metadata: ${e.message || e}`);
            return;
        }

        // Cập nhật trạng thái media
        const status = metadataObj.status || '';
        const isPlaying = metadataObj.isPlaying !== undefined ? Boolean(metadataObj.isPlaying) : false;
        const title = metadataObj.title || '';
        const artist = metadataObj.artist || '';
        const album = metadataObj.album || '';
        const artUrl = metadataObj.artUrl || '';
        const player = metadataObj.player || '';

        // Nếu player rỗng hoặc status rỗng, có nghĩa là không có player nào đang chạy
        if (!player || !status) {
            this._playbackStatus = null;
            this._currentMetadata = null;
            this._currentArtPath = null;
            this._currentPlayer = null;

            this._notifyCallbacks({
                isPlaying: false,
                metadata: null,
                playbackStatus: null,
                artPath: null
            });
            return;
        }

        // Cập nhật metadata object (để tương thích với các helper methods)
        this._currentMetadata = {
            'xesam:title': title,
            'xesam:artist': artist ? [artist] : [],
            'xesam:album': album,
            'mpris:artUrl': artUrl
        };

        this._playbackStatus = status;
        this._currentArtPath = artUrl;
        this._currentPlayer = player;

        // Notify callbacks
        this._notifyCallbacks({
            isPlaying: isPlaying,
            metadata: this._currentMetadata,
            playbackStatus: status,
            artPath: artUrl
        });
    }

    // Helper methods để extract metadata (giữ lại để tương thích với code cũ)
    _extractMetadataValue(metadata, keys) {
        try {
            if (!metadata) return null;
            for (const key of keys) {
                if (metadata[key] !== undefined && metadata[key] !== null) {
                    const value = metadata[key];
                    // Nếu là array (như xesam:artist), lấy phần tử đầu
                    if (Array.isArray(value) && value.length > 0) {
                        return value[0];
                    }
                    return value;
                }
            }
        } catch (e) {
            log(`[DynamicIsland] MediaManager: Error extracting metadata value: ${e.message || e}`);
        }
        return null;
    }

    _extractArtUrl(metadata) {
        return this._extractMetadataValue(metadata, ['mpris:artUrl', 'xesam:artUrl', 'mpris:arturl']);
    }

    _extractTitle(metadata) {
        return this._extractMetadataValue(metadata, ['xesam:title', 'mpris:title']);
    }


    _extractArtist(metadata) {
        try {
            if (!metadata) return null;
            const artist = this._extractMetadataValue(metadata, ['xesam:artist', 'xesam:albumArtist']);
            if (Array.isArray(artist) && artist.length > 0) {
                return artist.join(', ');
            }
            return artist || null;
        } catch (e) {
            log(`[DynamicIsland] MediaManager: Error extracting artist: ${e.message || e}`);
        }
        return null;
    }

    getArtUrl(metadata) {
        // Server đã download và cache art, chỉ cần trả về path từ metadata
        if (!metadata) return null;
        return this._extractArtUrl(metadata);
    }

    getTitle(metadata) {
        if (!metadata) return null;
        return this._extractTitle(metadata);
    }

    getArtist(metadata) {
        if (!metadata) return null;
        return this._extractArtist(metadata);
    }

    hasArtUrl(metadata) {
        if (!metadata) return false;
        const artUrl = this._extractArtUrl(metadata);
        return !!artUrl;
    }

    sendPlayerCommand(method) {
        if (!this._methodsProxy) return;
        try {
            // Gọi methods qua server
            if (method === 'PlayPause') {
                this._methodsProxy.MediaPlayPauseRemote((result, error) => {
                    if (error) {
                        log(`[DynamicIsland] MediaManager: Error sending PlayPause command: ${error.message || error}`);
                    }
                });
            } else if (method === 'Next') {
                this._methodsProxy.MediaNextRemote((result, error) => {
                    if (error) {
                        log(`[DynamicIsland] MediaManager: Error sending Next command: ${error.message || error}`);
                    }
                });
            } else if (method === 'Previous') {
                this._methodsProxy.MediaPreviousRemote((result, error) => {
                    if (error) {
                        log(`[DynamicIsland] MediaManager: Error sending Previous command: ${error.message || error}`);
                    }
                });
            }
        } catch (e) {
            log(`[DynamicIsland] MediaManager: Error sending ${method} command: ${e.message || e}`);
        }
    }

    addCallback(callback) {
        this._callbacks.push(callback);
    }

    _notifyCallbacks(info) {
        this._callbacks.forEach(cb => cb(info));
    }

    isMediaPlaying() {
        return this._playbackStatus === 'Playing';
    }

    getCurrentPlayer() {
        return this._currentPlayer;
    }

    destroy() {
        this._destroyed = true;

        if (this._serverProxy) {
            this._serverProxy = null;
        }
        if (this._methodsProxy) {
            this._methodsProxy = null;
        }

        this._playbackStatus = null;
        this._currentMetadata = null;
        this._currentArtPath = null;
        this._currentPlayer = null;
        this._callbacks = [];
    }
}