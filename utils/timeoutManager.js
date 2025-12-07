// ============================================
// TIMEOUT MANAGER - Quản lý timeouts tập trung
// ============================================
var TimeoutManager = class TimeoutManager {
    constructor() {
        this._timeouts = new Map();
    }

    set(key, delay, callback) {
        this.clear(key);
        const id = imports.mainloop.timeout_add(delay, () => {
            this._timeouts.delete(key);
            callback();
            return false;
        });
        this._timeouts.set(key, id);
        return id;
    }

    clear(key) {
        const id = this._timeouts.get(key);
        if (id) {
            imports.mainloop.source_remove(id);
            this._timeouts.delete(key);
        }
    }

    clearAll() {
        this._timeouts.forEach((id, key) => {
            imports.mainloop.source_remove(id);
        });
        this._timeouts.clear();
    }

    has(key) {
        return this._timeouts.has(key);
    }
}

