const St = imports.gi.St;
const Clutter = imports.gi.Clutter;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Visualizer = Me.imports.utils.visualizer;

var CameraView = class CameraView {
    constructor() {
        this._buildCompactView();
        this._buildExpandedView();
        this._buildMinimalView();
    }

    _buildMinimalView() {
        this.secondaryIcon = new St.Icon({
            icon_name: 'camera-web-symbolic',
            icon_size: 24,
            style_class: 'battery-icon-secondary',
            style: 'color: #4cd964;',
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
            icon_name: 'camera-web-symbolic',
            icon_size: 24,
            style: 'color: #4cd964;',
            x_align: Clutter.ActorAlign.START
        });

        this.iconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            style: 'padding-left: 16px;',
        });
        this.iconWrapper.set_child(this.iconLeft);

        // ===== VISUALIZER (màu xanh lá) =====
        this._visualizer = new Visualizer.MirroredVisualizer({
            barCount: 6,
            pattern: [4, 6, 8, 6, 4, 2],
            barWidth: 3,
            barSpacing: 3,
            rowHeight: 16,
            maxOffset: 2,
            animationSpeed: 80
        });
        // Set màu xanh lá cho camera
        this._visualizer.setColor('76, 217, 100'); // #4cd964 in RGB

        this._visualizerWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            style: 'padding-right: 16px;',
        });
        this._visualizerWrapper.set_child(this._visualizer.container);

        this.compactContainer = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: true,
            visible: false
        });
        this.compactContainer.add_child(this.iconWrapper);
        this.compactContainer.add_child(this._visualizerWrapper);
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
            this._visualizer.stop();
            this.compactContainer.hide();
            if (this.expandedContainer) {
                this.expandedContainer.hide();
            }
            return;
        }

        this.compactContainer.show();

        if (this.expandedContainer && this.expandedContainer.get_parent()) {
            this.expandedContainer.show();
        }

        this._appName = cameraInfo.appName || 'Camera';
        if (this.statusLabel) this.statusLabel.set_text('Camera');
        if (this.detailsLabel) this.detailsLabel.set_text(this._appName);
        
        // Start visualizer animation
        this._visualizer.start();
    }

    show() {
        this.compactContainer.show();
        if (this.expandedContainer) {
            this.expandedContainer.show();
        }
    }

    hide() {
        this.compactContainer.hide();
        if (this.expandedContainer) {
            this.expandedContainer.hide();
        }
        this._visualizer.stop();
    }

    destroy() {
        this._visualizer.destroy();
        if (this.compactContainer) {
            this.compactContainer.destroy();
        }
        if (this.expandedContainer) {
            this.expandedContainer.destroy();
        }
    }
};
