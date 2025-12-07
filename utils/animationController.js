const Clutter = imports.gi.Clutter;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const NotchConstants = Me.imports.utils.constants.NotchConstants;

// ============================================
// ANIMATION CONTROLLER - Quản lý animations
// ============================================
var AnimationController = class AnimationController {
    constructor(controller) {
        this.controller = controller;
    }

    expand() {
        if (!this.controller.notch) return;

        const notch = this.controller.notch;
        const monitorWidth = this.controller.monitorWidth;
        const expandedWidth = this.controller.expandedWidth;
        const expandedHeight = this.controller.expandedHeight;

        notch.remove_all_transitions();
        notch.add_style_class_name('expanded-state');
        notch.remove_style_class_name('compact-state');

        const newX = Math.floor((monitorWidth - expandedWidth) / 2);

        notch.ease({
            width: expandedWidth,
            height: expandedHeight,
            x: newX,
            duration: NotchConstants.ANIMATION_EXPAND_DURATION,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.controller.stateMachine.transitionTo('expanded');
            }
        });
    }

    compact() {
        if (!this.controller.notch) return;

        const notch = this.controller.notch;
        const layoutManager = this.controller.layoutManager;
        const hasMedia = this.controller.hasMedia;

        notch.remove_all_transitions();
        notch.add_style_class_name('compact-state');
        notch.remove_style_class_name('expanded-state');

        const geometry = layoutManager.calculateCompactGeometry(hasMedia);

        notch.ease({
            width: geometry.width,
            height: this.controller.height,
            x: geometry.x,
            duration: NotchConstants.ANIMATION_COMPACT_DURATION,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.controller.layoutManager.updateLayout();
                this.squeeze();
            }
        });
    }

    squeeze() {
        if (!this.controller.notch) return;

        const notch = this.controller.notch;
        const originalScale = this.controller.originalScale;

        // Transition to animating state for squeeze
        this.controller.stateMachine.transitionTo('animating');
        notch.remove_all_transitions();

        notch.ease({
            scale_x: NotchConstants.SQUEEZE_SCALE_X,
            scale_y: NotchConstants.ORIGINAL_SCALE,
            duration: NotchConstants.ANIMATION_SQUEEZE_DURATION,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                notch.ease({
                    scale_x: originalScale,
                    scale_y: originalScale,
                    duration: NotchConstants.ANIMATION_SQUEEZE_RETURN_DURATION,
                    mode: Clutter.AnimationMode.EASE_OUT_BACK,
                    onComplete: () => {
                        this.controller.stateMachine.transitionTo('compact');
                    }
                });
            }
        });

        this.squeezeSecondary();
    }

    squeezeSecondary() {
        const secondaryNotch = this.controller.secondaryNotch;
        if (!secondaryNotch) return;

        const originalScale = this.controller.originalScale;

        secondaryNotch.remove_all_transitions();

        secondaryNotch.ease({
            scale_x: NotchConstants.SQUEEZE_SECONDARY_SCALE_X,
            scale_y: NotchConstants.ORIGINAL_SCALE,
            duration: NotchConstants.ANIMATION_SQUEEZE_DURATION,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                secondaryNotch.ease({
                    scale_x: originalScale,
                    scale_y: originalScale,
                    duration: NotchConstants.ANIMATION_SQUEEZE_RETURN_DURATION,
                    mode: Clutter.AnimationMode.EASE_OUT_BACK
                });
            }
        });
    }
}

