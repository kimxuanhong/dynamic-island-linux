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

        // Method mapping for player commands
        this._commandMethods = {
            'PlayPause': 'MediaPlayPauseRemote',
            'Next': 'MediaNextRemote',
            'Previous': 'MediaPreviousRemote'
        };

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
                    <method name="GetMediaInfo">
                        <arg name="player" type="s" direction="out"/>
                        <arg name="status" type="s" direction="out"/>
                        <arg name="title" type="s" direction="out"/>
                        <arg name="artist" type="s" direction="out"/>
                        <arg name="artUrl" type="s" direction="out"/>
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
                } else {
                    // Fetch initial media state
                    this._methodsProxy.GetMediaInfoRemote((result, error) => {
                        if (error || !result) {
                            return;
                        }

                        const [player, status, title, artist, artUrl] = result;
                        if (!player || !status) {
                            return;
                        }

                        // Create metadata object in same format as server events
                        const metadataObj = {
                            player,
                            status,
                            title: title || '',
                            artist: artist || '',
                            artUrl: artUrl || '',
                            isPlaying: status === 'Playing'
                        };

                        this._updateMediaState(metadataObj);
                    });
                }
            }
        );
    }

    /**
     * Normalize artist value to array format
     * @param {string|Array|undefined} artist - Artist value from server
     * @returns {Array} Normalized artist array
     */
    _normalizeArtist(artist) {
        if (!artist) return [];
        if (Array.isArray(artist)) return artist;
        return [String(artist)];
    }

    /**
     * Parse metadata from server (can be string JSON or object)
     * @param {string|object} metadata - Metadata from server
     * @returns {object|null} Parsed metadata object or null on error
     */
    _parseMetadata(metadata) {
        if (!metadata) return null;

        if (typeof metadata === 'object') {
            return metadata;
        }

        if (typeof metadata === 'string') {
            try {
                return JSON.parse(metadata);
            } catch (e) {
                log(`[DynamicIsland] MediaManager: Failed to parse metadata JSON: ${e.message || e}`);
                return null;
            }
        }

        return null;
    }

    /**
     * Create metadata object in standard format
     * @param {object} metadataObj - Parsed metadata object
     * @returns {object} Standardized metadata object
     */
    _createMetadataObject(metadataObj) {
        const artist = metadataObj.artist !== undefined ? metadataObj.artist : '';
        
        return {
            'xesam:title': metadataObj.title || '',
            'xesam:artist': this._normalizeArtist(artist),
            'xesam:album': metadataObj.album || '',
            'mpris:artUrl': metadataObj.artUrl || ''
        };
    }

    /**
     * Clear current media state and notify callbacks
     */
    _clearMediaState() {
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
    }

    /**
     * Update media state from metadata object
     * @param {object} metadataObj - Parsed metadata object
     */
    _updateMediaState(metadataObj) {
        const status = metadataObj.status || '';
        const player = metadataObj.player || '';

        // Clear state if no active player
        if (!player || !status) {
            this._clearMediaState();
            return;
        }

        // Update state
        this._currentMetadata = this._createMetadataObject(metadataObj);
        this._playbackStatus = status;
        this._currentArtPath = metadataObj.artUrl || '';
        this._currentPlayer = player;

        // Notify callbacks
        const isPlaying = metadataObj.isPlaying !== undefined 
            ? Boolean(metadataObj.isPlaying) 
            : status === 'Playing';

        this._notifyCallbacks({
            isPlaying,
            metadata: this._currentMetadata,
            playbackStatus: status,
            artPath: this._currentArtPath
        });
    }

    _onServerEvent(eventType, appName, pid, timestamp, metadata) {
        if (this._destroyed || eventType !== 'media_changed') {
            return;
        }

        const metadataObj = this._parseMetadata(metadata);
        if (!metadataObj) {
            return;
        }

        this._updateMediaState(metadataObj);
    }

    /**
     * Extract metadata value by trying multiple keys
     * @param {object} metadata - Metadata object
     * @param {Array<string>} keys - Array of keys to try
     * @returns {*} First found value or null
     */
    _extractMetadataValue(metadata, keys) {
        if (!metadata) return null;

        for (const key of keys) {
            const value = metadata[key];
            if (value !== undefined && value !== null) {
                // If array, return first element (for compatibility)
                if (Array.isArray(value) && value.length > 0) {
                    return value[0];
                }
                return value;
            }
        }
        return null;
    }

    /**
     * Extract art URL from metadata
     * @param {object} metadata - Metadata object
     * @returns {string|null} Art URL or null
     */
    _extractArtUrl(metadata) {
        return this._extractMetadataValue(metadata, [
            'mpris:artUrl', 
            'xesam:artUrl', 
            'mpris:arturl'
        ]);
    }

    /**
     * Extract title from metadata
     * @param {object} metadata - Metadata object
     * @returns {string|null} Title or null
     */
    _extractTitle(metadata) {
        return this._extractMetadataValue(metadata, [
            'xesam:title', 
            'mpris:title'
        ]);
    }

    /**
     * Extract artist from metadata and return as string
     * @param {object} metadata - Metadata object
     * @returns {string|null} Artist string or null
     */
    _extractArtist(metadata) {
        if (!metadata) return null;

        const artist = this._extractMetadataValue(metadata, [
            'xesam:artist', 
            'xesam:albumArtist'
        ]);

        if (!artist) return null;

        // Handle arrays (flatten nested arrays)
        if (Array.isArray(artist)) {
            const flattened = artist.flat().filter(Boolean);
            return flattened.length > 0 ? flattened.join(', ') : null;
        }

        // Ensure string return
        return String(artist);
    }

    /**
     * Get art URL from metadata
     * @param {object} metadata - Metadata object
     * @returns {string|null} Art URL or null
     */
    getArtUrl(metadata) {
        return metadata ? this._extractArtUrl(metadata) : null;
    }

    /**
     * Get title from metadata
     * @param {object} metadata - Metadata object
     * @returns {string|null} Title or null
     */
    getTitle(metadata) {
        return metadata ? this._extractTitle(metadata) : null;
    }

    /**
     * Get artist from metadata as string
     * @param {object} metadata - Metadata object
     * @returns {string|null} Artist string or null
     */
    getArtist(metadata) {
        return metadata ? this._extractArtist(metadata) : null;
    }

    /**
     * Check if metadata has art URL
     * @param {object} metadata - Metadata object
     * @returns {boolean} True if art URL exists
     */
    hasArtUrl(metadata) {
        return !!this.getArtUrl(metadata);
    }

    /**
     * Send player command to server
     * @param {string} method - Command method ('PlayPause', 'Next', 'Previous')
     */
    sendPlayerCommand(method) {
        if (!this._methodsProxy) {
            log(`[DynamicIsland] MediaManager: Methods proxy not available`);
            return;
        }

        const methodName = this._commandMethods[method];
        if (!methodName) {
            log(`[DynamicIsland] MediaManager: Unknown command method: ${method}`);
            return;
        }

        try {
            this._methodsProxy[methodName]((result, error) => {
                if (error) {
                    log(`[DynamicIsland] MediaManager: Error sending ${method} command: ${error.message || error}`);
                }
            });
        } catch (e) {
            log(`[DynamicIsland] MediaManager: Exception sending ${method} command: ${e.message || e}`);
        }
    }

    /**
     * Add callback for media state changes
     * @param {Function} callback - Callback function
     */
    addCallback(callback) {
        if (typeof callback === 'function') {
            this._callbacks.push(callback);
        }
    }

    /**
     * Notify all registered callbacks
     * @param {object} info - Media info object
     */
    _notifyCallbacks(info) {
        this._callbacks.forEach(callback => {
            try {
                callback(info);
            } catch (e) {
                log(`[DynamicIsland] MediaManager: Callback error: ${e.message || e}`);
            }
        });
    }

    /**
     * Check if media is currently playing
     * @returns {boolean} True if playing
     */
    isMediaPlaying() {
        return this._playbackStatus === 'Playing';
    }

    /**
     * Get current player bus name
     * @returns {string|null} Player bus name or null
     */
    getCurrentPlayer() {
        return this._currentPlayer;
    }

    /**
     * Clean up and destroy MediaManager
     */
    destroy() {
        this._destroyed = true;

        // Disconnect proxies
        this._serverProxy = null;
        this._methodsProxy = null;

        // Clear state
        this._playbackStatus = null;
        this._currentMetadata = null;
        this._currentArtPath = null;
        this._currentPlayer = null;
        this._callbacks = [];
    }
}