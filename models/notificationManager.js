const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;

var NotificationManager = class NotificationManager {
    constructor() {
        this._callbacks = [];
        this._sources = new Map(); // Map<Source, SignalId>
        this._sourceAddedId = 0;
        this._destroyed = false;

        this._initNotificationListener();
    }

    _initNotificationListener() {
        // Lắng nghe khi có nguồn thông báo mới (App vừa mở hoặc gửi thông báo lần đầu)
        this._sourceAddedId = Main.messageTray.connect('source-added', (tray, source) => {
            this._onSourceAdded(source);
        });

        // Đăng ký cho các nguồn hiện có
        const sources = Main.messageTray.getSources();
        sources.forEach(source => {
            this._onSourceAdded(source);
        });
    }

    _onSourceAdded(source) {
        if (this._sources.has(source)) return;

        // Lắng nghe khi nguồn này gửi thông báo
        const signalId = source.connect('notification-added', (source, notification) => {
            this._onNotificationAdded(source, notification);
        });

        // Lắng nghe khi nguồn bị xóa (để cleanup)
        source.connect('destroy', () => {
            this._onSourceRemoved(source);
        });

        this._sources.set(source, signalId);
    }

    _onSourceRemoved(source) {
        this._sources.delete(source);
    }

    _onNotificationAdded(source, notification) {
        if (this._destroyed) return;
        const info = {
            title: notification.title || '',
            body: notification.body || notification.bannerBodyText || '',
            appName: source.title,
            gicon: source.icon, // GIcon object
            isUrgent: notification.urgency === MessageTray.Urgency.CRITICAL
        };

        this._notifyCallbacks(info);
    }

    addCallback(callback) {
        this._callbacks.push(callback);
    }

    _notifyCallbacks(info) {
        this._callbacks.forEach(cb => cb(info));
    }


    destroy() {
        this._destroyed = true;

        if (this._sourceAddedId) {
            Main.messageTray.disconnect(this._sourceAddedId);
            this._sourceAddedId = 0;
        }

        // Disconnect tất cả sources
        this._sources.forEach((signalId, source) => {
            try {
                source.disconnect(signalId);
            } catch (e) {
                log(`[DynamicIsland] BluetoothManager: Error disconnecting signal: ${e.message || e}`);
            }
        });
        this._sources.clear();
        this._callbacks = [];
    }
}