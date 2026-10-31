import {IslandIcon} from '../utils/islandIcon.js';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import {styleStatusCard} from '../utils/viewStyle.js';

import {MirroredVisualizer} from '../utils/visualizer.js';

export class RecordingView {
    constructor() {
        this._buildCompactView();
        this._buildExpandedView();
        this._buildMinimalView();
        this._timerId = null;
        this._iconAnimationTimer = null;
        this._currentIconFrame = 0;
        styleStatusCard(this, 'violet', 'MICROPHONE');
    }

    _buildMinimalView() {
        this.secondaryIcon = new IslandIcon({
            icon_name: 'audio-input-microphone-symbolic',
            icon_size: 24,
            style_class: 'battery-icon-secondary',
            style: 'color: #c4a5ff;',
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
        this.iconLeft = new IslandIcon({
            icon_name: 'audio-input-microphone-symbolic',
            icon_size: 24,
            style: 'color: #c4a5ff;',
            x_align: Clutter.ActorAlign.START
        });

        this.iconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            style: 'padding-left: 16px;',
        });
        this.iconWrapper.set_child(this.iconLeft);

        // ===== VISUALIZER (màu tím) =====
        this._visualizer = new MirroredVisualizer({
            barCount: 6,
            pattern: [4, 6, 8, 6, 4, 2],
            barWidth: 3,
            barSpacing: 3,
            rowHeight: 16,
            maxOffset: 2,
            animationSpeed: 80
        });
        // Set màu tím cho recording
        this._visualizer.setColor('196, 165, 255'); // #c4a5ff in RGB

        this._visualizerWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            style: 'padding-right: 16px;',
        });
        this._visualizerWrapper.set_child(this._visualizer.container);

        this.compactContainer = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            x_expand: true,
            y_expand: true,
            visible: false
        });
        this.compactContainer.add_child(this.iconWrapper);
        this.compactContainer.add_child(this._visualizerWrapper);
    }

    _buildExpandedView() {
        this.iconExpanded = new IslandIcon({
            icon_name: 'audio-input-microphone-symbolic',
            icon_size: 64,
            style: 'color: #c4a5ff;'
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
            orientation: Clutter.Orientation.VERTICAL,
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
            orientation: Clutter.Orientation.HORIZONTAL,
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
            this._stopIconAnimation();
            this._visualizer.stop();
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
        
        // Start visualizer animation
        this._visualizer.start();
        
        // Start icon animation
        this._startIconAnimation();
    }

    _startIconAnimation() {
        if (this._iconAnimationTimer) {
            return; // Already animating
        }

        // Icon sequence for microphone animation
        const iconSequence = [
            'audio-input-microphone-low-symbolic',
            'audio-input-microphone-medium-symbolic',
            'audio-input-microphone-high-symbolic',
            'audio-input-microphone-symbolic'
        ];

        this._currentIconFrame = 0;

        // Animation: 400ms per frame
        this._iconAnimationTimer = setInterval(() => {
            const iconName = iconSequence[this._currentIconFrame];
            
            // Update all icons
            this.iconLeft.icon_name = iconName;
            this.iconExpanded.icon_name = iconName;
            if (this.secondaryIcon) {
                this.secondaryIcon.icon_name = iconName;
            }

            // Move to next frame
            this._currentIconFrame = (this._currentIconFrame + 1) % iconSequence.length;
        }, 400); // 400ms per frame
    }

    _stopIconAnimation() {
        if (this._iconAnimationTimer) {
            clearInterval(this._iconAnimationTimer);
            this._iconAnimationTimer = null;
            this._currentIconFrame = 0;
            
            // Reset to default icon
            this.iconLeft.icon_name = 'audio-input-microphone-symbolic';
            this.iconExpanded.icon_name = 'audio-input-microphone-symbolic';
            if (this.secondaryIcon) {
                this.secondaryIcon.icon_name = 'audio-input-microphone-symbolic';
            }
        }
    }

    startTimer(startTime) {
        // Không còn sử dụng timer nữa
    }

    _stopTimer() {
        if (this._timerId !== null) {
            GLib.Source.remove(this._timerId);
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
        this._stopIconAnimation();
        this._visualizer.stop();
    }

    destroy() {
        this._stopTimer();
        this._stopIconAnimation();
        this._visualizer.destroy();
        if (this.compactContainer) {
            this.compactContainer.destroy();
        }
        if (this.expandedContainer) {
            this.expandedContainer.destroy();
        }
    }
};
