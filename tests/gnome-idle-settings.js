import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
export const METRICS = {};
export async function run() {
    const extension = Main.extensionManager.lookup('dynamic-island@xuanhong');
    for (let i = 0; i < 20 && !extension?.stateObj; i++)
        await Scripting.sleep(250);
    const e = extension?.stateObj;
    if (!e) throw new Error('Extension failed');
    Main.overview.hide();
    await Scripting.sleep(1000);
    const c = e._notchController;
    const s = e._settings;
    const settle = () => Scripting.sleep(100);
    c._onBatteryChanged({isPresent: true, percentage: 75, isCharging: false});
    c.cycleManager.activate('media');
    for (const [mode, count, current] of [
        ['battery', 1, 'battery'], ['media', 1, 'media'], ['clock', 1, 'clock'], ['hidden', 0, null],
    ]) {
        s.set_string('idle-content', mode);
        await settle();
        if (c.cycleManager.count() !== count || c.cycleManager.current() !== current ||
            c.notch.visible !== (count > 0))
            throw new Error(`Idle mode failed: ${mode}`);
        if (!c.cycleManager.has('battery') || !c.cycleManager.has('media'))
            throw new Error('Idle filter discarded active data');
    }
    c.cycleManager.activate('recording');
    c.layoutManager.updateLayout();
    if (!c.notch.visible || c.cycleManager.current() !== 'recording')
        throw new Error('Hidden idle mode hid privacy indicator');
    c.cycleManager.deactivate('recording');
    s.set_string('idle-content', 'clock');
    await settle();
    if (!/^\d\d:\d\d$/.test(c._clockLabel.text) || !c._clockTimer)
        throw new Error('Clock not running');
    c._onVolumeChanged({volume: 42, isMuted: false});
    await Scripting.sleep(500);
    if (!c.notch.visible || c._clockLabel.visible)
        throw new Error('Temporary event did not replace clock');
    c.compactNotch(true);
    await Scripting.sleep(900);
    if (!c._clockLabel.visible) throw new Error('Clock did not return');
    s.set_string('idle-content', 'auto');
    await settle();
    if (c.cycleManager.count() !== 2 || c._clockTimer || !c.secondaryNotch.visible)
        throw new Error('Automatic mode did not restore split layout');
    e.disable();
    if (c._clockTimer || c._idleSignal) throw new Error('Clock cleanup failed');
    print('DYNAMIC_ISLAND_IDLE_SETTINGS_PASS');
}
