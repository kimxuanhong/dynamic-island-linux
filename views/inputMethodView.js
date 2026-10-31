import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

export class InputMethodView {
    constructor() {
        this.expandedIcon = new St.Icon({
            icon_name: 'input-keyboard-symbolic',
            icon_size: 32,
            style: 'color: #8ecbff;',
        });
        this.expandedIconWrapper = new St.Bin({
            child: this.expandedIcon,
            width: 64,
            height: 64,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'background-color: rgba(92, 173, 255, 0.12); ' +
                'border: 1px solid rgba(142, 203, 255, 0.2); border-radius: 20px;',
        });
        this.statusLabel = new St.Label({
            text: '',
            style: 'color: white; font-size: 26px; font-weight: 700;',
        });
        this.statusLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this.deviceLabel = new St.Label({
            text: 'Đang sử dụng',
            style: 'color: rgba(255, 255, 255, 0.6); font-size: 13px; margin-top: 4px;',
        });
        const textBox = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        textBox.add_child(this.statusLabel);
        textBox.add_child(this.deviceLabel);
        this.expandedContainer = new St.BoxLayout({
            x_expand: true,
            y_expand: true,
            visible: false,
            style: 'padding: 32px; spacing: 20px;',
        });
        this.expandedContainer.add_child(this.expandedIconWrapper);
        this.expandedContainer.add_child(textBox);
    }

    update(info) {
        this.statusLabel.set_text(info.name);
        this.expandedIcon.icon_name = info.icon || 'input-keyboard-symbolic';
    }

    show() {
        this.expandedContainer.show();
    }

    hide() {
        this.expandedContainer.hide();
    }

    destroy() {
        this.expandedContainer.destroy();
    }
}
