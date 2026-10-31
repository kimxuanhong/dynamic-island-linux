import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// Public session-bus signal shared by cooperating input methods.
export class InputMethodManager {
    constructor() {
        this._callbacks = [];
        this._connection = Gio.DBus.session;
        this._subscription = this._connection.signal_subscribe(
            null, 'com.github.dynamic_island.InputMethod', 'Activated',
            '/com/github/dynamic_island/InputMethod', null,
            Gio.DBusSignalFlags.NONE,
            (_connection, _sender, _path, _interface, _signal, parameters) => {
                if (!parameters.is_of_type(new GLib.VariantType('(sss)')))
                    return;
                const [id, name, icon] = parameters.deep_unpack();
                if (!id || !name)
                    return;
                for (const callback of this._callbacks)
                    callback({id, name: name.slice(0, 128), icon});
            });
    }

    addCallback(callback) {
        this._callbacks.push(callback);
    }

    destroy() {
        this._connection.signal_unsubscribe(this._subscription);
        this._callbacks = [];
    }
}
