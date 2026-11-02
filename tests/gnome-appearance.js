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
    const settings = extension.stateObj._settings;
    c._onBatteryChanged({isPresent: true, percentage: 75, isCharging: false});
    for (const [size, scale] of [['small', 0.85], ['large', 1.15], ['normal', 1]]) {
        settings.set_string('island-size', size);
        settings.set_int('background-opacity', 40);
        await Scripting.sleep(100);
        const [x, y] = c.notch.get_transformed_position();
        const [width] = c.notch.get_transformed_size();
        if (Math.abs(x + width / 2 - c.monitorWidth / 2) > 1 ||
            Math.abs(y - settings.get_int('notch-margin-top')) > 1 ||
            Math.abs(c.notch.scale_x - scale) > 0.001 ||
            !c.notch.get_style().includes('0.4'))
            throw new Error(`Appearance/position failed for ${size}`);
        c.cycleManager.activate('media');
        c.cycleManager.activate('recording');
        c.layoutManager.updateLayout();
        await Scripting.sleep(100);
        const [mainX] = c.notch.get_transformed_position();
        const [mainWidth] = c.notch.get_transformed_size();
        const [secondaryX] = c.secondaryNotch.get_transformed_position();
        if (Math.abs(secondaryX - mainX - mainWidth - 10 * scale) > 1)
            throw new Error(`Split gap failed for ${size}`);
        c.cycleManager.deactivate('media');
        c.cycleManager.deactivate('recording');
        c.layoutManager.updateLayout();
    }
    settings.set_string('island-size', 'large');
    c._onVolumeChanged({volume: 42, isMuted: false});
    await Scripting.sleep(800);
    const [expandedX] = c.notch.get_transformed_position();
    const [expandedWidth] = c.notch.get_transformed_size();
    if (Math.abs(expandedX + expandedWidth / 2 - c.monitorWidth / 2) > 1)
        throw new Error('Expanded island is not centered');
    c.compactNotch(true);
    await Scripting.sleep(1000);
    if (Math.abs(c.notch.scale_x - 1.15) > 0.001)
        throw new Error('Collapse/squeeze reset selected size');
    extension.stateObj.disable();
    print('DYNAMIC_ISLAND_APPEARANCE_PASS');
}
