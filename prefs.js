const { Adw, Gio, Gtk } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

function init() {
    // No need to call initTranslations for simple extension
}

function fillPreferencesWindow(window) {
    const settings = ExtensionUtils.getSettings();
    
    const page = new Adw.PreferencesPage();
    const group = new Adw.PreferencesGroup({
        title: 'Notch Settings',
        description: 'Customize Dynamic Island appearance',
    });
    page.add(group);

    // Compact width factor - Simple slider row
    const compactWidthRow = new Adw.ActionRow({
        title: 'Compact Size',
        subtitle: 'Adjust the width of notch in compact mode (50% - 150%)',
    });
    
    const compactWidthScale = new Gtk.Scale({
        adjustment: new Gtk.Adjustment({
            lower: 0.5,
            upper: 1.5,
            step_increment: 0.1,
            page_increment: 0.1,
        }),
        draw_value: true,
        value_pos: Gtk.PositionType.RIGHT,
        digits: 1,
        hexpand: false,
        width_request: 200,
    });

    const currentCompactWidth = settings.get_double('compact-width-factor');
    compactWidthScale.set_value(currentCompactWidth);

    compactWidthScale.connect('value-changed', (scale) => {
        settings.set_double('compact-width-factor', scale.get_value());
    });

    // Add suffix widget more safely
    try {
        compactWidthRow.add_suffix(compactWidthScale);
    } catch (e) {
        log(`[DynamicIsland] Error adding suffix: ${e.message}`);
        // Fallback: add as child if add_suffix fails
        compactWidthRow.add_child(compactWidthScale);
    }
    group.add(compactWidthRow);

    // Date panel position toggle
    const dateToggleRow = new Adw.SwitchRow({
        title: 'Move Date Panel Right',
        subtitle: 'Move the date/clock panel to the right side',
    });

    const dateToggleState = settings.get_boolean('move-date-panel');
    dateToggleRow.set_active(dateToggleState);

    dateToggleRow.connect('notify::active', (row) => {
        settings.set_boolean('move-date-panel', row.get_active());
    });

    group.add(dateToggleRow);

    window.add(page);
}
