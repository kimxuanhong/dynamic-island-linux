const St = imports.gi.St;
const Clutter = imports.gi.Clutter;

var UxplayView = class UxplayView {
    constructor() {
        this._buildCompactView();
        this._buildExpandedView();
        this._buildMinimalView();
        this._blinkTimerId = null;
        this._isBlinking = false;
    }

    _buildMinimalView() {
        this.secondaryIcon = new St.Icon({
            icon_name: 'video-display-symbolic', // Icon cast/màn hình
            icon_size: 24,
            style_class: 'battery-icon-secondary',
            style: 'color: #3498db;', // Màu xanh dương cho sharing
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });

        this.secondaryContainer = new St.Bin({
            child: this.secondaryIcon,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'battery-minimal-container'
        });
    }

    _buildCompactView() {
        this.iconLeft = new St.Icon({
            icon_name: 'video-display-symbolic',
            icon_size: 24,
            style: 'color: #3498db;',
            x_align: Clutter.ActorAlign.START
        });

        this.iconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            style: 'padding-left: 16px;',
        });
        this.iconWrapper.set_child(this.iconLeft);

        // Chấm xanh dương chớp tắt
        this.sharingDot = new St.Bin({
            width: 8,
            height: 8,
            style: 'background-color: #3498db; border-radius: 4px;',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });
        this.sharingDot.set_opacity(255);

        this.dotWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            style: 'padding-right: 16px;'
        });
        this.dotWrapper.set_child(this.sharingDot);

        this.compactContainer = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: true,
            visible: false
        });
        this.compactContainer.add_child(this.iconWrapper);
        this.compactContainer.add_child(this.dotWrapper);
    }

    _buildExpandedView() {
        this.iconExpanded = new St.Icon({
            icon_name: 'video-display-symbolic',
            icon_size: 64,
            style: 'color: #3498db;'
        });

        this.expandedIconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.expandedIconWrapper.set_child(this.iconExpanded);

        this.statusLabel = new St.Label({
            text: 'Screen Mirroring',
            style: 'color: white; font-size: 18px; font-weight: bold;'
        });

        this.detailsLabel = new St.Label({
            text: '',
            style: 'color: rgba(255,255,255,0.8); font-size: 14px; margin-top: 5px;'
        });

        const textBox = new St.BoxLayout({
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.START,
        });
        textBox.add_child(this.statusLabel);
        textBox.add_child(this.detailsLabel);

        this.textWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true
        });
        this.textWrapper.set_child(textBox);

        this.expandedContainer = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: true,
            style: 'spacing: 20px; padding: 20px;',
            visible: false
        });
        this.expandedContainer.add_child(this.expandedIconWrapper);
        this.expandedContainer.add_child(this.textWrapper);
    }

    updateUxplay(sharingInfo) {
        if (!sharingInfo || !sharingInfo.isSharing) {
            this._stopBlinking();
            this.compactContainer.hide();
            this.expandedContainer.hide();
            return;
        }

        this.compactContainer.show();

        if (this.expandedContainer && this.expandedContainer.get_parent()) {
            this.expandedContainer.show();
        }

        this._appName = sharingInfo.appName || 'Uxplay';
        if (this.statusLabel) this.statusLabel.set_text('Screen Mirroring');
        if (this.detailsLabel) this.detailsLabel.set_text(this._appName);
        
        if (this.sharingDot) {
            this.sharingDot.show();
            this._startBlinking();
        }
    }

    _startBlinking() {
        this._stopBlinking();
        this._isBlinking = true;
        this._blinkState = true;

        const blink = () => {
            if (!this._isBlinking || !this.sharingDot) return false;

            if (this._blinkState) {
                this.sharingDot.set_opacity(76);
                this._blinkState = false;
            } else {
                this.sharingDot.set_opacity(255);
                this._blinkState = true;
            }

            return true;
        };

        blink();
        this._blinkTimerId = imports.mainloop.timeout_add(1000, blink); // Nhấp nháy chậm hơn recording một chút
    }

    _stopBlinking() {
        this._isBlinking = false;
        if (this._blinkTimerId !== null) {
            imports.mainloop.source_remove(this._blinkTimerId);
            this._blinkTimerId = null;
        }
        if (this.sharingDot) {
            this.sharingDot.set_opacity(255);
        }
    }

    show() {
        this.compactContainer.show();
        this.expandedContainer.show();
    }

    hide() {
        this.compactContainer.hide();
        this.expandedContainer.hide();
        this._stopBlinking();
    }

    destroy() {
        this._stopBlinking();
        if (this.compactContainer) {
            this.compactContainer.destroy();
        }
        if (this.expandedContainer) {
            this.expandedContainer.destroy();
        }
    }
};
