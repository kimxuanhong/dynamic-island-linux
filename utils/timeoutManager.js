import GLib from 'gi://GLib';

// ============================================
// TIMEOUT MANAGER - Quản lý timeouts tập trung
// ============================================
export class TimeoutManager {
    constructor() {
        this._timeouts = new Map();
    }

    set(key, delay, callback) {
        this.clear(key);
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._timeouts.delete(key);
            callback();
            return GLib.SOURCE_REMOVE;
        });
        this._timeouts.set(key, id);
        return id;
    }

    clear(key) {
        const id = this._timeouts.get(key);
        if (id) {
            GLib.Source.remove(id);
            this._timeouts.delete(key);
        }
    }

    clearAll() {
        this._timeouts.forEach((id, key) => {
            GLib.Source.remove(id);
        });
        this._timeouts.clear();
    }

    has(key) {
        return this._timeouts.has(key);
    }
}
