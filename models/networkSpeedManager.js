import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {parseNetworkCounters, networkRate} from '../utils/networkRate.js';

export class NetworkSpeedManager {
    constructor() {
        this._callbacks = [];
        this._generation = 0;
    }

    addCallback(callback) { this._callbacks.push(callback); }

    setEnabled(enabled) {
        if (enabled === Boolean(this._timer)) return;
        this._generation++;
        this._cancellable?.cancel();
        if (this._timer) GLib.source_remove(this._timer);
        this._timer = 0;
        this._previous = null;
        if (!enabled) return;
        this._cancellable = new Gio.Cancellable();
        this._sample();
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._sample();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _sample() {
        if (this._readingGeneration === this._generation) return;
        const generation = this._generation;
        this._readingGeneration = generation;
        Gio.File.new_for_path('/proc/net/dev').load_contents_async(this._cancellable, (file, result) => {
            if (generation !== this._generation) return;
            this._readingGeneration = null;
            try {
                const [, bytes] = file.load_contents_finish(result);
                const now = GLib.get_monotonic_time() / 1e6;
                // Count physical interfaces once; don't double count VPNs,
                // bridges, containers, or loopback traffic.
                const current = parseNetworkCounters(new TextDecoder().decode(bytes), name =>
                    Gio.File.new_for_path(`/sys/class/net/${name}/device`).query_exists(null));
                const rate = networkRate(this._previous, current, now - (this._time ?? now));
                this._previous = current;
                this._time = now;
                for (const cb of this._callbacks) cb({...rate, available: true});
            } catch {
                this._previous = null;
                for (const cb of this._callbacks) cb({rx: 0, tx: 0, available: false});
            }
        });
    }

    destroy() {
        this.setEnabled(false);
        this._callbacks = [];
    }
}
