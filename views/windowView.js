const St = imports.gi.St;
const Clutter = imports.gi.Clutter;

var WindowView = class WindowView {
    constructor() {
        this._buildCompactView();
        this._buildExpandedView();
    }

    _buildCompactView() {
        // Icon app bên trái
        this.appIcon = new St.Icon({
            icon_size: 24,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER
        });

        this.iconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            style: 'padding-left: 16px;',
        });
        this.iconWrapper.set_child(this.appIcon);

        // Label tên app bên phải
        this.appLabel = new St.Label({
            text: '',
            style: 'color: white; font-size: 14px; font-weight: bold; padding-right: 16px;',
            x_align: Clutter.ActorAlign.END
        });

        this.labelWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true
        });
        this.labelWrapper.set_child(this.appLabel);

        this.compactContainer = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: true,
            visible: false
        });
        this.compactContainer.add_child(this.iconWrapper);
        this.compactContainer.add_child(this.labelWrapper);
    }

    _buildExpandedView() {
        // Icon lớn
        this.expandedIcon = new St.Icon({
            icon_size: 64,
        });

        this.expandedIconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.expandedIconWrapper.set_child(this.expandedIcon);

        // Text
        this.statusLabel = new St.Label({
            text: 'App Launched',
            style: 'color: white; font-size: 18px; font-weight: bold;'
        });

        this.appNameLabel = new St.Label({
            text: '',
            style: 'color: rgba(255,255,255,0.8); font-size: 14px; margin-top: 5px;'
        });

        const textBox = new St.BoxLayout({
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.START,
        });
        textBox.add_child(this.statusLabel);
        textBox.add_child(this.appNameLabel);

        this.textWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
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

    updateWindow(windowInfo) {
        const {appName, appIcon} = windowInfo;

        // Update compact view
        this.appLabel.set_text(appName);
        if (appIcon) {
            this.appIcon.set_gicon(appIcon);
        }

        // Update expanded view
        this.appNameLabel.set_text(appName);
        if (appIcon) {
            this.expandedIcon.set_gicon(appIcon);
        }
    }

    show() {
        this.compactContainer.show();
        this.expandedContainer.show();
    }

    hide() {
        this.compactContainer.hide();
        this.expandedContainer.hide();
    }

    destroy() {
        if (this.compactContainer) {
            this.compactContainer.destroy();
        }
        if (this.expandedContainer) {
            this.expandedContainer.destroy();
        }
    }
}