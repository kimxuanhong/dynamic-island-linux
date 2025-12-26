const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const { GObject, Gtk } = imports.gi;

function init() {
    // No translations needed
}

const DynamicIslandPrefsWidget = GObject.registerClass(
    class DynamicIslandPrefsWidget extends Gtk.Box {
        _init(params) {
            super._init(params);
            this.margin = 20;
            this.spacing = 20;
            this.orientation = Gtk.Orientation.VERTICAL;

            this._settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.dynamic-island');

            // Title
            const titleLabel = new Gtk.Label({
                label: '<b>Dynamic Island Settings</b>',
                use_markup: true,
                halign: Gtk.Align.START
            });
            this.append(titleLabel);

            // Hide Date Panel setting
            const datePanelBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 10,
                margin_top: 10
            });

            const datePanelLabel = new Gtk.Label({
                label: 'Hide Date Panel:',
                halign: Gtk.Align.START,
                hexpand: true
            });
            datePanelBox.append(datePanelLabel);

            const datePanelSwitch = new Gtk.Switch({
                halign: Gtk.Align.END,
                active: this._settings.get_boolean('hide-datepanel')
            });
            datePanelSwitch.connect('notify::active', (sw) => {
                this._settings.set_boolean('hide-datepanel', sw.active);
            });
            datePanelBox.append(datePanelSwitch);

            this.append(datePanelBox);

            // Date Panel Position setting
            const positionBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 10,
                margin_top: 10
            });

            const positionLabel = new Gtk.Label({
                label: 'Date Panel Position:',
                halign: Gtk.Align.START
            });
            positionBox.append(positionLabel);

            const positionCombo = Gtk.ComboBoxText.new();
            positionCombo.append('left', 'Left');
            positionCombo.append('center', 'Center');
            positionCombo.append('right', 'Right');
            
            const currentPosition = this._settings.get_string('datepanel-position');
            positionCombo.set_active_id(currentPosition);
            
            positionCombo.connect('changed', (combo) => {
                const selectedId = combo.get_active_id();
                if (selectedId) {
                    this._settings.set_string('datepanel-position', selectedId);
                }
            });
            
            positionBox.append(positionCombo);
            this.append(positionBox);

            // Notch Top Margin
            const topMarginBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 10,
                margin_top: 10
            });

            const topMarginLabel = new Gtk.Label({
                label: 'Top Margin (px):',
                halign: Gtk.Align.START,
                hexpand: true
            });
            topMarginBox.append(topMarginLabel);

            const topMarginSpin = new Gtk.SpinButton({
                adjustment: new Gtk.Adjustment({
                    lower: 0,
                    upper: 100,
                    step_increment: 1,
                    page_increment: 5
                }),
                halign: Gtk.Align.END,
                value: this._settings.get_int('notch-margin-top')
            });
            topMarginSpin.connect('value-changed', (spin) => {
                this._settings.set_int('notch-margin-top', spin.get_value_as_int());
            });
            topMarginBox.append(topMarginSpin);
            this.append(topMarginBox);

            // Info label
            const infoLabel = new Gtk.Label({
                label: '<i>Note: Changes will take effect after reloading the extension.</i>',
                use_markup: true,
                halign: Gtk.Align.START,
                margin_top: 20,
                wrap: true
            });
            this.append(infoLabel);
        }
    }
);

function buildPrefsWidget() {
    return new DynamicIslandPrefsWidget();
}

