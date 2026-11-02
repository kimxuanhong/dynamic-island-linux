import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
export const METRICS = {};
export async function run() {
    const extension = Main.extensionManager.lookup('dynamic-island@xuanhong');
    for (let i = 0; i < 20 && !extension?.stateObj; i++) await Scripting.sleep(250);
    const e = extension?.stateObj;
    if (!e) throw new Error('Extension failed');
    Main.overview.hide();
    await Scripting.sleep(1000);
    const c = e._notchController;
    const s = e._settings;
    c._onBatteryChanged({isPresent: true, percentage: 75, isCharging: false});
    const assertSelection = (items, label) => {
        const actual = c.cycleManager._visibleItems();
        if (actual.length !== items.length || items.some(item => !actual.includes(item)))
            throw new Error(`${label}: expected ${items}, got ${actual}`);
        if (c.notch.visible !== (items.length > 0)) throw new Error(`${label}: visibility mismatch`);
    };
    for (const mode of ['battery', 'clock', 'network-speed', 'hidden']) {
        s.set_string('default-content', mode);
        await Scripting.sleep(100);
        assertSelection(mode === 'hidden' ? [] : [mode], `${mode} fallback`);
        for (const activity of ['media', 'recording', 'camera', 'uxplay']) {
            c.cycleManager.activate(activity);
            c.layoutManager.updateLayout();
            assertSelection([activity], `${activity} replaces ${mode}`);
            if (c.secondaryNotch.visible) throw new Error('Default content leaked into secondary notch');
            c.cycleManager.deactivate(activity);
            c.layoutManager.updateLayout();
            assertSelection(mode === 'hidden' ? [] : [mode], `${mode} restored after ${activity}`);
        }
        c.cycleManager.activate('media');
        c.cycleManager.activate('recording');
        c.layoutManager.updateLayout();
        assertSelection(['media', 'recording'], `${mode} concurrent activities`);
        if (!c.secondaryNotch.visible || c.cycleManager.getNext() === mode)
            throw new Error('Two-notch sequence includes fallback');
        c.cycleManager.next();
        c.layoutManager.updateLayout();
        assertSelection(['media', 'recording'], 'Cycling activities');
        c.cycleManager.deactivate('media');
        c.layoutManager.updateLayout();
        assertSelection(['recording'], 'Mic remains after media stops');
        c.cycleManager.deactivate('recording');
        c.layoutManager.updateLayout();
    }
    s.set_string('default-content', 'battery');
    c._onBatteryChanged({isPresent: false, percentage: 0, isCharging: false});
    assertSelection([], 'No battery fallback');
    s.set_string('default-content', 'clock');
    if (!/^\d\d:\d\d$/.test(c._clockLabel.text)) throw new Error('Clock not running');
    c._onVolumeChanged({volume: 42, isMuted: false});
    await Scripting.sleep(500);
    if (!c.notch.visible || c._clockLabel.visible) throw new Error('Temporary event did not replace clock');
    c.compactNotch(true);
    await Scripting.sleep(900);
    if (!c._clockLabel.visible) throw new Error('Clock did not return');
    s.set_string('default-content', 'network-speed');
    await Scripting.sleep(1500);
    if (!c.networkSpeedManager._previous || !c.networkSpeedView._download.text.startsWith('↓ '))
        throw new Error('Network speed sampling did not run');
    // Real media updates must replace the default immediately, before metadata expansion.
    c.mediaManager._updateMediaState({player: 'org.mpris.MediaPlayer2.test', status: 'Playing',
        title: 'Track', artist: 'Artist', length: 120000000, position: 1000000});
    await Scripting.sleep(100);
    assertSelection(['media'], 'Playing media immediately replaces speed');
    c._dismissMedia();
    await Scripting.sleep(900);
    assertSelection(['network-speed'], 'Speed returns after media disappears');
    s.set_string('default-content', 'hidden');
    if (c.networkSpeedManager._timer) throw new Error('Unused speed polling still running');
    e.disable();
    if (c._clockTimer || c._defaultSignal) throw new Error('Default content cleanup failed');
    print('DYNAMIC_ISLAND_DEFAULT_CONTENT_PASS');
}
