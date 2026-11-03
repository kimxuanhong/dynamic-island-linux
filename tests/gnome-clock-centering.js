import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
export const METRICS = {};
export async function run() {
    const extension = Main.extensionManager.lookup('dynamic-island@xuanhong');
    for (let i = 0; i < 20 && !extension?.stateObj; i++) await Scripting.sleep(250);
    const e = extension?.stateObj;
    if (!e) throw new Error('Extension failed');
    Main.overview.hide();
    const c = e._notchController;
    const view = c.clockView;
    e._settings.set_string('default-content', 'clock');
    await Scripting.sleep(1000);
    let checked = 0;
    const check = () => {
        if (!view.compactContainer.visible || !c.notch.visible || c.notch.width < 80) return;
        const [x] = c.notch.get_transformed_position();
        const [width] = c.notch.get_transformed_size();
        for (const actor of [view.compactLabel, view.compactLabel.clutter_text]) {
            const [tx] = actor.get_transformed_position();
            const [tw] = actor.get_transformed_size();
            if (Math.abs(tx + tw / 2 - x - width / 2) > 1)
                throw new Error(`Compact clock drifted: text center=${tx + tw / 2}, notch center=${x + width / 2}`);
        }
        checked++;
    };
    for (const width of [130, 280, 120, 188]) {
        e._settings.set_int('island-width', width);
        for (const [hour, minute] of [[11, 11], [23, 59], [0, 0], [18, 48]]) {
            view.updateClock(GLib.DateTime.new_local(2026, 11, 3, hour, minute, 0));
            await Scripting.sleep(35);
            check();
        }
    }
    if (view._weekday.text !== 'Tuesday' || view._date.text !== 'November 2026' ||
        view._monthButton.label !== 'November 2026' ||
        view._weekdayLabels.map(actor => actor.text).join(',') !== 'Mon,Tue,Wed,Thu,Fri,Sat,Sun')
        throw new Error('Clock calendar is not consistently English');
    c._onVolumeChanged({volume: 42, isMuted: false});
    await Scripting.sleep(400);
    c.compactNotch(true);
    for (let i = 0; i < 60; i++) { await Scripting.sleep(20); check(); }
    e._settings.set_string('default-content', 'hidden');
    await Scripting.sleep(650);
    e._settings.set_string('default-content', 'clock');
    for (let i = 0; i < 35; i++) { await Scripting.sleep(20); check(); }
    if (checked < 25) throw new Error('Insufficient visible compact frames checked');
    e.disable();
    print('DYNAMIC_ISLAND_CLOCK_CENTERING_PASS');
}
