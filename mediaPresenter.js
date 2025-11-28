const { Clutter, St, Gio, Soup, GLib } = imports.gi;

// Media Presenter Class
var MediaPresenter = class MediaPresenter {
    constructor(notchInstance) {
        this._notch = notchInstance;
        this._thumbnail = null;
        this._audioIcon = null;
        this._thumbnailWrapper = null;
        this._audioIconWrapper = null;
        this._checkTimeoutId = null;
        this._playerProxy = null;
        this._playerProxySignal = null;
        this._httpSession = new Soup.Session();
        this._artCache = new Map(); // URL -> local path
        this._dbusProxy = null;
        this._dbusSignalId = null;
        this._currentPlayerName = null;
        this._playbackStatus = null;
        this._expandedArt = null;
        this._expandedArtWrapper = null;
        this._controlsBox = null;
        this._playPauseIcon = null;
        this._titleLabel = null;
        this._titleWrapper = null;
    }

    enable() {
        this._buildActors();
        this._setupDBusNameOwnerChanged();
        this._watchForMediaPlayers();
        // Keep polling as a backup, but less frequent (5s)
        this._checkTimeoutId = imports.mainloop.timeout_add_seconds(5, () => {
            if (this._destroyed) return false;
            if (!this._playerProxy) {
                this._watchForMediaPlayers();
            }
            return true;
        });
    }

    destroy() {
        this._destroyed = true;

        if (this._checkTimeoutId) {
            imports.mainloop.source_remove(this._checkTimeoutId);
            this._checkTimeoutId = null;
        }

        if (this._playerProxy && this._playerProxySignal) {
            try {
                this._playerProxy.disconnect(this._playerProxySignal);
            } catch (e) {
                log(`[DynamicIsland] Error disconnecting player proxy: ${e.message}`);
            }
            this._playerProxySignal = null;
        }

        if (this._dbusSignalId && this._dbusProxy) {
            try {
                this._dbusProxy.disconnectSignal(this._dbusSignalId);
            } catch (e) {
                log(`[DynamicIsland] Error disconnecting DBus signal: ${e.message}`);
            }
            this._dbusSignalId = null;
        }

        this._httpSession?.abort();

        // Button connections will be cleaned up when controlsBox is destroyed

        this._thumbnailWrapper?.destroy();
        this._audioIconWrapper?.destroy();
        this._expandedArtWrapper?.destroy();
        this._controlsBox?.destroy();
        this._titleWrapper?.destroy();

        this._playerProxy = null;
        this._dbusProxy = null;
        this._httpSession = null;
        this._thumbnail = null;
        this._audioIcon = null;
        this._thumbnailWrapper = null;
        this._audioIconWrapper = null;
        this._expandedArt = null;
        this._expandedArtWrapper = null;
        this._controlsBox = null;
        this._titleLabel = null;
        this._titleWrapper = null;
        this._playPauseIcon = null;
        this._artCache.clear();
        this._buttonConnections = [];
    }

    _setupDBusNameOwnerChanged() {
        try {
            const DBusInterface = `
            <node>
              <interface name="org.freedesktop.DBus">
                <signal name="NameOwnerChanged">
                  <arg type="s" name="name"/>
                  <arg type="s" name="old_owner"/>
                  <arg type="s" name="new_owner"/>
                </signal>
              </interface>
            </node>`;

            const DBusProxyWrapper = Gio.DBusProxy.makeProxyWrapper(DBusInterface);
            this._dbusProxy = new DBusProxyWrapper(
                Gio.DBus.session,
                'org.freedesktop.DBus',
                '/org/freedesktop/DBus',
                (proxy, error) => {
                    if (error) {
                        log(`[DynamicIsland] Failed to connect to DBus: ${error.message}`);
                        return;
                    }

                    this._dbusSignalId = proxy.connectSignal('NameOwnerChanged', (proxy, sender, [name, oldOwner, newOwner]) => {
                        if (name && name.startsWith('org.mpris.MediaPlayer2.')) {
                            if (newOwner && !oldOwner) {
                                log(`[DynamicIsland] New player appeared: ${name}`);
                                // If we don't have a player, or if this is Spotify (priority), connect
                                if (!this._playerProxy || name.includes('spotify')) {
                                    this._connectToPlayer(name);
                                }
                            } else if (oldOwner && !newOwner) {
                                log(`[DynamicIsland] Player disappeared: ${name}`);
                                // If the disconnected player was our current one
                                if (this._currentPlayerName && this._currentPlayerName === name) {
                                    this._disconnectPlayer();
                                    this._watchForMediaPlayers(); // Look for other players
                                }
                            }
                        }
                    });
                }
            );
        } catch (e) {
            log(`[DynamicIsland] Error setting up DBus listener: ${e.message}`);
        }
    }

    _buildActors() {
        // Thumbnail on the left (album art)
        this._thumbnail = new St.Icon({
            style_class: 'media-thumbnail',
            icon_name: 'audio-x-generic-symbolic',
            icon_size: 24,
        });

        this._thumbnailWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            style_class: 'media-thumbnail-wrapper',
            visible: false, // Hidden by default
            clip_to_allocation: true,
        });
        this._thumbnailWrapper.set_child(this._thumbnail);
        this._notch.notchLeft.add_child(this._thumbnailWrapper);

        // Audio icon on the right
        this._audioIcon = new St.Icon({
            style_class: 'media-audio-icon',
            icon_name: 'audio-volume-high-symbolic',
            icon_size: 20,
        });

        this._audioIconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            visible: false, // Hidden by default
        });
        this._audioIconWrapper.set_child(this._audioIcon);
        this._notch.notchRight.add_child(this._audioIconWrapper);

        // Expanded album art (occupies entire left column when hovering)
        this._expandedArt = new St.Icon({
            style_class: 'media-expanded-art',
            icon_name: 'audio-x-generic-symbolic',
            icon_size: 96,
        });

        this._expandedArtWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            style_class: 'media-expanded-art-wrapper',
            visible: false,
            reactive: true,
            clip_to_allocation: true,
        });
        this._expandedArtWrapper.set_child(this._expandedArt);

        // Block scroll, allow clicks to raise player
        this._expandedArtWrapper.connect('scroll-event', () => Clutter.EVENT_STOP);

        this._notch.getNotchTopLeft().add_child(this._expandedArtWrapper);
        this._notch.getNotchBottomLeft().hide();

        // Expanded controls (top-right)
        this._controlsBox = new St.BoxLayout({
            style_class: 'media-controls-box',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
            reactive: true,
        });

        // Keep notch expanded when hovering over controls box
        this._controlsBox.connect('enter-event', () => {
            if (this._notch && this._notch._collapseTimeoutId) {
                imports.mainloop.source_remove(this._notch._collapseTimeoutId);
                this._notch._collapseTimeoutId = null;
            }
            if (this._notch && !this._notch._isExpanded) {
                this._notch._expand();
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this._controlsBox.connect('leave-event', () => {
            if (this._notch) {
                this._notch._scheduleCollapseCheck();
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Block only scroll on controls box to prevent click-through
        // Allow button events for clicks to work
        this._controlsBox.connect('scroll-event', () => Clutter.EVENT_STOP);

        const controlConfig = [
            { icon: 'media-skip-backward-symbolic', handler: () => this._sendPlayerCommand('Previous') },
            { icon: 'media-playback-start-symbolic', handler: () => this._sendPlayerCommand('PlayPause'), playPause: true },
            { icon: 'media-skip-forward-symbolic', handler: () => this._sendPlayerCommand('Next') },
        ];

        controlConfig.forEach(config => {
            const button = new St.Button({
                style_class: 'media-control-button',
                reactive: true,
                can_focus: true,
            });
            const icon = new St.Icon({
                style_class: 'media-control-icon',
                icon_name: config.icon,
            });
            button.set_child(icon);
            button.connect('clicked', () => config.handler());

            // Keep notch expanded when hovering over buttons
            button.connect('enter-event', () => {
                if (this._notch && this._notch._collapseTimeoutId) {
                    imports.mainloop.source_remove(this._notch._collapseTimeoutId);
                    this._notch._collapseTimeoutId = null;
                }
                if (this._notch && !this._notch._isExpanded) {
                    this._notch._expand();
                }
                return Clutter.EVENT_PROPAGATE;
            });

            button.connect('leave-event', () => {
                if (this._notch) {
                    this._notch._scheduleCollapseCheck();
                }
                return Clutter.EVENT_PROPAGATE;
            });

            // Block only scroll to prevent click-through to apps below
            // Allow button-press/release for clicks to work
            button.connect('scroll-event', () => Clutter.EVENT_STOP);

            if (config.playPause) {
                this._playPauseIcon = icon;
            }
            this._controlsBox.add_child(button);
        });
        this._notch.getNotchTopRight().add_child(this._controlsBox);

        // Expanded song title (bottom-right)
        this._titleLabel = new St.Label({
            style_class: 'media-title-label',
            text: '',
            x_align: Clutter.ActorAlign.START,
        });

        this._titleWrapper = new St.BoxLayout({
            style_class: 'media-title-wrapper',
            x_expand: true,
            y_expand: true,
            visible: false,
            reactive: true,
        });

        // Block only scroll on title wrapper
        this._titleWrapper.connect('scroll-event', () => Clutter.EVENT_STOP);

        this._titleWrapper.add_child(this._titleLabel);
        this._notch.getNotchBottomRight().add_child(this._titleWrapper);
    }

    _findBestPlayer(playerNames) {
        if (playerNames.includes('org.mpris.MediaPlayer2.spotify')) {
            return 'org.mpris.MediaPlayer2.spotify';
        }
        return playerNames.length > 0 ? playerNames[0] : null;
    }

    _watchForMediaPlayers() {
        try {
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
                        const players = names.filter(n => n.includes('org.mpris.MediaPlayer2'));
                        const playerBusName = this._findBestPlayer(players);

                        this._updateMediaVisibility(!!playerBusName);

                        if (playerBusName) {
                            // Only connect if we are not already connected to this specific player
                            if (!this._playerProxy || this._playerProxy.g_name !== playerBusName) {
                                log(`[DynamicIsland] Connecting to player: ${playerBusName}`);
                                this._connectToPlayer(playerBusName);
                            }
                        } else {
                            if (this._playerProxy) {
                                this._disconnectPlayer();
                            }
                        }
                    } catch (e) { log(e); }
                }
            );
        } catch (e) { log(e); }
    }

    _connectToPlayer(busName) {
        try {
            this._currentPlayerName = busName;
            this._playerProxy = new Gio.DBusProxy({
                g_connection: Gio.DBus.session,
                g_name: busName,
                g_object_path: '/org/mpris/MediaPlayer2',
                g_interface_name: 'org.mpris.MediaPlayer2.Player',
            });

            this._playerProxy.init(null);
            this._updateMediaVisibility(false);

            this._playerProxySignal = this._playerProxy.connect('g-properties-changed', (proxy, changed, invalidated) => {
                if (this._destroyed) return;
                try {
                    const changedProps = changed?.deep_unpack?.() ?? {};
                    const metadata = changedProps.Metadata;
                    if (metadata) {
                        this._updateMetadata(metadata);
                    }
                    const playbackStatus = changedProps.PlaybackStatus;
                    if (playbackStatus) {
                        this._updatePlaybackStatus(playbackStatus);
                    }
                } catch (e) {
                    if (!this._destroyed) {
                        log(`[DynamicIsland] Error in properties-changed callback: ${e.message}`);
                    }
                }
            });

            // Initial update
            const metadata = this._playerProxy.get_cached_property('Metadata');
            if (metadata) {
                this._updateMetadata(metadata.deep_unpack());
            }
            const playbackStatus = this._playerProxy.get_cached_property('PlaybackStatus');
            if (playbackStatus) {
                this._updatePlaybackStatus(playbackStatus);
            }
        } catch (e) {
            log(`Failed to connect to player: ${e.message}`);
        }
    }

    _disconnectPlayer() {
        if (this._playerProxy) {
            if (this._playerProxySignal) {
                this._playerProxy.disconnect(this._playerProxySignal);
                this._playerProxySignal = null;
            }
            this._playerProxy = null;
        }
        this._currentPlayerName = null;
        this._playbackStatus = null;
        // Ensure we revert to battery view
        this._updateMediaVisibility(false);
    }

    _updateMetadata(metadata) {
        if (!metadata) return;
        const unpackedMetadata = metadata.deep_unpack ? metadata.deep_unpack() : metadata;

        const artUrl = this._extractArtUrl(unpackedMetadata);
        log(`[DynamicIsland] Metadata update. ArtUrl: ${artUrl}`);

        if (artUrl) {
            if (artUrl.startsWith('http')) {
                // Check cache first
                if (this._artCache.has(artUrl)) {
                    const path = this._artCache.get(artUrl);
                    const file = Gio.File.new_for_path(path);
                    const gicon = new Gio.FileIcon({ file: file });
                    this._thumbnail.set_gicon(gicon);

                    // Use background-image for expanded art to support border-radius
                    // Use background-image for expanded art to support border-radius
                    if (this._expandedArtWrapper) {
                        this._expandedArtWrapper.style = `background-image: url("file://${path}"); background-size: cover; border-radius: 16px;`;
                        this._expandedArt.opacity = 0; // Make icon transparent but keep layout size
                        this._expandedArt.visible = true;
                    }

                    // Also set for compact thumbnail
                    if (this._thumbnailWrapper) {
                        this._thumbnailWrapper.style = `background-image: url("file://${path}"); background-size: cover; border-radius: 99px;`;
                        this._thumbnail.opacity = 0;
                        this._thumbnail.visible = true;
                    }
                } else {
                    this._downloadImage(artUrl);
                }
            } else {
                try {
                    // Local file or other URI
                    const gicon = Gio.icon_new_for_string(artUrl);
                    this._thumbnail.set_gicon(gicon);

                    if (this._expandedArtWrapper) {
                        // Clean up URL for CSS
                        const cssUrl = artUrl.replace(/'/g, "\\'");
                        this._expandedArtWrapper.style = `background-image: url("${cssUrl}"); background-size: cover; border-radius: 16px;`;
                        this._expandedArt.opacity = 0;
                        this._expandedArt.visible = true;

                        // Also set for compact thumbnail
                        if (this._thumbnailWrapper) {
                            this._thumbnailWrapper.style = `background-image: url("${cssUrl}"); background-size: cover; border-radius: 99px;`;
                            this._thumbnail.opacity = 0;
                            this._thumbnail.visible = true;
                        }
                    }
                } catch (e) {
                    // Fallback
                    this._thumbnail.icon_name = 'audio-x-generic-symbolic';
                    if (this._expandedArtWrapper) {
                        this._expandedArtWrapper.style = null;
                        this._expandedArt.icon_name = 'audio-x-generic-symbolic';
                        this._expandedArt.opacity = 255;
                        this._expandedArt.visible = true;
                    }
                    if (this._thumbnailWrapper) {
                        this._thumbnailWrapper.style = null;
                        this._thumbnail.icon_name = 'audio-x-generic-symbolic';
                        this._thumbnail.opacity = 255;
                        this._thumbnail.visible = true;
                    }
                }
            }
        } else {
            this._thumbnail.icon_name = 'audio-x-generic-symbolic';
            if (this._expandedArtWrapper) {
                this._expandedArtWrapper.style = null;
                this._expandedArt.icon_name = 'audio-x-generic-symbolic';
                this._expandedArt.opacity = 255;
                this._expandedArt.visible = true;
            }
            if (this._thumbnailWrapper) {
                this._thumbnailWrapper.style = null;
                this._thumbnail.icon_name = 'audio-x-generic-symbolic';
                this._thumbnail.opacity = 255;
                this._thumbnail.visible = true;
            }
        }

        const title = this._extractTitle(unpackedMetadata);
        if (this._titleLabel) {
            this._titleLabel.text = title || 'Unknown Title';
        }

        this._updatePlayPauseIcon();
    }

    _updatePlaybackStatus(status) {
        const unpackedStatus = status?.deep_unpack ? status.deep_unpack() : (status?.unpack ? status.unpack() : status);
        this._playbackStatus = unpackedStatus;
        const isPlaying = unpackedStatus === 'Playing';
        this._updateMediaVisibility(isPlaying);
        this._updatePlayPauseIcon();
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
            log(`[DynamicIsland] Error extracting metadata: ${e.message}`);
        }
        return null;
    }

    _extractArtUrl(metadata) {
        return this._extractMetadataValue(metadata, ['mpris:artUrl', 'xesam:artUrl', 'mpris:arturl']);
    }

    _extractTitle(metadata) {
        return this._extractMetadataValue(metadata, ['xesam:title', 'mpris:title']);
    }

    _downloadImage(url) {
        const msg = Soup.Message.new('GET', url);
        // Support both Soup 2.4 and 3.0 patterns if possible, or assume 2.4 for compatibility
        if (this._httpSession.queue_message) { // Soup 2.4
            this._httpSession.queue_message(msg, (session, message) => {
                if (message.status_code === 200) {
                    this._saveAndSetImage(url, message.response_body.data);
                }
            });
        } else if (this._httpSession.send_and_read_async) { // Soup 3.0
            this._httpSession.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (session, result) => {
                try {
                    const bytes = session.send_and_read_finish(result);
                    this._saveAndSetImage(url, bytes.get_data()); // get_data() returns Uint8Array or similar
                } catch (e) { log(e); }
            });
        }
    }

    _saveAndSetImage(url, data) {
        try {
            const dir = GLib.get_user_cache_dir() + '/dynamic-island-art';
            if (GLib.mkdir_with_parents(dir, 0o755) !== 0) return;

            // Create a unique filename hash
            const checksum = new GLib.Checksum(GLib.ChecksumType.MD5);
            checksum.update(url);
            const filename = checksum.get_string() + '.jpg'; // Assume jpg/png
            const path = dir + '/' + filename;

            const file = Gio.File.new_for_path(path);
            // Write data
            // For simplicity in JS, we can use replace_contents
            // data might be a ByteArray or similar.
            // In GJS, replace_contents expects a ByteArray (Uint8Array)

            // If data is not Uint8Array, we might need to cast it.
            // But let's assume it works for now or wrap in Uint8Array if needed.

            file.replace_contents(data, null, false, Gio.FileCreateFlags.NONE, null);

            this._artCache.set(url, path);

            // Update UI
            const gicon = new Gio.FileIcon({ file: file });
            this._thumbnail.set_gicon(gicon);

            if (this._expandedArtWrapper) {
                this._expandedArtWrapper.style = `background-image: url("file://${path}"); background-size: cover; border-radius: 16px;`;
                this._expandedArt.opacity = 0;
                this._expandedArt.visible = true;
            }
            if (this._thumbnailWrapper) {
                this._thumbnailWrapper.style = `background-image: url("file://${path}"); background-size: cover; border-radius: 99px;`;
                this._thumbnail.opacity = 0;
                this._thumbnail.visible = true;
            }
        } catch (e) {
            log(`[DynamicIsland] Failed to save image: ${e.message}`);
        }
    }

    setBatteryPresenter(batteryPresenter) {
        this._batteryPresenter = batteryPresenter;
    }

    isMediaPlaying() {
        return this._playerProxy !== null && this._playbackStatus === 'Playing';
    }

    _updateMediaVisibility(hasMedia) {
        if (!this._thumbnailWrapper || !this._audioIconWrapper) return;

        const wasMediaVisible = this._thumbnailWrapper.visible;
        if (wasMediaVisible === hasMedia) return; // No change

        // Trigger transition animation if in compact mode
        if (!this._notch._isExpanded) {
            this._notch._animateTransition();
        }

        if (hasMedia) {
            // Show Media, Hide Battery
            this._thumbnailWrapper.show();
            this._audioIconWrapper.show();
            this._expandedArtWrapper?.show();
            this._controlsBox?.show();
            this._titleWrapper?.show();
            if (this._batteryPresenter) this._batteryPresenter.hide();
        } else {
            // Hide Media, Show Battery
            this._thumbnailWrapper.hide();
            this._audioIconWrapper.hide();
            this._expandedArtWrapper?.hide();
            this._controlsBox?.hide();
            this._titleWrapper?.hide();
            if (this._batteryPresenter) this._batteryPresenter.show();
        }
    }

    _sendPlayerCommand(method) {
        if (!this._playerProxy) return;
        try {
            this._playerProxy.call_sync(
                method,
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null
            );
        } catch (e) {
            log(`[DynamicIsland] Failed to send ${method}: ${e.message}`);
        }
    }



    _updatePlayPauseIcon() {
        if (!this._playPauseIcon) return;
        const iconName = this._playbackStatus === 'Playing'
            ? 'media-playback-pause-symbolic'
            : 'media-playback-start-symbolic';
        this._playPauseIcon.icon_name = iconName;
    }
};

