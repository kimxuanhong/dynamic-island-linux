const St = imports.gi.St;
const Clutter = imports.gi.Clutter;

var VolumeView = class VolumeView {
    constructor(volumeManager) {
        this._volumeManager = volumeManager;
        this._signals = [];
        this._buildExpandedView();
    }

    _buildExpandedView() {
        // Icon lớn ở giữa
        this.expandedIcon = new St.Icon({
            icon_name: 'audio-volume-high-symbolic',
            icon_size: 64,
            style: 'color: white;'
        });

        this.expandedIconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.expandedIconWrapper.set_child(this.expandedIcon);

        // Volume percentage label
        this.volumeLabel = new St.Label({
            text: '0%',
            style: 'color: white; font-size: 18px; font-weight: bold; margin-top: 10px;'
        });

        // Progress bar lớn hơn - THÊM reactive và track_hover
        this.expandedProgressBarBg = new St.Widget({
            style_class: 'volume-progress-bg-expanded',
            style: 'background-color: rgba(255,255,255,0.2); border-radius: 8px; height: 12px; width: 300px;',
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            track_hover: true
        });

        this.expandedProgressBarFill = new St.Widget({
            style_class: 'volume-progress-fill-expanded',
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
            style_class: 'volume-expanded',
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            visible: false
        });
        this.expandedContainer.add_child(this.expandedIconWrapper);
        this.expandedContainer.add_child(this.volumeLabel);
        this.expandedContainer.add_child(this.expandedProgressWrapper);
    }

    _connectProgressBarEvents() {
        // Lưu các signal IDs để disconnect sau này
        this._signals = [];

        // Sự kiện click
        this._signals.push(
            this.expandedProgressBarBg.connect('button-press-event', (actor, event) => {
                this._handleProgressBarClick(actor, event, true);
                return Clutter.EVENT_STOP;
            })
        );

        // Sự kiện kéo (drag)
        this._signals.push(
            this.expandedProgressBarBg.connect('motion-event', (actor, event) => {
                if (event.get_state() & Clutter.ModifierType.BUTTON1_MASK) {
                    // Không log khi drag để giảm spam
                    this._handleProgressBarClick(actor, event, false);
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            })
        );

        // Thêm hiệu ứng hover (tuỳ chọn)
        this._signals.push(
            this.expandedProgressBarBg.connect('enter-event', () => {
                this.expandedProgressBarBg.style =
                    'background-color: rgba(255,255,255,0.3); border-radius: 8px; height: 12px; width: 300px; cursor: pointer;';
                return Clutter.EVENT_PROPAGATE;
            })
        );

        this._signals.push(
            this.expandedProgressBarBg.connect('leave-event', () => {
                this.expandedProgressBarBg.style =
                    'background-color: rgba(255,255,255,0.2); border-radius: 8px; height: 12px; width: 300px;';
                return Clutter.EVENT_PROPAGATE;
            })
        );
    }

    _handleProgressBarClick(actor, event, shouldLog = true) {
        // Lấy vị trí click
        const [x, y] = event.get_coords();
        const [actorX, actorY] = actor.get_transformed_position();
        const actorWidth = actor.get_width();

        // Tính toán volume dựa trên vị trí click
        const relativeX = x - actorX;
        const percentage = Math.max(0, Math.min(100, (relativeX / actorWidth) * 100));

        // Set volume qua manager
        if (this._volumeManager.setVolume(percentage)) {
            // Cập nhật UI ngay lập tức
            this.updateVolume({
                volume: Math.round(percentage),
                isMuted: this._volumeManager.isMuted()
            });
        }
    }

    updateVolume(volumeInfo) {
        const {volume, isMuted} = volumeInfo;

        // Cập nhật icon
        let iconName;
        if (isMuted || volume === 0) {
            iconName = 'audio-volume-muted-symbolic';
        } else if (volume < 33) {
            iconName = 'audio-volume-low-symbolic';
        } else if (volume < 66) {
            iconName = 'audio-volume-medium-symbolic';
        } else {
            iconName = 'audio-volume-high-symbolic';
        }
        this.expandedIcon.icon_name = iconName;

        // Cập nhật progress bar expanded (300px width)
        const percentage = isMuted ? 0 : volume;
        const expandedBarWidth = Math.round(300 * percentage / 100);
        this.expandedProgressBarFill.set_width(expandedBarWidth);

        // Cập nhật label
        this.volumeLabel.set_text(`${percentage}%`);
    }

    show() {
        this.expandedContainer.show();
    }

    hide() {
        this.expandedContainer.hide();
    }

    destroy() {
        // Disconnect tất cả signals
        if (this._signals) {
            this._signals.forEach(signalId => {
                this.expandedProgressBarBg.disconnect(signalId);
            });
            this._signals = [];
        }

        if (this.expandedContainer) {
            this.expandedContainer.destroy();
        }
    }
}

// ============================================
// 2E. VIEW - Xử lý Giao diện Brightness (BrightnessView)
// ============================================