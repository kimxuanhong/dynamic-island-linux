import Clutter from 'gi://Clutter';

import {NotchConstants} from './constants.js';

// ============================================
// ANIMATION CONTROLLER - Quản lý animations
// ============================================
export class AnimationController {
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

        const newX = this.controller._calculateNotchX ? 
            this.controller._calculateNotchX(expandedWidth) : 
            Math.floor((monitorWidth - expandedWidth) / 2);
        const newY = this.controller._calculateNotchY ? 
            this.controller._calculateNotchY() : 
            NotchConstants.NOTCH_Y_POSITION;

        notch.ease({
            width: expandedWidth,
            height: expandedHeight,
            opacity: 255,
            x: newX,
            y: newY,
            duration: NotchConstants.ANIMATION_EXPAND_DURATION,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.controller.stateMachine.transitionTo('expanded');
                if (this.controller.presenterRegistry.getCurrent() === 'media' &&
                    !this.controller.cycleManager.has('media'))
                    this.controller.compactNotch(true);
            }
        });
    }

    compact() {
        if (!this.controller.notch) return;

        const notch = this.controller.notch;

        notch.remove_all_transitions();
        notch.add_style_class_name('compact-state');
        notch.remove_style_class_name('expanded-state');

        const geometry = this.calculateCompactGeometry();
        const y = this.controller._calculateNotchY ? 
            this.controller._calculateNotchY() : 
            NotchConstants.NOTCH_Y_POSITION;

        notch.ease({
            width: geometry.width,
            height: this.controller.height,
            scale_x: this.controller.originalScale,
            scale_y: this.controller.originalScale,
            x: geometry.x,
            y: y,
            duration: NotchConstants.ANIMATION_COMPACT_DURATION,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.controller._finishCollapse();
            }
        });
    }

    hide() {
        const c = this.controller;
        if (!c.notch?.visible || c._hiding) return;
        c._hiding = true;
        c._revealing = false;
        c.notch.remove_all_transitions();
        c.secondaryNotch?.remove_all_transitions();
        c.secondaryNotch?.hide();
        c.notch.set_scale(c.originalScale, c.originalScale);
        c.stateMachine.transitionTo('animating');
        // Shrink and fade in the same transition, keeping both ends centered.
        c.notch.ease({
            width: 0,
            x: c._calculateNotchX(0),
            opacity: 0,
            duration: NotchConstants.ANIMATION_HIDE_DURATION,
            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
            onComplete: () => {
                if (c._destroyed || !c._hiding) return;
                c._hiding = false;
                c.notch.hide();
                c.notch.set_opacity(255);
                c.notch.set_width(c.width);
                c.notch.set_position(c._calculateNotchX(c.width), c._calculateNotchY());
                c.stateMachine.transitionTo('compact');
                if (c._expansionQueue.length) c._finishCollapse();
            },
        });
    }

    reveal(from = null) {
        const c = this.controller;
        const start = from ?? (c.notch.visible
            ? {width: c.notch.width, x: c.notch.x, opacity: c.notch.opacity}
            : {width: 0, x: c._calculateNotchX(0), opacity: 0});
        const opacity = start.opacity ?? c.notch.opacity;
        this.cancelHide();
        c.notch.remove_all_transitions();
        c._revealing = true;
        c.notch.remove_style_class_name('expanded-state');
        c.notch.add_style_class_name('compact-state');
        c.notch.set_size(start.width, c.height);
        c.notch.set_position(start.x, c._calculateNotchY());
        c.notch.set_scale(c.originalScale, c.originalScale);
        c.notch.set_opacity(opacity);
        c.notch.show();
        c.stateMachine.transitionTo('animating');
        const target = this.calculateCompactGeometry();
        c.notch.ease({
            width: target.width, x: target.x, opacity: 255,
            duration: NotchConstants.ANIMATION_HIDE_DURATION,
            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
            onComplete: () => {
                if (c._destroyed) return;
                c._revealing = false;
                c.stateMachine.transitionTo('compact');
                if (c._expansionQueue.length) c._finishCollapse();
                else {
                    c.layoutManager.updateLayout();
                    c._resumePendingHover();
                }
            },
        });
    }

    cancelHide() {
        const c = this.controller;
        if (!c._hiding) return;
        c._hiding = false;
        c.notch.remove_all_transitions();
        c.notch.set_opacity(255);
        c.stateMachine.transitionTo('compact');
    }

    squeeze() {
        if (!this.controller.notch) return;

        const notch = this.controller.notch;
        const originalScale = this.controller.originalScale;

        // Transition to animating state for squeeze
        this.controller.stateMachine.transitionTo('animating');
        notch.remove_all_transitions();

        notch.ease({
            scale_x: originalScale * NotchConstants.SQUEEZE_SCALE_X,
            scale_y: originalScale,
            duration: NotchConstants.ANIMATION_SQUEEZE_DURATION,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                notch.ease({
                    scale_x: originalScale,
                    scale_y: originalScale,
                    duration: NotchConstants.ANIMATION_SQUEEZE_RETURN_DURATION,
                    mode: Clutter.AnimationMode.EASE_OUT_BACK,
                    onComplete: () => {
                        if (this.controller._expansionQueue.length)
                            this.controller._finishCollapse();
                        else {
                            this.controller.stateMachine.transitionTo('compact');
                            this.controller._resumePendingHover();
                        }
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
            scale_x: originalScale * NotchConstants.SQUEEZE_SECONDARY_SCALE_X,
            scale_y: originalScale,
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

    calculateCompactGeometry() {
        const isSingle = this.controller.cycleManager.count() <= 1;
        if (!isSingle) {
            const mainWidth = this.controller.width;
            const gap = NotchConstants.SPLIT_GAP;
            const secWidth = NotchConstants.SECONDARY_WIDTH;
            const groupWidth = mainWidth + gap + secWidth;
            const x = this.controller._calculateNotchX ? 
                this.controller._calculateNotchX(groupWidth, mainWidth) :
                Math.floor((this.controller.monitorWidth - groupWidth) / 2);
            return {
                width: mainWidth,
                x: x
            };
        } else {
            const x = this.controller._calculateNotchX ? 
                this.controller._calculateNotchX(this.controller.width) : 
                Math.floor((this.controller.monitorWidth - this.controller.width) / 2);
            return {
                width: this.controller.width,
                x: x
            };
        }
    }
}
