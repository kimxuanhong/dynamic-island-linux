const St = imports.gi.St;
const Main = imports.ui.main;
const Clutter = imports.gi.Clutter;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const NotchConstants = Me.imports.utils.constants.NotchConstants;
const NotchStateMachine = Me.imports.utils.stateMachine.NotchStateMachine;
const TimeoutManager = Me.imports.utils.timeoutManager.TimeoutManager;
const PresenterRegistry = Me.imports.utils.presenterRegistry.PresenterRegistry;
const CycleManager = Me.imports.utils.cycleManager.CycleManager;
const LayoutManager = Me.imports.utils.layoutManager.LayoutManager;
const AnimationController = Me.imports.utils.animationController.AnimationController;

const BatteryManager = Me.imports.models.batteryManager.BatteryManager;
const BluetoothManager = Me.imports.models.bluetoothManager.BluetoothManager;
const MediaManager = Me.imports.models.mediaManager.MediaManager;
const VolumeManager = Me.imports.models.volumeManager.VolumeManager;
const BrightnessManager = Me.imports.models.brightnessManager.BrightnessManager;
const NotificationManager = Me.imports.models.notificationManager.NotificationManager;
const WindowManager = Me.imports.models.windowManager.WindowManager;
const RecordingManager = Me.imports.models.recordingManager.RecordingManager;
const CameraManager = Me.imports.models.cameraManager.CameraManager;

const BatteryView = Me.imports.views.batteryView.BatteryView;
const BluetoothView = Me.imports.views.bluetoothView.BluetoothView;
const MediaView = Me.imports.views.mediaView.MediaView;
const VolumeView = Me.imports.views.volumeView.VolumeView;
const BrightnessView = Me.imports.views.brightnessView.BrightnessView;
const NotificationView = Me.imports.views.notificationView.NotificationView;
const WindowView = Me.imports.views.windowView.WindowView;
const RecordingView = Me.imports.views.recordingView.RecordingView;
const CameraView = Me.imports.views.cameraView.CameraView;

var NotchController = class NotchController {
    constructor() {
        this.width = NotchConstants.COMPACT_WIDTH;
        this.height = NotchConstants.COMPACT_HEIGHT;
        this.expandedWidth = NotchConstants.EXPANDED_WIDTH;
        this.expandedHeight = NotchConstants.EXPANDED_HEIGHT;
        this.originalScale = NotchConstants.ORIGINAL_SCALE;

        // UI Actors
        this.notch = null;
        this.secondaryNotch = null;

        this._animatedIcons = new Map();

        // Monitor info
        const monitor = Main.layoutManager.primaryMonitor;
        this.monitorWidth = monitor.width;

        // Initialize core systems
        this.stateMachine = new NotchStateMachine();
        this.timeoutManager = new TimeoutManager();
        this.presenterRegistry = new PresenterRegistry();
        this.cycleManager = new CycleManager();
        this.layoutManager = new LayoutManager(this);
        this.animationController = new AnimationController(this);

        // Initialize managers and views
        this._initializeManagers();
        this._initializeViews();
        this._registerPresenters();

        // Create UI
        this._createNotchActor();

        // Setup monitoring
        this._setupMonitoring();

        // Setup events
        this._setupMouseEvents();

        // Initial state
        this._updateUI();
    }

    _initializeManagers() {
        this.batteryManager = new BatteryManager();
        this.bluetoothManager = new BluetoothManager();
        this.mediaManager = new MediaManager();
        this.volumeManager = new VolumeManager();
        this.brightnessManager = new BrightnessManager();
        this.notificationManager = new NotificationManager();
        this.windowManager = new WindowManager();
        this.recordingManager = new RecordingManager();
        this.cameraManager = new CameraManager();
    }

    _initializeViews() {
        this.batteryView = new BatteryView();
        this.bluetoothView = new BluetoothView();
        this.mediaView = new MediaView(this.mediaManager, this.volumeManager, this.bluetoothManager);
        this.volumeView = new VolumeView(this.volumeManager);
        this.brightnessView = new BrightnessView(this.brightnessManager);
        this.notificationView = new NotificationView();
        this.windowView = new WindowView();
        this.recordingView = new RecordingView();
        this.cameraView = new CameraView();

        this.allViewsMap = new Map([
            ['battery', this.batteryView],
            ['bluetooth', this.bluetoothView],
            ['media', this.mediaView],
            ['volume', this.volumeView],
            ['brightness', this.brightnessView],
            ['notification', this.notificationView],
            ['window', this.windowView],
            ['recording', this.recordingView],
            ['camera', this.cameraView]
        ]);

        this.mediaView._updateAllIcons();
    }

    _registerPresenters() {
        // Battery Presenter
        this.presenterRegistry.register('battery', {
            getCompactContainer: () => this.batteryView.compactContainer,
            getExpandedContainer: () => this.batteryView.expandedContainer,
            getSecondaryContainer: () => this.batteryView.secondaryContainer,
            onActivate: () => this.layoutManager.updateLayout()
        });

        // Media Presenter
        this.presenterRegistry.register('media', {
            getCompactContainer: () => this.mediaView.compactContainer,
            getExpandedContainer: () => this.mediaView.expandedContainer,
            getSecondaryContainer: () => this.mediaView.secondaryContainer,
            onActivate: () => this.layoutManager.updateLayout()
        });

        // Recording Presenter
        this.presenterRegistry.register('recording', {
            getCompactContainer: () => this.recordingView.compactContainer,
            getExpandedContainer: () => this.recordingView.expandedContainer,
            getSecondaryContainer: () => this.recordingView.secondaryContainer,
            onActivate: () => this.layoutManager.updateLayout()
        });

        // Camera Presenter
        this.presenterRegistry.register('camera', {
            getCompactContainer: () => null,
            getExpandedContainer: () => this.cameraView.expandedContainer,
            getSecondaryContainer: () => null,
            onActivate: () => this._showOnlyView('camera')
        });

        // Bluetooth Presenter
        this.presenterRegistry.register('bluetooth', {
            getCompactContainer: () => null,
            getExpandedContainer: () => this.bluetoothView.expandedContainer,
            getSecondaryContainer: () => null,
            onActivate: () => this._showOnlyView('bluetooth')
        });

        // Volume Presenter
        this.presenterRegistry.register('volume', {
            getCompactContainer: () => null,
            getExpandedContainer: () => this.volumeView.expandedContainer,
            getSecondaryContainer: () => null,
            onActivate: () => this._showOnlyView('volume')
        });

        // Brightness Presenter
        this.presenterRegistry.register('brightness', {
            getCompactContainer: () => null,
            getExpandedContainer: () => this.brightnessView.expandedContainer,
            getSecondaryContainer: () => null,
            onActivate: () => this._showOnlyView('brightness')
        });

        this.presenterRegistry.register('notification', {
            getCompactContainer: () => null,
            getExpandedContainer: () => null,
            getSecondaryContainer: () => null,
            onActivate: () => this._showOnlyView('notification')
        });

        this.presenterRegistry.register('window', {
            getCompactContainer: () => null,
            getExpandedContainer: () => null,
            getSecondaryContainer: () => null,
            onActivate: () => this._showOnlyView('window')
        });

        // Set default presenter
        this.cycleManager.activate('battery');
        this.presenterRegistry.switchTo('battery');
    }


    _showOnlyView(viewName) {
        for (const [name, view] of this.allViewsMap) {
            if (view) {
                if (name === viewName) {
                    view.show();
                } else {
                    view.hide();
                }
            }
        }
    }

    _createNotchActor() {
        this.notch = new St.BoxLayout({
            style_class: 'notch compact-state',
            vertical: false,
            reactive: true,
            track_hover: true,
            x_expand: false,
            can_focus: true,
            clip_to_allocation: true
        });

        this.notch.set_width(this.width);
        this.notch.set_height(this.height);
        this.originalScale = 1.0;
        this.notch.set_scale(this.originalScale, this.originalScale);
        this.notch.set_pivot_point(0.5, 0.5)

        const initialX = Math.floor((this.monitorWidth - this.width) / 2);
        this.notch.set_position(initialX, NotchConstants.NOTCH_Y_POSITION);

        this.notch.add_child(this.batteryView.compactContainer);
        this.notch.add_child(this.bluetoothView.compactContainer);
        this.notch.add_child(this.mediaView.compactContainer);
        this.notch.add_child(this.recordingView.compactContainer);
        this.notch.add_child(this.recordingView.compactContainer);

        Main.layoutManager.addChrome(this.notch, {
            affectsInputRegion: true,
            trackFullscreen: false
        });

        // Create Secondary Notch (Circular)
        this.secondaryNotch = new St.BoxLayout({
            style_class: 'notch-secondary',
            vertical: false,
            reactive: true,
            track_hover: false,
            x_expand: false,
            can_focus: true,
            clip_to_allocation: true,
            visible: false,
            opacity: 0
        });

        this.secondaryNotch.set_width(NotchConstants.SECONDARY_WIDTH);
        this.secondaryNotch.set_height(NotchConstants.SECONDARY_HEIGHT);
        this.secondaryNotch.set_pivot_point(0.5, 0.5);

        // Click to swap
        this.secondaryNotch.connect('button-press-event', () => {
            this.cycleManager.next();
            this.layoutManager.updateLayout();
            if (this.stateMachine.isCompact()) {
                this.squeeze();
            }
            return Clutter.EVENT_STOP;
        });

        Main.layoutManager.addChrome(this.secondaryNotch, {
            affectsInputRegion: true,
            trackFullscreen: false
        });
    }

    _setupMonitoring() {
        this.batteryManager.addCallback((info) => this._onBatteryChanged(info));
        this.bluetoothManager.addCallback((info) => this._onBluetoothChanged(info));
        this.mediaManager.addCallback((info) => this._onMediaChanged(info));
        this.volumeManager.addCallback((info) => this._onVolumeChanged(info));
        this.brightnessManager.addCallback((info) => this._onBrightnessChanged(info));
        this.notificationManager.addCallback((info) => this._onNotificationReceived(info));
        this.windowManager.addCallback((info) => this._onWindowLaunched(info));
        this.recordingManager.addCallback((info) => this._onRecordingChanged(info));
        this.cameraManager.addCallback((info) => this._onCameraChanged(info));
    }

    _setupMouseEvents() {
        // Cancel tất cả timeouts ngay khi hover vào notch
        this._enterEventId = this.notch.connect('enter-event', () => {
            this._cancelTemporaryPresenterTimeouts();
            return Clutter.EVENT_PROPAGATE;
        });

        this._motionEventId = this.notch.connect('motion-event', () => {
            this._cancelTemporaryPresenterTimeouts();
            if (this.stateMachine.isCompact()) {
                this.expandNotch(false);
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this._leaveEventId = this.notch.connect('leave-event', () => {
            if (this.stateMachine.isExpanded() && !this.timeoutManager.has('collapse')) {
                this.timeoutManager.set('collapse', NotchConstants.TIMEOUT_COLLAPSE, () => {
                    if (this.stateMachine.isExpanded()) {
                        this.compactNotch();
                    }
                });
            }
        });
    }

    _animateWindowIcon(info) {
        if (!this.notch) return;

        this.presenterRegistry.switchTo('window', true);

        const [notchX, notchY] = this.notch.get_transformed_position();
        const notchWidth = this.notch.width;
        const notchHeight = this.notch.height;
        const iconSize = NotchConstants.NOTIFICATION_ICON_SIZE;
        const padding = NotchConstants.NOTIFICATION_ICON_PADDING;

        // Icon bay từ TRÁI sang PHẢI (ngược với notification)
        const startX = notchX + padding;
        const endX = notchX + notchWidth - padding - iconSize;
        const iconY = notchY + (notchHeight / 2) - (iconSize / 2);

        this._animateIconMove('window-launch', {
            startX,
            startY: iconY,
            endX,
            iconConfig: {
                icon_name: 'application-x-executable-symbolic',
                icon_size: iconSize,
                style: 'color: #00aaff;',
                gicon: info.appIcon
            },
            moveDuration: NotchConstants.ANIMATION_WINDOW_MOVE,
            onComplete: () => {
                this.layoutManager.updateLayout();
                this.squeeze();
            }
        });
    }

    _animateIconMove(animationId, config) {
        if (!this.notch || !config) return null;

        this._cleanupAnimatedIcon(animationId);

        const {
            startX,
            startY,
            endX,
            endY = startY,
            iconConfig = {},
            moveDuration = NotchConstants.ANIMATION_NOTIFICATION_MOVE,
            fadeDuration = 200,
            onComplete = null,
            fadeOut = true
        } = config;

        const animatedIcon = new St.Icon({
            icon_name: iconConfig.icon_name || 'mail-unread-symbolic',
            icon_size: iconConfig.icon_size || NotchConstants.NOTIFICATION_ICON_SIZE,
            style: iconConfig.style || 'color: white;'
        });

        if (iconConfig.gicon) {
            animatedIcon.set_gicon(iconConfig.gicon);
        }

        animatedIcon.set_position(startX, startY);
        animatedIcon.set_opacity(255);

        Main.uiGroup.add_child(animatedIcon);
        this._animatedIcons.set(animationId, animatedIcon);

        const cleanupAndCallback = () => {
            this._cleanupAnimatedIcon(animationId);
            if (onComplete) {
                onComplete();
            }
        };

        animatedIcon.ease({
            x: endX,
            y: endY,
            duration: moveDuration,
            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
            onComplete: () => {
                if (fadeOut) {
                    animatedIcon.ease({
                        opacity: 0,
                        duration: fadeDuration,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                        onComplete: cleanupAndCallback
                    });
                } else {
                    cleanupAndCallback();
                }
            }
        });

        return animatedIcon;
    }

    _cleanupAnimatedIcon(animationId) {
        const icon = this._animatedIcons.get(animationId);
        if (icon) {
            try {
                icon.remove_all_transitions();
                if (icon.get_parent()) {
                    Main.uiGroup.remove_child(icon);
                }
                icon.destroy();
            } catch (e) {
                log(`[DynamicIsland] NotchController: Error cleaning up animated icon: ${e.message || e}`);
            }
            this._animatedIcons.delete(animationId);
        }
    }

    _cleanupAllAnimatedIcons() {
        for (const animationId of this._animatedIcons.keys()) {
            this._cleanupAnimatedIcon(animationId);
        }
    }

    _animateNotificationIcon(info) {
        if (!this.notch) return;

        this.presenterRegistry.switchTo('notification', true);

        const [notchX, notchY] = this.notch.get_transformed_position();
        const notchWidth = this.notch.width;
        const notchHeight = this.notch.height;
        const iconSize = NotchConstants.NOTIFICATION_ICON_SIZE;
        const padding = NotchConstants.NOTIFICATION_ICON_PADDING;

        const startX = notchX + padding;
        const endX = notchX + notchWidth - padding - iconSize;
        const iconY = notchY + (notchHeight / 2) - (iconSize / 2);

        this._animateIconMove('notification', {
            startX,
            startY: iconY,
            endX,
            iconConfig: {
                icon_name: 'mail-unread-symbolic',
                icon_size: iconSize,
                style: 'color: white;',
                gicon: info.gicon
            },
            moveDuration: NotchConstants.ANIMATION_NOTIFICATION_MOVE,
            onComplete: () => {
                this.layoutManager.updateLayout();
                this.squeeze();
            }
        });
    }

    _onBatteryChanged(info) {
        this.batteryView.updateBattery(info);
        if (info.isCharging) {
            this.notch.add_style_class_name('charging');
        } else {
            this.notch.remove_style_class_name('charging');
        }

        // Auto expand khi bắt đầu charge
        if (info.shouldAutoExpand && this.stateMachine.isCompact()) {
            this.presenterRegistry.switchTo('battery');
            this.expandNotch(true);

            this._scheduleAutoCollapse('battery-auto-collapse', NotchConstants.TIMEOUT_BATTERY_AUTO_COLLAPSE);
        }
    }

    _onBluetoothChanged(info) {
        this.bluetoothView.updateBluetooth(info);

        // Cập nhật icon dựa trên trạng thái bluetooth và mute
        this.mediaView._updateAllIcons();

        // Cancel all temporary presenter timeouts before switching
        this._cancelTemporaryPresenterTimeouts();

        this.presenterRegistry.switchTo('bluetooth', true);
        this.expandNotch(true);

        this._scheduleAutoCollapse('bluetooth', NotchConstants.TIMEOUT_BLUETOOTH);
    }

    _onRecordingChanged(info) {
        if (info && info.isRecording) {
            this.recordingView.updateRecording(info);
            const startTime = info.startTime || Date.now();
            this.recordingView.startTimer(startTime);

            this.cycleManager.activate('recording');
            this.presenterRegistry.switchTo('recording', true);
        } else {
            this.cycleManager.deactivate('recording');
            this.layoutManager.updateLayout();
        }
        if (this.stateMachine.isCompact()) {
            this.squeeze();
        }
    }

    _onCameraChanged(info) {
        if (info && info.isCameraInUse) {
            this.cameraView.updateCamera(info);

            this._cancelTemporaryPresenterTimeouts();

            this.presenterRegistry.switchTo('camera', true);
            this.expandNotch(true);

            this._scheduleAutoCollapse('camera', NotchConstants.TIMEOUT_NOTIFICATION || 3000);
        }
    }

    _onVolumeChanged(info) {
        this.volumeView.updateVolume(info);
        this.mediaView._updateAllIcons();

        this._cancelTemporaryPresenterTimeouts();

        this.presenterRegistry.switchTo('volume', true);
        this.expandNotch(true);

        this._scheduleAutoCollapse('volume', NotchConstants.TIMEOUT_VOLUME);
    }

    _onBrightnessChanged(info) {
        this.brightnessView.updateBrightness(info);

        this._cancelTemporaryPresenterTimeouts();

        this.presenterRegistry.switchTo('brightness', true);
        this.expandNotch(true);

        this._scheduleAutoCollapse('brightness', NotchConstants.TIMEOUT_BRIGHTNESS);
    }

    _onNotificationReceived(info) {
        if (this.stateMachine.isCompact()) {
            this._animateNotificationIcon(info);
        }
    }

    _onWindowLaunched(info) {
        this.windowView.updateWindow(info);

        if (this.stateMachine.isCompact()) {
            this._animateWindowIcon(info);
        }
    }

    _onMediaChanged(info) {
        this.mediaView._updatePlayPauseIcon(info.isPlaying);
        this.timeoutManager.clear('media-switch');

        if (info.isPlaying) {
            this.mediaView.updateMedia(info);
            this.mediaView._updateAllIcons();

            if (!this.cycleManager.has('media')) {
                this.cycleManager.activate('media');
                this.presenterRegistry.switchTo('media', true);
            }

            if (this.stateMachine.isCompact()) {
                this.squeeze();
            }
        } else {
            this.timeoutManager.set('media-switch', NotchConstants.TIMEOUT_MEDIA_SWITCH, () => {
                this.cycleManager.deactivate('media');
                this.layoutManager.updateLayout();
                if (this.stateMachine.isCompact()) {
                    this.squeeze();
                }
            });
        }
    }

    _scheduleAutoCollapse(timeoutKey, delay) {
        this.timeoutManager.set(timeoutKey, delay, () => {
            if (this.stateMachine.isExpanded()) {
                this.compactNotch();
            }
        });
    }

    _updateUI() {
        const info = this.batteryManager.getBatteryInfo();
        if (info) {
            this.batteryView.updateBattery(info);
        }
        this.layoutManager.updateLayout();
    }

    _cancelTemporaryPresenterTimeouts() {
        this.timeoutManager.clear('collapse');
        this.timeoutManager.clear('battery-auto-collapse');

        this.timeoutManager.clear('volume');
        this.timeoutManager.clear('brightness');
        this.timeoutManager.clear('bluetooth');
        this.timeoutManager.clear('bluetooth-defer');
        this.timeoutManager.clear('window');
        this.timeoutManager.clear('recording');
        this.timeoutManager.clear('camera');
    }

    _hideAllExpandedViews() {
        this.batteryView.expandedContainer.hide();
        this.bluetoothView.expandedContainer.hide();
        this.mediaView.expandedContainer.hide();
        this.volumeView.expandedContainer.hide();
        this.brightnessView.expandedContainer.hide();
        this.windowView.expandedContainer.hide();
        this.recordingView.expandedContainer.hide();
        this.cameraView.expandedContainer.hide();
    }

    _hideAllCompactViews() {
        this.batteryView.compactContainer.hide();
        this.bluetoothView.compactContainer.hide();
        this.mediaView.compactContainer.hide();
        this.notificationView.compactContainer.hide();
        this.windowView.compactContainer.hide();
        this.recordingView.compactContainer.hide();
        this.windowView.compactContainer.hide();
        this.recordingView.compactContainer.hide();
    }

    _showExpandedView(presenter) {
        if (!presenter) return;
        const container = presenter.getExpandedContainer();
        if (!container) return;

        if (!container.get_parent()) {
            this.notch.add_child(container);
        }
        container.show();
    }

    expandNotch(isAuto = false) {
        if (!this.notch) return; // Notch chưa được tạo

        // Hide secondary notch immediately
        if (this.secondaryNotch) {
            this.secondaryNotch.hide();
        }

        const currentPresenter = isAuto ? this.presenterRegistry.getCurrent() : this.cycleManager.current();
        const presenter = this.presenterRegistry.getPresenter(currentPresenter);

        // If already expanded and auto-expand, just update view
        if (this.stateMachine.isExpanded() && isAuto) {
            this._hideAllExpandedViews();
            this._showExpandedView(presenter);
            return;
        }

        // Prevent expansion if already expanded or animating
        if (this.stateMachine.isExpanded()) return;
        if (!isAuto && this.stateMachine.isAnimating()) return;

        // Transition to animating state
        this.stateMachine.transitionTo('animating');

        // Hide all compact views
        this._hideAllCompactViews();

        // Show expanded view
        this._showExpandedView(presenter);

        // Start animation
        this.animationController.expand();
    }

    compactNotch() {
        if (!this.notch) return; // Notch chưa được tạo
        if (!this.stateMachine.isExpanded()) return;
        if (this.stateMachine.isAnimating()) return;

        // Transition to animating state
        this.stateMachine.transitionTo('animating');

        // Hide all expanded views
        this._hideAllExpandedViews();

        // Start animation
        this.animationController.compact();
    }

    squeeze() {
        this.animationController.squeeze();
    }

    destroy() {
        // Clear all timeouts
        this.timeoutManager.clearAll();

        // Disconnect events
        if (this.notch) {
            if (this._enterEventId) {
                this.notch.disconnect(this._enterEventId);
                this._enterEventId = null;
            }
            if (this._motionEventId) {
                this.notch.disconnect(this._motionEventId);
                this._motionEventId = null;
            }
            if (this._leaveEventId) {
                this.notch.disconnect(this._leaveEventId);
                this._leaveEventId = null;
            }
        }

        // Destroy managers
        if (this.batteryManager) {
            this.batteryManager.destroy();
            this.batteryManager = null;
        }
        if (this.bluetoothManager) {
            this.bluetoothManager.destroy();
            this.bluetoothManager = null;
        }
        if (this.mediaManager) {
            this.mediaManager.destroy();
            this.mediaManager = null;
        }
        if (this.volumeManager) {
            this.volumeManager.destroy();
            this.volumeManager = null;
        }
        if (this.brightnessManager) {
            this.brightnessManager.destroy();
            this.brightnessManager = null;
        }
        if (this.notificationManager) {
            this.notificationManager.destroy();
            this.notificationManager = null;
        }
        if (this.windowManager) {
            this.windowManager.destroy();
            this.windowManager = null;
        }
        if (this.recordingManager) {
            this.recordingManager.destroy();
            this.recordingManager = null;
        }
        if (this.cameraManager) {
            this.cameraManager.destroy();
            this.cameraManager = null;
        }

        this._cleanupAllAnimatedIcons();

        // Destroy views
        if (this.batteryView) {
            this.batteryView.destroy();
            this.batteryView = null;
        }
        if (this.bluetoothView) {
            this.bluetoothView.destroy();
            this.bluetoothView = null;
        }
        if (this.mediaView) {
            this.mediaView.destroy();
            this.mediaView = null;
        }
        if (this.volumeView) {
            this.volumeView.destroy();
            this.volumeView = null;
        }
        if (this.brightnessView) {
            this.brightnessView.destroy();
            this.brightnessView = null;
        }
        if (this.notificationView) {
            this.notificationView.destroy();
            this.notificationView = null;
        }
        if (this.windowView) {
            this.windowView.destroy();
            this.windowView = null;
        }
        if (this.recordingView) {
            this.recordingView.destroy();
            this.recordingView = null;
        }
        if (this.cameraView) {
            this.cameraView.destroy();
            this.cameraView = null;
        }

        // Destroy actors
        if (this.notch) {
            Main.layoutManager.removeChrome(this.notch);
            this.notch.destroy();
            this.notch = null;
        }
        if (this.secondaryNotch) {
            Main.layoutManager.removeChrome(this.secondaryNotch);
            this.secondaryNotch.destroy();
            this.secondaryNotch = null;
        }

        // Clear references
        this.stateMachine = null;
        this.timeoutManager = null;
        this.presenterRegistry = null;
        this.layoutManager = null;
        this.animationController = null;
    }
}