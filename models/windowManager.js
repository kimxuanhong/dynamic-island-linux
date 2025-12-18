const Shell = imports.gi.Shell;

var WindowManager = class WindowManager {
    constructor() {
        this._callbacks = [];
        this._windowTracker = null;
        this._windowCreatedId = null;
        this._destroyed = false;
        this._isInitializing = true;
        this._trackedWindows = new Set(); // Theo dõi các window đã xử lý

        this._initWindowTracker();
    }

    _initWindowTracker() {
        // Lấy WindowTracker từ Shell
        this._windowTracker = Shell.WindowTracker.get_default();

        if (!this._windowTracker) {
            return;
        }

        // Lấy danh sách window hiện tại để không trigger notification cho chúng
        const existingWindows = global.get_window_actors();
        existingWindows.forEach(windowActor => {
            const metaWindow = windowActor.get_meta_window();
            if (metaWindow) {
                this._trackedWindows.add(metaWindow);
            }
        });

        // Lắng nghe sự kiện window-created từ display
        const display = global.display;
        this._windowCreatedId = display.connect('window-created', (display, metaWindow) => {
            this._onWindowCreated(metaWindow);
        });

        // Đánh dấu đã khởi tạo xong sau 1 giây
        imports.mainloop.timeout_add(1000, () => {
            this._isInitializing = false;
            return false;
        });
    }

    _onWindowCreated(metaWindow) {
        if (this._destroyed || this._isInitializing) return;

        // Bỏ qua nếu đã track window này
        if (this._trackedWindows.has(metaWindow)) return;
        this._trackedWindows.add(metaWindow);

        // Bỏ qua các loại window không cần thiết
        const windowType = metaWindow.get_window_type();
        if (windowType !== 0) { // 0 = META_WINDOW_NORMAL
            return;
        }

        // Lấy thông tin app
        const app = this._windowTracker.get_window_app(metaWindow);
        if (!app) return;

        const appName = app.get_name();
        const appIcon = app.get_icon();
        const windowTitle = metaWindow.get_title();

        // Cleanup khi window bị destroy
        metaWindow.connect('unmanaged', () => {
            this._trackedWindows.delete(metaWindow);
            this._notifyCallbacks({
                event: 'closed',
                appName: appName || 'Unknown App',
                windowTitle: windowTitle || '',
                appIcon: appIcon,
                metaWindow: metaWindow
            });
        });

        // Notify callbacks
        this._notifyCallbacks({
            event: 'launched',
            appName: appName || 'Unknown App',
            windowTitle: windowTitle || '',
            appIcon: appIcon,
            metaWindow: metaWindow
        });
    }

    addCallback(callback) {
        this._callbacks.push(callback);
    }

    _notifyCallbacks(info) {
        this._callbacks.forEach(cb => cb(info));
    }

    destroy() {
        this._destroyed = true;

        if (this._windowCreatedId) {
            global.display.disconnect(this._windowCreatedId);
            this._windowCreatedId = null;
        }

        this._windowTracker = null;
        this._trackedWindows.clear();
        this._callbacks = [];
    }
}