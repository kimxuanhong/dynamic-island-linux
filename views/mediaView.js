const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Shell = imports.gi.Shell;


var MediaView = class MediaView {
    constructor(mediaManager, volumeManager, bluetoothManager) {
        this._lastMetadata = null;
        this._lastArtPath = null;
        this._mediaManager = mediaManager;
        this._volumeManager = volumeManager;
        this._bluetoothManager = bluetoothManager;
        this._buildCompactView();
        this._buildExpandedView();
        this._buildMinimalView();
        this._updateAllIcons();
    }

    _buildMinimalView() {
        this._secondaryThumbnail = new St.Icon({
            style_class: 'media-thumbnail-secondary',
            icon_name: 'audio-x-generic-symbolic',
            icon_size: 24,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });

        this._secondaryThumbnailWrapper = new St.Bin({
            child: this._secondaryThumbnail,
            style_class: 'media-thumbnail-wrapper-secondary',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            clip_to_allocation: true
        });

        this.secondaryContainer = new St.Bin({
            child: this._secondaryThumbnailWrapper,
            x_expand: true,
            y_expand: true,
            style_class: 'media-minimal-container'
        });
    }

    _buildCompactView() {
        // Thumbnail on the left (album art)
        this._thumbnail = new St.Icon({
            style_class: 'media-thumbnail',
            icon_name: 'audio-x-generic-symbolic',
            icon_size: 24,
        });

        // Thumbnail on the left (giống battery iconWrapper)
        this._thumbnail = new St.Icon({
            style_class: 'media-thumbnail',
            icon_name: 'audio-x-generic-symbolic',
            icon_size: 24,
            x_align: Clutter.ActorAlign.START
        });

        this._thumbnailWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            style_class: 'media-thumbnail-wrapper',
            style: 'padding-left: 16px;',
            visible: false,
            clip_to_allocation: true,
        });
        this._thumbnailWrapper.set_child(this._thumbnail);

        // Audio icon on the right
        this._audioIcon = new St.Icon({
            style_class: 'media-audio-icon',
            icon_name: 'sound-wave-symbolic', // Mặc định là thanh nhạc
            icon_size: 20,
            x_align: Clutter.ActorAlign.END
        });

        this._audioIconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        this._audioIconWrapper.set_child(this._audioIcon);

        // Compact container giống hệt battery
        this.compactContainer = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: true,
            style_class: 'media-compact-container',
        });
        this.compactContainer.add_child(this._thumbnailWrapper);
        this.compactContainer.add_child(this._audioIconWrapper);
    }

    /**
     * Tính icon name dựa trên trạng thái mute và headset
     * @param {boolean} isMuted
     * @param {boolean} hasHeadset
     * @param {boolean} isCompact - true cho compact icon, false cho expanded icon
     * @returns {string} Icon name
     */
    _getIconName(isMuted, hasHeadset, isCompact = false) {
        if (isMuted) {
            return 'audio-volume-muted-symbolic';
        }

        if (hasHeadset) {
            return 'audio-headphones-symbolic';
        }

        // Speakers icon khác nhau giữa compact và expanded
        return isCompact ? 'sound-wave-symbolic' : 'audio-speakers-symbolic';
    }

    /**
     * Cập nhật tất cả icons dựa trên trạng thái hiện tại
     */
    _updateAllIcons() {
        const isMuted = this._volumeManager.isMuted();
        const hasHeadset = this._bluetoothManager.hasConnectedHeadset();

        // Update compact icon
        if (this._audioIcon) {
            this._audioIcon.icon_name = this._getIconName(isMuted, hasHeadset, true);
        }

        // Update expanded audio device icon
        if (this._audioDeviceIcon) {
            this._audioDeviceIcon.icon_name = this._getIconName(isMuted, hasHeadset, false);
        }
    }

    _buildExpandedView() {
        // ============================================
        // TOP TIER: Thumbnail, Title, Artist (horizontal)
        // ============================================

        // Small thumbnail (left)
        this._expandedThumbnail = new St.Icon({
            style_class: 'media-expanded-art',
            icon_name: 'audio-x-generic-symbolic',
            icon_size: 56,
        });

        this._expandedThumbnailWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'media-expanded-thumbnail-wrapper',
            visible: true,
            reactive: true,
            clip_to_allocation: true,
        });
        this._expandedThumbnailWrapper.set_child(this._expandedThumbnail);
        this._expandedThumbnailWrapper.connect('scroll-event', () => Clutter.EVENT_STOP);
        this._expandedThumbnailWrapper.connect('button-press-event', () => {
            this._onArtClick();
            return Clutter.EVENT_STOP;
        });

        // Title and Artist (right of thumbnail)
        this._titleLabel = new St.Label({
            style_class: 'media-title-label',
            text: '',
            x_align: Clutter.ActorAlign.START,
        });

        this._artistLabel = new St.Label({
            style_class: 'media-artist-label',
            text: '',
            x_align: Clutter.ActorAlign.START,
            style: 'color: rgba(255,255,255,0.7); font-size: 13px; margin-top: 3px;',
        });

        this._titleWrapper = new St.BoxLayout({
            style_class: 'media-title-wrapper',
            vertical: true,
            x_expand: true,
            y_expand: false,
            visible: true,
            reactive: true,
        });
        this._titleWrapper.connect('scroll-event', () => Clutter.EVENT_STOP);
        this._titleWrapper.add_child(this._titleLabel);
        this._titleWrapper.add_child(this._artistLabel);

        // Top tier container (horizontal: thumbnail + title/artist)
        const topTier = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: false,
            style: 'spacing: 12px;',
        });
        topTier.add_child(this._expandedThumbnailWrapper);
        topTier.add_child(this._titleWrapper);


        // ============================================
        // BOTTOM TIER: Control Buttons
        // ============================================

        var bottomBox = new St.BoxLayout({
            x_expand: true,
            y_expand: false,
            visible: true,
            reactive: true,
        });
        bottomBox.connect('scroll-event', () => Clutter.EVENT_STOP);

        this._controlsBox = new St.BoxLayout({
            style_class: 'media-controls-box',
            x_expand: true,
            y_expand: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            visible: true,
            reactive: true,
        });
        this._controlsBox.connect('scroll-event', () => Clutter.EVENT_STOP);

        // Sharing button
        this._shareButton = new St.Button({
            style_class: 'share-audio-button',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            can_focus: true,
        });
        const shareIcon = new St.Icon({
            style_class: 'share-audio-icon',
            icon_name: 'emblem-shared-symbolic',
        });
        this._shareButton.set_child(shareIcon);
        this._shareButton.connect('clicked', () => this._onShare());
        this._shareButton.connect('scroll-event', () => Clutter.EVENT_STOP);
        bottomBox.add_child(this._shareButton);

        // Main control buttons: Previous, Play/Pause, Next
        const controlConfig = [
            { icon: 'media-skip-backward-symbolic', handler: () => this._onPrevious() },
            { icon: 'media-playback-start-symbolic', handler: () => this._onPlayPause(), playPause: true },
            { icon: 'media-skip-forward-symbolic', handler: () => this._onNext() },
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
            button.connect('scroll-event', () => Clutter.EVENT_STOP);

            if (config.playPause) {
                this._playPauseIcon = icon;
            }
            this._controlsBox.add_child(button);
        });
        bottomBox.add_child(this._controlsBox);

        // Audio device button (speaker/headphones)
        this._audioDeviceButton = new St.Button({
            style_class: 'share-audio-button',
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            can_focus: true,
        });
        this._audioDeviceIcon = new St.Icon({
            style_class: 'share-audio-icon',
            icon_name: 'audio-speakers-symbolic',
        });
        this._audioDeviceButton.set_child(this._audioDeviceIcon);
        this._audioDeviceButton.connect('clicked', () => this._onAudioDevice());
        this._audioDeviceButton.connect('scroll-event', () => Clutter.EVENT_STOP);
        bottomBox.add_child(this._audioDeviceButton);

        // ============================================
        // MAIN CONTAINER: Vertical layout
        // ============================================

        this.expandedContainer = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_expand: true,
            style: 'spacing: 0px; padding: 24px;',
            visible: false,
        });
        // Separator between top and bottom sections
        const separator = new St.Widget({
            style: 'background-color: rgba(255,255,255,0.15); height: 2px; margin: 18px 0;',
            x_expand: true,
            y_expand: false,
        });

        this.expandedContainer.add_child(topTier);
        this.expandedContainer.add_child(separator);
        this.expandedContainer.add_child(bottomBox);
    }

    updateMedia(mediaInfo) {
        const { isPlaying, metadata, playbackStatus, artPath } = mediaInfo;

        // Kiểm tra xem có chuyển nguồn phát không bằng cách so sánh title
        let metadataChanged = false;
        if (metadata && this._lastMetadata) {
            const currentTitle = this._mediaManager.getTitle(metadata);
            const lastTitle = this._mediaManager.getTitle(this._lastMetadata);
            metadataChanged = currentTitle !== lastTitle;
        } else if (metadata && !this._lastMetadata) {
            metadataChanged = true; // Lần đầu có metadata
        }

        // Lưu lại metadata và artPath cuối cùng để restore khi play lại
        if (metadata) {
            this._lastMetadata = metadata;
        }

        // Cập nhật artPath cache:
        // - Nếu có artPath: lưu vào cache
        // - Nếu artPath là null (không có art): xóa cache để không dùng art cũ khi chuyển nguồn
        // - Chỉ giữ cache khi metadata không thay đổi (cùng bài hát)
        if (metadataChanged) {
            // Chuyển nguồn mới: cập nhật cache theo artPath hiện tại
            if (artPath) {
                this._lastArtPath = artPath;
            } else {
                // Nguồn mới không có art, xóa cache art cũ
                this._lastArtPath = null;
            }
        } else if (artPath !== undefined) {
            // Cùng nguồn nhưng artPath thay đổi (ví dụ: download xong)
            if (artPath) {
                this._lastArtPath = artPath;
            } else {
                this._lastArtPath = null;
            }
        }

        // Update visibility for compact view
        const shouldShow = isPlaying;
        if (shouldShow) {
            this._thumbnailWrapper.show();
            this._audioIconWrapper.show();
        } else {
            this._thumbnailWrapper.hide();
            this._audioIconWrapper.hide();
        }

        // Always show expanded components when expanded
        if (this.expandedContainer && this.expandedContainer.visible) {
            if (this._expandedThumbnailWrapper) this._expandedThumbnailWrapper.show();
            this._controlsBox.show();
            this._titleWrapper.show();
        }

        // Sử dụng metadata/artPath hiện tại hoặc đã lưu
        // Chỉ dùng _lastArtPath nếu metadata không thay đổi (cùng nguồn)
        const currentMetadata = metadata || this._lastMetadata;
        const currentArtPath = artPath !== undefined ? artPath :
            (metadataChanged ? null : this._lastArtPath);

        if (!currentMetadata && !currentArtPath) {
            // Reset to default
            this._thumbnail.icon_name = 'audio-x-generic-symbolic';
            if (this._secondaryThumbnail) this._secondaryThumbnail.icon_name = 'audio-x-generic-symbolic';

            if (this._expandedThumbnailWrapper) {
                this._expandedThumbnailWrapper.style = null;
                this._expandedThumbnail.icon_name = 'audio-x-generic-symbolic';
                this._expandedThumbnail.opacity = 255;
                this._expandedThumbnail.visible = true;
            }
            if (this._thumbnailWrapper) {
                this._thumbnailWrapper.style = null;
                this._thumbnail.icon_name = 'audio-x-generic-symbolic';
                this._thumbnail.opacity = 255;
                this._thumbnail.visible = true;
            }
            if (this._secondaryThumbnailWrapper) {
                this._secondaryThumbnailWrapper.style = null;
                if (this._secondaryThumbnail) {
                    this._secondaryThumbnail.opacity = 255;
                    this._secondaryThumbnail.visible = true;
                }
            }
            return;
        }

        // Update art - sử dụng metadata/artPath hiện tại hoặc đã lưu
        let artUrl = currentArtPath;
        let isDownloading = false;
        if (!artUrl && currentMetadata) {
            // Try to get art URL from metadata using public method
            const artUrlFromMeta = this._mediaManager.getArtUrl(currentMetadata);
            if (artUrlFromMeta) {
                artUrl = artUrlFromMeta;
            } else {
                // Check if there's an HTTP URL being downloaded
                if (this._mediaManager.hasArtUrl(currentMetadata)) {
                    isDownloading = true;
                }
            }
        }

        if (artUrl) {
            if (artUrl.startsWith('http')) {
                // Will be updated via callback when downloaded
                return;
            } else if (artUrl.startsWith('file://') || artUrl.startsWith('/')) {
                // Local file
                const path = artUrl.replace('file://', '');
                const file = Gio.File.new_for_path(path);
                const gicon = new Gio.FileIcon({ file: file });
                this._thumbnail.set_gicon(gicon);
                if (this._secondaryThumbnail) this._secondaryThumbnail.set_gicon(gicon);

                if (this._expandedThumbnailWrapper) {
                    this._expandedThumbnailWrapper.style = `background-image: url("file://${path}"); background-size: cover; border-radius: 8px;`;
                    this._expandedThumbnail.opacity = 0;
                    this._expandedThumbnail.visible = true;
                }
                if (this._thumbnailWrapper) {
                    this._thumbnailWrapper.style = `background-image: url("file://${path}"); background-size: cover; border-radius: 99px;`;
                    this._thumbnail.opacity = 0;
                    this._thumbnail.visible = true;
                }
                if (this._secondaryThumbnailWrapper) {
                    this._secondaryThumbnailWrapper.style = `background-image: url("file://${path}"); background-size: cover; border-radius: 99px;`;
                    if (this._secondaryThumbnail) {
                        this._secondaryThumbnail.opacity = 0;
                        this._secondaryThumbnail.visible = true;
                    }
                }
            } else {
                try {
                    // Other URI
                    const gicon = Gio.icon_new_for_string(artUrl);
                    this._thumbnail.set_gicon(gicon);
                    if (this._secondaryThumbnail) this._secondaryThumbnail.set_gicon(gicon);

                    if (this._expandedThumbnailWrapper) {
                        const cssUrl = artUrl.replace(/'/g, "\\'");
                        this._expandedThumbnailWrapper.style = `background-image: url("${cssUrl}"); background-size: cover; border-radius: 8px;`;
                        this._expandedThumbnail.opacity = 0;
                        this._expandedThumbnail.visible = true;

                        if (this._thumbnailWrapper) {
                            this._thumbnailWrapper.style = `background-image: url("${cssUrl}"); background-size: cover; border-radius: 99px;`;
                            this._thumbnail.opacity = 0;
                            this._thumbnail.visible = true;
                        }
                        if (this._secondaryThumbnailWrapper) {
                            this._secondaryThumbnailWrapper.style = `background-image: url("${cssUrl}"); background-size: cover; border-radius: 99px;`;
                            if (this._secondaryThumbnail) {
                                this._secondaryThumbnail.opacity = 0;
                                this._secondaryThumbnail.visible = true;
                            }
                        }
                    }
                } catch (e) {
                    log(`[DynamicIsland] MediaView: Error setting album art icon: ${e.message || e}`);
                    // Fallback
                    this._thumbnail.icon_name = 'audio-x-generic-symbolic';
                    if (this._secondaryThumbnail) this._secondaryThumbnail.icon_name = 'audio-x-generic-symbolic';

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
                    if (this._secondaryThumbnailWrapper) {
                        this._secondaryThumbnailWrapper.style = null;
                        if (this._secondaryThumbnail) {
                            this._secondaryThumbnail.opacity = 255;
                            this._secondaryThumbnail.visible = true;
                        }
                    }
                }
            }
        } else if (!isDownloading) {
            // Reset if no art
            this._thumbnail.icon_name = 'audio-x-generic-symbolic';
            if (this._secondaryThumbnail) this._secondaryThumbnail.icon_name = 'audio-x-generic-symbolic';

            if (this._expandedThumbnailWrapper) {
                this._expandedThumbnailWrapper.style = null;
                this._expandedThumbnail.icon_name = 'audio-x-generic-symbolic';
                this._expandedThumbnail.opacity = 255;
                this._expandedThumbnail.visible = true;
            }
            if (this._thumbnailWrapper) {
                this._thumbnailWrapper.style = null;
                this._thumbnail.icon_name = 'audio-x-generic-symbolic';
                this._thumbnail.opacity = 255;
                this._thumbnail.visible = true;
            }
            if (this._secondaryThumbnailWrapper) {
                this._secondaryThumbnailWrapper.style = null;
                if (this._secondaryThumbnail) {
                    this._secondaryThumbnail.opacity = 255;
                    this._secondaryThumbnail.visible = true;
                }
            }
        }

        // Update title and artist - sử dụng metadata hiện tại hoặc đã lưu
        if (currentMetadata) {
            const title = this._mediaManager.getTitle(currentMetadata);
            const artist = this._mediaManager.getArtist(currentMetadata);

            if (this._titleLabel) {
                this._titleLabel.text = title || 'Unknown Title';
            }
            if (this._artistLabel) {
                this._artistLabel.text = artist || '';
                // Ẩn artist label nếu không có artist
                this._artistLabel.visible = !!artist;
            }
        }

        // Update play/pause icon
        this._updatePlayPauseIcon(playbackStatus);
    }

    _updatePlayPauseIcon(playbackStatus) {
        if (!this._playPauseIcon) return;
        const iconName = playbackStatus === 'Playing'
            ? 'media-playback-pause-symbolic'
            : 'media-playback-start-symbolic';
        this._playPauseIcon.icon_name = iconName;
    }

    _onPrevious() {
        this._mediaManager.sendPlayerCommand('Previous');
    }

    _onPlayPause() {
        this._mediaManager.sendPlayerCommand('PlayPause');
    }

    _onNext() {
        this._mediaManager.sendPlayerCommand('Next');
    }

    _onShare() {
        if (!this._lastMetadata) {
            return;
        }
        // Lấy URL từ metadata
        const url = this._mediaManager.getMediaUrl(this._lastMetadata);
        if (!url) {
            return;
        }
        // Copy vào clipboard
        const clipboard = St.Clipboard.get_default();
        clipboard.set_text(St.ClipboardType.CLIPBOARD, url);
    }

    _onAudioDevice() {
        if (this._volumeRequestHandler) {
            this._volumeRequestHandler();
        }
    }

    setVolumeRequestHandler(handler) {
        this._volumeRequestHandler = handler;
    }

    _onArtClick() {
        const busName = this._mediaManager.getCurrentPlayer();
        if (!busName) return;

        this._focusMediaPlayerWindow(busName, this._mediaManager.getTitle(this._lastMetadata));
    }

    _focusMediaPlayerWindow(busName, mediaTitle = null) {
        const appSystem = Shell.AppSystem.get_default();

        // Rút gọn xử lý tên app từ MPRIS bus name
        const appName = busName.replace('org.mpris.MediaPlayer2.', '')
            .split('.')[0]
            .toLowerCase();

        // Set để check nhanh trình duyệt
        const browserSet = new Set(['chrome', 'chromium', 'firefox', 'edge', 'brave', 'opera', 'vivaldi']);
        const isBrowser = [...browserSet].some(b => appName.includes(b));

        // Cache list windows
        const windowActors = global.get_window_actors();
        const runningApps = appSystem.get_running();

        // Quick helpers
        const focusWindow = (window) => {
            const ws = window.get_workspace();
            ws.activate_with_focus(window, global.get_current_time());
        };

        const findWindowByTitle = (actors, title, appFilter = null) => {
            if (!title) return null;

            for (let actor of actors) {
                const w = actor.get_meta_window();
                const wTitle = w.get_title();
                const wmClass = w.get_wm_class() || '';

                if (wTitle?.includes(title)) {
                    if (!appFilter || wmClass.toLowerCase().includes(appFilter))
                        return w;
                }
            }
            return null;
        };

        for (let app of runningApps) {
            const appId = app.get_id().toLowerCase();
            const appNameLower = app.get_name().toLowerCase();

            if (appId.includes(appName) || appNameLower.includes(appName)) {

                // 🟦 SPECIAL CASE: Browser
                if (isBrowser) {
                    // 1. Try match correct tab/window
                    const matchedWindow = findWindowByTitle(windowActors, mediaTitle, appName);
                    if (matchedWindow) {
                        focusWindow(matchedWindow);
                        return;
                    }

                }

                // 🟦 NORMAL APPS
                const windows = app.get_windows();

                const matched = mediaTitle
                    ? windows.find(w => w.get_title()?.includes(mediaTitle))
                    : null;

                if (matched) {
                    focusWindow(matched);
                    return;
                }

                if (windows.length > 0) {
                    focusWindow(windows[0]);
                    return;
                }
            }
        }
    }

    show() {
        this.compactContainer.show();
        this.expandedContainer.show();
    }

    hide() {
        this.compactContainer.hide();
        this.expandedContainer.hide();
    }

    destroy() {
        if (this.compactContainer) {
            this.compactContainer.destroy();
        }
        if (this.expandedContainer) {
            this.expandedContainer.destroy();
        }
    }
}

// ============================================
// 2D. VIEW - Xử lý Giao diện Volume (VolumeView)
// ============================================