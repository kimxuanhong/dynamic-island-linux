const St = imports.gi.St;
const Clutter = imports.gi.Clutter;

var BatteryView = class BatteryView {
    constructor() {
        this._buildCompactView();
        this._buildExpandedView();
        this._buildMinimalView();
    }

    _buildMinimalView() {
        this.secondaryIcon = new St.Icon({
            icon_name: 'battery-good-symbolic',
            icon_size: 24,
            style_class: 'battery-icon-secondary',
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
            icon_name: 'battery-good-symbolic',
            icon_size: 24,
            x_align: Clutter.ActorAlign.START
        });

        this.iconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            style: 'padding-left: 16px;',
        });
        this.iconWrapper.set_child(this.iconLeft);

        this.percentageLabel = new St.Label({
            text: '0%',
            style: 'color: white; font-size: 14px; font-weight: bold; padding-right: 16px;',
            x_align: Clutter.ActorAlign.END
        });

        this.percentageWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true
        });
        this.percentageWrapper.set_child(this.percentageLabel);

        this.compactContainer = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: true,
        });
        this.compactContainer.add_child(this.iconWrapper);
        this.compactContainer.add_child(this.percentageWrapper);
    }

    _buildExpandedView() {
        this.iconExpanded = new St.Icon({
            icon_name: 'battery-good-symbolic',
            icon_size: 64,
        });

        this.statusLabel = new St.Label({
            text: 'Charging...',
            style: 'color: white; font-size: 18px; font-weight: bold; margin-top: 10px;'
        });

        this.expandedContainer = new St.BoxLayout({
            style_class: 'battery-expanded',
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            visible: false
        });
        this.expandedContainer.add_child(this.iconExpanded);
        this.expandedContainer.add_child(this.statusLabel);
    }

    updateBattery(batteryInfo) {
        const {percentage, isCharging, isPresent} = batteryInfo;
        let iconName;

        if (!isPresent) {
            this.percentageLabel.set_text('AC');
            this.iconLeft.icon_name = 'battery-missing-symbolic';
            this.iconExpanded.icon_name = 'battery-missing-symbolic';
            this.iconLeft.set_style(`color: #ffffff;`);
            this.iconExpanded.set_style(`color: #ffffff;`);
            this.statusLabel.set_text('AC Power');
            return;
        }

        this.percentageLabel.set_text(`${percentage}%`);

        if (isCharging) {
            iconName = 'battery-charging-symbolic';
        } else if (percentage === 100) {
            iconName = 'battery-full-charged-symbolic';
        } else if (percentage >= 90) {
            iconName = 'battery-full-symbolic';
        } else if (percentage >= 60) {
            iconName = 'battery-good-symbolic';
        } else if (percentage >= 30) {
            iconName = 'battery-low-symbolic';
        } else {
            iconName = 'battery-empty-symbolic';
        }

        this.iconLeft.icon_name = iconName;
        this.iconExpanded.icon_name = iconName;
        if (this.secondaryIcon) this.secondaryIcon.icon_name = iconName;

        const color = this._getBatteryColor(percentage);
        const statusClass = this._getBatteryStatusClass(percentage, isCharging);

        this.iconLeft.set_style(`color: ${color};`);
        this.iconExpanded.set_style(`color: ${color};`);
        if (this.secondaryIcon) this.secondaryIcon.set_style(`color: ${color};`);

        this.percentageLabel.style_class = `text-shadow ${statusClass}`;

        if (isCharging) {
            this.statusLabel.set_text(`⚡ Charging - ${percentage}%`);
            this.iconExpanded.style_class = 'icon-glow battery-charging';
        } else {
            this.statusLabel.set_text(`Battery: ${percentage}%`);
            this.iconExpanded.style_class = statusClass;
        }
    }

    _getBatteryColor(percentage) {
        if (percentage > 60) return '#00ff00';
        if (percentage > 30) return '#ffff00';
        return '#ff0000';
    }

    _getBatteryStatusClass(percentage, isCharging) {
        if (isCharging) return 'battery-charging';
        if (percentage <= 20) return 'battery-low';
        if (percentage === 100) return 'battery-full';
        return '';
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