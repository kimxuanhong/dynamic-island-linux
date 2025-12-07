// ============================================
// PRESENTER REGISTRY - Strategy Pattern cho Presenters
// ============================================
var PresenterRegistry = class PresenterRegistry {
    constructor(controller) {
        this.controller = controller;
        this._currentPresenter = null;
        this._presenters = new Map();
    }

    register(name, presenter) {
        this._presenters.set(name, presenter);
    }

    getCurrent() {
        return this._currentPresenter;
    }

    switchTo(name) {
        if (this._currentPresenter === name) return false;

        const oldPresenter = this._currentPresenter;
        this._currentPresenter = name;
        const presenter = this._presenters.get(name);

        if (presenter && presenter.onActivate) {
            presenter.onActivate(oldPresenter);
        }

        return true;
    }

    getPresenter(name) {
        return this._presenters.get(name);
    }

}

