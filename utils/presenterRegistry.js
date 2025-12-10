var PresenterRegistry = class PresenterRegistry {
    constructor() {
        this._currentPresenter = null;
        this._items = new Map();
    }

    register(name, presenter) {
        if (this._items.has(name)) return;

        this._items.set(name, presenter);
    }

    getCurrent() {
        return this._currentPresenter;
    }

    getPresenter(name) {
        return this._items.get(name);
    }

    switchTo(name, force = false) {
        if (!force && this._currentPresenter === name) return false;
        this._currentPresenter = name;
        const presenter = this._items.get(name);
        if (presenter?.onActivate) {
            presenter.onActivate();
        }
        return true;
    }
}
