const St = imports.gi.St;
const Clutter = imports.gi.Clutter;

var CameraView = class CameraView {
    constructor() {
        this._buildExpandedView();
    }

    _buildExpandedView() {
        this.iconExpanded = new St.Icon({
            icon_name: 'camera-web-symbolic',
            icon_size: 64,
            style: 'color: #4cd964;'
        });

        this.expandedIconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.expandedIconWrapper.set_child(this.iconExpanded);

        this.statusLabel = new St.Label({
            text: 'Camera',
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

    updateCamera(cameraInfo) {

        if (!cameraInfo || !cameraInfo.isCameraInUse) {

            if (this.expandedContainer) {
                this.expandedContainer.hide();
            }
            return;
        }



        if (this.expandedContainer) {
            this.expandedContainer.visible = true;

        }

        this._appName = cameraInfo.appName || 'Camera';
        if (this.statusLabel) this.statusLabel.set_text('Camera');
        if (this.detailsLabel) this.detailsLabel.set_text(this._appName);
    }

    show() {
        // Only expanded container exists
        if (this.expandedContainer) {
            this.expandedContainer.show();
        }
    }

    hide() {
        if (this.expandedContainer) {
            this.expandedContainer.hide();
        }
    }

    destroy() {
        if (this.expandedContainer) {
            this.expandedContainer.destroy();
        }
    }
};
