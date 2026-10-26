import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {connectMotion, connectSlider} from '../utils/input.js';

export class BrightnessView {
    constructor(brightnessManager) {
        this._brightnessManager = brightnessManager;
        this._inputDisconnectors = [];
        this._buildExpandedView();
    }

    _buildExpandedView() {
        // Icon lớn ở giữa
        this.expandedIcon = new St.Icon({
            icon_name: 'display-brightness-symbolic',
            icon_size: 64,
            style: 'color: white;'
        });

        this.expandedIconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.expandedIconWrapper.set_child(this.expandedIcon);

        // Brightness percentage label
        this.brightnessLabel = new St.Label({
            text: '0%',
            style: 'color: white; font-size: 18px; font-weight: bold; margin-top: 10px;'
        });

        // Progress bar lớn hơn - THÊM reactive và track_hover
        this.expandedProgressBarBg = new St.Widget({
            style_class: 'brightness-progress-bg-expanded',
            style: 'background-color: rgba(255,255,255,0.2); border-radius: 8px; height: 12px; width: 300px;',
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            track_hover: true
        });

        this.expandedProgressBarFill = new St.Widget({
            style_class: 'brightness-progress-fill-expanded',
            style: 'background-color: white; border-radius: 8px; height: 12px;',
            y_align: Clutter.ActorAlign.CENTER
        });

        this.expandedProgressBarBg.add_child(this.expandedProgressBarFill);

        // Thêm sự kiện tương tác
        this._connectProgressBarEvents();

        this.expandedProgressWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'margin-top: 15px;'
        });
        this.expandedProgressWrapper.set_child(this.expandedProgressBarBg);

        // Container expanded
        this.expandedContainer = new St.BoxLayout({
            style_class: 'brightness-expanded',
            orientation: Clutter.Orientation.VERTICAL,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            visible: false
        });
        this.expandedContainer.add_child(this.expandedIconWrapper);
        this.expandedContainer.add_child(this.brightnessLabel);
        this.expandedContainer.add_child(this.expandedProgressWrapper);
    }

    _connectProgressBarEvents() {
        const bar = this.expandedProgressBarBg;
        this._inputDisconnectors = [
            connectSlider(bar, x => this._handleProgressBarClick(bar, x)),
            connectMotion(bar, 'enter', () => {
                bar.style = 'background-color: rgba(255,255,255,0.3); border-radius: 8px; height: 12px; width: 300px;';
            }),
            connectMotion(bar, 'leave', () => {
                bar.style = 'background-color: rgba(255,255,255,0.2); border-radius: 8px; height: 12px; width: 300px;';
            }),
        ];
    }

    _handleProgressBarClick(actor, relativeX) {
        const actorWidth = actor.get_width();
        if (actorWidth <= 0) return;

        // Tính toán brightness dựa trên vị trí click
        const percentage = Math.max(0, Math.min(100, (relativeX / actorWidth) * 100));

        // Set brightness qua manager
        if (this._brightnessManager.setBrightness(percentage)) {
            // Cập nhật UI ngay lập tức
            this.updateBrightness({
                brightness: Math.round(percentage)
            });
        }
    }

    updateBrightness(brightnessInfo) {
        const {brightness} = brightnessInfo;

        // Cập nhật icon dựa trên brightness level
        let iconName;
        if (brightness === 0) {
            iconName = 'display-brightness-off-symbolic';
        } else if (brightness < 33) {
            iconName = 'display-brightness-low-symbolic';
        } else if (brightness < 66) {
            iconName = 'display-brightness-medium-symbolic';
        } else {
            iconName = 'display-brightness-symbolic';
        }
        this.expandedIcon.icon_name = iconName;

        // Cập nhật progress bar expanded (300px width)
        const expandedBarWidth = Math.round(300 * brightness / 100);
        this.expandedProgressBarFill.set_width(expandedBarWidth);

        // Cập nhật label
        this.brightnessLabel.set_text(`${brightness}%`);
    }

    show() {
        this.expandedContainer.show();
    }

    hide() {
        this.expandedContainer.hide();
    }

    destroy() {
        // Disconnect tất cả signals
        if (this._inputDisconnectors) {
            this._inputDisconnectors.forEach(disconnect => disconnect());
            this._inputDisconnectors = [];
        }

        if (this.expandedContainer) {
            this.expandedContainer.destroy();
        }
    }
}


// ============================================
// 2E. VIEW - Xử lý Giao diện Notification (NotificationView)
// ============================================
