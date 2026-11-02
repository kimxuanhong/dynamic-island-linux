import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';
import {IslandIcon} from '../utils/islandIcon.js';
import {styleStatusCard} from '../utils/viewStyle.js';

export class EventView {
    constructor(category = 'Network') {
        this.expandedIcon = new IslandIcon({icon_size: 32});
        this.expandedIconWrapper = new St.Bin({child: this.expandedIcon,
            y_align: Clutter.ActorAlign.CENTER});
        this.statusLabel = new St.Label();
        this.detailsLabel = new St.Label();
        this.detailsLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        const text = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.CENTER, x_expand: true});
        text.add_child(this.statusLabel);
        text.add_child(this.detailsLabel);
        this.textWrapper = new St.Bin({child: text});
        this.expandedContainer = new St.BoxLayout({visible: false, x_expand: true, y_expand: true});
        this.expandedContainer.add_child(this.expandedIconWrapper);
        this.expandedContainer.add_child(this.textWrapper);
        styleStatusCard(this, 'blue', category);
    }

    update({title, detail, icon, gicon}) {
        this.statusLabel.text = title;
        this.detailsLabel.text = detail ?? '';
        this.expandedIcon.gicon = null;
        this.expandedIcon.icon_name = icon;
        if (gicon) this.expandedIcon.gicon = gicon;
    }
    show() { this.expandedContainer.show(); }
    hide() { this.expandedContainer.hide(); }
    destroy() { this.expandedContainer.destroy(); }
}
