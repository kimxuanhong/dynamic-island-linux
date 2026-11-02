import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class DynamicIslandPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._dynamicIslandSettings = settings;

        const page = new Adw.PreferencesPage({
            title: 'Dynamic Island',
            icon_name: 'preferences-system-symbolic',
        });
        const group = new Adw.PreferencesGroup({title: 'Appearance'});
        page.add(group);

        const opacityRow = new Adw.SpinRow({
            title: 'Background Opacity',
            subtitle: 'Percent; text and icons remain fully visible',
            adjustment: new Gtk.Adjustment({lower: 0, upper: 100, step_increment: 5}),
        });
        settings.bind('background-opacity', opacityRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(opacityRow);

        const sizeRow = new Adw.ComboRow({
            title: 'Island Size',
            model: Gtk.StringList.new(['Small', 'Normal', 'Large']),
        });
        const sizes = ['small', 'normal', 'large'];
        sizeRow.selected = sizes.indexOf(settings.get_string('island-size'));
        sizeRow.connect('notify::selected', row => settings.set_string('island-size', sizes[row.selected]));
        window.connect('close-request', () => {
            settings.disconnect(sizeSignal);
            return false;
        });
        const sizeSignal = settings.connect('changed::island-size', () => {
            sizeRow.selected = sizes.indexOf(settings.get_string('island-size'));
        });
        group.add(sizeRow);

        const hideDateRow = new Adw.SwitchRow({
            title: 'Hide Date Panel',
            subtitle: 'Hide the clock and calendar button in the top panel',
        });
        settings.bind(
            'hide-datepanel', hideDateRow, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        group.add(hideDateRow);

        const positionModel = new Gtk.StringList();
        for (const label of ['Left', 'Center', 'Right'])
            positionModel.append(label);

        const positions = ['left', 'center', 'right'];
        const positionRow = new Adw.ComboRow({
            title: 'Date Panel Position',
            model: positionModel,
            selected: Math.max(
                0,
                positions.indexOf(settings.get_string('datepanel-position'))
            ),
        });
        positionRow.connect('notify::selected', row => {
            settings.set_string('datepanel-position', positions[row.selected]);
        });
        group.add(positionRow);

        const marginRow = new Adw.SpinRow({
            title: 'Top Margin',
            subtitle: 'Distance from the top edge in pixels',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 100,
                step_increment: 1,
                page_increment: 5,
            }),
            value: settings.get_int('notch-margin-top'),
        });
        marginRow.connect('notify::value', row => {
            settings.set_int('notch-margin-top', Math.round(row.value));
        });
        group.add(marginRow);

        const idleValues = ['auto', 'battery', 'media', 'clock', 'hidden'];
        const idleRow = new Adw.ComboRow({
            title: 'Idle Content',
            subtitle: 'Choose what stays visible between events; privacy indicators still appear',
            model: Gtk.StringList.new(['Automatic', 'Battery if present', 'Media only', 'Clock', 'Hidden']),
            selected: idleValues.indexOf(settings.get_string('idle-content')),
        });
        idleRow.connect('notify::selected', row => settings.set_string('idle-content', idleValues[row.selected]));
        const idleSignal = settings.connect('changed::idle-content', () => {
            idleRow.selected = idleValues.indexOf(settings.get_string('idle-content'));
        });
        window.connect('close-request', () => {
            settings.disconnect(idleSignal);
            return false;
        });
        group.add(idleRow);

        const levels = new Adw.PreferencesGroup({title: 'Volume and Brightness'});
        page.add(levels);
        for (const [key, title, subtitle] of [
            ['show-volume', 'Show Volume', 'Show output volume changes in the island'],
            ['show-brightness', 'Show Brightness', 'Show screen brightness changes in the island'],
            ['hide-system-osd', 'Replace System Overlays', 'Replace enabled volume and brightness overlays; other system overlays remain visible'],
        ]) {
            const row = new Adw.SwitchRow({title, subtitle});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            levels.add(row);
        }
        const duration = new Adw.SpinRow({
            title: 'Display Time', subtitle: 'Seconds before volume or brightness closes',
            adjustment: new Gtk.Adjustment({lower: 1, upper: 10, step_increment: 1}),
        });
        settings.bind('level-display-time', duration, 'value', Gio.SettingsBindFlags.DEFAULT);
        levels.add(duration);

        const events = new Adw.PreferencesGroup({title: 'Notifications and Windows'});
        page.add(events);
        const windowRow = new Adw.SwitchRow({title: 'Window Open and Close Events',
            subtitle: 'Temporary events for new or closed windows; not a running app list'});
        settings.bind('show-window-events', windowRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        events.add(windowRow);
        for (const [key, title, values, labels] of [
            ['notification-style', 'Notification Style', ['off', 'icon', 'card'], ['Off', 'Flying icon', 'Expanded card']],
            ['notification-icon', 'Flying Icon', ['app', 'mail', 'airplane'], ['Application icon', 'Mail', 'Airplane']],
        ]) {
            const row = new Adw.ComboRow({title, model: Gtk.StringList.new(labels),
                selected: values.indexOf(settings.get_string(key))});
            row.connect('notify::selected', () => settings.set_string(key, values[row.selected]));
            const id = settings.connect(`changed::${key}`, () => { row.selected = values.indexOf(settings.get_string(key)); });
            window.connect('close-request', () => { settings.disconnect(id); return false; });
            events.add(row);
        }
        for (const [key, title, lower, upper, step] of [
            ['notification-animation-duration', 'Flying Icon Duration (ms)', 200, 3000, 100],
            ['notification-display-time', 'Card Display Time (seconds)', 1, 10, 1],
        ]) {
            const row = new Adw.SpinRow({title,
                adjustment: new Gtk.Adjustment({lower, upper, step_increment: step})});
            settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
            events.add(row);
        }

        const connections = new Adw.PreferencesGroup({title: 'Connections'});
        page.add(connections);
        for (const [key, title] of [['show-network', 'Wi-Fi and Ethernet Events'], ['show-bluetooth', 'Bluetooth Events']]) {
            const row = new Adw.SwitchRow({title});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            connections.add(row);
        }

        const privacy = new Adw.PreferencesGroup({title: 'Privacy Indicators',
            description: 'Exclusions affect only the island. Enter exact app IDs, process names, or reported app names, separated by commas.'});
        page.add(privacy);
        for (const [key, title] of [
            ['microphone-excluded-apps', 'Microphone Excluded Apps'],
            ['camera-excluded-apps', 'Camera Excluded Apps'],
        ]) {
            const row = new Adw.EntryRow({title, text: settings.get_strv(key).join(', '),
                show_apply_button: true});
            row.connect('apply', () => settings.set_strv(key,
                [...new Set(row.text.split(',').map(value => value.trim()).filter(Boolean))]));
            privacy.add(row);
        }

        window.add(page);
    }
}
