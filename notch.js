const { Clutter, GObject, St, GLib } = imports.gi;
const Main = imports.ui.main;

// Import constants
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Constants = Me.imports.constants;

const COMPACT_WIDTH = Constants.COMPACT_WIDTH;
const COMPACT_HEIGHT = Constants.COMPACT_HEIGHT;
const EXPANDED_WIDTH = Constants.EXPANDED_WIDTH;
const EXPANDED_HEIGHT = Constants.EXPANDED_HEIGHT;
const ANIMATION_DURATION = Constants.ANIMATION_DURATION;
const BOX_MARGIN_TOP = Constants.BOX_MARGIN_TOP;

var Notch = GObject.registerClass(
    class Notch extends St.BoxLayout {
        _init() {
            super._init({
                style_class: 'notch',
                vertical: false,
                reactive: true,
                track_hover: true,
                clip_to_allocation: true,
            });

            this._isExpanded = false;
            this._collapseTimeoutId = null;
            this._hoverProgress = 0;
            this._hoverTarget = 0;
            this._hoverAnimationId = null;
            this._destroyed = false;

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

            this.connect('destroy', () => {
                this._destroyed = true;
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
                if (this._destroyed) return false;
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

                try {
                    const { x, y } = this._getTargetCoords(currentWidth);
                    this.set_position(x, y);
                    this.set_size(Math.round(currentWidth), COMPACT_HEIGHT);
                } catch (e) {
                    if (!this._destroyed) {
                        log(`[DynamicIsland] Error in transition animation: ${e.message}`);
                    }
                    return false;
                }

                if (t >= 1) {
                    this._stopHoverAnimation();
                    // Ensure we reset to exact compact dimensions
                    if (!this._destroyed) {
                        this._setInitialGeometry();
                    }
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
                if (this._destroyed) return false;
                const elapsed = GLib.get_monotonic_time() - startTime;
                const t = Math.min(1, elapsed / totalDuration);

                try {
                    this._updatePhaseProgress(t, startProgress, clampedTarget, isExpanding);
                } catch (e) {
                    if (!this._destroyed) {
                        log(`[DynamicIsland] Error in hover animation: ${e.message}`);
                    }
                    return false;
                }

                if (t >= 1) {
                    this._stopHoverAnimation();
                    if (!this._destroyed) {
                        this._setHoverProgress(clampedTarget);
                        this._hoverTarget = clampedTarget;
                        this._isExpanded = clampedTarget === 1;
                    }
                    return false;
                }

                return true;
            });
        }

        _updatePhaseProgress(t, startProgress, clampedTarget, isExpanding) {
            let sizeProgress;
            if (isExpanding) {
                // Expand: use easeOutBack for bouncy effect
                sizeProgress = this._lerp(startProgress, clampedTarget, this._easeOutBack(t));
            } else {
                // Collapse: use easeInOutQuad for smooth closing
                sizeProgress = this._lerp(startProgress, clampedTarget, this._easeInOutQuad(t));
            }

            // We now use a single progress value to drive everything (size, opacity, scale)
            this._setHoverProgress(sizeProgress);
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
                // Scale based on notch expansion progress (clamped) instead of opacity
                // This ensures smooth scaling during both expand and collapse phases
                const expandedScale = this._lerp(0.95, 1, clamped);

                this._expandedLayout.visible = expandedOpacity > 5;
                this._expandedLayout.opacity = expandedOpacity;
                this._expandedLayout.set_scale(expandedScale, expandedScale);
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

            // CROSS-FADE LOGIC
            // 0.0 -> 0.2: Transition phase (Compact fades out, Expanded fades in)
            // 0.2 -> 1.0: Expansion phase (Only Expanded visible, growing)

            const TRANSITION_THRESHOLD = 0.2;

            // Compact Layout: Visible only at start, fades out quickly
            if (this._compactLayout) {
                let compactOpacity = 0;
                if (clamped < TRANSITION_THRESHOLD) {
                    // Map 0.0-0.2 to 1.0-0.0
                    const t = clamped / TRANSITION_THRESHOLD;
                    compactOpacity = 255 * (1 - t);
                }

                this._compactLayout.opacity = Math.round(compactOpacity);
                this._compactLayout.visible = compactOpacity > 0;
                // Slight shrink for compact when disappearing
                const compactScale = this._lerp(1, 0.9, clamped * 5); // fast shrink
                this._compactLayout.set_scale(compactScale, compactScale);
            }

            // Expanded Layout: Appears early, scales from 0.5 to 1.0
            if (this._expandedLayout) {
                let expandedOpacity = 255;
                if (clamped < TRANSITION_THRESHOLD) {
                    // Map 0.0-0.2 to 0.0-1.0
                    const t = clamped / TRANSITION_THRESHOLD;
                    expandedOpacity = 255 * t;
                }

                // Scale from 0.5 (half size) to 1.0 (full size)
                // This gives the "zoom in" effect of the full content
                const expandedScale = this._lerp(0.5, 1.0, clamped);

                this._expandedLayout.visible = expandedOpacity > 0;
                this._expandedLayout.opacity = Math.round(expandedOpacity);
                this._expandedLayout.set_scale(expandedScale, expandedScale);
            }

            // Update hit-test overlay (if any logic remains, though we removed the widget)
            if (clamped >= 0.99) {
                this._isExpanded = true;
            } else if (clamped <= 0.01) {
                this._isExpanded = false;
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
                if (this._destroyed) return false;

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