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
        if (!this.controller.notch) return; // Notch chưa được tạo

        const state = this.controller.stateMachine.getState();
        const presenter = this.controller.presenterRegistry.getCurrent();
        const hasMedia = this.controller.hasMedia;
        const isSwapped = this.controller.isSwapped;

        if (state === 'expanded') {
            this._updateExpandedLayout(presenter);
        } else {
            this._updateCompactLayout(presenter, hasMedia, isSwapped);
        }
    }

    _updateExpandedLayout(presenter) {
        if (!this.controller.notch) return;

        if (this.controller.secondaryNotch) {
            this.controller.secondaryNotch.hide();
        }
        this.controller.notch.set_width(this.controller.expandedWidth);
    }

    _updateCompactLayout(presenter, hasMedia, isSwapped) {
        if (hasMedia) {
            this._updateSplitModeLayout(isSwapped);
        } else {
            this._updateDefaultLayout(presenter);
        }
    }

    _updateSplitModeLayout(isSwapped) {
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
        this._updateSplitModeContent(isSwapped);
    }

    _updateSplitModeContent(isSwapped) {
        if (!this.controller.notch) return;

        this.controller.notch.remove_all_children();
        if (this.controller.secondaryNotch) {
            this.controller.secondaryNotch.remove_all_children();
        }

        const presenter = this.controller.presenterRegistry.getCurrent();
        const batteryPresenter = this.controller.presenterRegistry.getPresenter('battery');
        const mediaPresenter = this.controller.presenterRegistry.getPresenter('media');
        const notificationPresenter = this.controller.presenterRegistry.getPresenter('notification');

        let mainContent, secContent;

        if (presenter === 'notification' || presenter === 'window') {
            mainContent = notificationPresenter?.getCompactContainer();
            if (isSwapped) {
                secContent = mediaPresenter?.getSecondaryContainer();
            } else {
                secContent = batteryPresenter?.getSecondaryContainer();
            }
        } else {
            if (isSwapped) {
                mainContent = batteryPresenter?.getCompactContainer();
                secContent = mediaPresenter?.getSecondaryContainer();
            } else {
                mainContent = mediaPresenter?.getCompactContainer();
                secContent = batteryPresenter?.getSecondaryContainer();
            }
        }

        if (mainContent) {
            this.controller.notch.add_child(mainContent);
            mainContent.show();
            mainContent.remove_style_class_name('in-secondary');
        }

        if (secContent && this.controller.secondaryNotch) {
            this.controller.secondaryNotch.add_child(secContent);
            secContent.show();
            secContent.add_style_class_name('in-secondary');
        }
    }

    _updateDefaultLayout(presenter) {
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

        const presenterObj = this.controller.presenterRegistry.getPresenter(presenter);
        const mainContent = presenterObj?.getCompactContainer();

        if (mainContent) {
            this.controller.notch.add_child(mainContent);
            mainContent.show();
            mainContent.remove_style_class_name('in-secondary');
        }

        // Clean up style classes
        this.controller.batteryView.compactContainer.remove_style_class_name('in-secondary');
        this.controller.mediaView.compactContainer.remove_style_class_name('in-secondary');
    }

    calculateCompactGeometry(hasMedia) {
        if (hasMedia) {
            const mainWidth = NotchConstants.SPLIT_MAIN_WIDTH;
            const gap = NotchConstants.SPLIT_GAP;
            const secWidth = NotchConstants.SPLIT_SECONDARY_WIDTH;
            const groupWidth = mainWidth + gap + secWidth;
            return {
                width: mainWidth,
                x: Math.floor((this.controller.monitorWidth - groupWidth) / 2)
            };
        } else {
            return {
                width: this.controller.width,
                x: Math.floor((this.controller.monitorWidth - this.controller.width) / 2)
            };
        }
    }
}

