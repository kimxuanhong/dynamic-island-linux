import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';

const directory = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_child('icons');
const cache = new Map();

// Use our own symbolic SVGs; application artwork supplied as a GIcon stays intact.
export const IslandIcon = GObject.registerClass(class IslandIcon extends St.Icon {
    _init(params = {}) {
        super._init(params);
        this.connect('notify::icon-name', () => this._useBundledIcon());
        this._useBundledIcon();
    }

    _useBundledIcon() {
        const name = this.icon_name;
        if (!name) return;
        if (!cache.has(name)) {
            const file = directory.get_child(`${name}.svg`);
            const asset = file.query_exists(null) ? file
                : directory.get_child('application-x-executable-symbolic.svg');
            cache.set(name, new Gio.FileIcon({file: asset}));
        }
        const icon = cache.get(name);
        if (icon) this.gicon = icon;
    }
});
