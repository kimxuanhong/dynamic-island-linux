const { Clutter, St, UPowerGlib } = imports.gi;

// Import constants
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Constants = Me.imports.constants;

const ANIMATION_DURATION = Constants.ANIMATION_DURATION;

// Battery Presenter Class
var BatteryPresenter = class BatteryPresenter {
    constructor(notchInstance) {
        this._notch = notchInstance;
        this._client = null;
        this._device = null;
        this._deviceSignals = [];
        this._icon = null;
        this._percentageLabel = null;
        this._iconWrapper = null;
        this._percentageWrapper = null;

        // Charging notification elements
        this._chargingIcon = null;
        this._chargingLabel = null;
        this._chargingWrapper = null;
        this._notificationTimeoutId = null;
        this._nestedTimeoutId = null;
        this._previousPresenterState = null;
        this._previousBatteryState = UPowerGlib.DeviceState.UNKNOWN;
        this._destroyed = false;
    }

    enable() {
        this._client = new UPowerGlib.Client();
        this._device = this._client.get_display_device();
        this._buildActors();
        this._attachDeviceSignals();
        this._syncBatteryState();
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

        this._detachDeviceSignals();
        this._iconWrapper?.destroy();
        this._percentageWrapper?.destroy();
        this._chargingWrapper?.destroy();

        this._iconWrapper = null;
        this._percentageWrapper = null;
        this._chargingWrapper = null;
        this._icon = null;
        this._percentageLabel = null;
        this._client = null;
        this._device = null;
    }

    show() {
        if (this._iconWrapper) this._iconWrapper.show();
        if (this._percentageWrapper) this._percentageWrapper.show();
    }

    hide() {
        if (this._iconWrapper) this._iconWrapper.hide();
        if (this._percentageWrapper) this._percentageWrapper.hide();
    }

    _buildActors() {
        // Battery icon on the left
        this._icon = new St.Icon({
            style_class: 'battery-icon',
            icon_name: 'battery-level-100-symbolic',
        });
        this._icon.set_icon_size(20);

        this._iconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        this._iconWrapper.set_child(this._icon);
        this._notch.notchLeft.add_child(this._iconWrapper);

        // Battery percentage on the right
        this._percentageLabel = new St.Label({
            style_class: 'battery-percentage',
            text: '--%',
            x_align: Clutter.ActorAlign.END,
        });

        this._percentageWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        this._percentageWrapper.set_child(this._percentageLabel);
        this._notch.notchRight.add_child(this._percentageWrapper);

        // Charging Notification UI (Expanded)
        const chargingBox = new St.BoxLayout({
            vertical: false,
            style_class: 'charging-box',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._chargingIcon = new St.Icon({
            style_class: 'charging-icon',
            icon_name: 'battery-level-100-charging-symbolic',
            icon_size: 48,
        });

        const textBox = new St.BoxLayout({
            vertical: true,
            style_class: 'charging-text-box',
            y_align: Clutter.ActorAlign.CENTER,
        });

        const statusLabel = new St.Label({
            style_class: 'charging-status-label',
            text: 'Charging',
        });

        this._chargingLabel = new St.Label({
            style_class: 'charging-percentage-label',
            text: '100%',
        });

        textBox.add_child(statusLabel);
        textBox.add_child(this._chargingLabel);

        chargingBox.add_child(this._chargingIcon);
        chargingBox.add_child(textBox);

        this._chargingWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            visible: false,
        });
        this._chargingWrapper.set_child(chargingBox);

        // Add to top left (spans width)
        this._notch.getNotchTopLeft().add_child(this._chargingWrapper);
    }

    _attachDeviceSignals() {
        if (!this._device) return;
        this._deviceSignals.push(
            this._device.connect('notify::percentage', () => this._syncBatteryState())
        );
        this._deviceSignals.push(
            this._device.connect('notify::state', () => this._syncBatteryState())
        );
    }

    _detachDeviceSignals() {
        if (!this._device || !this._deviceSignals.length) return;
        this._deviceSignals.forEach(id => this._device.disconnect(id));
        this._deviceSignals = [];
    }

    _syncBatteryState() {
        if (this._destroyed || !this._percentageLabel || !this._icon) return;

        try {
            if (!this._device) {
                this._percentageLabel.text = '--%';
                this._icon.icon_name = 'battery-missing-symbolic';
                return;
            }

            const percentage = Math.round(this._device.percentage ?? this._device.get_percentage?.() ?? 0);
            const state = this._device.state;

            // Check for state change to charging
            const isCharging = state === UPowerGlib.DeviceState.CHARGING;
            const wasCharging = this._previousBatteryState === UPowerGlib.DeviceState.CHARGING;

            if (isCharging && !wasCharging) {
                this._showChargingNotification(percentage);
            }

            this._previousBatteryState = state;

            this._percentageLabel.text = `${percentage}%`;
            this._icon.icon_name = this._getIconName(percentage, state);
        } catch (e) {
            log(`[DynamicIsland] Error in _syncBatteryState: ${e.message}`);
        }
    }

    _getIconName(percentage, state) {
        const clamped = Math.max(0, Math.min(100, Math.round(percentage / 10) * 10));
        const charging = state === UPowerGlib.DeviceState.CHARGING ||
            state === UPowerGlib.DeviceState.PENDING_CHARGE;
        const suffix = charging ? '-charging-symbolic' : '-symbolic';
        return `battery-level-${clamped}${suffix}`;
    }

    setPresenters(mediaPresenter, bluetoothPresenter, volumePresenter) {
        this._mediaPresenter = mediaPresenter;
        this._bluetoothPresenter = bluetoothPresenter;
        this._volumePresenter = volumePresenter;
    }

    _savePreviousState() {
        if (this._mediaPresenter && this._mediaPresenter._thumbnailWrapper?.visible) {
            this._previousPresenterState = 'media';
        } else if (this._bluetoothPresenter && this._bluetoothPresenter._iconWrapper?.visible) {
            this._previousPresenterState = 'bluetooth';
        } else if (this._volumePresenter && this._volumePresenter._iconWrapper?.visible) {
            this._previousPresenterState = 'volume';
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
            // Bluetooth handles itself
        } else if (this._previousPresenterState === 'volume' && this._volumePresenter) {
            // Volume handles itself
        } else {
            this.show();
        }
        this._previousPresenterState = null;
    }

    _showChargingNotification(percentage) {
        // Save current state
        this._savePreviousState();

        // Hide other presenters
        this.hide(); // Hide compact battery
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
        if (this._volumePresenter) {
            this._volumePresenter._iconWrapper?.hide();
            this._volumePresenter._volumeBarWrapper?.hide();
        }

        // Update UI
        this._chargingLabel.text = `${percentage}%`;

        // Update charging icon based on percentage
        const clamped = Math.max(0, Math.min(100, Math.round(percentage / 10) * 10));
        this._chargingIcon.icon_name = `battery-level-${clamped}-charging-symbolic`;

        this._chargingWrapper.show();

        // Expand notch
        this._notch._expand();

        // Schedule collapse
        if (this._notificationTimeoutId) {
            imports.mainloop.source_remove(this._notificationTimeoutId);
        }

        this._notificationTimeoutId = imports.mainloop.timeout_add_seconds(3, () => {
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

                if (this._chargingWrapper) this._chargingWrapper.hide();

                // Restore previous presenter
                this._restorePreviousState();

                return false;
            });

            return false;
        });
    }
};

