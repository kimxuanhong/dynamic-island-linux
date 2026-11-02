import Gio from 'gi://Gio';
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
    const manager = Main.osdWindowManager;
    e._osdInjection.clear();
    const original = manager._showOsdWindow;
    let fallback = 0;
    const spy = () => fallback++;
    manager._showOsdWindow = spy;
    e._setupSystemOsd();
    const show = (name, level = 0.42) => manager._showOsdWindow(0,
        new Gio.ThemedIcon({name}), null, level, 1);
    try {
        s.set_boolean('hide-system-osd', true);
        s.set_boolean('show-volume', false);
        c._onVolumeChanged({volume: 42, isMuted: false});
        if (c.presenterRegistry.getCurrent() === 'volume')
            throw new Error('Disabled volume was shown');
        show('audio-volume-high-symbolic');
        if (fallback !== 1) throw new Error('Disabled volume lost native OSD');
        show('audio-input-microphone-symbolic');
        if (fallback !== 2) throw new Error('Microphone OSD was suppressed');
        s.set_boolean('show-volume', true);
        s.set_int('level-display-time', 1);
        show('audio-volume-high-symbolic');
        await Scripting.sleep(500);
        if (fallback !== 2 || !c.notch.visible || c.volumeView.valueLabel.text !== '42%')
            throw new Error('Volume replacement failed');
        s.set_boolean('show-volume', false);
        await Scripting.sleep(900);
        if (c.notch.visible || c._expansionQueue.some(event => event.presenterName === 'volume'))
            throw new Error('Disabling visible volume did not dismiss it');
        show('display-brightness-symbolic', 0.65);
        await Scripting.sleep(500);
        if (fallback !== 2 || c.brightnessView.valueLabel.text !== '65%')
            throw new Error('Brightness replacement failed');
        await Scripting.sleep(1600);
        if (c.notch.visible) throw new Error('Configured display time was ignored');
        s.set_boolean('show-brightness', false);
        show('display-brightness-symbolic');
        s.set_boolean('hide-system-osd', false);
        s.set_boolean('show-volume', true);
        show('audio-volume-high-symbolic');
        if (fallback !== 4) throw new Error('Native OSD fallback failed');
        e.disable();
        if (manager._showOsdWindow !== spy)
            throw new Error('Disable did not restore original OSD method');
        print('DYNAMIC_ISLAND_LEVEL_SETTINGS_PASS');
    } finally {
        e._osdInjection?.clear();
        manager._showOsdWindow = original;
    }
}
