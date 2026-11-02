export class CycleManager {
    constructor() {
        this._items = [];
        this._currentPos = -1;
    }

    activate(obj) {
        const existingIndex = this._items.indexOf(obj);

        if (existingIndex !== -1) {
            // Re-activate: xóa rồi thêm lại cuối
            this._items.splice(existingIndex, 1);
        }

        // Luôn thêm vào cuối và SET làm current
        this._items.push(obj);
        this._currentPos = this._items.length - 1;
    }

    deactivate(obj) {
        const index = this._items.indexOf(obj);
        if (index === -1) return;

        this._items.splice(index, 1);

        if (this._items.length === 0) {
            this._currentPos = -1;
        } else if (this._currentPos >= this._items.length) {
            // Current vượt quá range → clamp về cuối
            this._currentPos = this._items.length - 1;
        }
    }

    setFilter(filter) {
        this._filter = filter;
    }

    _visibleItems() {
        return this._items.filter(item => !this._filter || this._filter(item));
    }

    current() {
        const items = this._visibleItems();
        const selected = this._items[this._currentPos];
        return items.includes(selected) ? selected : (items[0] ?? null);
    }

    next() {
        const next = this.getNext();
        if (next !== null) this._currentPos = this._items.indexOf(next);
        return next;
    }

    getNext() {
        const items = this._visibleItems();
        if (!items.length) return null;
        return items[(items.indexOf(this.current()) + 1) % items.length];
    }

    count() {
        return this._visibleItems().length;
    }

    has(name) {
        return this._items.indexOf(name) !== -1;
    }
}
