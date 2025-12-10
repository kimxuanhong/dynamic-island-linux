const St = imports.gi.St;
const Clutter = imports.gi.Clutter;

var RecordingView = class RecordingView {
    constructor() {
        this._buildCompactView();
        this._buildExpandedView();
        this._buildMinimalView();
        this._timerId = null;
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

        this.timerLabel = new St.Label({
            text: '00:00',
            style: 'color: white; font-size: 14px; font-weight: bold; font-family: monospace; padding-right: 16px;',
            x_align: Clutter.ActorAlign.END
        });

        this.timerWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true
        });
        this.timerWrapper.set_child(this.timerLabel);

        this.compactContainer = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: true,
            visible: false
        });
        this.compactContainer.add_child(this.iconWrapper);
        this.compactContainer.add_child(this.timerWrapper);
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
    }

    _startTimer(startTime) {
        this._stopTimer();

        const updateTimer = () => {
            const isCompactVisible = this.compactContainer && this.compactContainer.visible;
            const isExpandedVisible = this.expandedContainer && this.expandedContainer.visible;

            if (!isCompactVisible && !isExpandedVisible) {
                return false;
            }

            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            const timeString = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

            if (this.timerLabel) {
                this.timerLabel.set_text(timeString);
            }
            if (this.detailsLabel && this._appName) {
                this.detailsLabel.set_text(`${this._appName} • ${timeString}`);
            }

            return true;
        };

        updateTimer();
        this._timerId = imports.mainloop.timeout_add(1000, updateTimer);
    }

    startTimer(startTime) {
        this._startTimer(startTime);
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
    }

    destroy() {
        this._stopTimer();
        if (this.compactContainer) {
            this.compactContainer.destroy();
        }
        if (this.expandedContainer) {
            this.expandedContainer.destroy();
        }
    }
};
