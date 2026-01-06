const St = imports.gi.St;
const Clutter = imports.gi.Clutter;

var RecordingView = class RecordingView {
    constructor() {
        this._buildCompactView();
        this._buildExpandedView();
        this._buildMinimalView();
        this._timerId = null;
        this._blinkTimerId = null;
        this._isBlinking = false;
    }

    _buildMinimalView() {
        this.secondaryIcon = new St.Icon({
            icon_name: 'audio-input-microphone-symbolic',
            icon_size: 24,
            style_class: 'battery-icon-secondary',
            style: 'color: #ff5555;',
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
            icon_name: 'audio-input-microphone-symbolic',
            icon_size: 24,
            style: 'color: #ff5555;',
            x_align: Clutter.ActorAlign.START
        });

        this.iconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            style: 'padding-left: 16px;',
        });
        this.iconWrapper.set_child(this.iconLeft);

        // Chấm xanh chớp tắt
        this.recordingDot = new St.Bin({
            width: 8,
            height: 8,
            style: 'background-color: #00ff00; border-radius: 4px;',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });
        this.recordingDot.set_opacity(255);

        this.dotWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            style: 'padding-right: 16px;'
        });
        this.dotWrapper.set_child(this.recordingDot);

        this.compactContainer = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: true,
            visible: false
        });
        this.compactContainer.add_child(this.iconWrapper);
        this.compactContainer.add_child(this.dotWrapper);
    }

    _buildExpandedView() {
        this.iconExpanded = new St.Icon({
            icon_name: 'audio-input-microphone-symbolic',
            icon_size: 64,
            style: 'color: #ff5555;'
        });

        this.expandedIconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.expandedIconWrapper.set_child(this.iconExpanded);

        this.statusLabel = new St.Label({
            text: 'Recording',
            style: 'color: white; font-size: 18px; font-weight: bold;'
        });

        this.detailsLabel = new St.Label({
            text: '',
            style: 'color: rgba(255,255,255,0.8); font-size: 14px; margin-top: 5px;'
        });

        const textBox = new St.BoxLayout({
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.START,
        });
        textBox.add_child(this.statusLabel);
        textBox.add_child(this.detailsLabel);

        this.textWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true
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

    updateRecording(recordingInfo) {

        if (!recordingInfo || !recordingInfo.isRecording) {
            this._stopTimer();
            this._stopBlinking();
            this.compactContainer.hide();
            this.expandedContainer.hide();
            return;
        }

        this.compactContainer.show();

        if (this.expandedContainer && this.expandedContainer.get_parent()) {
            this.expandedContainer.show();
        }

        this._appName = recordingInfo.appName || 'Recording';
        if (this.statusLabel) this.statusLabel.set_text('Recording');
        if (this.detailsLabel) this.detailsLabel.set_text(this._appName);
        
        // Đảm bảo chấm xanh được hiển thị và bắt đầu chớp tắt
        if (this.recordingDot) {
            this.recordingDot.show();
            this._startBlinking();
        }
    }

    startTimer(startTime) {
        // Không còn sử dụng timer nữa
    }

    _startBlinking() {
        this._stopBlinking();
        this._isBlinking = true;
        this._blinkState = true; // true = sáng, false = tối

        const blink = () => {
            if (!this._isBlinking || !this.recordingDot) {
                return false;
            }

            // Toggle opacity: 255 (sáng) <-> 76 (tối, ~30%)
            if (this._blinkState) {
                this.recordingDot.set_opacity(76);
                this._blinkState = false;
            } else {
                this.recordingDot.set_opacity(255);
                this._blinkState = true;
            }

            return true; // Tiếp tục lặp
        };

        // Bắt đầu chớp tắt ngay lập tức
        blink();
        // Lặp lại mỗi 500ms (tổng chu kỳ 1 giây)
        this._blinkTimerId = imports.mainloop.timeout_add(500, blink);
    }

    _stopBlinking() {
        this._isBlinking = false;
        if (this._blinkTimerId !== null) {
            imports.mainloop.source_remove(this._blinkTimerId);
            this._blinkTimerId = null;
        }
        // Đặt lại opacity về sáng khi dừng
        if (this.recordingDot) {
            this.recordingDot.set_opacity(255);
        }
    }

    _stopTimer() {
        if (this._timerId !== null) {
            imports.mainloop.source_remove(this._timerId);
            this._timerId = null;
        }
    }

    show() {
        this.compactContainer.show();
        this.expandedContainer.show();
    }

    hide() {
        this.compactContainer.hide();
        this.expandedContainer.hide();
        this._stopTimer();
        this._stopBlinking();
    }

    destroy() {
        this._stopTimer();
        this._stopBlinking();
        if (this.compactContainer) {
            this.compactContainer.destroy();
        }
        if (this.expandedContainer) {
            this.expandedContainer.destroy();
        }
    }
};
