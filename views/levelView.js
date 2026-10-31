import {IslandIcon} from '../utils/islandIcon.js';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {connectSlider} from '../utils/input.js';

// Sound and brightness share a stable header / slider / footer layout.
export class LevelView {
    constructor({title, subtitle, icon, accent, footer, clickable = false}) {
        this._level = 0;
        this.isDragging = false;
        this.expandedIcon = new IslandIcon({icon_name: icon, icon_size: 25});
        const tileProps = {
            style_class: `glass-icon-tile level-icon-button accent-${accent}`,
            width: 52, height: 52, child: this.expandedIcon,
            y_align: Clutter.ActorAlign.CENTER,
        };
        this.expandedIconWrapper = clickable
            ? new St.Button({...tileProps, can_focus: true, accessible_name: 'Toggle mute'})
            : new St.Bin(tileProps);
        if (clickable)
            this.expandedIconWrapper.connect('clicked', () => this._onIconClick());
        const labels = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true, y_align: Clutter.ActorAlign.CENTER,
        });
        labels.add_child(new St.Label({text: title, style_class: 'level-title'}));
        this.subtitleLabel = new St.Label({text: subtitle, style_class: 'level-subtitle'});
        labels.add_child(this.subtitleLabel);
        this.valueLabel = new St.Label({
            text: '0%', style_class: `level-value accent-${accent}`,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const header = new St.BoxLayout({style_class: 'level-header', x_expand: true});
        header.add_child(this.expandedIconWrapper);
        header.add_child(labels);
        header.add_child(this.valueLabel);
        this.expandedProgressBarBg = new St.Widget({
            style_class: 'level-track', x_expand: true,
            reactive: true, track_hover: true, accessible_name: title,
        });
        this.expandedProgressBarFill = new St.Widget({
            style_class: `level-fill accent-${accent}`, width: 0,
        });
        this.expandedProgressBarBg.add_child(this.expandedProgressBarFill);
        this._widthId = this.expandedProgressBarBg.connect('notify::allocation', () => this._syncFill());
        this._disconnectSlider = connectSlider(this.expandedProgressBarBg, x => {
            const width = this.expandedProgressBarBg.get_allocation_box().get_width();
            if (width > 0)
                this._onLevelChanged(Math.max(0, Math.min(100, x / width * 100)));
        }, () => {
            this.isDragging = true;
            this.onInteractionBegin?.();
        }, () => {
            this.isDragging = false;
            this.onInteractionEnd?.();
        });
        const sliderSection = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL, x_expand: true,
        });
        sliderSection.add_child(this.expandedProgressBarBg);
        const scale = new St.BoxLayout({style_class: 'level-scale'});
        scale.add_child(new St.Label({text: '0', x_expand: true}));
        scale.add_child(new St.Label({text: '100%'}));
        sliderSection.add_child(scale);
        this.expandedContainer = new St.BoxLayout({
            style_class: 'level-card', orientation: Clutter.Orientation.VERTICAL,
            x_expand: true, y_expand: true, visible: false,
        });
        this.expandedContainer.add_child(header);
        this.expandedContainer.add_child(sliderSection);
        this.expandedContainer.add_child(new St.Label({text: footer, style_class: 'level-footer'}));
    }

    setLevel(value) {
        this._level = Math.max(0, Math.min(100, value));
        this.valueLabel.text = `${Math.round(this._level)}%`;
        this._syncFill();
    }

    _syncFill() {
        // Wait for allocation; an unparented St widget has no theme node yet.
        if (!this.expandedProgressBarBg.get_stage()) return;
        const width = this.expandedProgressBarBg.get_allocation_box().get_width();
        this.expandedProgressBarFill.set_width(Math.round(width * this._level / 100));
    }

    show() { this.expandedContainer.show(); }
    hide() { this.expandedContainer.hide(); }

    destroy() {
        this._disconnectSlider();
        this.expandedProgressBarBg.disconnect(this._widthId);
        this.expandedContainer.destroy();
    }
}
