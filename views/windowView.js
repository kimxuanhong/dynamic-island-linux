import {IslandIcon} from '../utils/islandIcon.js';
import Clutter from 'gi://Clutter';
import St from 'gi://St';

export class WindowView {
    constructor() {
        this._buildCompactView();
    }

    _buildCompactView() {
        // Icon app bên trái
        this.appIcon = new IslandIcon({
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
            orientation: Clutter.Orientation.HORIZONTAL,
            x_expand: true,
            y_expand: true,
            visible: false
        });
        this.compactContainer.add_child(this.iconWrapper);
        this.compactContainer.add_child(this.labelWrapper);
    }

    updateWindow(windowInfo) {
        const {appName, appIcon} = windowInfo;
        this.appLabel.set_text(appName);
        if (appIcon)
            this.appIcon.set_gicon(appIcon);
    }

    show() {
        this.compactContainer.show();
    }

    hide() {
        this.compactContainer.hide();
    }

    destroy() {
        if (this.compactContainer)
            this.compactContainer.destroy();
    }
}
