const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const NotchConstants = Me.imports.utils.constants.NotchConstants;

// ============================================
// LAYOUT MANAGER - Quản lý layout logic
// ============================================
var LayoutManager = class LayoutManager {
    constructor(controller) {
        this.controller = controller;
    }

    updateLayout() {
        if (!this.controller.notch) return;
        const state = this.controller.stateMachine.getState();
        if (state === 'expanded') {
            this._updateExpandedLayout();
        } else {
            this._updateCompactLayout();
        }
    }

    _updateExpandedLayout() {
        if (!this.controller.notch) return;

        if (this.controller.secondaryNotch) {
            this.controller.secondaryNotch.hide();
        }
        this.controller.notch.set_width(this.controller.expandedWidth);
    }

    _updateCompactLayout() {
        const isSingle = this.controller.cycleManager.count() <= 1;
        if (!isSingle) {
            this._updateSplitModeLayout();
        } else {
            this._updateDefaultLayout();
        }
    }

    _updateSplitModeLayout() {
        if (!this.controller.notch) return;

        // Show secondary notch
        if (this.controller.secondaryNotch) {
            this.controller.secondaryNotch.show();
            this.controller.secondaryNotch.set_opacity(255);
        }

        // Calculate positions using constants
        const mainWidth = NotchConstants.SPLIT_MAIN_WIDTH;
        const gap = NotchConstants.SPLIT_GAP;
        const secWidth = NotchConstants.SPLIT_SECONDARY_WIDTH;
        const groupWidth = mainWidth + gap + secWidth;
        const startX = Math.floor((this.controller.monitorWidth - groupWidth) / 2);

        this.controller.notch.set_width(mainWidth);
        this.controller.notch.set_position(startX, NotchConstants.NOTCH_Y_POSITION);
        if (this.controller.secondaryNotch) {
            this.controller.secondaryNotch.set_position(startX + mainWidth + gap, NotchConstants.NOTCH_Y_POSITION);
        }

        // Update content
        this._updateSplitModeContent();
    }

    _updateSplitModeContent() {
        if (!this.controller.notch) return;

        this.controller.notch.remove_all_children();
        if (this.controller.secondaryNotch) {
            this.controller.secondaryNotch.remove_all_children();
        }

        // Get current presenter's compact container for main notch
        const currentPresenterName = this.controller.cycleManager.current();
        const currentPresenter = this.controller.presenterRegistry.getPresenter(currentPresenterName);
        const mainContent = currentPresenter?.getCompactContainer?.();

        // Get next presenter's SECONDARY container for secondary notch
        const nextPresenterName = this.controller.cycleManager.getNext();
        const nextPresenter = this.controller.presenterRegistry.getPresenter(nextPresenterName);
        const secContent = nextPresenter?.getSecondaryContainer?.();

        if (mainContent) {
            const oldParent = mainContent.get_parent();
            if (oldParent) oldParent.remove_child(mainContent);

            this.controller.notch.add_child(mainContent);
            mainContent.show();
            mainContent.remove_style_class_name('in-secondary');
        }

        if (secContent && this.controller.secondaryNotch) {
            const oldParent = secContent.get_parent();
            if (oldParent) oldParent.remove_child(secContent);

            this.controller.secondaryNotch.add_child(secContent);
            secContent.show();
            secContent.add_style_class_name('in-secondary');
        }
    }

    _updateDefaultLayout() {
        if (!this.controller.notch) return;

        // Hide secondary notch
        if (this.controller.secondaryNotch) {
            this.controller.secondaryNotch.hide();
            this.controller.secondaryNotch.set_opacity(0);
        }

        // Set position
        this.controller.notch.set_width(this.controller.width);
        const startX = Math.floor((this.controller.monitorWidth - this.controller.width) / 2);
        this.controller.notch.set_position(startX, NotchConstants.NOTCH_Y_POSITION);

        // Update content
        this.controller.notch.remove_all_children();

        const currentPresenterName = this.controller.cycleManager.current();
        const currentPresenter = this.controller.presenterRegistry.getPresenter(currentPresenterName);
        const mainContent = currentPresenter?.getCompactContainer?.();
        if (mainContent) {
            const oldParent = mainContent.get_parent();
            if (oldParent) oldParent.remove_child(mainContent);

            this.controller.notch.add_child(mainContent);
            mainContent.show();
            mainContent.remove_style_class_name('in-secondary');
        }

        // Clean up style classes
        this.controller.batteryView.compactContainer.remove_style_class_name('in-secondary');
        this.controller.mediaView.compactContainer.remove_style_class_name('in-secondary');
    }
}

