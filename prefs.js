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

        window.add(page);
    }
}
