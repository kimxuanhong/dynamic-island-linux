import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

// Shared status-card typography, icon material and spacing.
export function styleStatusCard(view, accent, category) {
    view.expandedContainer.set_style(null);
    view.expandedContainer.add_style_class_name('status-card');
    const tile = view.expandedIconWrapper;
    tile.set_size(64, 64);
    tile.style_class = `glass-icon-tile accent-${accent}`;
    const icon = view.iconExpanded ?? view.expandedIcon;
    icon.icon_size = 32;
    icon.add_style_class_name(`accent-${accent}`);
    view.textWrapper.x_expand = true;
    const textBox = view.textWrapper.get_child();
    textBox.x_expand = true;
    textBox.x_align = Clutter.ActorAlign.FILL;
    textBox.insert_child_at_index(new St.Label({
        text: category.charAt(0) + category.slice(1).toLowerCase(),
        style_class: 'status-eyebrow',
    }), 0);
    const title = view.percentageLabelExpanded ?? view.statusLabel;
    title.set_style(null);
    title.add_style_class_name(view.percentageLabelExpanded ? 'status-value' : 'status-title');
    title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    for (const label of [view.detailsLabel, view.deviceLabel, view.appNameLabel,
        view.timeRemainingLabel, view.percentageLabelExpanded ? view.statusLabel : null]) {
        if (!label) continue;
        label.set_style(null);
        label.add_style_class_name(label === view.timeRemainingLabel ? 'status-caption' : 'status-detail');
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    }
}
