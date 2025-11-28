const { Clutter, St } = imports.gi;
const Volume = imports.ui.status.volume;

// Import constants
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Constants = Me.imports.constants;

const ANIMATION_DURATION = Constants.ANIMATION_DURATION;

// Volume Presenter Class
var VolumePresenter = class VolumePresenter {
    constructor(notchInstance) {
        this._notch = notchInstance;
        this._control = null;
        this._stream = null;
        this._volumeChangedId = null;
        this._sinkChangedId = null;
        this._nestedTimeoutId = null;

        this._icon = null;
        this._iconWrapper = null;
        this._volumeBar = null;
        this._volumeBarWrapper = null;
        this._percentageLabel = null;
        this._volumeProgress = 0;

        this._notificationTimeoutId = null;
        this._previousPresenterState = null;
        this._destroyed = false;
    }

    enable() {
        this._buildActors();
        this._connectToMixer();
    }

    destroy() {
        this._destroyed = true;

        if (this._notificationTimeoutId) {
            imports.mainloop.source_remove(this._notificationTimeoutId);
            this._notificationTimeoutId = null;
        }

        if (this._nestedTimeoutId) {
            imports.mainloop.source_remove(this._nestedTimeoutId);
            this._nestedTimeoutId = null;
        }

        this._disconnectFromMixer();

        this._iconWrapper?.destroy();
        this._volumeBarWrapper?.destroy();

        this._iconWrapper = null;
        this._volumeBarWrapper = null;
    }

    _buildActors() {
        // Compact Icon (center)
        this._icon = new St.Icon({
            style_class: 'volume-icon',
            icon_name: 'audio-volume-high-symbolic',
            icon_size: 20,
        });

        this._iconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            visible: false,
        });
        this._iconWrapper.set_child(this._icon);
        this._notch.notchCenter.add_child(this._iconWrapper);

        // Expanded Volume Bar (spans both columns)
        const volumeBox = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'volume-box',
        });

        const iconLarge = new St.Icon({
            style_class: 'volume-icon-large',
            icon_name: 'audio-volume-high-symbolic',
            icon_size: 48,
        });
        volumeBox.add_child(iconLarge);

        // Volume bar background with fill inside
        const barBg = new St.DrawingArea({
            style_class: 'volume-bar-bg',
            width: 340,
            height: 8,
        });

        barBg.connect('repaint', () => {
            const [w, h] = barBg.get_surface_size();
            const cr = barBg.get_context();
            
            // Background
            cr.setSourceRGB(1, 1, 1);
            cr.globalAlpha = 0.2;
            cr.rectangle(0, 0, w, h);
            cr.fill();
            
            // Fill
            cr.setSourceRGB(1, 1, 1);
            cr.globalAlpha = 1.0;
            const fillWidth = Math.round(w * (this._volumeProgress || 0));
            cr.rectangle(0, 0, fillWidth, h);
            cr.fill();
        });

        this._volumeBar = barBg;
        this._volumeProgress = 0;

        const barContainer = new St.BoxLayout({
            vertical: false,
            x_align: Clutter.ActorAlign.CENTER,
            style_class: 'volume-bar-container',
        });
        barContainer.add_child(barBg);

        volumeBox.add_child(barContainer);

        // Percentage label
        this._percentageLabel = new St.Label({
            style_class: 'volume-percentage',
            text: '50%',
        });
        volumeBox.add_child(this._percentageLabel);

        this._volumeBarWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            visible: false,
        });
        this._volumeBarWrapper.set_child(volumeBox);

        // Add to both top columns (spans entire width)
        this._notch.getNotchTopLeft().add_child(this._volumeBarWrapper);
    }

    _connectToMixer() {
        try {
            this._control = Volume.getMixerControl();
            this._stream = this._control.get_default_sink();

            if (this._stream) {
                this._volumeChangedId = this._stream.connect('notify::volume', () => {
                    this._onVolumeChanged();
                });
            }

            // Also listen for stream changes
            this._sinkChangedId = this._control.connect('default-sink-changed', () => {
                if (this._destroyed) return;
                if (this._volumeChangedId && this._stream) {
                    this._stream.disconnect(this._volumeChangedId);
                }
                this._stream = this._control.get_default_sink();
                if (this._stream) {
                    this._volumeChangedId = this._stream.connect('notify::volume', () => {
                        if (!this._destroyed) {
                            this._onVolumeChanged();
                        }
                    });
                }
            });

            log('[DynamicIsland] Volume monitoring enabled');
        } catch (e) {
            log(`[DynamicIsland] Error connecting to mixer: ${e.message}`);
        }
    }

    _disconnectFromMixer() {
        if (this._volumeChangedId && this._stream) {
            this._stream.disconnect(this._volumeChangedId);
            this._volumeChangedId = null;
        }
        if (this._sinkChangedId && this._control) {
            this._control.disconnect(this._sinkChangedId);
            this._sinkChangedId = null;
        }
        this._stream = null;
        this._control = null;
    }

    _onVolumeChanged() {
        if (this._destroyed || !this._stream || !this._control) return;

        try {
            const volume = this._stream.volume / this._control.get_vol_max_norm();
            const percentage = Math.round(volume * 100);

            this._volumeProgress = volume;
            this._volumeBar?.queue_repaint();

            this._showNotification(percentage);
        } catch (e) {
            log(`[DynamicIsland] Error in _onVolumeChanged: ${e.message}`);
        }
    }

    setPresenters(mediaPresenter, bluetoothPresenter, batteryPresenter) {
        this._mediaPresenter = mediaPresenter;
        this._bluetoothPresenter = bluetoothPresenter;
        this._batteryPresenter = batteryPresenter;
    }

    _savePreviousState() {
        if (this._mediaPresenter && this._mediaPresenter._thumbnailWrapper?.visible) {
            this._previousPresenterState = 'media';
        } else if (this._bluetoothPresenter && this._bluetoothPresenter._iconWrapper?.visible) {
            this._previousPresenterState = 'bluetooth';
        } else {
            this._previousPresenterState = 'battery';
        }
    }

    _restorePreviousState() {
        // Trigger transition animation
        this._notch._animateTransition();

        // Priority: If media is playing, show media. Otherwise restore previous state
        if (this._mediaPresenter && this._mediaPresenter.isMediaPlaying()) {
            this._mediaPresenter._updateMediaVisibility(true);
        } else if (this._previousPresenterState === 'media' && this._mediaPresenter) {
            this._mediaPresenter._updateMediaVisibility(true);
        } else if (this._previousPresenterState === 'bluetooth' && this._bluetoothPresenter) {
            // Bluetooth will handle its own restoration
        } else if (this._batteryPresenter) {
            this._batteryPresenter.show();
        }
        this._previousPresenterState = null;
    }

    _showNotification(percentage) {
        // Save current state
        this._savePreviousState();

        // Hide other presenters
        if (this._batteryPresenter) this._batteryPresenter.hide();
        if (this._mediaPresenter) {
            this._mediaPresenter._thumbnailWrapper?.hide();
            this._mediaPresenter._audioIconWrapper?.hide();
            this._mediaPresenter._expandedArtWrapper?.hide();
            this._mediaPresenter._controlsBox?.hide();
            this._mediaPresenter._titleWrapper?.hide();
        }
        if (this._bluetoothPresenter) {
            this._bluetoothPresenter._iconWrapper?.hide();
            this._bluetoothPresenter._expandedIconWrapper?.hide();
            this._bluetoothPresenter._textWrapper?.hide();
        }

        // Update UI
        this._percentageLabel.text = `${percentage}%`;
        this._volumeProgress = percentage / 100;
        this._volumeBar?.queue_repaint();

        // Update icon based on volume level
        if (percentage === 0) {
            this._icon.icon_name = 'audio-volume-muted-symbolic';
        } else if (percentage < 33) {
            this._icon.icon_name = 'audio-volume-low-symbolic';
        } else if (percentage < 66) {
            this._icon.icon_name = 'audio-volume-medium-symbolic';
        } else {
            this._icon.icon_name = 'audio-volume-high-symbolic';
        }

        this._iconWrapper.show();
        this._volumeBarWrapper.show();

        // Expand notch
        this._notch._expand();

        // Schedule collapse
        if (this._notificationTimeoutId) {
            imports.mainloop.source_remove(this._notificationTimeoutId);
        }

        this._notificationTimeoutId = imports.mainloop.timeout_add_seconds(2, () => {
            this._notificationTimeoutId = null;
            if (this._destroyed) return false;

            // Collapse notch
            if (this._notch && !this._notch._destroyed) {
                this._notch._collapse();
            }

            // Wait for collapse animation to finish
            this._nestedTimeoutId = imports.mainloop.timeout_add(ANIMATION_DURATION + 100, () => {
                this._nestedTimeoutId = null;
                if (this._destroyed) return false;

                if (this._iconWrapper) this._iconWrapper.hide();
                if (this._volumeBarWrapper) this._volumeBarWrapper.hide();

                // Restore previous presenter
                this._restorePreviousState();

                return false;
            });

            return false;
        });
    }
};

