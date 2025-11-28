const { Clutter, St, Gio, GLib } = imports.gi;

// Import constants
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Constants = Me.imports.constants;

const ANIMATION_DURATION = Constants.ANIMATION_DURATION;

// Bluetooth Presenter Class
var BluetoothPresenter = class BluetoothPresenter {
    constructor(notchInstance) {
        this._notch = notchInstance;
        this._subscriptionId = null;

        this._icon = null;
        this._iconWrapper = null;
        this._expandedIcon = null;
        this._expandedIconWrapper = null;
        this._statusLabel = null;
        this._deviceLabel = null;
        this._textWrapper = null;

        this._notificationTimeoutId = null;
        this._nestedTimeoutId = null;
        this._previousPresenterState = null; // 'battery' or 'media'
        this._destroyed = false;
    }

    enable() {
        this._buildActors();
        this._connectToBlueZ();
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

        this._disconnectFromBlueZ();

        this._iconWrapper?.destroy();
        this._expandedIconWrapper?.destroy();
        this._textWrapper?.destroy();

        this._iconWrapper = null;
        this._expandedIconWrapper = null;
        this._textWrapper = null;
    }

    _buildActors() {
        // Compact Icon (center)
        this._icon = new St.Icon({
            style_class: 'bluetooth-icon',
            icon_name: 'bluetooth-active-symbolic',
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

        // Expanded Icon (Left column)
        this._expandedIcon = new St.Icon({
            style_class: 'bluetooth-expanded-icon',
            icon_name: 'bluetooth-active-symbolic',
            icon_size: 64,
        });

        this._expandedIconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            visible: false,
        });
        this._expandedIconWrapper.set_child(this._expandedIcon);
        this._notch.getNotchTopLeft().add_child(this._expandedIconWrapper);

        // Expanded Text (Right column)
        const box = new St.BoxLayout({
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.START,
        });

        this._statusLabel = new St.Label({
            style_class: 'bluetooth-status-label',
            text: 'Connected',
        });

        this._deviceLabel = new St.Label({
            style_class: 'bluetooth-device-label',
            text: '',
        });

        box.add_child(this._statusLabel);
        box.add_child(this._deviceLabel);

        this._textWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            visible: false,
        });
        this._textWrapper.set_child(box);
        this._notch.getNotchTopRight().add_child(this._textWrapper);
    }

    _connectToBlueZ() {
        try {
            // Monitor DBus for PropertiesChanged signals on org.bluez
            this._subscriptionId = Gio.DBus.system.signal_subscribe(
                'org.bluez',
                'org.freedesktop.DBus.Properties',
                'PropertiesChanged',
                null,
                'org.bluez.Device1',
                Gio.DBusSignalFlags.NONE,
                (connection, sender, path, iface, signal, params) => {
                    try {
                        if (this._destroyed) return;
                        const [interfaceName, changedProps, invalidatedProps] = params.deep_unpack();

                        if (interfaceName === 'org.bluez.Device1') {
                            if ('Connected' in changedProps) {
                                const connected = changedProps['Connected'].unpack();

                                // Get device name for both connect and disconnect
                                Gio.DBus.system.call(
                                    'org.bluez',
                                    path,
                                    'org.freedesktop.DBus.Properties',
                                    'Get',
                                    new GLib.Variant('(ss)', ['org.bluez.Device1', 'Alias']),
                                    null,
                                    Gio.DBusCallFlags.NONE,
                                    -1,
                                    null,
                                    (conn, res) => {
                                        try {
                                            if (this._destroyed) return;
                                            const reply = conn.call_finish(res);
                                            const name = reply.deep_unpack()[0].unpack();
                                            this._showNotification(name, connected);
                                        } catch (e) {
                                            if (!this._destroyed) {
                                                // Fallback to "Unknown Device"
                                                this._showNotification('Unknown Device', connected);
                                            }
                                        }
                                    }
                                );
                            }
                        }
                    } catch (e) {
                        if (!this._destroyed) {
                            log(`[DynamicIsland] Error processing BlueZ signal: ${e.message}`);
                        }
                    }
                }
            );

            log('[DynamicIsland] Bluetooth monitoring enabled');
        } catch (e) {
            log(`[DynamicIsland] Error connecting to BlueZ: ${e.message}`);
        }
    }

    _disconnectFromBlueZ() {
        if (this._subscriptionId !== null) {
            Gio.DBus.system.signal_unsubscribe(this._subscriptionId);
            this._subscriptionId = null;
        }
    }

    setPresenters(mediaPresenter, batteryPresenter) {
        this._mediaPresenter = mediaPresenter;
        this._batteryPresenter = batteryPresenter;
    }

    _savePreviousState() {
        // Determine which presenter is currently visible
        if (this._mediaPresenter && this._mediaPresenter._thumbnailWrapper?.visible) {
            this._previousPresenterState = 'media';
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
        } else if (this._batteryPresenter) {
            this._batteryPresenter.show();
        }
        this._previousPresenterState = null;
    }

    _showNotification(deviceName, isConnected = true) {
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

        // Update UI based on connection state
        this._statusLabel.text = isConnected ? 'Connected' : 'Disconnected';
        this._deviceLabel.text = deviceName;

        // Change icon color based on state
        if (isConnected) {
            this._expandedIcon.style_class = 'bluetooth-expanded-icon';
        } else {
            this._expandedIcon.style_class = 'bluetooth-expanded-icon-disconnected';
        }

        this._iconWrapper.show();
        this._expandedIconWrapper.show();
        this._textWrapper.show();

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

            // Wait for collapse animation to finish before hiding UI and restoring
            this._nestedTimeoutId = imports.mainloop.timeout_add(ANIMATION_DURATION + 100, () => {
                this._nestedTimeoutId = null;
                if (this._destroyed) return false;

                if (this._iconWrapper) this._iconWrapper.hide();
                if (this._expandedIconWrapper) this._expandedIconWrapper.hide();
                if (this._textWrapper) this._textWrapper.hide();

                // Restore previous presenter
                this._restorePreviousState();

                return false;
            });

            return false;
        });
    }
};

