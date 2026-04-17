const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Shell = imports.gi.Shell;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Visualizer = Me.imports.utils.visualizer;

var UxplayView = class UxplayView {
    constructor() {
        this._buildCompactView();
        this._buildExpandedView();
        this._buildMinimalView();
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

        // ===== VISUALIZER (màu xanh dương) =====
        this._visualizer = new Visualizer.MirroredVisualizer({
            barCount: 6,
            pattern: [4, 6, 8, 6, 4, 2],
            barWidth: 3,
            barSpacing: 3,
            rowHeight: 16,
            maxOffset: 2,
            animationSpeed: 80
        });
        // Set màu xanh dương cho screen mirroring
        this._visualizer.setColor('52, 152, 219'); // #3498db in RGB

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
            icon_name: 'video-display-symbolic',
            icon_size: 64,
            style: 'color: #3498db;'
        });

        this.expandedIconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            visible: true,
            reactive: true,
            clip_to_allocation: true,
        });
        this.expandedIconWrapper.set_child(this.iconExpanded);
        this.expandedIconWrapper.connect('scroll-event', () => Clutter.EVENT_STOP);
        this.expandedIconWrapper.connect('button-press-event', () => {
            this._focusUxplayWindow();
            return Clutter.EVENT_STOP;
        });

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
            this._visualizer.stop();
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
        
        // Start visualizer animation
        this._visualizer.start();
    }

    _focusUxplayWindow() {
        const appSystem = Shell.AppSystem.get_default();
        const runningApps = appSystem.get_running();
        const windowActors = global.get_window_actors();

        const focusWindow = (window) => {
            const ws = window.get_workspace();
            ws.activate_with_focus(window, global.get_current_time());
        };

        const searchTerms = ['uxplay', 'airplay', 'gstreamer'];

        for (let app of runningApps) {
            const appId = app.get_id().toLowerCase();
            const appNameLower = app.get_name().toLowerCase();

            if (searchTerms.some(term => appId.includes(term) || appNameLower.includes(term))) {
                const windows = app.get_windows();

                if (windows.length > 0) {
                    focusWindow(windows[0]);
                    return;
                }
            }
        }

        // Fallback: Tìm qua mảng windows nếu app chưa được GNOME ghi nhận (thường xảy ra với app chạy dưới cmd)
        for (let actor of windowActors) {
            const w = actor.get_meta_window();
            if (!w) continue;

            const wmClass = w.get_wm_class() || '';
            const wmClassLower = wmClass.toLowerCase();
            
            if (searchTerms.some(term => wmClassLower.includes(term))) {
                focusWindow(w);
                return;
            }
        }
    }

    show() {
        this.compactContainer.show();
        this.expandedContainer.show();
    }

    hide() {
        this.compactContainer.hide();
        this.expandedContainer.hide();
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
