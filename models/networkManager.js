import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

export class NetworkManager {
    constructor() {
        this._callbacks = [];
        this._stateCallbacks = [];
        this._signals = [];
        this._connectionSignals = [];
        this._cancellable = new Gio.Cancellable();
        this._destroyed = false;
        this._init();
    }

    async _init() {
        try {
            const {default: NM} = await import('gi://NM');
            this._nm = NM;
            if (this._destroyed) return;
            const client = await new Promise((resolve, reject) => {
                NM.Client.new_async(this._cancellable, (_source, result) => {
                    try { resolve(NM.Client.new_finish(result)); } catch (error) { reject(error); }
                });
            });
            if (this._destroyed) return;
            this._client = client;
            this._activatedState = NM.ActiveConnectionState.ACTIVATED;
            for (const signal of ['notify::primary-connection', 'notify::active-connections', 'notify::nm-running'])
                this._signals.push(client.connect(signal, () => this._watchConnections()));
            this._watchConnections(true);
        } catch (error) {
            // NetworkManager is optional; other island features remain usable.
            if (!this._destroyed) console.debug(`Dynamic Island network monitor unavailable: ${error.message}`);
        }
    }

    _watchConnections(initial = false) {
        for (const [connection, id] of this._connectionSignals) GObject.signal_handler_disconnect(connection, id);
        this._connectionSignals = [];
        for (const connection of this._client.get_active_connections()) {
            this._connectionSignals.push([connection,
                connection.connect('notify::state', () => this._schedule())]);
            for (const device of connection.get_devices?.() ?? []) {
                if (typeof device.get_active_access_point !== 'function') continue;
                this._connectionSignals.push([device, device.connect('notify::active-access-point', () => this._watchConnections())]);
                const ap = device.get_active_access_point();
                if (ap) this._connectionSignals.push([ap, ap.connect('notify::ssid', () => this._schedule())]);
            }
        }
        if (initial) this._acceptSnapshot(this._readSnapshot());
        else this._schedule();
    }

    _schedule() {
        if (this._timer) GLib.source_remove(this._timer);
        // Coalesce the intermediate disconnect/connect states of route changes.
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 700, () => {
            this._timer = 0;
            if (!this._destroyed) this._acceptSnapshot(this._readSnapshot());
            return GLib.SOURCE_REMOVE;
        });
    }

    _readSnapshot() {
        const physical = connection => connection &&
            ['802-3-ethernet', '802-11-wireless'].includes(connection.get_connection_type()) &&
            connection.get_state() === this._activatedState;
        const primary = this._client.get_primary_connection();
        const connection = physical(primary) ? primary
            : this._client.get_active_connections().find(physical);
        if (!connection) return {connected: false, kind: '', name: ''};
        const wifi = connection.get_connection_type() === '802-11-wireless';
        let ssid = '';
        if (wifi) {
            for (const device of connection.get_devices?.() ?? []) {
                const bytes = device.get_active_access_point?.()?.get_ssid();
                if (!bytes) continue;
                ssid = this._nm?.utils_ssid_to_utf8(bytes.get_data()) ?? '';
                if (ssid) break;
            }
        }
        return {connected: true, kind: wifi ? 'wifi' : 'wired', name: ssid || connection.get_id()};
    }

    _acceptSnapshot(snapshot) {
        const previous = this._last;
        this._last = snapshot;
        if (previous && JSON.stringify(previous) === JSON.stringify(snapshot)) return;
        for (const cb of this._stateCallbacks) cb(snapshot);
        if (!previous) return;
        const info = snapshot.connected ? snapshot : {...previous, connected: false};
        for (const cb of this._callbacks) cb(info);
    }

    addCallback(callback) { this._callbacks.push(callback); }
    addStateCallback(callback) {
        this._stateCallbacks.push(callback);
        if (this._last) callback(this._last);
    }

    destroy() {
        this._destroyed = true;
        this._cancellable.cancel();
        if (this._timer) GLib.source_remove(this._timer);
        this._timer = 0;
        for (const id of this._signals) GObject.signal_handler_disconnect(this._client, id);
        for (const [connection, id] of this._connectionSignals) GObject.signal_handler_disconnect(connection, id);
        this._signals = [];
        this._connectionSignals = [];
        this._callbacks = [];
        this._stateCallbacks = [];
        this._client = null;
    }
}
