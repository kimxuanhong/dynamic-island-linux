const { Clutter, GObject, St, UPowerGlib, Gio, Soup, GLib } = imports.gi;
const Main = imports.ui.main;
const Volume = imports.ui.status.volume;

// Constants
const COMPACT_WIDTH = 200;
const COMPACT_HEIGHT = 40;
const EXPANDED_WIDTH = 400;
const EXPANDED_HEIGHT = 160;
const ANIMATION_DURATION = 300; // Increased for smoother animation
const BOX_MARGIN_TOP = 0;

let notch;
let batteryPresenter;
let mediaPresenter;
let bluetoothPresenter;
let volumePresenter;
let monitorsChangedId;
let stageResizeId;

const Notch = GObject.registerClass(
    class Notch extends St.BoxLayout {
        _init() {
            super._init({
                style_class: 'notch',
                vertical: false,
                reactive: true,
                track_hover: true,
            });

            this._isExpanded = false;
            this._collapseTimeoutId = null;
            this._hoverProgress = 0;
            this._hoverTarget = 0;
            this._hoverAnimationId = null;

            // Create hit-test overlay to block events below expanded notch
            this._hitTestOverlay = new St.Widget({
                name: 'notch-hit-test-overlay',
                reactive: true,
                visible: false,
            });
            this._hitTestOverlay.connect('button-press-event', () => Clutter.EVENT_STOP);
            this._hitTestOverlay.connect('button-release-event', () => Clutter.EVENT_STOP);
            this._hitTestOverlay.connect('scroll-event', () => Clutter.EVENT_STOP);
            this._hitTestOverlay.connect('motion-event', () => Clutter.EVENT_STOP);
            this._hitTestOverlay.connect('enter-event', () => Clutter.EVENT_STOP);
            this._hitTestOverlay.connect('leave-event', () => Clutter.EVENT_STOP);

            // Compact layout (3 horizontal compartments)
            this._compactLayout = new St.BoxLayout({
                x_expand: true,
                y_expand: true,
                vertical: false,
                reactive: true,
            });
            this.add_child(this._compactLayout);

            this.notchLeft = new St.BoxLayout({
                style_class: 'notch-left',
                x_expand: true,
                y_expand: true,
            });
            this._compactLayout.add_child(this.notchLeft);

            this.notchCenter = new St.BoxLayout({
                style_class: 'notch-center',
                x_expand: true,
                y_expand: true,
            });
            this._compactLayout.add_child(this.notchCenter);

            this.notchRight = new St.BoxLayout({
                style_class: 'notch-right',
                x_expand: true,
                y_expand: true,
            });
            this._compactLayout.add_child(this.notchRight);

            // Create expanded layout (2x2 grid)
            this._expandedLayout = new St.BoxLayout({
                x_expand: true,
                y_expand: true,
                vertical: false,
                visible: false,
                reactive: true,
            });
            this._expandedLayout.connect('enter-event', () => {
                if (this._collapseTimeoutId) {
                    imports.mainloop.source_remove(this._collapseTimeoutId);
                    this._collapseTimeoutId = null;
                }
                return Clutter.EVENT_STOP;
            });
            this._expandedLayout.connect('leave-event', () => {
                if (this._collapseTimeoutId)
                    imports.mainloop.source_remove(this._collapseTimeoutId);
                this._scheduleCollapseCheck(true);
                return Clutter.EVENT_STOP;
            });
            this.add_child(this._expandedLayout);

            // Left column
            const leftColumn = new St.BoxLayout({
                x_expand: true,
                y_expand: true,
                vertical: true,
                reactive: true,
            });
            this._expandedLayout.add_child(leftColumn);

            this.notchTopLeft = new St.BoxLayout({
                style_class: 'notch-top-left',
                x_expand: true,
                y_expand: true,
                reactive: true,
            });
            leftColumn.add_child(this.notchTopLeft);

            this.notchBottomLeft = new St.BoxLayout({
                style_class: 'notch-bottom-left',
                x_expand: true,
                y_expand: true,
                reactive: true,
            });
            leftColumn.add_child(this.notchBottomLeft);

            // Right column
            const rightColumn = new St.BoxLayout({
                x_expand: true,
                y_expand: true,
                vertical: true,
                reactive: true,
            });
            this._expandedLayout.add_child(rightColumn);

            this.notchTopRight = new St.BoxLayout({
                style_class: 'notch-top-right',
                x_expand: true,
                y_expand: true,
                reactive: true,
            });
            rightColumn.add_child(this.notchTopRight);

            this.notchBottomRight = new St.BoxLayout({
                style_class: 'notch-bottom-right',
                x_expand: true,
                y_expand: true,
                reactive: true,
            });
            rightColumn.add_child(this.notchBottomRight);

            // Set initial position
            this._setInitialGeometry();
            this._setHoverProgress(0);

            // Connect hover events
            this.connect('enter-event', () => {
                if (this._collapseTimeoutId) {
                    imports.mainloop.source_remove(this._collapseTimeoutId);
                    this._collapseTimeoutId = null;
                }
                this._expand();
                return Clutter.EVENT_STOP;
            });

            this.connect('leave-event', () => {
                if (this._collapseTimeoutId)
                    imports.mainloop.source_remove(this._collapseTimeoutId);

                this._scheduleCollapseCheck();
                return Clutter.EVENT_STOP;
            });

            // Block other events to prevent click-through
            this.connect('button-press-event', () => Clutter.EVENT_STOP);
            this.connect('button-release-event', () => Clutter.EVENT_STOP);
            this.connect('scroll-event', () => Clutter.EVENT_STOP);

            this.connect('destroy', () => {
                if (this._collapseTimeoutId) {
                    imports.mainloop.source_remove(this._collapseTimeoutId);
                    this._collapseTimeoutId = null;
                }
                this._stopHoverAnimation();
            });
        }

        _expand() {
            if (this._hoverTarget === 1 && this._isExpanded && !this._hoverAnimationId) return;
            this._animateHoverTo(1);
        }

        _collapse(forceImmediate = false) {
            if (forceImmediate) {
                this._stopHoverAnimation();
                this._setHoverProgress(0);
                this._hoverTarget = 0;
                this._isExpanded = false;
                return;
            }
            if (this._hoverTarget === 0 && !this._hoverAnimationId && !this._isExpanded)
                return;
            this._animateHoverTo(0);
        }

        _animateTransition() {
            // Only animate if in compact mode
            if (this._isExpanded || this._hoverTarget !== 0) return;

            this._stopHoverAnimation();

            const duration = 300; // ms
            const startTime = GLib.get_monotonic_time();
            const totalDuration = duration * 1000;
            const startWidth = COMPACT_WIDTH;
            const minWidth = COMPACT_WIDTH * 0.9; // Shrink to 90%

            this._hoverAnimationId = imports.mainloop.timeout_add(16, () => {
                const elapsed = GLib.get_monotonic_time() - startTime;
                const t = Math.min(1, elapsed / totalDuration);

                // Phase 1: Shrink (0 -> 0.5)
                // Phase 2: Bounce back (0.5 -> 1)
                let currentWidth;
                if (t < 0.5) {
                    const shrinkT = t * 2;
                    currentWidth = this._lerp(startWidth, minWidth, this._easeInOutQuad(shrinkT));
                } else {
                    const bounceT = (t - 0.5) * 2;
                    currentWidth = this._lerp(minWidth, startWidth, this._easeOutBack(bounceT));
                }

                const { x, y } = this._getTargetCoords(currentWidth);
                this.set_position(x, y);
                this.set_size(Math.round(currentWidth), COMPACT_HEIGHT);

                if (t >= 1) {
                    this._stopHoverAnimation();
                    // Ensure we reset to exact compact dimensions
                    this._setInitialGeometry();
                    return false;
                }

                return true;
            });
        }

        _setInitialGeometry() {
            const { x, y } = this._getTargetCoords(COMPACT_WIDTH);
            this.set_position(x, y);
            this.set_size(COMPACT_WIDTH, COMPACT_HEIGHT);
        }

        _getTargetCoords(width) {
            const monitor = Main.layoutManager.primaryMonitor;
            return {
                x: monitor.x + Math.floor((monitor.width - width) / 2),
                y: monitor.y + BOX_MARGIN_TOP,
            };
        }

        _animateHoverTo(target) {
            const clampedTarget = Math.max(0, Math.min(1, target));
            const startProgress = this._hoverProgress;

            if (Math.abs(startProgress - clampedTarget) < 0.001) {
                this._setHoverProgress(clampedTarget);
                this._hoverTarget = clampedTarget;
                this._isExpanded = clampedTarget === 1;
                return;
            }

            this._hoverTarget = clampedTarget;
            this._stopHoverAnimation();

            const isExpanding = clampedTarget > startProgress;
            const duration = ANIMATION_DURATION;
            const startTime = GLib.get_monotonic_time();
            const totalDuration = duration * 1000; // microseconds

            this._hoverAnimationId = imports.mainloop.timeout_add(16, () => {
                const elapsed = GLib.get_monotonic_time() - startTime;
                const t = Math.min(1, elapsed / totalDuration);

                this._updatePhaseProgress(t, startProgress, clampedTarget, isExpanding);

                if (t >= 1) {
                    this._stopHoverAnimation();
                    this._setHoverProgress(clampedTarget);
                    this._hoverTarget = clampedTarget;
                    this._isExpanded = clampedTarget === 1;
                    return false;
                }

                return true;
            });
        }

        _updatePhaseProgress(t, startProgress, clampedTarget, isExpanding) {
            const PHASE_1_DURATION = 0.4;
            const isInPhase1 = t < PHASE_1_DURATION;

            if (isExpanding) {
                // Expand: Phase 1 (size grows), Phase 2 (content fades in)
                if (isInPhase1) {
                    const sizePhaseT = t / PHASE_1_DURATION;
                    const sizeProgress = this._lerp(startProgress, clampedTarget, this._easeOutBack(sizePhaseT));
                    this._setHoverProgressWithContentOpacity(sizeProgress, 0);
                } else {
                    const contentPhaseT = (t - PHASE_1_DURATION) / (1 - PHASE_1_DURATION);
                    this._setHoverProgressWithContentOpacity(clampedTarget, this._easeInOutQuad(contentPhaseT));
                }
            } else {
                // Collapse: Phase 1 (content fades out), Phase 2 (size shrinks)
                if (isInPhase1) {
                    const contentPhaseT = t / PHASE_1_DURATION;
                    const contentOpacity = 1 - this._easeInOutQuad(contentPhaseT);
                    this._setHoverProgressWithContentOpacity(this._hoverProgress, contentOpacity);
                } else {
                    const sizePhaseT = (t - PHASE_1_DURATION) / (1 - PHASE_1_DURATION);
                    const sizeProgress = this._lerp(startProgress, clampedTarget, this._easeInOutQuad(sizePhaseT));
                    this._setHoverProgressWithContentOpacity(sizeProgress, 0);
                }
            }
        }

        _setHoverProgressWithContentOpacity(progress, contentOpacityFactor) {
            const clamped = Math.max(0, Math.min(1, progress));
            this._hoverProgress = clamped;

            const width = this._lerp(COMPACT_WIDTH, EXPANDED_WIDTH, clamped);
            const height = this._lerp(COMPACT_HEIGHT, EXPANDED_HEIGHT, clamped);
            const { x, y } = this._getTargetCoords(width);

            this.set_position(x, y);
            this.set_size(Math.round(width), Math.round(height));

            // Scale compact content - fade out during expansion
            if (this._compactLayout) {
                // During expand: content fades quickly
                // During collapse: content stays visible until phase 2
                const compactFadeFactor = contentOpacityFactor > 0 ? 1 - contentOpacityFactor : 1;
                const opacityEase = this._easeInOutQuad(1 - clamped);
                const compactOpacity = Math.max(0, 255 * opacityEase * compactFadeFactor);

                this._compactLayout.opacity = compactOpacity;
                this._compactLayout.visible = compactOpacity > 5;
                this._compactLayout.set_scale(this._lerp(1, 0.85, clamped), this._lerp(1, 0.85, clamped));
            }

            // Scale expanded content - fade in during expansion, fade out during collapse
            if (this._expandedLayout) {
                const expandedOpacity = Math.round(255 * contentOpacityFactor);
                const expandedScale = this._lerp(0.9, 1, clamped);

                this._expandedLayout.visible = expandedOpacity > 5;
                this._expandedLayout.opacity = expandedOpacity;
                this._expandedLayout.set_scale(expandedScale, expandedScale);
            }

            // Update hit-test overlay
            if (this._hitTestOverlay) {
                this._hitTestOverlay.visible = clamped > 0.01;
                this._updateHitTestOverlay(clamped);
            }

            if (clamped >= 0.99) {
                this._isExpanded = true;
            } else if (clamped <= 0.01) {
                this._isExpanded = false;
            }
        }

        _setHoverProgress(progress) {
            const clamped = Math.max(0, Math.min(1, progress));
            this._hoverProgress = clamped;

            const width = this._lerp(COMPACT_WIDTH, EXPANDED_WIDTH, clamped);
            const height = this._lerp(COMPACT_HEIGHT, EXPANDED_HEIGHT, clamped);
            const { x, y } = this._getTargetCoords(width);

            this.set_position(x, y);
            this.set_size(Math.round(width), Math.round(height));

            if (this._compactLayout) {
                const opacityEase = this._easeInOutQuad(1 - clamped);
                const compactOpacity = Math.max(0, 255 * opacityEase);
                this._compactLayout.opacity = compactOpacity;
                this._compactLayout.visible = compactOpacity > 5;
                this._compactLayout.set_scale(this._lerp(1, 0.85, clamped), this._lerp(1, 0.85, clamped));
            }

            if (this._expandedLayout) {
                const expandedOpacity = Math.round(255 * clamped);
                this._expandedLayout.visible = clamped > 0.01;
                this._expandedLayout.opacity = expandedOpacity;
                this._expandedLayout.set_scale(this._lerp(0.9, 1, clamped), this._lerp(0.9, 1, clamped));
            }

            if (this._hitTestOverlay) {
                this._hitTestOverlay.visible = clamped > 0.01;
                this._updateHitTestOverlay(clamped);
            }

            if (clamped >= 0.99) {
                this._isExpanded = true;
            } else if (clamped <= 0.01) {
                this._isExpanded = false;
            }
        }

        _updateHitTestOverlay(progress) {
            try {
                const box = new Clutter.ActorBox();
                this.get_transformed_allocation(box);

                // Make overlay cover full notch area
                this._hitTestOverlay.set_position(box.x1, box.y1);
                this._hitTestOverlay.set_size(box.x2 - box.x1, box.y2 - box.y1);
            } catch (e) {
                log(`[DynamicIsland] Error updating hit-test overlay: ${e.message}`);
            }
        }

        _stopHoverAnimation() {
            if (this._hoverAnimationId) {
                imports.mainloop.source_remove(this._hoverAnimationId);
                this._hoverAnimationId = null;
            }
        }

        _lerp(start, end, t) {
            return start + (end - start) * t;
        }

        _easeInOutQuad(t) {
            return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        }

        _easeOutBack(t) {
            // Spring-like easing for expansion - gives a bouncy, natural feel
            const c1 = 1.70158;
            const c3 = c1 + 1;
            return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
        }

        _easeInOutCubic(t) {
            return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        }

        syncPosition() {
            const width = this._lerp(COMPACT_WIDTH, EXPANDED_WIDTH, this._hoverProgress);
            const { x, y } = this._getTargetCoords(width);
            this.set_position(x, y);
        }

        getNotchLeft() { return this.notchLeft; }
        getNotchCenter() { return this.notchCenter; }
        getNotchRight() { return this.notchRight; }
        getNotchTopLeft() { return this.notchTopLeft; }
        getNotchTopRight() { return this.notchTopRight; }
        getNotchBottomLeft() { return this.notchBottomLeft; }
        getNotchBottomRight() { return this.notchBottomRight; }

        _scheduleCollapseCheck(forceImmediate = false) {
            // Clear any existing timeout
            if (this._collapseTimeoutId) {
                imports.mainloop.source_remove(this._collapseTimeoutId);
            }

            const delay = forceImmediate ? 40 : 180;
            this._collapseTimeoutId = imports.mainloop.timeout_add(delay, () => {
                this._collapseTimeoutId = null;

                // Check if pointer is still near/inside notch
                if (!forceImmediate && this._shouldRemainExpanded()) {
                    // Schedule another check
                    this._scheduleCollapseCheck();
                    return false;
                }

                this._collapse(forceImmediate);
                return false;
            });
        }

        _shouldRemainExpanded() {
            if (!this._isExpanded) return false;
            return this._isPointerInsideNotch() || this._isPointerNearNotch(30);
        }

        _isPointerInsideNotch() {
            const [stageX, stageY] = this._getPointerPosition();
            if (stageX === null || stageY === null) return false;

            try {
                const actor = global.stage?.get_actor_at_pos?.(Clutter.PickMode.REACTIVE, stageX, stageY);
                if (!actor) return false;

                // Check if actor is this notch or any descendant
                if (actor === this) return true;
                if (actor.is_descendant_of?.(this)) return true;

                // Also check if pointer is within expanded bounds (includes button areas)
                return this._isPointerInExpandedArea(stageX, stageY);
            } catch (e) {
                return false;
            }
        }

        _isPointerInExpandedArea(stageX, stageY) {
            try {
                const box = new Clutter.ActorBox();
                this.get_transformed_allocation(box);

                // Check main notch area
                if (stageX >= box.x1 && stageX <= box.x2 && stageY >= box.y1 && stageY <= box.y2) {
                    return true;
                }

                return false;
            } catch (e) {
                return false;
            }
        }

        _isPointerNearNotch(margin = 0) {
            const [stageX, stageY] = this._getPointerPosition();
            if (stageX === null || stageY === null) return false;

            try {
                const box = new Clutter.ActorBox();
                this.get_transformed_allocation(box);
                return (
                    stageX >= box.x1 - margin &&
                    stageX <= box.x2 + margin &&
                    stageY >= box.y1 - margin &&
                    stageY <= box.y2 + margin
                );
            } catch (e) {
                return false;
            }
        }

        _getPointerPosition() {
            try {
                // Try global.get_pointer first (GNOME 40+)
                if (global.get_pointer) {
                    return global.get_pointer();
                }

                // Fallback to display.get_pointer
                if (global.display?.get_pointer) {
                    return global.display.get_pointer();
                }

                // Fallback to device manager (older versions)
                if (global.display?.get_device_manager) {
                    const deviceManager = global.display.get_device_manager();
                    const pointer = deviceManager?.get_core_pointer?.();
                    if (pointer) {
                        const [success, x, y] = global.display.get_device_position(pointer);
                        if (success) return [x, y];
                    }
                }
            } catch (e) {
                log(`[DynamicIsland] Error getting pointer position: ${e.message}`);
            }

            return [null, null];
        }
    }
);

function _reposition() {
    if (!notch) return;

    notch.syncPosition();
}

function enable() {
    notch = new Notch();
    Main.uiGroup.add_child(notch);

    // Add hit-test overlay to block events under expanded notch
    Main.uiGroup.add_child(notch._hitTestOverlay);

    _reposition();

    // Initialize battery display
    batteryPresenter = new BatteryPresenter(notch);
    batteryPresenter.enable();

    // Initialize media display
    mediaPresenter = new MediaPresenter(notch);
    mediaPresenter.enable();

    // Initialize bluetooth display
    bluetoothPresenter = new BluetoothPresenter(notch);
    bluetoothPresenter.enable();

    // Initialize volume display
    volumePresenter = new VolumePresenter(notch);
    volumePresenter.enable();

    monitorsChangedId = Main.layoutManager.connect('monitors-changed', _reposition);
    stageResizeId = global.stage.connect('notify::allocation', _reposition);
}

function disable() {
    if (monitorsChangedId) {
        Main.layoutManager.disconnect(monitorsChangedId);
        monitorsChangedId = null;
    }

    if (stageResizeId) {
        global.stage.disconnect(stageResizeId);
        stageResizeId = null;
    }

    if (mediaPresenter) {
        mediaPresenter.destroy();
        mediaPresenter = null;
    }

    if (batteryPresenter) {
        batteryPresenter.destroy();
        batteryPresenter = null;
    }

    if (bluetoothPresenter) {
        bluetoothPresenter.destroy();
        bluetoothPresenter = null;
    }

    if (volumePresenter) {
        volumePresenter.destroy();
        volumePresenter = null;
    }

    if (notch) {
        // Remove hit-test overlay
        if (notch._hitTestOverlay && notch._hitTestOverlay.get_parent()) {
            Main.uiGroup.remove_child(notch._hitTestOverlay);
        }
        notch._hitTestOverlay?.destroy();
        notch.destroy();
        notch = null;
    }
}

// Battery Presenter Class
class BatteryPresenter {
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
        this._previousPresenterState = null;
        this._previousBatteryState = UPowerGlib.DeviceState.UNKNOWN;
    }

    enable() {
        this._client = new UPowerGlib.Client();
        this._device = this._client.get_display_device();
        this._buildActors();
        this._attachDeviceSignals();
        this._syncBatteryState();
    }

    destroy() {
        if (this._notificationTimeoutId) {
            imports.mainloop.source_remove(this._notificationTimeoutId);
            this._notificationTimeoutId = null;
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
        if (!this._percentageLabel || !this._icon) return;

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
    }

    _getIconName(percentage, state) {
        const clamped = Math.max(0, Math.min(100, Math.round(percentage / 10) * 10));
        const charging = state === UPowerGlib.DeviceState.CHARGING ||
            state === UPowerGlib.DeviceState.PENDING_CHARGE;
        const suffix = charging ? '-charging-symbolic' : '-symbolic';
        return `battery-level-${clamped}${suffix}`;
    }

    _savePreviousState() {
        if (mediaPresenter && mediaPresenter._thumbnailWrapper?.visible) {
            this._previousPresenterState = 'media';
        } else if (bluetoothPresenter && bluetoothPresenter._iconWrapper?.visible) {
            this._previousPresenterState = 'bluetooth';
        } else if (volumePresenter && volumePresenter._iconWrapper?.visible) {
            this._previousPresenterState = 'volume';
        } else {
            this._previousPresenterState = 'battery';
        }
    }

    _restorePreviousState() {
        // Trigger transition animation
        this._notch._animateTransition();

        if (this._previousPresenterState === 'media' && mediaPresenter) {
            mediaPresenter._updateMediaVisibility(true);
        } else if (this._previousPresenterState === 'bluetooth' && bluetoothPresenter) {
            // Bluetooth handles itself
        } else if (this._previousPresenterState === 'volume' && volumePresenter) {
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
        if (mediaPresenter) {
            mediaPresenter._thumbnailWrapper?.hide();
            mediaPresenter._audioIconWrapper?.hide();
            mediaPresenter._expandedArtWrapper?.hide();
            mediaPresenter._controlsBox?.hide();
            mediaPresenter._titleWrapper?.hide();
        }
        if (bluetoothPresenter) {
            bluetoothPresenter._iconWrapper?.hide();
            bluetoothPresenter._expandedIconWrapper?.hide();
            bluetoothPresenter._textWrapper?.hide();
        }
        if (volumePresenter) {
            volumePresenter._iconWrapper?.hide();
            volumePresenter._volumeBarWrapper?.hide();
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

            // Collapse notch
            this._notch._collapse();

            // Wait for collapse animation to finish
            imports.mainloop.timeout_add(ANIMATION_DURATION + 100, () => {
                this._chargingWrapper.hide();

                // Restore previous presenter
                this._restorePreviousState();

                return false;
            });

            return false;
        });
    }
}

// Media Presenter Class
class MediaPresenter {
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
            if (!this._playerProxy) {
                this._watchForMediaPlayers();
            }
            return true;
        });
    }

    destroy() {
        if (this._checkTimeoutId) {
            imports.mainloop.source_remove(this._checkTimeoutId);
            this._checkTimeoutId = null;
        }

        if (this._playerProxy && this._playerProxySignal) {
            this._playerProxy.disconnect(this._playerProxySignal);
            this._playerProxySignal = null;
        }

        if (this._dbusSignalId && this._dbusProxy) {
            this._dbusProxy.disconnectSignal(this._dbusSignalId);
            this._dbusSignalId = null;
        }

        this._httpSession?.abort();

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
        });
        this._expandedArtWrapper.set_child(this._expandedArt);

        // Block only scroll on expanded art to prevent click-through
        // Allow clicks (art has no handler anyway)
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
                const changedProps = changed?.deep_unpack?.() ?? {};
                const metadata = changedProps.Metadata;
                if (metadata) {
                    this._updateMetadata(metadata);
                }
                const playbackStatus = changedProps.PlaybackStatus;
                if (playbackStatus) {
                    this._updatePlaybackStatus(playbackStatus);
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
                    const file = Gio.File.new_for_path(this._artCache.get(artUrl));
                    const gicon = new Gio.FileIcon({ file: file });
                    this._thumbnail.set_gicon(gicon);
                    this._expandedArt?.set_gicon(gicon);
                } else {
                    this._downloadImage(artUrl);
                }
            } else {
                // Try using Gio.icon_new_for_string as in backup.js
                try {
                    const gicon = Gio.icon_new_for_string(artUrl);
                    this._thumbnail.set_gicon(gicon);
                    this._expandedArt?.set_gicon(gicon);
                } catch (e) {
                    // Fallback to manual file handling if icon_new_for_string fails
                    if (artUrl.startsWith('file://')) {
                        const file = Gio.File.new_for_uri(artUrl);
                        const gicon = new Gio.FileIcon({ file: file });
                        this._thumbnail.set_gicon(gicon);
                        this._expandedArt?.set_gicon(gicon);
                    } else {
                        this._thumbnail.icon_name = 'audio-x-generic-symbolic';
                        if (this._expandedArt) this._expandedArt.icon_name = 'audio-x-generic-symbolic';
                    }
                }
            }
        } else {
            this._thumbnail.icon_name = 'audio-x-generic-symbolic';
            if (this._expandedArt) this._expandedArt.icon_name = 'audio-x-generic-symbolic';
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
            this._expandedArt?.set_gicon(gicon);
        } catch (e) {
            log(`[DynamicIsland] Failed to save image: ${e.message}`);
        }
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
            if (batteryPresenter) batteryPresenter.hide();
        } else {
            // Hide Media, Show Battery
            this._thumbnailWrapper.hide();
            this._audioIconWrapper.hide();
            this._expandedArtWrapper?.hide();
            this._controlsBox?.hide();
            this._titleWrapper?.hide();
            if (batteryPresenter) batteryPresenter.show();
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
}

// Bluetooth Presenter Class
class BluetoothPresenter {
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
        this._previousPresenterState = null; // 'battery' or 'media'
    }

    enable() {
        this._buildActors();
        this._connectToBlueZ();
    }

    destroy() {
        if (this._notificationTimeoutId) {
            imports.mainloop.source_remove(this._notificationTimeoutId);
            this._notificationTimeoutId = null;
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
                                            const reply = conn.call_finish(res);
                                            const name = reply.deep_unpack()[0].unpack();
                                            this._showNotification(name, connected);
                                        } catch (e) {
                                            // Fallback to "Unknown Device"
                                            this._showNotification('Unknown Device', connected);
                                        }
                                    }
                                );
                            }
                        }
                    } catch (e) {
                        log(`[DynamicIsland] Error processing BlueZ signal: ${e.message}`);
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

    _savePreviousState() {
        // Determine which presenter is currently visible
        if (mediaPresenter && mediaPresenter._thumbnailWrapper?.visible) {
            this._previousPresenterState = 'media';
        } else {
            this._previousPresenterState = 'battery';
        }
    }

    _restorePreviousState() {
        // Trigger transition animation
        this._notch._animateTransition();

        // Restore the previous presenter
        if (this._previousPresenterState === 'media' && mediaPresenter) {
            mediaPresenter._updateMediaVisibility(true);
        } else if (batteryPresenter) {
            batteryPresenter.show();
        }
        this._previousPresenterState = null;
    }

    _showNotification(deviceName, isConnected = true) {
        // Save current state
        this._savePreviousState();

        // Hide other presenters
        if (batteryPresenter) batteryPresenter.hide();
        if (mediaPresenter) {
            mediaPresenter._thumbnailWrapper?.hide();
            mediaPresenter._audioIconWrapper?.hide();
            mediaPresenter._expandedArtWrapper?.hide();
            mediaPresenter._controlsBox?.hide();
            mediaPresenter._titleWrapper?.hide();
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

            // Collapse notch
            this._notch._collapse();

            // Wait for collapse animation to finish before hiding UI and restoring
            imports.mainloop.timeout_add(ANIMATION_DURATION + 100, () => {
                this._iconWrapper.hide();
                this._expandedIconWrapper.hide();
                this._textWrapper.hide();

                // Restore previous presenter
                this._restorePreviousState();

                return false;
            });

            return false;
        });
    }
}

// Volume Presenter Class
class VolumePresenter {
    constructor(notchInstance) {
        this._notch = notchInstance;
        this._control = null;
        this._stream = null;
        this._volumeChangedId = null;

        this._icon = null;
        this._iconWrapper = null;
        this._volumeBar = null;
        this._volumeBarWrapper = null;
        this._percentageLabel = null;
        this._volumeProgress = 0;

        this._notificationTimeoutId = null;
        this._previousPresenterState = null;
    }

    enable() {
        this._buildActors();
        this._connectToMixer();
    }

    destroy() {
        if (this._notificationTimeoutId) {
            imports.mainloop.source_remove(this._notificationTimeoutId);
            this._notificationTimeoutId = null;
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
            width: 280,
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
            this._control.connect('default-sink-changed', () => {
                if (this._volumeChangedId && this._stream) {
                    this._stream.disconnect(this._volumeChangedId);
                }
                this._stream = this._control.get_default_sink();
                if (this._stream) {
                    this._volumeChangedId = this._stream.connect('notify::volume', () => {
                        this._onVolumeChanged();
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
        this._stream = null;
        this._control = null;
    }

    _onVolumeChanged() {
        if (!this._stream) return;

        const volume = this._stream.volume / this._control.get_vol_max_norm();
        const percentage = Math.round(volume * 100);

        this._volumeProgress = volume;
        this._volumeBar?.queue_repaint();

        this._showNotification(percentage);
    }

    _savePreviousState() {
        if (mediaPresenter && mediaPresenter._thumbnailWrapper?.visible) {
            this._previousPresenterState = 'media';
        } else if (bluetoothPresenter && bluetoothPresenter._iconWrapper?.visible) {
            this._previousPresenterState = 'bluetooth';
        } else {
            this._previousPresenterState = 'battery';
        }
    }

    _restorePreviousState() {
        // Trigger transition animation
        this._notch._animateTransition();

        if (this._previousPresenterState === 'media' && mediaPresenter) {
            mediaPresenter._updateMediaVisibility(true);
        } else if (this._previousPresenterState === 'bluetooth' && bluetoothPresenter) {
            // Bluetooth will handle its own restoration
        } else if (batteryPresenter) {
            batteryPresenter.show();
        }
        this._previousPresenterState = null;
    }

    _showNotification(percentage) {
        // Save current state
        this._savePreviousState();

        // Hide other presenters
        if (batteryPresenter) batteryPresenter.hide();
        if (mediaPresenter) {
            mediaPresenter._thumbnailWrapper?.hide();
            mediaPresenter._audioIconWrapper?.hide();
            mediaPresenter._expandedArtWrapper?.hide();
            mediaPresenter._controlsBox?.hide();
            mediaPresenter._titleWrapper?.hide();
        }
        if (bluetoothPresenter) {
            bluetoothPresenter._iconWrapper?.hide();
            bluetoothPresenter._expandedIconWrapper?.hide();
            bluetoothPresenter._textWrapper?.hide();
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

            // Collapse notch
            this._notch._collapse();

            // Wait for collapse animation to finish
            imports.mainloop.timeout_add(ANIMATION_DURATION + 100, () => {
                this._iconWrapper.hide();
                this._volumeBarWrapper.hide();

                // Restore previous presenter
                this._restorePreviousState();

                return false;
            });

            return false;
        });
    }
}

function init() { }
