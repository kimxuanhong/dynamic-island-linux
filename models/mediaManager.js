const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Soup = imports.gi.Soup;

var MediaManager = class MediaManager {
    constructor() {
        this._callbacks = [];
        this._playerProxy = null;
        this._playerProxySignal = null;
        this._dbusProxy = null;
        this._dbusSignalId = null;
        this._playbackStatus = null;
        this._currentMetadata = null;
        this._currentArtPath = null;
        this._checkTimeoutId = null;
        this._httpSession = new Soup.Session();
        this._artCache = new Map(); // URL -> local path
        this._destroyed = false;
        this._pendingUpdate = null; // Batch updates
        this._playerListeners = [];
        this._currentPlayer = null;

        // Define XML interfaces
        this._defineInterfaces();
        this._setupDBusNameOwnerChanged();
        this._watchForMediaPlayers();
    }

    _defineInterfaces() {
        // MPRIS Player Interface
        const MPRIS_PLAYER_INTERFACE = `
        <node>
            <interface name="org.mpris.MediaPlayer2.Player">
                <property name="PlaybackStatus" type="s" access="read"/>
                <property name="Metadata" type="a{sv}" access="read"/>
                <method name="PlayPause"/>
                <method name="Next"/>
                <method name="Previous"/>
            </interface>
        </node>`;

        // DBus Interface for NameOwnerChanged
        const DBUS_INTERFACE = `
        <node>
            <interface name="org.freedesktop.DBus">
                <signal name="NameOwnerChanged">
                    <arg type="s" name="name"/>
                    <arg type="s" name="old_owner"/>
                    <arg type="s" name="new_owner"/>
                </signal>
            </interface>
        </node>`;

        this.MprisPlayerProxy = Gio.DBusProxy.makeProxyWrapper(MPRIS_PLAYER_INTERFACE);
        this.DBusProxy = Gio.DBusProxy.makeProxyWrapper(DBUS_INTERFACE);
    }

    _setupDBusNameOwnerChanged() {
        this._dbusProxy = new this.DBusProxy(
            Gio.DBus.session,
            'org.freedesktop.DBus',
            '/org/freedesktop/DBus',
            (proxy, error) => {
                if (error) {
                    return;
                }

                this._dbusSignalId = proxy.connectSignal('NameOwnerChanged', (proxy, sender, [name, oldOwner, newOwner]) => {
                    if (name && name.startsWith('org.mpris.MediaPlayer2.')) {
                        // Filter out invalid MPRIS services (like Bluetooth devices that register as MPRIS)
                        const invalidPatterns = ['bluetooth', 'mouse', 'keyboard', 'input', 'device'];
                        const nameLower = name.toLowerCase();
                        const isInvalid = invalidPatterns.some(pattern => nameLower.includes(pattern));

                        if (isInvalid) {
                            // Skip invalid services silently
                            return;
                        }

                        if (newOwner && !oldOwner) {
                            log(`[DynamicIsland] New player appeared: ${name}`);
                            this._disconnectPlayer();
                            this._connectToPlayer(name);
                            this._playerListeners.push(name);
                        } else if (oldOwner && !newOwner) {
                            log(`[DynamicIsland] Player disappeared: ${name}`);
                            // If the disconnected player was our current one
                            this._disconnectPlayer();
                            this._playerListeners = this._playerListeners.filter(player => player !== name);
                            if (this._playerListeners.length > 0) {
                                this._connectToPlayer(this._playerListeners[0]);
                            }

                        }
                    }
                });
            }
        );
    }

    _watchForMediaPlayers() {
        Gio.DBus.session.call(
            'org.freedesktop.DBus',
            '/org/freedesktop/DBus',
            'org.freedesktop.DBus',
            'ListNames',
            null,
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null,
            (conn, res) => {
                try {
                    const reply = conn.call_finish(res);
                    const names = reply.deep_unpack()[0];
                    // Filter out invalid MPRIS services (like Bluetooth devices)
                    const invalidPatterns = ['bluetooth', 'mouse', 'keyboard', 'input', 'device'];
                    this._playerListeners = names.filter(n => {
                        if (!n.includes('org.mpris.MediaPlayer2.')) return false;
                        const nLower = n.toLowerCase();
                        return !invalidPatterns.some(pattern => nLower.includes(pattern));
                    });
                    log(`[DynamicIsland] MediaManager: Found ${this._playerListeners.length} media player(s)`);
                    if (this._playerListeners.length > 0) {
                        this._connectToPlayer(this._playerListeners[0]);
                    }
                } catch (e) {
                    log(`[DynamicIsland] MediaManager: Error watching for media players: ${e.message || e}`);
                }
            }
        );
    }

    _connectToPlayer(busName) {
        log(`[DynamicIsland] MediaManager: Connecting to player ${busName}...`);
        this._currentPlayer = busName
        // Use XML-defined proxy wrapper
        this._playerProxy = new this.MprisPlayerProxy(
            Gio.DBus.session,
            busName,
            '/org/mpris/MediaPlayer2',
            (proxy, error) => {
                if (error) {
                    log(`[DynamicIsland] Failed to connect to player: ${error.message}`);
                    return;
                }

                log(`[DynamicIsland] MediaManager: Connected to player ${busName}, setting up property change listener`);
                // Single callback for all property changes
                this._playerProxySignal = proxy.connect('g-properties-changed', (proxy, changed, invalidated) => {
                    if (this._destroyed) return;
                    this._handlePropertiesChanged(changed);
                });

                // Initial update - batch both metadata and playback status
                this._performInitialUpdate();
            }
        );
    }

    _performInitialUpdate() {
        if (!this._playerProxy) return;

        const metadata = this._playerProxy.Metadata;
        const playbackStatus = this._playerProxy.PlaybackStatus;

        if (metadata || playbackStatus) {
            this._batchUpdate({
                metadata: metadata,
                playbackStatus: playbackStatus
            });
        }
    }

    _handlePropertiesChanged(changed) {
        if (!changed) return;

        try {
            const changedProps = changed.deep_unpack ? changed.deep_unpack() : changed;

            // Batch all changes into a single update
            const updates = {};

            if ('Metadata' in changedProps) {
                updates.metadata = changedProps.Metadata;
            }

            if ('PlaybackStatus' in changedProps) {
                updates.playbackStatus = changedProps.PlaybackStatus;
            }

            if (Object.keys(updates).length > 0) {
                this._batchUpdate(updates);
            }
        } catch (e) {
            if (!this._destroyed) {
                log(`[DynamicIsland] MediaManager: Error handling property changes: ${e.message || e}`);
            }
        }
    }

    _batchUpdate(updates) {
        // Cancel pending update if exists
        if (this._pendingUpdate) {
            imports.mainloop.source_remove(this._pendingUpdate);
            this._pendingUpdate = null;
        }

        // Merge updates
        if (updates.metadata) {
            const unpackedMetadata = updates.metadata.deep_unpack ? updates.metadata.deep_unpack() : updates.metadata;
            this._currentMetadata = unpackedMetadata;

            // Handle art URL
            const artUrl = this._extractArtUrl(unpackedMetadata);
            if (artUrl) {
                if (artUrl.startsWith('http')) {
                    if (this._artCache.has(artUrl)) {
                        this._currentArtPath = this._artCache.get(artUrl);
                    } else {
                        // Download async but don't notify yet
                        this._downloadImage(artUrl, (data) => {
                            const path = this._saveAndCacheImage(artUrl, data);
                            if (path) {
                                this._currentArtPath = path;
                                this._scheduleNotify();
                            }
                        });
                        this._currentArtPath = null;
                    }
                } else {
                    this._currentArtPath = artUrl;
                }
            } else {
                this._currentArtPath = null;
            }
        }

        if (updates.playbackStatus) {
            const unpackedStatus = updates.playbackStatus.deep_unpack ?
                updates.playbackStatus.deep_unpack() :
                (updates.playbackStatus.unpack ? updates.playbackStatus.unpack() : updates.playbackStatus);
            this._playbackStatus = unpackedStatus;
        }

        // Schedule a single notification
        this._scheduleNotify();
    }

    _scheduleNotify() {
        // Debounce notifications - wait 50ms for more updates
        if (this._pendingUpdate) {
            imports.mainloop.source_remove(this._pendingUpdate);
        }

        this._pendingUpdate = imports.mainloop.timeout_add(50, () => {
            this._pendingUpdate = null;
            this._notifyCallbacks({
                isPlaying: this._playbackStatus === 'Playing',
                metadata: this._currentMetadata,
                playbackStatus: this._playbackStatus,
                artPath: this._currentArtPath
            });
            return false;
        });
    }

    _disconnectPlayer() {
        if (this._playerProxy) {
            if (this._playerProxySignal) {
                this._playerProxy.disconnect(this._playerProxySignal);
                this._playerProxySignal = null;
            }
            this._playerProxy = null;
        }

        this._playbackStatus = null;
        this._currentMetadata = null;
        this._currentArtPath = null;

        // Clear pending update
        if (this._pendingUpdate) {
            imports.mainloop.source_remove(this._pendingUpdate);
            this._pendingUpdate = null;
        }

        // Notify với metadata và artPath = null để trigger switch về battery
        this._notifyCallbacks({
            isPlaying: false,
            metadata: null,
            playbackStatus: null,
            artPath: null
        });
    }

    _extractMetadataValue(metadata, keys) {
        try {
            if (!metadata) return null;
            for (const key of keys) {
                if (metadata[key]) {
                    const value = metadata[key];
                    return value.unpack ? value.unpack() : value.toString();
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

    getMediaUrl(metadata) {
        const url = this._extractMetadataValue(metadata, [
            'xesam:url',
            'mpris:url'
        ]);
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            return url;
        }
        return null;
    }

    _extractArtist(metadata) {
        try {
            if (!metadata) return null;

            // Try xesam:artist first (most common)
            const keys = ['xesam:artist', 'xesam:albumArtist'];
            for (const key of keys) {
                const value = metadata[key];

                if (value !== undefined && value !== null) {
                    // Unpack the GVariant
                    const unpacked = value.unpack ? value.unpack() : value;

                    // xesam:artist is usually an array of strings
                    if (Array.isArray(unpacked)) {
                        // Each item might still be a GVariant, need to unpack
                        const artists = unpacked.map(item => {
                            if (item && typeof item === 'object' && (item.unpack || item.deep_unpack)) {
                                return item.unpack ? item.unpack() : item.deep_unpack();
                            }
                            return item;
                        }).filter(a => typeof a === 'string' && a.length > 0);

                        if (artists.length > 0) {
                            return artists.join(', ');
                        }
                    } else if (typeof unpacked === 'string') {
                        return unpacked;
                    }
                }
            }
        } catch (e) {
            log(`[DynamicIsland] MediaManager: Error extracting artist: ${e.message || e}`);
        }
        return null;
    }

    _downloadImage(url, callback) {

        const msg = Soup.Message.new('GET', url);

        // Nếu session có send_and_read_async → Soup 3
        if (this._httpSession.send_and_read_async) {
            this._httpSession.send_and_read_async(
                msg,
                GLib.PRIORITY_DEFAULT,
                null,
                (session, result) => {
                    try {
                        const bytes = session.send_and_read_finish(result);
                        const data = bytes.get_data();   // Uint8Array
                        callback(data);
                    } catch (e) {
                        log(`[DynamicIsland] MediaManager: Error reading album art bytes: ${e.message || e}`);
                        callback(null);
                    }
                }
            );
            return;
        }

        // Còn lại là Soup 2
        this._httpSession.queue_message(msg, (session, message) => {
            try {
                if (message.status_code === 200 && message.response_body?.data) {
                    callback(message.response_body.data);
                } else {
                    callback(null);
                }
            } catch (e) {
                log(`[DynamicIsland] MediaManager: Error downloading album art: ${e.message || e}`);
                callback(null);
            }
        });
    }


    _saveAndCacheImage(url, data) {
        try {
            const dir = GLib.get_user_cache_dir() + '/dynamic-island-art';
            if (GLib.mkdir_with_parents(dir, 0o755) !== 0) return;

            const checksum = new GLib.Checksum(GLib.ChecksumType.MD5);
            checksum.update(url);
            const filename = checksum.get_string() + '.jpg';
            const path = dir + '/' + filename;

            const file = Gio.File.new_for_path(path);
            file.replace_contents(data, null, false, Gio.FileCreateFlags.NONE, null);

            this._artCache.set(url, path);
            return path;
        } catch (e) {
            log(`[DynamicIsland] MediaManager: Error saving album art to cache: ${e.message || e}`);
            return null;
        }
    }

    getArtUrl(metadata) {
        if (!metadata) return null;
        const artUrl = this._extractArtUrl(metadata);
        if (!artUrl) return null;

        if (artUrl.startsWith('http')) {
            if (this._artCache.has(artUrl)) {
                return this._artCache.get(artUrl);
            }
            // Download async
            this._downloadImage(artUrl, (data) => {
                const path = this._saveAndCacheImage(artUrl, data);
                if (path) {
                    this._notifyCallbacks({
                        isPlaying: this._playbackStatus === 'Playing',
                        metadata: metadata,
                        playbackStatus: this._playbackStatus,
                        artPath: path
                    });
                }
            });
            return null; // Will be updated via callback
        }
        return artUrl; // Local file
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
        if (!this._playerProxy) return;
        try {
            // Use the methods defined in XML interface
            if (method === 'PlayPause') {
                this._playerProxy.PlayPauseRemote();
            } else if (method === 'Next') {
                this._playerProxy.NextRemote();
            } else if (method === 'Previous') {
                this._playerProxy.PreviousRemote();
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
        return this._playerProxy !== null && this._playbackStatus === 'Playing';
    }

    getCurrentPlayer() {
        return this._currentPlayer;
    }

    destroy() {
        this._destroyed = true;

        if (this._checkTimeoutId) {
            imports.mainloop.source_remove(this._checkTimeoutId);
            this._checkTimeoutId = null;
        }

        if (this._pendingUpdate) {
            imports.mainloop.source_remove(this._pendingUpdate);
            this._pendingUpdate = null;
        }

        if (this._playerProxy && this._playerProxySignal) {
            try {
                this._playerProxy.disconnect(this._playerProxySignal);
            } catch (e) {
                log(`[DynamicIsland] MediaManager: Error disconnecting player proxy signal: ${e.message || e}`);
            }
            this._playerProxySignal = null;
        }

        if (this._dbusSignalId && this._dbusProxy) {
            try {
                this._dbusProxy.disconnect(this._dbusSignalId);
            } catch (e) {
                log(`[DynamicIsland] MediaManager: Error disconnecting DBus signal: ${e.message || e}`);
            }
            this._dbusSignalId = null;
        }

        this._httpSession?.abort();

        this._playerProxy = null;
        this._dbusProxy = null;
        this._httpSession = null;
        this._artCache.clear();
        this._callbacks = [];
    }
}