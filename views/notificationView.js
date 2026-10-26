import Clutter from 'gi://Clutter';
import St from 'gi://St';

export class NotificationView {
    constructor() {
        this._buildExpandedView();
    }

    _buildExpandedView() {
        this.compactContainer = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
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
