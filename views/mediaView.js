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
        this._progressUpdateInterval = null;
        this._currentPosition = 0;
        this._currentLength = 0;
        this._lastUpdateTime = 0;
        this._buildCompactView();
        this._buildExpandedView();
        this._buildMinimalView();
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

        // ===== VISUALIZER =====
        this._visualizerBars = [];
        const barCount = 6;
        const pattern = [4, 6, 8, 6, 4, 2];

        this._visualizerBox = new St.BoxLayout({
            style_class: 'media-visualizer-box',
            vertical: false,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.END, // 🔥 quan trọng
            style: 'spacing: 3px;',
        });

        this._visualizerBox.set_height(16); // 🔥 tránh bị bó layout

        for (let i = 0; i < barCount; i++) {
            const height = pattern[i % pattern.length];

            const bar = new St.Widget({
                style_class: 'media-visualizer-bar',
                style: `
                width: 3px;
                background-color: rgba(255,255,255,0.5);
                border-radius: 1.5px;
            `,
            });

            bar.set_height(height); // ✅ fix chuẩn
            bar.set_y_align(Clutter.ActorAlign.END); // ✅ dính đáy

            this._visualizerBars.push(bar);
            this._visualizerBox.add_child(bar);
        }

        this._audioIconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            style: 'padding-right: 3px;',
        });
        this._audioIconWrapper.set_child(this._visualizerBox);

        this._visualizerAnimation = null;

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
     * Start visualizer animation
     */
    _startVisualizerAnimation() {
        if (this._visualizerAnimation) return;

        const pattern = [4, 6, 8, 6, 4, 2];

        const states = this._visualizerBars.map((_, i) => ({
            base: pattern[i % pattern.length],
            offset: 0,
            dir: Math.random() > 0.5 ? 1 : -1
        }));

        const MAX_OFFSET = 2;

        this._visualizerAnimation = setInterval(() => {
            this._visualizerBars.forEach((bar, i) => {
                const state = states[i];

                const step = Math.random() > 0.7 ? 2 : 1;
                state.offset += step * state.dir;

                // clamp + đảo chiều
                if (state.offset > MAX_OFFSET) {
                    state.offset = MAX_OFFSET;
                    state.dir = -1;
                }
                if (state.offset < -MAX_OFFSET) {
                    state.offset = -MAX_OFFSET;
                    state.dir = 1;
                }

                let height = state.base + state.offset;

                // 🔥 giữ form: không cho phá shape
                if (i > 0) {
                    height = Math.max(height, this._visualizerBars[i - 1].height - 2);
                }

                const opacity = 0.7 + (height / 10) * 0.3;

                bar.set_height(height); // ✅ FIX CHUẨN

                bar.set_style(`
                width: 3px;
                background-color: rgba(255,255,255,${opacity});
                border-radius: 1.5px;
            `);
            });
        }, 80);
    }

    /**
     * Stop visualizer animation
     */
    _stopVisualizerAnimation() {
        if (this._visualizerAnimation) {
            clearInterval(this._visualizerAnimation);
            this._visualizerAnimation = null;

            const idle = [4, 6, 8, 6, 4, 2];

            this._visualizerBars.forEach((bar, i) => {
                bar.set_height(idle[i]);

                bar.set_style(`
                width: 3px;
                background-color: rgba(255,255,255,0.4);
                border-radius: 1.5px;
            `);
            });
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
        // PROGRESS BAR: Position and Duration
        // ============================================

        // Progress bar background
        this._progressBarBg = new St.Widget({
            style_class: 'media-progress-bg',
            style: 'background-color: rgba(255,255,255,0.2); height: 4px; border-radius: 2px;',
            x_expand: true,
            y_expand: false,
        });

        // Progress bar fill
        this._progressBarFill = new St.Widget({
            style_class: 'media-progress-fill',
            style: 'background-color: rgba(255,255,255,0.8); height: 4px; border-radius: 2px;',
            x_expand: false,
            y_expand: false,
        });

        this._progressBarContainer = new St.Bin({
            child: this._progressBarBg,
            x_expand: true,
            y_expand: false,
            style: 'padding: 0;',
        });

        // Add fill as overlay
        this._progressBarBg.add_child(this._progressBarFill);

        // Time labels (current / total)
        this._currentTimeLabel = new St.Label({
            style_class: 'media-time-label',
            text: '0:00',
            style: 'color: rgba(255,255,255,0.7); font-size: 11px;',
            x_align: Clutter.ActorAlign.START,
        });

        this._totalTimeLabel = new St.Label({
            style_class: 'media-time-label',
            text: '0:00',
            style: 'color: rgba(255,255,255,0.7); font-size: 11px;',
            x_align: Clutter.ActorAlign.END,
        });

        const timeLabelsBox = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: false,
            style: 'margin-top: 4px;',
        });
        timeLabelsBox.add_child(this._currentTimeLabel);
        timeLabelsBox.add_child(new St.Widget({ x_expand: true })); // Spacer
        timeLabelsBox.add_child(this._totalTimeLabel);

        const progressSection = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_expand: false,
            style: 'margin: 10px 0;',
        });
        progressSection.add_child(this._progressBarContainer);
        progressSection.add_child(timeLabelsBox);


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
        this.expandedContainer.add_child(progressSection);
        //this.expandedContainer.add_child(separator);
        this.expandedContainer.add_child(bottomBox);
    }

    /**
     * Update progress bar based on position and length
     * @param {number} position - Current position in microseconds
     * @param {number} length - Total length in microseconds
     */
    updateProgress(position, length) {
        if (!this._progressBarFill || !this._progressBarBg) return;

        // Store current values
        this._currentPosition = position;
        this._currentLength = length;
        this._lastUpdateTime = Date.now();

        if (length > 0 && position >= 0) {
            const percentage = Math.min(100, (position / length) * 100);
            const bgWidth = this._progressBarBg.width;
            
            if (bgWidth > 0) {
                this._progressBarFill.set_width(bgWidth * percentage / 100);
            }

            // Update time labels
            this._currentTimeLabel.text = this._formatTime(position);
            this._totalTimeLabel.text = this._formatTime(length);
        } else {
            // Reset if no valid data
            this._progressBarFill.set_width(0);
            this._currentTimeLabel.text = '0:00';
            this._totalTimeLabel.text = '0:00';
        }
    }

    /**
     * Start progress bar update interval
     */
    _startProgressUpdate() {
        this._stopProgressUpdate();
        
        this._progressUpdateInterval = setInterval(() => {
            if (this._currentLength > 0 && this._currentPosition >= 0) {
                // Calculate elapsed time since last update
                const now = Date.now();
                const elapsed = (now - this._lastUpdateTime) * 1000; // Convert to microseconds
                
                // Update position
                this._currentPosition = Math.min(this._currentPosition + elapsed, this._currentLength);
                this._lastUpdateTime = now;
                
                // Update UI
                this.updateProgress(this._currentPosition, this._currentLength);
            }
        }, 1000); // Update every second
    }

    /**
     * Stop progress bar update interval
     */
    _stopProgressUpdate() {
        if (this._progressUpdateInterval) {
            clearInterval(this._progressUpdateInterval);
            this._progressUpdateInterval = null;
        }
    }

    /**
     * Format microseconds to MM:SS or HH:MM:SS
     * @param {number} microseconds
     * @returns {string}
     */
    _formatTime(microseconds) {
        const seconds = Math.floor(microseconds / 1000000);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Update visualizer state based on playback status
     * @param {boolean} isPlaying - Whether media is playing
     * @param {string} playbackStatus - Playback status ('Playing', 'Paused', 'Stopped')
     */
    _updateVisualizerState(isPlaying, playbackStatus) {
        if (isPlaying && playbackStatus === 'Playing') {
            this._startVisualizerAnimation();
        } else {
            this._stopVisualizerAnimation();
        }
    }

    /**
     * Update only playback state (for pause/stop without full metadata update)
     * @param {boolean} isPlaying - Whether media is playing
     * @param {string} playbackStatus - Playback status
     */
    updatePlaybackState(isPlaying, playbackStatus) {
        this._updateVisualizerState(isPlaying, playbackStatus);
        this._updatePlayPauseIcon(playbackStatus);
        
        // Start or stop progress update based on playback state
        if (isPlaying && playbackStatus === 'Playing') {
            this._startProgressUpdate();
        } else {
            this._stopProgressUpdate();
        }
    }

    updateMedia(mediaInfo) {
        const { isPlaying, metadata, playbackStatus, artPath, position, length } = mediaInfo;
    
        // Update visualizer based on playback status
        this._updateVisualizerState(isPlaying, playbackStatus);

        // Update progress bar
        if (position !== undefined && length !== undefined) {
            this.updateProgress(position, length);
        }

        // Start or stop progress update based on playback state
        if (isPlaying && playbackStatus === 'Playing') {
            this._startProgressUpdate();
        } else {
            this._stopProgressUpdate();
        }

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
                    // log(`[DynamicIsland] MediaView: Error setting album art icon: ${e.message || e}`);
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
        this._playPauseIcon.icon_name = playbackStatus === 'Playing'
            ? 'media-playback-pause-symbolic'
            : 'media-playback-start-symbolic';
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
        // Stop visualizer animation
        this._stopVisualizerAnimation();
        
        // Stop progress update
        this._stopProgressUpdate();

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