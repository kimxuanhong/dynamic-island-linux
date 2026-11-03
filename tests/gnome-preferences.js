import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
export const METRICS = {};
export async function run() {
    const extension = Main.extensionManager.lookup('dynamic-island@xuanhong');
    for (let i = 0; i < 20 && !extension?.stateObj; i++) await Scripting.sleep(250);
    if (!extension?.stateObj) throw new Error('Extension failed');
    Main.overview.hide();
    Gio.Subprocess.new(['gnome-extensions', 'prefs', 'dynamic-island@xuanhong'], Gio.SubprocessFlags.NONE);
    let window;
    for (let i = 0; i < 30; i++) {
        await Scripting.sleep(250);
        window = global.get_window_actors().map(actor => actor.meta_window)
            .find(w => w.get_title()?.includes('Dynamic Island'));
        if (window) break;
    }
    if (!window) throw new Error('Preferences window did not open');
    window.delete(global.get_current_time());
    await Scripting.sleep(300);
    extension.stateObj.disable();
    print('DYNAMIC_ISLAND_PREFERENCES_PASS');
}
