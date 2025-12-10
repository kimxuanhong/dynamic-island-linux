var CycleManager = class CycleManager {
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

    current() {
        if (this._currentPos === -1 || this._items.length === 0) {
            return null;
        }
        this._currentPos = Math.min(this._currentPos, this._items.length - 1);
        return this._items[this._currentPos];
    }

    next() {
        if (this._items.length === 0) return null;
        if (this._items.length === 1) return this._items[0];

        this._currentPos = (this._currentPos + 1) % this._items.length;
        return this._items[this._currentPos];
    }

    getNext() {
        if (this._items.length <= 1) return this.current();

        const nextPos = (this._currentPos + 1) % this._items.length;
        return this._items[nextPos];
    }

    count() {
        return this._items.length;
    }

    has(name) {
        return this._items.indexOf(name) !== -1;
    }
}