import {IslandIcon} from '../utils/islandIcon.js';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import {connectClick, connectMotion} from '../utils/input.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {AnimationController} from '../utils/animationController.js';
import {NotchConstants} from '../utils/constants.js';
import {CycleManager} from '../utils/cycleManager.js';
import {LayoutManager} from '../utils/layoutManager.js';
import {PresenterRegistry} from '../utils/presenterRegistry.js';
import {NotchStateMachine} from '../utils/stateMachine.js';
import {TimeoutManager} from '../utils/timeoutManager.js';

import {InputMethodManager} from '../models/inputMethodManager.js';
import {InputMethodView} from '../views/inputMethodView.js';

import {NetworkSpeedManager} from '../models/networkSpeedManager.js';
import {NetworkSpeedView} from '../views/networkSpeedView.js';
import {NetworkManager} from '../models/networkManager.js';
import {EventView} from '../views/eventView.js';

import {BatteryManager} from '../models/batteryManager.js';
import {BluetoothManager} from '../models/bluetoothManager.js';
import {BrightnessManager} from '../models/brightnessManager.js';
import {CameraManager} from '../models/cameraManager.js';
import {MediaManager} from '../models/mediaManager.js';
import {NotificationManager} from '../models/notificationManager.js';
import {RecordingManager} from '../models/recordingManager.js';
import {UxplayManager} from '../models/uxplayManager.js';
import {VolumeManager} from '../models/volumeManager.js';
import {WindowManager} from '../models/windowManager.js';

import {BatteryView} from '../views/batteryView.js';
import {BluetoothView} from '../views/bluetoothView.js';
import {BrightnessView} from '../views/brightnessView.js';
import {CameraView} from '../views/cameraView.js';
import {MediaView} from '../views/mediaView.js';
import {NotificationView} from '../views/notificationView.js';
import {RecordingView} from '../views/recordingView.js';
import {UxplayView} from '../views/uxplayView.js';
import {VolumeView} from '../views/volumeView.js';
import {WindowView} from '../views/windowView.js';

export class NotchController {
    constructor(settings = null) {
        this.width = settings?.get_int('island-width') ?? NotchConstants.COMPACT_WIDTH;
        this.height = settings?.get_int('island-height') ?? NotchConstants.COMPACT_HEIGHT;
        this.expandedWidth = NotchConstants.EXPANDED_WIDTH;
        this.expandedHeight = NotchConstants.EXPANDED_HEIGHT;
        this.originalScale = NotchConstants.ORIGINAL_SCALE;

        // Settings
        this.settings = settings;
        if (settings && !settings.get_user_value('default-content') && settings.get_user_value('idle-content')) {
            const old = settings.get_string('idle-content');
            settings.set_string('default-content', ['clock', 'hidden', 'battery'].includes(old)
                ? old : old === 'media' ? 'hidden' : 'battery');
            settings.reset('idle-content');
        }

        // UI Actors
        this.notch = null;
        this.secondaryNotch = null;

        this._expansionQueue = [];
        this._collapsing = false;
        this._hiding = false;
        this._revealing = false;
        this._notificationIconActive = false;
        this._hoverExpansionPending = false;
        this._animatedIcons = new Map();
        this._destroyed = false; // ✅ Track destruction state

        // Track media changes
        this._lastMediaTitle = null;
        this._lastMediaArtist = null;

        // Monitor info
        const monitor = Main.layoutManager.primaryMonitor;
        this.monitorWidth = monitor?.width ?? global.stage.width;
        this._monitorsChangedId = Main.layoutManager.connect(
            'monitors-changed',
            () => {
                const primaryMonitor = Main.layoutManager.primaryMonitor;
                if (!primaryMonitor)
                    return;

                this.monitorWidth = primaryMonitor.width;
                this.updatePosition();
            }
        );

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

        this._appearanceSignals = ['background-opacity', 'island-width', 'island-height'].map(key =>
            this.settings?.connect(`changed::${key}`, () => this._syncAppearance())
        ).filter(Boolean);
        this._syncAppearance();
        this._levelSignals = ['show-volume', 'show-brightness', 'show-network', 'show-bluetooth'].map(key =>
            this.settings?.connect(`changed::${key}`, () => this._syncLevelSettings())
        ).filter(Boolean);

        this._defaultSignal = this.settings?.connect('changed::default-content', () => this._syncDefaultContent());
        this._syncDefaultContent();

        this._eventSignals = ['notification-style'].map(key =>
            this.settings?.connect(`changed::${key}`, () => this._syncEventSettings())
        ).filter(Boolean);

        // Initial state
        this._updateUI();
    }

    _initializeManagers() {
        this.inputMethodManager = new InputMethodManager();
        this.batteryManager = new BatteryManager();
        this.networkManager = new NetworkManager();
        this.networkSpeedManager = new NetworkSpeedManager();
        this.bluetoothManager = new BluetoothManager();
        this.mediaManager = new MediaManager();
        this.volumeManager = new VolumeManager();
        this.brightnessManager = new BrightnessManager();
        this.notificationManager = new NotificationManager();
        this.windowManager = new WindowManager();
        this.recordingManager = new RecordingManager(this.settings);
        this.cameraManager = new CameraManager(this.settings);
        this.uxplayManager = new UxplayManager();
    }

    _initializeViews() {
        this.inputMethodView = new InputMethodView();
        this.networkView = new EventView();
        this.networkSpeedView = new NetworkSpeedView();
        this.batteryView = new BatteryView();
        this.bluetoothView = new BluetoothView();
        this.mediaView = new MediaView(this.mediaManager, this.volumeManager, this.bluetoothManager);
        this.volumeView = new VolumeView(this.volumeManager);
        this.brightnessView = new BrightnessView(this.brightnessManager);
        for (const [name, view] of [['volume', this.volumeView], ['brightness', this.brightnessView]]) {
            view.onInteractionBegin = () => this._cancelTemporaryPresenterTimeouts();
            view.onInteractionEnd = () => {
                if (!this._destroyed)
                    this._scheduleAutoCollapse(name, name === 'volume'
                        ? NotchConstants.TIMEOUT_VOLUME : NotchConstants.TIMEOUT_BRIGHTNESS);
            };
        }
        this.notificationView = new NotificationView();
        this.windowView = new WindowView();
        this.recordingView = new RecordingView();
        this.cameraView = new CameraView();
        this.uxplayView = new UxplayView();

        this.allViewsMap = new Map([
            ['input-method', this.inputMethodView],
            ['network', this.networkView],
            ['network-speed', this.networkSpeedView],
            ['battery', this.batteryView],
            ['bluetooth', this.bluetoothView],
            ['media', this.mediaView],
            ['volume', this.volumeView],
            ['brightness', this.brightnessView],
            ['notification', this.notificationView],
            ['window', this.windowView],
            ['recording', this.recordingView],
            ['camera', this.cameraView],
            ['uxplay', this.uxplayView]
        ]);

        // 🔋 Set battery expand callback
        this.batteryView.setExpandCallback(() => {
            this._requestAutoExpansion('battery', 'battery-notification', NotchConstants.TIMEOUT_BATTERY_AUTO_COLLAPSE);
        });

        this.mediaView.setVolumeRequestHandler(() => {
            this._requestAutoExpansion('volume', 'volume', this._levelDisplayTime());
        });
    }

    _registerPresenters() {
        this._clockLabel = new St.Label({y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER, x_expand: true});
        this._clockSecondary = new St.Label({y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER, x_expand: true});
        this.presenterRegistry.register('clock', {
            getCompactContainer: () => this._clockLabel,
            getSecondaryContainer: () => this._clockSecondary,
            getExpandedContainer: () => null,
            onActivate: () => this.layoutManager.updateLayout(),
        });
        this.presenterRegistry.register('network-speed', {
            getCompactContainer: () => this.networkSpeedView.compactContainer,
            getSecondaryContainer: () => null,
            getExpandedContainer: () => this.networkSpeedView.expandedContainer,
            onActivate: () => this.layoutManager.updateLayout(),
        });
        this.presenterRegistry.register('network', {
            getCompactContainer: () => null,
            getExpandedContainer: () => this.networkView.expandedContainer,
            getSecondaryContainer: () => null,
            onActivate: () => this._showOnlyView('network'),
        });
        this.presenterRegistry.register('input-method', {
            getCompactContainer: () => null,
            getExpandedContainer: () => this.inputMethodView.expandedContainer,
            getSecondaryContainer: () => null,
            onActivate: () => this._showOnlyView('input-method'),
        });
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

        // Uxplay Presenter
        this.presenterRegistry.register('uxplay', {
            getCompactContainer: () => this.uxplayView.compactContainer,
            getExpandedContainer: () => this.uxplayView.expandedContainer,
            getSecondaryContainer: () => this.uxplayView.secondaryContainer,
            onActivate: () => this.layoutManager.updateLayout()
        });

        // Camera Presenter
        this.presenterRegistry.register('camera', {
            getCompactContainer: () => this.cameraView.compactContainer,
            getExpandedContainer: () => this.cameraView.expandedContainer,
            getSecondaryContainer: () => this.cameraView.secondaryContainer,
            onActivate: () => this.layoutManager.updateLayout()
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
            getExpandedContainer: () => this.notificationView.expandedContainer,
            getSecondaryContainer: () => null,
            onActivate: () => this._showOnlyView('notification')
        });

        // Wait for real content before showing the island.
    }


    _showOnlyView(viewName) {
        if (this._collapsing) return;
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
            visible: false,
            orientation: Clutter.Orientation.HORIZONTAL,
            reactive: true,
            track_hover: true,
            x_expand: false,
            can_focus: true,
            clip_to_allocation: true
        });

        this.notch.set_width(this.width);
        this.notch.set_height(this.height);
        this.notch.set_scale(this.originalScale, this.originalScale);
        this.notch.set_pivot_point(0.5, 0);

        const initialX = this._calculateNotchX(this.width);
        const initialY = this._calculateNotchY();
        this.notch.set_position(initialX, initialY);

        this.notch.add_child(this.batteryView.compactContainer);
        this.notch.add_child(this.bluetoothView.compactContainer);
        this.notch.add_child(this.mediaView.compactContainer);
        this.notch.add_child(this.recordingView.compactContainer);
        this.notch.add_child(this.cameraView.compactContainer);
        this.notch.add_child(this.uxplayView.compactContainer);

        Main.layoutManager.addChrome(this.notch, {
            trackFullscreen: false
        });

        // Create Secondary Notch (Horizontal pill)
        this.secondaryNotch = new St.BoxLayout({
            style_class: 'notch-secondary',
            orientation: Clutter.Orientation.HORIZONTAL,
            reactive: true,
            track_hover: false,
            x_expand: false,
            can_focus: true,
            clip_to_allocation: true,
            visible: false,
            opacity: 0
        });

        this.secondaryNotch.set_width(NotchConstants.SECONDARY_WIDTH);
        this.secondaryNotch.set_height(this.height);
        this.secondaryNotch.set_pivot_point(0.5, 0);

        // Click to swap
        connectClick(this.secondaryNotch, () => {
            this.cycleManager.next();
            this.layoutManager.updateLayout();
            if (this.stateMachine.isCompact()) {
                this.expandNotch(false);
            }
            return Clutter.EVENT_STOP;
        });

        Main.layoutManager.addChrome(this.secondaryNotch, {
            trackFullscreen: false
        });
    }

    _setupMonitoring() {
        this.inputMethodManager.addCallback(info => {
            if (this._destroyed) return;
            this.inputMethodView.update(info);
            this._requestAutoExpansion('input-method', 'input-method', 2000);
        });
        this.networkSpeedManager.addCallback(info => this.networkSpeedView.updateSpeed(info));
        this.networkManager.addCallback(info => this._onNetworkChanged(info));
        this.batteryManager.addCallback((info) => this._onBatteryChanged(info));
        this.bluetoothManager.addCallback((info) => this._onBluetoothChanged(info));
        this.mediaManager.addCallback((info) => this._onMediaChanged(info));
        this.volumeManager.addCallback((info) => this._onVolumeChanged(info));
        this.brightnessManager.addCallback((info) => this._onBrightnessChanged(info));
        this.notificationManager.addCallback((info) => this._onNotificationReceived(info));
        this.windowManager.addCallback((info) => this._onWindowLaunched(info));
        this.recordingManager.addCallback((info) => this._onRecordingChanged(info));
        this.cameraManager.addCallback((info) => this._onCameraChanged(info));
        this.uxplayManager.addCallback((info) => this._onUxplayChanged(info));
    }

    _setupMouseEvents() {
        // Debounce expand để tránh trigger nhiều lần
        let expandPending = false;
        
        // Cancel tất cả timeouts ngay khi hover vào notch
        this._disconnectEnter = connectMotion(this.notch, 'enter', () => {
            this._cancelTemporaryPresenterTimeouts();
            this._hoverExpansionPending = this.stateMachine.isAnimating();
            
            // Expand ngay lập tức nếu đang compact
            if (this.stateMachine.isCompact() && !expandPending) {
                expandPending = true;
                this.expandNotch(false);
                // Reset flag sau khi animation hoàn tất
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, NotchConstants.ANIMATION_EXPAND_DURATION, () => {
                    expandPending = false;
                    return false;
                });
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this._disconnectMotion = connectMotion(this.notch, 'motion', () => {
            this._cancelTemporaryPresenterTimeouts();
            // Expansion is handled by the motion controller enter callback.
            return Clutter.EVENT_PROPAGATE;
        });

        this._disconnectLeave = connectMotion(this.notch, 'leave', () => {
            this._hoverExpansionPending = false;
            if ((this.stateMachine.isExpanded() || this.stateMachine.isAnimating()) && !this.timeoutManager.has('collapse')) {
                this.timeoutManager.set('collapse', NotchConstants.TIMEOUT_COLLAPSE, () => {
                    if (this.stateMachine.isExpanded()) {
                        this.compactNotch();
                    }
                });
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

        const animatedIcon = new IslandIcon({
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
                // log(`[DynamicIsland] NotchController: Error cleaning up animated icon: ${e.message || e}`);
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
        if (!this.notch || this._destroyed) return;
        this._notificationIconActive = true;

        const [notchX, notchY] = this.notch.get_transformed_position();
        const [notchWidth, notchHeight] = this.notch.get_transformed_size();
        const iconSize = NotchConstants.NOTIFICATION_ICON_SIZE;
        const padding = NotchConstants.NOTIFICATION_ICON_PADDING;

        const startX = notchX + padding;
        const endX = notchX + notchWidth - padding - iconSize;
        const iconY = notchY + (notchHeight / 2) - (iconSize / 2);

        const iconChoice = this.settings?.get_string('notification-icon') ?? 'app';
        this._animateIconMove('notification', {
            startX,
            startY: iconY,
            endX,
            iconConfig: {
                icon_name: iconChoice === 'airplane' ? 'airplane-mode-symbolic' : 'mail-unread-symbolic',
                icon_size: iconSize,
                style: 'color: white;',
                gicon: iconChoice === 'app' ? info.gicon : null
            },
            moveDuration: this.settings?.get_int('notification-animation-duration') ?? NotchConstants.ANIMATION_NOTIFICATION_MOVE,
            onComplete: () => {
                this._notificationIconActive = false;
                if (this._expansionQueue.length) this._finishCollapse();
                else {
                    this.layoutManager.updateLayout();
                    this.squeeze();
                }
            }
        });
    }

    _onBatteryChanged(info) {
        const wasPresent = this.cycleManager.has('battery');
        if (!info?.isPresent) {
            this.cycleManager.deactivate('battery');
            this._expansionQueue = this._expansionQueue.filter(event => event.presenterName !== 'battery');
            this.timeoutManager.clear('battery-notification');
            this.timeoutManager.clear('battery-auto-collapse');
            this.batteryView.updateBattery(info);
            this.notch.remove_style_class_name('charging');
            if (!wasPresent) return;
            if (this.presenterRegistry.getCurrent() === 'battery' && this.stateMachine.isExpanded())
                this.compactNotch(true);
            else
                this.layoutManager.updateLayout();
            return;
        }
        if (!this.cycleManager.has('battery'))
            this.cycleManager.activate('battery', false);
        this.batteryView.updateBattery(info);
        if (!wasPresent) this.layoutManager.updateLayout();
        if (info.isCharging) {
            this.notch.add_style_class_name('charging');
        } else {
            this.notch.remove_style_class_name('charging');
        }

        // Battery expand logic is now handled by batteryView callback
        // (triggered by _checkBatteryNotifications in batteryView.updateBattery)
    }

    _onNetworkChanged(info) {
        if (this.settings && !this.settings.get_boolean('show-network')) return;
        const label = info.kind === 'wifi' ? 'Wi-Fi' : 'Ethernet';
        this.networkView.update({title: `${label} ${info.connected ? 'connected' : 'disconnected'}`,
            detail: info.name, icon: info.kind === 'wifi' ? 'network-wireless-symbolic' : 'network-wired-symbolic'});
        this._requestAutoExpansion('network', 'network', 3000);
    }

    _onBluetoothChanged(info) {
        if (this.settings && !this.settings.get_boolean('show-bluetooth')) return;
        this.bluetoothView.updateBluetooth(info);


        // ✅ FIX: Đợi một frame để UI update xong trước khi expand
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            // Check if still valid (not destroyed during idle)
            if (!this.notch || this._destroyed) {
                return false;
            }

            this._requestAutoExpansion('bluetooth', 'bluetooth', NotchConstants.TIMEOUT_BLUETOOTH);
            
            return false; // Don't repeat
        });
    }

    _onRecordingChanged(info) {
        if (info && info.isRecording) {
            this.recordingView.updateRecording(info);

            this.cycleManager.activate('recording');
            this._requestAutoExpansion('recording', 'recording', NotchConstants.TIMEOUT_RECORDING);
        } else {
            this.cycleManager.deactivate('recording');
            this._expansionQueue = this._expansionQueue.filter(event => event.presenterName !== 'recording');
            this.timeoutManager.clear('recording');
            if (this.presenterRegistry.getCurrent() === 'recording' &&
                this.notch.has_style_class_name('expanded-state'))
                this.compactNotch(true);
            else
                this.layoutManager.updateLayout();
        }
        if (this.stateMachine.isCompact()) {
            this.squeeze();
        }
    }

    _onCameraChanged(info) {
        if (info && info.isCameraInUse) {
            this.cameraView.updateCamera(info);

            this.cycleManager.activate('camera');
            this._requestAutoExpansion('camera', 'camera', NotchConstants.TIMEOUT_RECORDING);
        } else {
            this.cycleManager.deactivate('camera');
            this._expansionQueue = this._expansionQueue.filter(event => event.presenterName !== 'camera');
            this.timeoutManager.clear('camera');
            if (this.presenterRegistry.getCurrent() === 'camera' &&
                this.notch.has_style_class_name('expanded-state'))
                this.compactNotch(true);
            else
                this.layoutManager.updateLayout();
        }
        if (this.stateMachine.isCompact()) {
            this.squeeze();
        }
    }

    _levelDisplayTime() {
        return (this.settings?.get_int('level-display-time') ?? 2) * 1000;
    }

    _syncLevelSettings() {
        for (const name of ['volume', 'brightness', 'network', 'bluetooth']) {
            if (this.settings.get_boolean(`show-${name}`)) continue;
            this._expansionQueue = this._expansionQueue.filter(event => event.presenterName !== name);
            this.timeoutManager.clear(name);
            if (this.presenterRegistry.getCurrent() === name &&
                this.notch.has_style_class_name('expanded-state'))
                this.compactNotch(true);
        }
    }

    _onVolumeChanged(info) {
        if (this.settings && !this.settings.get_boolean('show-volume')) return;
        this.volumeView.updateVolume(info);

        this._requestAutoExpansion('volume', 'volume', this._levelDisplayTime());
    }

    _onBrightnessChanged(info) {
        if (this.settings && !this.settings.get_boolean('show-brightness')) return;
        this.brightnessView.updateBrightness(info);

        this._requestAutoExpansion('brightness', 'brightness', this._levelDisplayTime());
    }

    _onNotificationReceived(info) {
        const style = this.settings?.get_string('notification-style') ?? 'icon';
        if (style === 'off') return;
        if (style === 'icon') {
            this._queueNotificationIcon(info);
        } else {
            this.notificationView.updateNotification(info);
            this._requestAutoExpansion('notification', 'notification',
                (this.settings?.get_int('notification-display-time') ?? 3) * 1000);
        }
    }

    _queueNotificationIcon(info) {
        if (this._destroyed) return;
        if (this.notch.visible && this.stateMachine.isCompact() && !this._notificationIconActive) {
            this._animateNotificationIcon(info);
            return;
        }
        this._expansionQueue.push({presenterName: 'notification-icon', info});
        if (!this.notch.visible || this._hiding) {
            if (this.cycleManager.count()) this.layoutManager.updateLayout();
            else {
                this._hideAllCompactViews();
                this._hideAllExpandedViews();
                this.animationController.reveal();
            }
        } else if (!this._collapsing && !this._revealing && !this._notificationIconActive &&
            !this.volumeView?.isDragging && !this.brightnessView?.isDragging &&
            !this.timeoutManager.has('queued-wait')) {
            this._scheduleAutoCollapse('queued-wait', NotchConstants.TIMEOUT_VOLUME);
        }
    }

    _onWindowLaunched(info) {
        if (info.event === 'closed') {
            if (this.stateMachine.isCompact())
                this.squeeze();
            return;
        }

        this.windowView.updateWindow(info);

        if (this.stateMachine.isCompact())
            this.squeeze();
    }

    _syncEventSettings() {
        const disabled = [];
        if (this.settings.get_string('notification-style') !== 'card') disabled.push('notification');
        if (this.settings.get_string('notification-style') !== 'icon') {
            this._cleanupAnimatedIcon('notification');
            this._notificationIconActive = false;
            this._expansionQueue = this._expansionQueue.filter(event => event.presenterName !== 'notification-icon');
            this.layoutManager.updateLayout();
        }
        for (const name of disabled) {
            this._expansionQueue = this._expansionQueue.filter(event => event.presenterName !== name);
            this.timeoutManager.clear(name);
            if (this.presenterRegistry.getCurrent() === name &&
                this.notch.has_style_class_name('expanded-state')) this.compactNotch(true);
        }
    }

    _dismissMedia() {
        const hadMedia = this.cycleManager.has('media');
        if (this.notch?.hover && this.presenterRegistry.getCurrent() === 'media')
            this._hoverExpansionPending = true;
        this.timeoutManager.clear('media-switch');
        this.timeoutManager.clear('media-ready');
        this._pendingMediaInfo = null;
        this.timeoutManager.clear('media-track-change');
        this._expansionQueue = this._expansionQueue.filter(event => event.presenterName !== 'media');
        this._lastMediaTitle = null;
        this._lastMediaArtist = null;
        this.mediaView.clearMedia();
        this.cycleManager.deactivate('media');
        if (this.presenterRegistry.getCurrent() === 'media' && this.stateMachine.isExpanded())
            this.compactNotch(true);
        else if (hadMedia && !this._collapsing && (this.stateMachine.isCompact() ||
            (this.stateMachine.isAnimating() && !this.notch.has_style_class_name('expanded-state')))) {
            // Recenter split -> single smoothly instead of snapping the layout.
            this._collapsing = true;
            this._skipCollapseSqueeze = true;
            this.stateMachine.transitionTo('animating');
            this.secondaryNotch?.ease({opacity: 0, duration: 150});
            this.animationController.compact();
        } else
            this.layoutManager.updateLayout();
    }

    _onMediaChanged(info) {
        if (info.isPlaying)
            this.timeoutManager.clear('media-switch');
        if (!info.metadata && !info.playbackStatus) {
            this._dismissMedia();
            return;
        }

        if (info.isPlaying) {
            // Detect track change by comparing title and artist
            const currentTitle = this.mediaManager.getTitle(info.metadata);
            const currentArtist = this.mediaManager.getArtist(info.metadata);
            
            const isTrackChanged = this._lastMediaTitle !== currentTitle || 
                                   this._lastMediaArtist !== currentArtist;
            
            // Store current track info for next comparison
            this._lastMediaTitle = currentTitle;
            this._lastMediaArtist = currentArtist;

            this.mediaView.updateMedia(info);

            // Update progress bar if position and length are available
            if (info.position !== undefined && info.length !== undefined) {
                this.mediaView.updateProgress(info.position, info.length);
            }

            if (!this.cycleManager.has('media')) {
                this.cycleManager.activate('media');
                this.layoutManager.updateLayout();
            }

            this._pendingMediaInfo = info;
            // Let metadata and artwork arrive before requesting an expanded view.
            // Position/artwork updates for the same track do not restart the wait.
            if (isTrackChanged) {
                this.timeoutManager.clear('media-ready');
                this._expansionQueue = this._expansionQueue.filter(event => event.presenterName !== 'media');
                if (typeof currentTitle === 'string' && currentTitle.trim()) {
                    this.timeoutManager.set('media-ready', NotchConstants.TIMEOUT_MEDIA_READY, () => {
                        const latest = this._pendingMediaInfo;
                        const title = this.mediaManager.getTitle(latest?.metadata);
                        if (latest?.isPlaying && typeof title === 'string' && title.trim())
                            this._requestAutoExpansion('media', 'media-track-change', 2500);
                    });
                }
            } else if (this.stateMachine.isCompact() && !this.timeoutManager.has('media-ready')) {
                this.squeeze();
            }
        } else {
            if (this.timeoutManager.has('media-ready')) {
                this.timeoutManager.clear('media-ready');
                this._lastMediaTitle = null;
                this._lastMediaArtist = null;
            }
            this._pendingMediaInfo = null;
            this._expansionQueue = this._expansionQueue.filter(event => event.presenterName !== 'media');
            // Update playback state only (stop visualizer without losing metadata)
            this.mediaView.updatePlaybackState(info.isPlaying, info.playbackStatus);
            
            if (!this.timeoutManager.has('media-switch')) {
                this.timeoutManager.set('media-switch', NotchConstants.TIMEOUT_MEDIA_SWITCH, () => {
                    this._dismissMedia();
                });
            }
        }
    }

    _onUxplayChanged(info) {
        if (info && info.isSharing) {
            this.uxplayView.updateUxplay(info);

            this.cycleManager.activate('uxplay');
            this._requestAutoExpansion('uxplay', 'uxplay', NotchConstants.TIMEOUT_RECORDING);
        } else {
            this.cycleManager.deactivate('uxplay');
            this._expansionQueue = this._expansionQueue.filter(event => event.presenterName !== 'uxplay');
            this.timeoutManager.clear('uxplay');
            if (this.presenterRegistry.getCurrent() === 'uxplay' &&
                this.notch.has_style_class_name('expanded-state')) this.compactNotch(true);
            else this.layoutManager.updateLayout();
        }
        
        if (this.stateMachine.isCompact()) {
            this.squeeze();
        }
    }

    _requestAutoExpansion(presenterName, timeoutKey, delay) {
        if (this._destroyed) return;
        if ((!this.notch.visible || this._hiding || this._revealing) &&
            !this._notificationIconActive &&
            !this._expansionQueue.some(event => event.presenterName === 'notification-icon')) {
            this._cancelTemporaryPresenterTimeouts();
            this._dispatchingExpansion = true;
            try {
                this.presenterRegistry.switchTo(presenterName, true);
                this.expandNotch(true);
            } finally {
                this._dispatchingExpansion = false;
            }
            this._scheduleAutoCollapse(timeoutKey, delay);
            return;
        }
        const current = this.presenterRegistry.getCurrent();
        const levelChange = presenterName === 'volume' || presenterName === 'brightness';
        const cardOpen = !this._revealing && !this._collapsing &&
            this.notch.has_style_class_name('expanded-state');
        if (levelChange && current !== presenterName && cardOpen && !this._notificationIconActive &&
            !this.volumeView?.isDragging && !this.brightnessView?.isDragging) {
            this._cancelTemporaryPresenterTimeouts();
            this._expansionQueue = this._expansionQueue.filter(event =>
                event.presenterName !== 'volume' && event.presenterName !== 'brightness');
            this.presenterRegistry.switchTo(presenterName, true);
            this.expandNotch(true);
            this._scheduleAutoCollapse(timeoutKey, delay);
            return;
        }
        if (current === presenterName && !this._revealing && !this._hiding &&
            (this._collapsing || this.notch?.has_style_class_name('expanded-state'))) {
            if (this._collapsing) {
                this._collapsing = false;
                this.stateMachine.transitionTo('compact');
                this.presenterRegistry.switchTo(presenterName, true);
                this.expandNotch(true);
            }
            this._scheduleAutoCollapse(timeoutKey, delay);
            return;
        }
        const busy = this._notificationIconActive || this._collapsing || this.stateMachine.isAnimating() ||
            (this.stateMachine.isExpanded() && current !== presenterName);
        if (busy) {
            const previous = this._expansionQueue[this._expansionQueue.length - 1];
            // Consecutive updates of one view share its latest data and timer.
            if (previous?.presenterName === presenterName) {
                previous.collapse = {timeoutKey, delay};
            } else {
                this._expansionQueue.push({presenterName, collapse: {timeoutKey, delay}});
            }
            if (!this._collapsing && !this.volumeView?.isDragging && !this.brightnessView?.isDragging &&
                !this.timeoutManager.has('queued-wait'))
                this._scheduleAutoCollapse('queued-wait', NotchConstants.TIMEOUT_VOLUME);
            return;
        }
        this._cancelTemporaryPresenterTimeouts();
        this.presenterRegistry.switchTo(presenterName, false);
        this.expandNotch(true);
        if (!this.volumeView?.isDragging && !this.brightnessView?.isDragging)
            this._scheduleAutoCollapse(timeoutKey, delay);
    }

    _scheduleAutoCollapse(timeoutKey, delay) {
        if (this._collapsing && this._expansionQueue.length) {
            this._expansionQueue[this._expansionQueue.length - 1].collapse = {timeoutKey, delay};
            return;
        }
        this.timeoutManager.set(timeoutKey, delay, () => {
            if (this.stateMachine.isExpanded()) {
                // A released slider must not hold queued events indefinitely
                // just because the pointer is still over the card.
                this.compactNotch(this._expansionQueue.length > 0);
            }
        });
    }

    _updateUI() {
        const info = this.batteryManager.getBatteryInfo();
        if (info) {
            this._onBatteryChanged(info);
        }
        this.layoutManager.updateLayout();
    }

    _cancelTemporaryPresenterTimeouts() {
        this.timeoutManager.clear('input-method');
        this.timeoutManager.clear('network');
        this.timeoutManager.clear('notification');
        this.timeoutManager.clear('collapse');
        this.timeoutManager.clear('queued-wait');
        this.timeoutManager.clear('queued-expansion');
        this.timeoutManager.clear('battery-notification');
        this.timeoutManager.clear('battery-auto-collapse');

        this.timeoutManager.clear('volume');
        this.timeoutManager.clear('brightness');
        this.timeoutManager.clear('bluetooth');
        this.timeoutManager.clear('bluetooth-defer');
        this.timeoutManager.clear('recording');
        this.timeoutManager.clear('camera');
        this.timeoutManager.clear('uxplay');
        this.timeoutManager.clear('media-track-change');
    }

    _hideAllExpandedViews(except = null) {
        if (this.networkSpeedView.expandedContainer !== except) this.networkSpeedView.expandedContainer.hide();
        if (this.notificationView.expandedContainer !== except) this.notificationView.hide();
        if (this.networkView.expandedContainer !== except) this.networkView.hide();
        if (this.inputMethodView.expandedContainer !== except)
            this.inputMethodView.expandedContainer.hide();
        if (this.batteryView.expandedContainer !== except)
            this.batteryView.expandedContainer.hide();
        if (this.bluetoothView.expandedContainer !== except)
            this.bluetoothView.expandedContainer.hide();
        if (this.mediaView.expandedContainer !== except)
            this.mediaView.expandedContainer.hide();
        if (this.volumeView.expandedContainer !== except)
            this.volumeView.expandedContainer.hide();
        if (this.brightnessView.expandedContainer !== except)
            this.brightnessView.expandedContainer.hide();
        if (this.recordingView.expandedContainer !== except)
            this.recordingView.expandedContainer.hide();
        if (this.cameraView.expandedContainer !== except)
            this.cameraView.expandedContainer.hide();
        if (this.uxplayView.expandedContainer !== except)
            this.uxplayView.expandedContainer.hide();
    }

    _hideAllCompactViews() {
        this.networkSpeedView.compactContainer.hide();
        this._clockLabel?.hide();
        this._clockSecondary?.hide();
        this.batteryView.compactContainer.hide();
        this.bluetoothView.compactContainer.hide();
        this.mediaView.compactContainer.hide();
        this.notificationView.hide();
        this.windowView.compactContainer.hide();
        this.recordingView.compactContainer.hide();
        this.cameraView.compactContainer.hide();
        this.uxplayView.compactContainer.hide();
    }

    _showExpandedView(presenter) {
        if (!presenter) return;
        const container = presenter.getExpandedContainer();
        if (!container) return;

        const currentParent = container.get_parent();

        // If container already has this.notch as parent, just show it
        if (currentParent === this.notch) {
            container.show();
            return;
        }

        // If container has a different parent, remove it first
        if (currentParent) {
            try {
                currentParent.remove_child(container);
            } catch (e) {
                // Ignore if already removed or doesn't exist
            }
        }

        // Now safe to add - container should have no parent
        if (!container.get_parent()) {
            try {
                // Disable animations temporarily for faster add
                const oldTransitions = container.get_transition('opacity');
                if (oldTransitions) {
                    container.remove_all_transitions();
                }
                
                this.notch.add_child(container);
                container.set_opacity(255);
            } catch (e) {
                // log(`[DynamicIsland] NotchController: Error adding expanded container: ${e.message || e}`);
                return;
            }
        }

        container.show();
    }

    expandNotch(isAuto = false) {
        if (!isAuto && !this.cycleManager.current()) return;
        if (!this.notch) return;
        if (!this.notch.visible || this._hiding || this._revealing) {
            const hidden = !this.notch.visible;
            this.notch.remove_all_transitions();
            this._hiding = false;
            this._revealing = false;
            this.stateMachine.transitionTo('compact');
            if (hidden) {
                this.notch.set_size(0, 0);
                this.notch.set_position(this._calculateNotchX(0), this._calculateNotchY());
                this.notch.set_opacity(0);
            }
        }
        if (this._collapsing) {
            this._expansionQueue.push({
                presenterName: isAuto ? this.presenterRegistry.getCurrent() : this.cycleManager.current(),
            });
            return;
        }

        const currentPresenter = isAuto ? this.presenterRegistry.getCurrent() : this.cycleManager.current();
        if (!isAuto && !this.stateMachine.isAnimating())
            this.presenterRegistry.switchTo(currentPresenter, false);
        // Presenter activation may rebuild compact layout and show the split
        // actor. Hide it after activation, before starting the expansion.
        this.secondaryNotch?.hide();

        const presenter = this.presenterRegistry.getPresenter(currentPresenter);

        // ✅ FIX: Check if presenter has valid expanded container
        if (!presenter || !presenter.getExpandedContainer) {
            // log(`[DynamicIsland] NotchController: No valid presenter or expanded container for ${currentPresenter}`);
            return;
        }

        const expandedContainer = presenter.getExpandedContainer();
        if (!expandedContainer) {
            // log(`[DynamicIsland] NotchController: Expanded container is null for ${currentPresenter}`);
            return;
        }

        this.notch.show();

        // If already expanded and auto-expand, just update view
        if (this.stateMachine.isExpanded() && isAuto) {
            this._hideAllExpandedViews(expandedContainer);
            this._showExpandedView(presenter);
            return;
        }

        // Prevent expansion if already expanded or animating
        if (this.stateMachine.isExpanded()) return;
        if (!isAuto && this.stateMachine.isAnimating()) return;

        // ✅ FIX: Cancel any ongoing animations before starting new one
        if (this.notch) {
            this.notch.remove_all_transitions();
        }

        // Transition to animating state
        this.stateMachine.transitionTo('animating');

        // Hide all compact views
        this._hideAllCompactViews();

        // Show expanded view
        this._showExpandedView(presenter);

        // Start animation
        this.animationController.expand();
    }

    compactNotch(force = false) {
        if (!force && this.notch?.hover) return;
        if (this.volumeView?.isDragging || this.brightnessView?.isDragging) return;
        if (!this.notch) return; // Notch chưa được tạo
        const opening = this.stateMachine.isAnimating() && !this._collapsing &&
            this.notch.has_style_class_name('expanded-state');
        if (!this.stateMachine.isExpanded() && !(force && opening)) return;

        this._collapsing = true;
        // Transition to animating state
        this.stateMachine.transitionTo('animating');

        // Hide all expanded views
        this._hideAllExpandedViews();

        // Start animation
        this.animationController.compact();
    }

    _finishCollapse() {
        if (this._destroyed) return;
        this._collapsing = false;
        this.stateMachine.transitionTo('compact');
        if (!this._expansionQueue.length) this.layoutManager.updateLayout();
        const skipSqueeze = this._skipCollapseSqueeze;
        this._skipCollapseSqueeze = false;
        if (this._expansionQueue[0]?.presenterName !== 'notification-icon' && this._resumePendingHover()) return;
        const event = this._expansionQueue.shift();
        if (!event) {
            if (!skipSqueeze && !this._hiding && this.notch.visible) this.animationController.squeeze();
            return;
        }
        if (event.presenterName === 'notification-icon') {
            this._animateNotificationIcon(event.info);
            return;
        }
        this._dispatchingExpansion = true;
        try {
            this.presenterRegistry.switchTo(event.presenterName, true);
            this.expandNotch(true);
        } finally {
            this._dispatchingExpansion = false;
        }
        if (event.collapse) {
            const {timeoutKey, delay} = event.collapse;
            this._scheduleAutoCollapse(timeoutKey, delay + NotchConstants.ANIMATION_EXPAND_DURATION);
        } else {
            this._scheduleAutoCollapse('queued-expansion', NotchConstants.TIMEOUT_COLLAPSE +
                NotchConstants.ANIMATION_EXPAND_DURATION);
        }
    }

    _resumePendingHover() {
        if (!this.cycleManager.current()) {
            this._hoverExpansionPending = false;
            return false;
        }
        if (!this._hoverExpansionPending || !this.notch?.hover) return false;
        this._hoverExpansionPending = false;
        this.expandNotch(false);
        return true;
    }

    squeeze() {
        if (!this.stateMachine.isCompact() || this._hiding) return;
        this.animationController.squeeze();
    }

    _syncDefaultContent() {
        const mode = this.settings?.get_string('default-content') ?? 'battery';
        const activities = ['media', 'recording', 'camera', 'uxplay'];
        this.cycleManager.setFilter(name => {
            if (activities.some(active => this.cycleManager.has(active)))
                return activities.includes(name);
            return name === mode;
        });
        this.networkSpeedManager.setEnabled(mode === 'network-speed');
        if (mode === 'network-speed') this.cycleManager.activate('network-speed', false);
        else this.cycleManager.deactivate('network-speed');
        if (this._clockTimer) GLib.source_remove(this._clockTimer);
        this._clockTimer = 0;
        if (mode === 'clock') {
            const update = () => {
                const now = GLib.DateTime.new_now_local();
                this._clockLabel.text = now.format('%H:%M');
                this._clockSecondary.text = now.format('%H:%M');
                return GLib.SOURCE_CONTINUE;
            };
            update();
            this._clockTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, update);
            this.cycleManager.activate('clock', false);
        } else {
            this.cycleManager.deactivate('clock');
        }
        const current = this.presenterRegistry.getCurrent();
        if (['battery', 'clock', 'network-speed'].includes(current) &&
            current !== mode &&
            this.notch.has_style_class_name('expanded-state'))
            this.compactNotch(true);
        else
            this.layoutManager.updateLayout();
    }

    _syncAppearance() {
        const opacity = (this.settings?.get_int('background-opacity') ?? 85) / 100;
        const width = this.settings?.get_int('island-width') ?? NotchConstants.COMPACT_WIDTH;
        const height = this.settings?.get_int('island-height') ?? NotchConstants.COMPACT_HEIGHT;
        const resized = width !== this.width || height !== this.height;
        const hiding = this._hiding;
        const squeezing = this.stateMachine.isAnimating() && !this._collapsing && !hiding && !this._revealing &&
            !this.notch.has_style_class_name('expanded-state');
        this.width = width;
        this.height = height;
        this.secondaryNotch.set_height(height);
        // Width/height preferences affect compact geometry only.
        for (const actor of [this.notch, this.secondaryNotch]) {
            actor.set_style(`background-color: rgba(0, 0, 0, ${opacity});`);
            if (resized && squeezing) actor.remove_all_transitions();
        }
        if (resized && this._revealing) {
            this.animationController.reveal({width: this.notch.width,
                x: this._calculateNotchX(this.notch.width)});
            return;
        }
        if (resized && hiding) {
            this.animationController.cancelHide();
            this.notch.set_size(this.width, this.height);
            this.notch.set_position(this._calculateNotchX(this.width), this._calculateNotchY());
            this.animationController.hide();
            return;
        }
        // Retarget active animations so they cannot restore the previous size.
        if (resized && this._collapsing) {
            this.animationController.compact();
            return;
        }
        if (resized && squeezing) this.stateMachine.transitionTo('compact');
        if (resized && this.stateMachine.isAnimating() &&
            this.notch.has_style_class_name('expanded-state')) {
            this.animationController.expand();
            return;
        }
        if (resized && this.stateMachine.isExpanded()) {
            this.notch.set_size(this.expandedWidth, this.expandedHeight);
            this.notch.set_position(this._calculateNotchX(this.expandedWidth), this._calculateNotchY());
        } else if (resized && this.stateMachine.isCompact()) {
            this.notch.set_size(this.width, this.height);
        }
        this.updatePosition();
        if (resized && squeezing && this._expansionQueue.length) this._finishCollapse();
    }

    _calculateNotchX(groupWidth, actorWidth = groupWidth) {
        // Scaling about the horizontal center shifts the visible left edge by
        // (1 - scale) * actorWidth / 2. Compensate using this actor's width,
        // even when centering the wider split group.
        return (this.monitorWidth - groupWidth * this.originalScale) / 2 +
            (this.originalScale - 1) * actorWidth / 2;
    }

    _calculateNotchY() {
        const topMargin = this.settings ? this.settings.get_int('notch-margin-top') : NotchConstants.NOTCH_Y_POSITION;
        return topMargin;
    }

    updatePosition() {
        if (!this.notch) return;

        const expanding = this.stateMachine.isAnimating() &&
            this.notch.has_style_class_name('expanded-state');
        const currentWidth = this.stateMachine.isExpanded() || expanding
            ? this.expandedWidth
            : this.width;

        const newX = this._calculateNotchX(currentWidth);
        const newY = this._calculateNotchY();

        this.notch.set_position(newX, newY);

        // Cập nhật layout để secondary notch cũng được di chuyển
        this.layoutManager.updateLayout();
    }

    destroy() {
        // ✅ Mark as destroyed to prevent race conditions
        this._destroyed = true;
        for (const id of this._appearanceSignals ?? [])
            this.settings.disconnect(id);
        this._appearanceSignals = [];
        for (const id of this._levelSignals ?? [])
            this.settings.disconnect(id);
        this._levelSignals = [];
        for (const id of this._eventSignals ?? []) this.settings.disconnect(id);
        this._eventSignals = [];
        if (this._defaultSignal) this.settings.disconnect(this._defaultSignal);
        this._defaultSignal = 0;
        if (this._clockTimer) GLib.source_remove(this._clockTimer);
        this._clockTimer = 0;
        for (const actor of [this._clockLabel, this._clockSecondary]) actor?.destroy();
        this._expansionQueue.length = 0;

        // Clear all timeouts
        this.timeoutManager.clearAll();

        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = 0;
        }

        // Disconnect events
        if (this.notch) {
            if (this._disconnectEnter) {
                this._disconnectEnter();
                this._disconnectEnter = null;
            }
            if (this._disconnectMotion) {
                this._disconnectMotion();
                this._disconnectMotion = null;
            }
            if (this._disconnectLeave) {
                this._disconnectLeave();
                this._disconnectLeave = null;
            }
        }

        this.networkSpeedManager.destroy();
        this.networkSpeedView.destroy();
        this.networkManager.destroy();
        this.networkView.destroy();
        this.inputMethodManager.destroy();
        this.inputMethodView.destroy();

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
        if (this.uxplayManager) {
            this.uxplayManager.destroy();
            this.uxplayManager = null;
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
        if (this.uxplayView) {
            this.uxplayView.destroy();
            this.uxplayView = null;
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
