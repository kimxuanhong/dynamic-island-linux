const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;

var NotificationManager = class NotificationManager {
    constructor() {
        this._callbacks = [];
        this._sources = new Map(); // Map<Source, SignalId>
        this._sourceAddedId = 0;
        this._serverProxy = null;
        this._dbusConnection = null;
        this._destroyed = false;

        this._initServerConnection();
        this._initNotificationListener();
    }

    _initServerConnection() {
        // Định nghĩa Interface cho Server DBus Signal
        const ServerInterface = `
            <node>
                <interface name="com.github.dynamic_island.Server">
                    <signal name="EventOccurred">
                        <arg name="event_type" type="s" direction="out"/>
                        <arg name="app_name" type="s" direction="out"/>
                        <arg name="pid" type="i" direction="out"/>
                        <arg name="timestamp" type="s" direction="out"/>
                        <arg name="metadata" type="s" direction="out"/>
                    </signal>
                </interface>
            </node>
        `;
        const ServerProxy = Gio.DBusProxy.makeProxyWrapper(ServerInterface);

        // Kết nối tới Server qua Session Bus để lắng nghe signals
        this._serverProxy = new ServerProxy(
            Gio.DBus.session,
            'com.github.dynamic_island.Server',
            '/com/github/dynamic_island/Server',
            (proxy, error) => {
                if (error) {
                    log(`[DynamicIsland] NotificationManager: Failed to connect to server: ${error.message || error}`);
                    return;
                }

                // Lắng nghe signal EventOccurred từ server (để nhất quán với các manager khác)
                this._serverProxy.connectSignal('EventOccurred', (proxy, senderName, [eventType, appName, pid, timestamp, metadata]) => {
                    this._onServerEvent(eventType, appName, pid, timestamp, metadata);
                });
            }
        );

        // Lưu DBus connection để emit signal
        this._dbusConnection = Gio.DBus.session;
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
        
        const title = notification.title || '';
        const body = notification.body || notification.bannerBodyText || '';
        const appName = source.title || '';
        
        // Lấy icon path từ GIcon
        let iconPath = '';
        if (source.icon) {
            try {
                if (source.icon.to_string) {
                    iconPath = source.icon.to_string();
                } else if (source.icon.get_names) {
                    const names = source.icon.get_names();
                    if (names && names.length > 0) {
                        iconPath = names[0];
                    }
                }
            } catch (e) {
                // Ignore icon errors
            }
        }

        // Emit signal tới server
        this._emitNotificationToServer(appName, title, body, iconPath);

        // Notify callbacks ngay lập tức (không đợi server)
        const info = {
            title: title,
            body: body,
            appName: appName,
            gicon: source.icon, // GIcon object
            isUrgent: notification.urgency === MessageTray.Urgency.CRITICAL
        };

        this._notifyCallbacks(info);
    }

    _emitNotificationToServer(appName, title, body, icon) {
        if (!this._dbusConnection) return;

        try {
            // Emit signal tới server
            // Signal name: com.github.dynamic_island.Extension.Notification
            // Object path: /com/github/dynamic_island/Extension
            this._dbusConnection.emit_signal(
                null, // destination (null = broadcast)
                '/com/github/dynamic_island/Extension', // object path
                'com.github.dynamic_island.Extension', // interface name
                'Notification', // signal name
                new GLib.Variant('(ssss)', [appName, title, body, icon]) // arguments
            );
        } catch (e) {
            log(`[DynamicIsland] NotificationManager: Error emitting notification signal: ${e.message || e}`);
        }
    }

    _onServerEvent(eventType, appName, pid, timestamp, metadata) {
        if (this._destroyed) return;

        // Chỉ xử lý các events notification
        if (eventType !== 'notification') {
            return;
        }

        // Parse metadata JSON
        let metadataObj = {};
        try {
            if (metadata && typeof metadata === 'string') {
                metadataObj = JSON.parse(metadata);
            }
        } catch (e) {
            log(`[DynamicIsland] NotificationManager: Failed to parse metadata: ${e.message || e}`);
            return;
        }

        // Server đã nhận được notification từ extension
        // Có thể log hoặc xử lý thêm nếu cần
        // Nhưng không cần notify callbacks lại vì đã notify từ MessageTray rồi
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
                log(`[DynamicIsland] NotificationManager: Error disconnecting signal: ${e.message || e}`);
            }
        });
        this._sources.clear();

        if (this._serverProxy) {
            this._serverProxy = null;
        }
        this._dbusConnection = null;

        this._callbacks = [];
    }
}