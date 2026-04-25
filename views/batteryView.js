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
        // Icon lớn bên trái - xoay 90 độ để đứng thẳng
        this.iconExpanded = new St.Icon({
            icon_name: 'battery-good-symbolic',
            icon_size: 64,
        });
        
        // Set pivot point ở giữa icon để xoay đúng tâm
        this.iconExpanded.set_pivot_point(0.5, 0.5);
        // Xoay icon bằng Clutter rotation
        this.iconExpanded.set_rotation_angle(Clutter.RotateAxis.Z_AXIS, -90);

        this.expandedIconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            width: 64,
            height: 64,
        });
        this.expandedIconWrapper.set_child(this.iconExpanded);

        // Text bên phải
        this.percentageLabelExpanded = new St.Label({
            text: '0%',
            style: 'color: white; font-size: 24px; font-weight: bold;'
        });

        this.statusLabel = new St.Label({
            text: 'Battery',
            style: 'color: rgba(255, 255, 255, 0.8); font-size: 14px; margin-top: 5px;'
        });

        this.timeRemainingLabel = new St.Label({
            text: '',
            style: 'color: rgba(255, 255, 255, 0.7); font-size: 13px; margin-top: 3px;'
        });

        const textBox = new St.BoxLayout({
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.START,
        });
        textBox.add_child(this.percentageLabelExpanded);
        textBox.add_child(this.statusLabel);
        textBox.add_child(this.timeRemainingLabel);

        this.textWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.textWrapper.set_child(textBox);

        // Container chính theo layout bluetooth
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

    updateBattery(batteryInfo) {
        if (!batteryInfo) return;
        
        const {percentage, isCharging, isPresent, timeToEmpty, timeToFull} = batteryInfo;
        let iconName;

        if (!isPresent) {
            this.percentageLabel.set_text('AC');
            this.iconLeft.icon_name = 'battery-missing-symbolic';
            this.iconExpanded.icon_name = 'battery-missing-symbolic';
            this.iconLeft.set_style(`color: #ffffff;`);
            this.iconExpanded.set_style(`color: #ffffff;`);
            this.percentageLabelExpanded.set_text('AC Power');
            this.statusLabel.set_text('No Battery');
            this.timeRemainingLabel.set_text('');
            return;
        }

        // Update compact view
        this.percentageLabel.set_text(`${percentage}%`);
        
        // Update expanded view - percentage
        this.percentageLabelExpanded.set_text(`${percentage}%`);

        // Determine icon
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

        // Update expanded view - status and time
        if (isCharging) {
            this.statusLabel.set_text('⚡ Charging');
            this.statusLabel.set_style('color: rgba(100, 255, 100, 0.9); font-size: 14px; margin-top: 5px;');
            
            if (timeToFull > 0) {
                const timeStr = this._formatTime(timeToFull);
                this.timeRemainingLabel.set_text(`${timeStr} until full`);
                this.timeRemainingLabel.show();
            } else {
                this.timeRemainingLabel.hide();
            }
            
            this.iconExpanded.style_class = 'icon-glow battery-charging';
        } else {
            if (percentage === 100) {
                this.statusLabel.set_text('Fully Charged');
                this.statusLabel.set_style('color: rgba(100, 255, 100, 0.9); font-size: 14px; margin-top: 5px;');
            } else {
                this.statusLabel.set_text('On Battery');
                this.statusLabel.set_style('color: rgba(255, 255, 255, 0.8); font-size: 14px; margin-top: 5px;');
            }
            
            if (timeToEmpty > 0) {
                const timeStr = this._formatTime(timeToEmpty);
                this.timeRemainingLabel.set_text(`${timeStr} remaining`);
                this.timeRemainingLabel.show();
            } else {
                this.timeRemainingLabel.hide();
            }
            
            this.iconExpanded.style_class = statusClass;
        }
    }

    _formatTime(seconds) {
        if (seconds <= 0) return '';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (hours > 0) {
            if (minutes > 0) {
                return `${hours}h ${minutes}m`;
            }
            return `${hours}h`;
        }
        return `${minutes}m`;
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