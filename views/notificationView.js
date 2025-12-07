const St = imports.gi.St;

var NotificationView = class NotificationView {
    constructor() {
        this._buildExpandedView();
    }

    _buildExpandedView() {
        this.compactContainer = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: true,
            visible: false
        });
    }

    show() {
        this.compactContainer.show();
    }

    hide() {
        this.compactContainer.hide();
    }

    destroy() {
        if (this.compactContainer) {
            this.compactContainer.destroy();
        }
    }
}

// ============================================
// 2F. VIEW - Xử lý Giao diện Window Launch (WindowView)
// ============================================