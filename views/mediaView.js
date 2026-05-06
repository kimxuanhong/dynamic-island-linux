const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Shell = imports.gi.Shell;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Visualizer = Me.imports.utils.visualizer;

var MediaView = class MediaView {
    constructor(mediaManager, volumeManager, bluetoothManager) {
        this._mediaManager = mediaManager;
        this._volumeManager = volumeManager;
        this._bluetoothManager = bluetoothManager;
        
        // State
        this._lastMetadata = null;
        this._lastArtPath = null;
        this._lastTrackTitle = null;
        this._currentPosition = 0;
        this._currentLength = 0;
        this._lastUpdateTime = 0;
        this._isDraggingProgress = false;
        
        // Timers
        this._progressUpdateInterval = null;
        
        // Build UI
        this._buildCompactView();
        this._buildExpandedView();
        this._buildMinimalView();
    }

    // ==================== COMPACT VIEW ====================
    
    _buildCompactView() {
        // Thumbnail
        this._thumbnail = new St.Icon({
            style_class: 'media-thumbnail',
            icon_name: 'audio-x-generic-symbolic',
            icon_size: 24,
            x_align: Clutter.ActorAlign.START
        });

        this._thumbnailWrapper = new St.Bin({
            child: this._thumbnail,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            style_class: 'media-thumbnail-wrapper',
            style: 'padding-left: 16px;',
            visible: false,
            clip_to_allocation: true,
        });

        // Visualizer
        this._visualizer = new Visualizer.MirroredVisualizer({
            barCount: 6,
            pattern: [4, 6, 8, 6, 4, 2],
            barWidth: 3,
            barSpacing: 3,
            rowHeight: 16,
            maxOffset: 2,
            animationSpeed: 80,
            bpm: 140
        });

        this._audioIconWrapper = new St.Bin({
            child: this._visualizer.container,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            style: 'padding-right: 3px;',
        });

        this.compactContainer = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: true,
            style_class: 'media-compact-container',
        });

        this.compactContainer.add_child(this._thumbnailWrapper);
        this.compactContainer.add_child(this._audioIconWrapper);
    }

    // ==================== MINIMAL VIEW ====================
    
    _buildMinimalView() {
        this._secondaryVisualizer = new Visualizer.MirroredVisualizer({
            barCount: 6,
            pattern: [4, 6, 8, 6, 4, 2],
            barWidth: 2,
            barSpacing: 2,
            rowHeight: 16,
            maxOffset: 2,
            animationSpeed: 80,
            bpm: 140
        });

        this.secondaryContainer = new St.Bin({
            child: this._secondaryVisualizer.container,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'media-minimal-container'
        });
    }

    // ==================== EXPANDED VIEW ====================
    
    _buildExpandedView() {
        const topTier = this._createTopTier();
        const progressSection = this._createProgressSection();
        const bottomTier = this._createBottomTier();

        this.expandedContainer = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_expand: true,
            style: 'spacing: 0px; padding: 24px;',
            visible: false,
        });

        this.expandedContainer.add_child(topTier);
        this.expandedContainer.add_child(progressSection);
        this.expandedContainer.add_child(bottomTier);
    }

    _createTopTier() {
        // Thumbnail
        this._expandedThumbnail = new St.Icon({
            style_class: 'media-expanded-art',
            icon_name: 'audio-x-generic-symbolic',
            icon_size: 56,
        });

        this._expandedThumbnailWrapper = new St.Bin({
            child: this._expandedThumbnail,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'media-expanded-thumbnail-wrapper',
            visible: true,
            reactive: true,
            clip_to_allocation: true,
        });
        
        this._expandedThumbnailWrapper.connect('scroll-event', () => Clutter.EVENT_STOP);
        this._expandedThumbnailWrapper.connect('button-press-event', () => {
            this._onArtClick();
            return Clutter.EVENT_STOP;
        });

        // Title & Artist
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

        const topTier = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: false,
            style: 'spacing: 12px;',
        });
        topTier.add_child(this._expandedThumbnailWrapper);
        topTier.add_child(this._titleWrapper);

        return topTier;
    }

    _createProgressSection() {
        // Progress bar
        this._progressBarBg = new St.Widget({
            style_class: 'media-progress-bg',
            style: 'background-color: rgba(255,255,255,0.2); height: 4px; border-radius: 2px;',
            x_expand: true,
            y_expand: false,
        });

        this._progressBarFill = new St.Widget({
            style_class: 'media-progress-fill',
            style: 'background-color: rgba(255,255,255,0.8); height: 4px; border-radius: 2px;',
            x_expand: false,
            y_expand: false,
        });

        this._progressBarBg.add_child(this._progressBarFill);

        this._progressBarContainer = new St.Bin({
            child: this._progressBarBg,
            x_expand: true,
            y_expand: false,
            style: 'padding: 0;',
            reactive: true,
            track_hover: true,
        });

        this._setupProgressBarEvents();

        // Time labels
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
        timeLabelsBox.add_child(new St.Widget({ x_expand: true }));
        timeLabelsBox.add_child(this._totalTimeLabel);

        this._progressSection = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_expand: false,
            style: 'margin: 10px 0;',
            visible: true,
        });
        this._progressSection.add_child(this._progressBarContainer);
        this._progressSection.add_child(timeLabelsBox);

        return this._progressSection;
    }

    _setupProgressBarEvents() {
        const resetStyle = () => {
            this._progressBarBg.style = 'background-color: rgba(255,255,255,0.2); height: 4px; border-radius: 2px;';
            this._progressBarFill.style = 'background-color: rgba(255,255,255,0.8); height: 4px; border-radius: 2px;';
        };

        const hoverStyle = () => {
            this._progressBarBg.style = 'background-color: rgba(255,255,255,0.3); height: 4px; border-radius: 2px;';
            this._progressBarFill.style = 'background-color: rgba(255,255,255,1.0); height: 4px; border-radius: 2px;';
        };

        this._progressBarContainer.connect('enter-event', hoverStyle);
        this._progressBarContainer.connect('leave-event', () => {
            if (!this._isDraggingProgress) resetStyle();
        });
        
        this._progressBarContainer.connect('button-press-event', (actor, event) => {
            this._isDraggingProgress = true;
            this._onProgressBarClick(actor, event);
            return Clutter.EVENT_STOP;
        });

        this._progressBarContainer.connect('button-release-event', (actor, event) => {
            if (this._isDraggingProgress) {
                this._isDraggingProgress = false;
                this._onProgressBarClick(actor, event);
                resetStyle();
            }
            return Clutter.EVENT_STOP;
        });

        this._progressBarContainer.connect('motion-event', (actor, event) => {
            if (this._isDraggingProgress) {
                this._onProgressBarClick(actor, event);
            }
            return Clutter.EVENT_STOP;
        });

        this._progressBarContainer.connect('scroll-event', () => Clutter.EVENT_STOP);
    }

    _createBottomTier() {
        const bottomBox = new St.BoxLayout({
            x_expand: true,
            y_expand: false,
            visible: true,
            reactive: true,
        });
        bottomBox.connect('scroll-event', () => Clutter.EVENT_STOP);

        // Share button
        this._shareButton = this._createButton('emblem-shared-symbolic', () => this._onShare());
        bottomBox.add_child(this._shareButton);

        // Control buttons
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

        const controls = [
            { icon: 'media-skip-backward-symbolic', handler: () => this._onPrevious() },
            { icon: 'media-playback-start-symbolic', handler: () => this._onPlayPause(), isPlayPause: true },
            { icon: 'media-skip-forward-symbolic', handler: () => this._onNext() },
        ];

        controls.forEach(config => {
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
            button.connect('clicked', config.handler);
            button.connect('scroll-event', () => Clutter.EVENT_STOP);

            if (config.isPlayPause) this._playPauseIcon = icon;
            this._controlsBox.add_child(button);
        });

        bottomBox.add_child(this._controlsBox);

        // Audio device button
        this._audioDeviceIcon = new St.Icon({
            style_class: 'share-audio-icon',
            icon_name: 'audio-speakers-symbolic',
        });
        this._audioDeviceButton = this._createButton(null, () => this._onAudioDevice());
        this._audioDeviceButton.set_child(this._audioDeviceIcon);
        bottomBox.add_child(this._audioDeviceButton);

        return bottomBox;
    }

    _createButton(iconName, handler) {
        const button = new St.Button({
            style_class: 'share-audio-button',
            x_align: iconName ? Clutter.ActorAlign.START : Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            can_focus: true,
        });
        
        if (iconName) {
            const icon = new St.Icon({
                style_class: 'share-audio-icon',
                icon_name: iconName,
            });
            button.set_child(icon);
        }
        
        button.connect('clicked', handler);
        button.connect('scroll-event', () => Clutter.EVENT_STOP);
        return button;
    }

    // ==================== PROGRESS BAR ====================
    
    _onProgressBarClick(actor, event) {
        if (this._currentLength <= 0) return;

        const [x] = event.get_coords();
        const [actorX] = actor.get_transformed_position();
        const clickX = x - actorX;
        const percentage = Math.max(0, Math.min(1, clickX / actor.width));
        const newPosition = Math.floor(this._currentLength * percentage);

        this._mediaManager.seekTo(newPosition);
        this._currentPosition = newPosition;
        this._lastUpdateTime = Date.now();
        this.updateProgress(newPosition, this._currentLength);
    }

    updateProgress(position, length) {
        if (!this._progressBarFill || !this._progressBarBg) return;

        this._currentPosition = position;
        this._currentLength = length;
        this._lastUpdateTime = Date.now();

        if (this._progressSection && !this._progressSection.visible) {
            this._progressSection.show();
        }

        if (length > 0 && position >= 0) {
            const percentage = Math.min(100, (position / length) * 100);
            const bgWidth = this._progressBarBg.width;
            
            if (bgWidth > 0) {
                const newWidth = Math.floor(bgWidth * percentage / 100);
                if (Math.abs(this._progressBarFill.width - newWidth) > 1) {
                    this._progressBarFill.set_width(newWidth);
                }
            }

            this._updateTimeLabel(this._currentTimeLabel, this._formatTime(position));
            this._updateTimeLabel(this._totalTimeLabel, this._formatTime(length));
        } else {
            this._progressBarFill.set_width(0);
            this._updateTimeLabel(this._currentTimeLabel, '0:00');
            this._updateTimeLabel(this._totalTimeLabel, '0:00');
        }
    }

    _updateTimeLabel(label, text) {
        if (label.text !== text) {
            label.text = text;
        }
    }

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

    _startProgressUpdate() {
        this._stopProgressUpdate();
        
        this._progressUpdateInterval = setInterval(() => {
            if (!this.expandedContainer?.visible) return;
            
            if (this._currentLength > 0 && this._currentPosition >= 0) {
                const now = Date.now();
                const elapsed = (now - this._lastUpdateTime) * 1000;
                this._currentPosition = Math.min(this._currentPosition + elapsed, this._currentLength);
                this._lastUpdateTime = now;
                this.updateProgress(this._currentPosition, this._currentLength);
            }
        }, 1000);
    }

    _stopProgressUpdate() {
        if (this._progressUpdateInterval) {
            clearInterval(this._progressUpdateInterval);
            this._progressUpdateInterval = null;
        }
    }

    // ==================== UPDATE METHODS ====================
    
    updatePlaybackState(isPlaying, playbackStatus) {
        this._updateVisualizerState(isPlaying, playbackStatus);
        this._updatePlayPauseIcon(playbackStatus);
        
        if (isPlaying && playbackStatus === 'Playing') {
            this._startProgressUpdate();
        } else {
            this._stopProgressUpdate();
        }
    }

    updateMedia(mediaInfo) {
        const { isPlaying, metadata, playbackStatus, artPath, position, length } = mediaInfo;
    
        this._updateVisualizerState(isPlaying, playbackStatus);

        // Detect track change
        const currentTitle = metadata ? this._mediaManager.getTitle(metadata) : null;
        const metadataChanged = this._handleTrackChange(currentTitle, length);
        
        // Update progress - CHỈ dùng position từ server
        if (position !== undefined && length !== undefined && length > 0) {
            this.updateProgress(position, length);
        }

        // Start/stop progress timer
        if (isPlaying && playbackStatus === 'Playing') {
            this._startProgressUpdate();
        } else {
            this._stopProgressUpdate();
        }

        // Update metadata cache
        if (metadata) this._lastMetadata = metadata;
        this._updateArtPathCache(metadataChanged, artPath);

        // Update visibility
        this._updateVisibility(isPlaying);

        // Update UI
        const currentMetadata = metadata || this._lastMetadata;
        const currentArtPath = artPath !== undefined ? artPath : (metadataChanged ? null : this._lastArtPath);
        
        this._updateAlbumArt(currentMetadata, currentArtPath);
        this._updateTextLabels(currentMetadata);
        this._updatePlayPauseIcon(playbackStatus);
    }

    _handleTrackChange(currentTitle, length) {
        if (!currentTitle) return false;

        const isNewTrack = this._lastTrackTitle && currentTitle !== this._lastTrackTitle;
        const isFirstTrack = !this._lastTrackTitle;

        if (isNewTrack || isFirstTrack) {
            // Change visualizer color
            const newColor = null;
            this._visualizer.setColor(newColor);
            if (this._secondaryVisualizer) {
                this._secondaryVisualizer.setColor(newColor || this._visualizer.getColor());
            }
            
            // Reset progress
            this._currentPosition = 0;
            this._currentLength = length || 0;
            this._lastUpdateTime = Date.now();
            this.updateProgress(0, length || 0);
            
            this._lastTrackTitle = currentTitle;
            return true;
        }

        this._lastTrackTitle = currentTitle;
        return false;
    }

    _updateArtPathCache(metadataChanged, artPath) {
        if (metadataChanged) {
            this._lastArtPath = artPath || null;
        } else if (artPath !== undefined) {
            this._lastArtPath = artPath || null;
        }
    }

    _updateVisibility(isPlaying) {
        if (isPlaying) {
            this._thumbnailWrapper.show();
            this._audioIconWrapper.show();
        } else {
            this._thumbnailWrapper.hide();
            this._audioIconWrapper.hide();
        }

        if (this.expandedContainer?.visible) {
            this._expandedThumbnailWrapper?.show();
            this._controlsBox.show();
            this._titleWrapper.show();
        }
    }

    _updateAlbumArt(metadata, artPath) {
        if (!metadata && !artPath) {
            this._resetAlbumArt();
            return;
        }

        let artUrl = artPath;
        if (!artUrl && metadata) {
            artUrl = this._mediaManager.getArtUrl(metadata);
            if (!artUrl && this._mediaManager.hasArtUrl(metadata)) {
                return; // Downloading
            }
        }

        if (!artUrl) {
            this._resetAlbumArt();
            return;
        }

        if (artUrl.startsWith('http')) {
            return; // Will update via callback
        }

        if (artUrl.startsWith('file://') || artUrl.startsWith('/')) {
            this._setLocalAlbumArt(artUrl.replace('file://', ''));
        } else {
            this._setIconAlbumArt(artUrl);
        }
    }

    _resetAlbumArt() {
        this._thumbnail.icon_name = 'audio-x-generic-symbolic';
        this._thumbnail.opacity = 255;
        this._thumbnail.visible = true;
        this._thumbnailWrapper.style = null;

        if (this._expandedThumbnailWrapper) {
            this._expandedThumbnail.icon_name = 'audio-x-generic-symbolic';
            this._expandedThumbnail.opacity = 255;
            this._expandedThumbnail.visible = true;
            this._expandedThumbnailWrapper.style = null;
        }
    }

    _setLocalAlbumArt(path) {
        const file = Gio.File.new_for_path(path);
        const gicon = new Gio.FileIcon({ file });
        this._thumbnail.set_gicon(gicon);

        this._thumbnailWrapper.style = `background-image: url("file://${path}"); background-size: cover; border-radius: 99px;`;
        this._thumbnail.opacity = 0;
        this._thumbnail.visible = true;

        if (this._expandedThumbnailWrapper) {
            this._expandedThumbnailWrapper.style = `background-image: url("file://${path}"); background-size: cover; border-radius: 8px;`;
            this._expandedThumbnail.opacity = 0;
            this._expandedThumbnail.visible = true;
        }
    }

    _setIconAlbumArt(artUrl) {
        try {
            const gicon = Gio.icon_new_for_string(artUrl);
            this._thumbnail.set_gicon(gicon);

            const cssUrl = artUrl.replace(/'/g, "\\'");
            this._thumbnailWrapper.style = `background-image: url("${cssUrl}"); background-size: cover; border-radius: 99px;`;
            this._thumbnail.opacity = 0;
            this._thumbnail.visible = true;

            if (this._expandedThumbnailWrapper) {
                this._expandedThumbnailWrapper.style = `background-image: url("${cssUrl}"); background-size: cover; border-radius: 8px;`;
                this._expandedThumbnail.opacity = 0;
                this._expandedThumbnail.visible = true;
            }
        } catch (e) {
            this._resetAlbumArt();
        }
    }

    _updateTextLabels(metadata) {
        if (!metadata) return;

        const title = this._mediaManager.getTitle(metadata);
        const artist = this._mediaManager.getArtist(metadata);

        if (this._titleLabel) {
            this._titleLabel.text = title || 'Unknown Title';
        }
        if (this._artistLabel) {
            this._artistLabel.text = artist || '';
            this._artistLabel.visible = !!artist;
        }
    }

    _updateVisualizerState(isPlaying, playbackStatus) {
        const shouldPlay = isPlaying && playbackStatus === 'Playing';
        
        if (shouldPlay) {
            this._visualizer.start();
            this._secondaryVisualizer?.start();
        } else {
            this._visualizer.stop();
            this._secondaryVisualizer?.stop();
        }
    }

    _updatePlayPauseIcon(playbackStatus) {
        if (!this._playPauseIcon) return;
        this._playPauseIcon.icon_name = playbackStatus === 'Playing'
            ? 'media-playback-pause-symbolic'
            : 'media-playback-start-symbolic';
    }

    // ==================== EVENT HANDLERS ====================
    
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
        if (!this._lastMetadata) return;
        
        const url = this._mediaManager.getMediaUrl(this._lastMetadata);
        if (!url) return;
        
        const clipboard = St.Clipboard.get_default();
        clipboard.set_text(St.ClipboardType.CLIPBOARD, url);
    }

    _onAudioDevice() {
        if (this._volumeRequestHandler) {
            this._volumeRequestHandler();
        }
    }

    _onArtClick() {
        const busName = this._mediaManager.getCurrentPlayer();
        if (!busName) return;

        this._focusMediaPlayerWindow(busName, this._mediaManager.getTitle(this._lastMetadata));
    }

    _focusMediaPlayerWindow(busName, mediaTitle = null) {
        const appSystem = Shell.AppSystem.get_default();
        const appName = busName.replace('org.mpris.MediaPlayer2.', '').split('.')[0].toLowerCase();
        const browserSet = new Set(['chrome', 'chromium', 'firefox', 'edge', 'brave', 'opera', 'vivaldi']);
        const isBrowser = [...browserSet].some(b => appName.includes(b));

        const focusWindow = (window) => {
            window.get_workspace().activate_with_focus(window, global.get_current_time());
        };

        const findWindowByTitle = (title, appFilter = null) => {
            if (!title) return null;
            
            for (let actor of global.get_window_actors()) {
                const w = actor.get_meta_window();
                const wTitle = w.get_title();
                const wmClass = w.get_wm_class() || '';

                if (wTitle?.includes(title)) {
                    if (!appFilter || wmClass.toLowerCase().includes(appFilter)) {
                        return w;
                    }
                }
            }
            return null;
        };

        for (let app of appSystem.get_running()) {
            const appId = app.get_id().toLowerCase();
            const appNameLower = app.get_name().toLowerCase();

            if (appId.includes(appName) || appNameLower.includes(appName)) {
                // Browser: try to match tab
                if (isBrowser) {
                    const matchedWindow = findWindowByTitle(mediaTitle, appName);
                    if (matchedWindow) {
                        focusWindow(matchedWindow);
                        return;
                    }
                }

                // Normal apps
                const windows = app.get_windows();
                const matched = mediaTitle ? windows.find(w => w.get_title()?.includes(mediaTitle)) : null;

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

    // ==================== PUBLIC API ====================
    
    setVolumeRequestHandler(handler) {
        this._volumeRequestHandler = handler;
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
        this._visualizer?.destroy();
        this._secondaryVisualizer?.destroy();
        this._stopProgressUpdate();

        this.compactContainer?.destroy();
        this.expandedContainer?.destroy();
    }
}
