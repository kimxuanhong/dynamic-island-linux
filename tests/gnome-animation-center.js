import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
export const METRICS = {};
export async function run() {
    const extension = Main.extensionManager.lookup('dynamic-island@xuanhong');
    for (let i = 0; i < 20 && !extension?.stateObj; i++) await Scripting.sleep(250);
    const e = extension?.stateObj;
    if (!e) throw new Error('Extension failed');
    const c = e._notchController;
    Main.overview.hide();
    await Scripting.sleep(1000);
    const center = actor => actor.get_transformed_position()[0] + actor.get_transformed_size()[0] / 2;
    const sample = async (actors, centers, label, frames = 32) => {
        for (let i = 0; i < frames; i++) {
            await Scripting.sleep(20);
            for (let a = 0; a < actors.length; a++) {
                const drift = Math.abs(center(actors[a]) - centers[a]);
                if (drift > 1) throw new Error(`${label}: actor ${a} drifted ${drift.toFixed(2)} px`);
            }
        }
    };
    c._onBatteryChanged({isPresent: true, percentage: 75, isCharging: false});
    for (const size of ['small', 'normal', 'large']) {
        e._settings.set_string('island-size', size);
        await Scripting.sleep(100);
        c.squeeze();
        await sample([c.notch], [c.monitorWidth / 2], `${size} squeeze`);
        c._onVolumeChanged({volume: 42, isMuted: false});
        await sample([c.notch], [c.monitorWidth / 2], `${size} expansion`);
        c.compactNotch(true);
        await sample([c.notch], [c.monitorWidth / 2], `${size} collapse`, 42);
        c.cycleManager.activate('media');
        c.layoutManager.updateLayout();
        await Scripting.sleep(100);
        const centers = [center(c.notch), center(c.secondaryNotch)];
        c.squeeze();
        await sample([c.notch, c.secondaryNotch], centers, `${size} split squeeze`);
        c.cycleManager.deactivate('media');
        c.layoutManager.updateLayout();
    }
    e._settings.set_string('island-size', 'small');
    c.squeeze();
    await Scripting.sleep(100);
    e._settings.set_string('island-size', 'large');
    await sample([c.notch], [c.monitorWidth / 2], 'resize during squeeze');
    if (Math.abs(c.notch.scale_x - 1.15) > 0.001)
        throw new Error('Squeeze restored stale size');
    c._onVolumeChanged({volume: 42, isMuted: false});
    await Scripting.sleep(80);
    e._settings.set_string('island-size', 'normal');
    await sample([c.notch], [c.monitorWidth / 2], 'resize during expansion');
    c.compactNotch(true);
    await Scripting.sleep(80);
    e._settings.set_string('island-size', 'small');
    await sample([c.notch], [c.monitorWidth / 2], 'resize during collapse', 42);
    if (Math.abs(c.notch.scale_x - 0.85) > 0.001)
        throw new Error('Collapse restored stale size');
    e.disable();
    print('DYNAMIC_ISLAND_ANIMATION_CENTER_PASS');
}
