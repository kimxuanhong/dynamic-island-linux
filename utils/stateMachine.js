// ============================================
// STATE MACHINE - Quản lý trạng thái
// ============================================
var NotchStateMachine = class NotchStateMachine {
    constructor() {
        this._state = 'compact'; // compact, expanded, animating
        this._listeners = [];
    }

    getState() {
        return this._state;
    }

    isCompact() {
        return this._state === 'compact';
    }

    isExpanded() {
        return this._state === 'expanded';
    }

    isAnimating() {
        return this._state === 'animating';
    }

    transitionTo(newState) {
        if (this._state === newState) return false;
        const oldState = this._state;
        this._state = newState;
        this._notifyListeners(oldState, newState);
        return true;
    }

    _notifyListeners(oldState, newState) {
        this._listeners.forEach(cb => cb(oldState, newState));
    }
}

