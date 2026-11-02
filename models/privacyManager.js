import Gio from 'gi://Gio';
import {PrivacyActivity} from '../utils/privacyActivity.js';

const ServerProxy = Gio.DBusProxy.makeProxyWrapper(`<node>
<interface name="com.github.dynamic_island.Server">
<signal name="EventOccurred"><arg type="s"/><arg type="s"/><arg type="i"/><arg type="s"/><arg type="s"/></signal>
</interface></node>`);

export class PrivacyManager {
    constructor(kind, settings = null) {
        this._kind = kind;
        this._settings = settings;
        this._callbacks = [];
        this._activity = new PrivacyActivity();
        this._destroyed = false;
        this._settingSignal = settings?.connect(`changed::${kind}-excluded-apps`, () => this._notify());
        this._serverProxy = new ServerProxy(Gio.DBus.session,
            'com.github.dynamic_island.Server', '/com/github/dynamic_island/Server',
            (proxy, error) => {
                if (error || this._destroyed) return;
                this._eventSignal = proxy.connectSignal('EventOccurred',
                    (_proxy, _sender, args) => this._onServerEvent(...args));
            });
    }

    _onServerEvent(eventType, appName, pid, _timestamp, metadata) {
        if (this._destroyed) return;
        const starts = this._kind === 'camera' ? ['camera_start'] : ['microphone_start', 'recording_started'];
        const stops = this._kind === 'camera' ? ['camera_stop'] : ['microphone_stop', 'recording_stopped'];
        if (!starts.includes(eventType) && !stops.includes(eventType)) return;
        let data = {};
        try { data = metadata ? JSON.parse(metadata) : {}; } catch { return; }
        this._activity.update(starts.includes(eventType), appName, pid, data);
        this._notify();
    }

    _info() {
        const apps = this._activity.visible(this._settings?.get_strv(`${this._kind}-excluded-apps`) ?? []);
        return {active: apps.length > 0,
            appName: [...new Set(apps.map(app => app.appName))].join(', '),
            startTime: apps.length ? Math.min(...apps.map(app => app.startTime)) : null};
    }

    _notify() {
        const info = this._info();
        const value = this._kind === 'camera'
            ? {...info, isCameraInUse: info.active}
            : {...info, isRecording: info.active};
        for (const cb of this._callbacks) cb(value);
    }

    addCallback(callback) { this._callbacks.push(callback); }
    removeCallback(callback) { this._callbacks = this._callbacks.filter(cb => cb !== callback); }

    destroy() {
        this._destroyed = true;
        if (this._settingSignal) this._settings.disconnect(this._settingSignal);
        if (this._eventSignal) this._serverProxy.disconnectSignal(this._eventSignal);
        this._callbacks = [];
        this._activity.sessions.clear();
        this._serverProxy = null;
    }
}
