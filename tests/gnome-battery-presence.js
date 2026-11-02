import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
export const METRICS = {};
export async function run() {
    const extension = Main.extensionManager.lookup('dynamic-island@xuanhong');
    for (let i = 0; i < 20 && !extension?.stateObj; i++)
        await Scripting.sleep(250);
    const c = extension?.stateObj?._notchController;
    if (!c) throw new Error('Extension failed');
    Main.overview.hide();
    await Scripting.sleep(1000);
    const battery = {percentage: 75, isCharging: false, isPresent: true};
    c._onBatteryChanged(battery);
    if (!c.cycleManager.has('battery') || !c.notch.visible)
        throw new Error('Present battery should show island');
    c._onBatteryChanged({...battery, isPresent: false});
    if (c.cycleManager.has('battery') || c.notch.visible || c.secondaryNotch.visible)
        throw new Error('Absent battery should hide idle island');
    c._onVolumeChanged({volume: 42, isMuted: false});
    await Scripting.sleep(800);
    if (!c.notch.visible) throw new Error('Volume should show island without battery');
    c.compactNotch(true);
    await Scripting.sleep(1000);
    if (c.notch.visible) throw new Error('Island should hide after temporary event');
    c._onBatteryChanged(battery);
    if (!c.notch.visible) throw new Error('Battery return should restore island');
    extension.stateObj.disable();
    print('DYNAMIC_ISLAND_BATTERY_PRESENCE_PASS');
}
