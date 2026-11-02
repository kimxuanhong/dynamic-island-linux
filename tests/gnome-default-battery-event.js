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
    e._settings.set_string('default-content', 'battery');
    const battery = {isPresent: true, percentage: 75, isCharging: false};
    c._onBatteryChanged(battery);
    c.cycleManager.activate('media');
    c.cycleManager.activate('recording');
    c.layoutManager.updateLayout();
    const assertActivities = () => {
        const visible = c.cycleManager._visibleItems();
        if (visible.length !== 2 || visible.includes('battery') ||
            !visible.includes('media') || !visible.includes('recording'))
            throw new Error(`Battery entered activity sequence: ${visible}`);
    };
    for (const isCharging of [true, false]) {
        c._onBatteryChanged({...battery, isCharging});
        await Scripting.sleep(500);
        if (c.presenterRegistry.getCurrent() !== 'battery' || !c.batteryView.expandedContainer.visible || !c.notch.visible)
            throw new Error(`Hidden battery did not expand on charging=${isCharging}`);
        assertActivities();
        await Scripting.sleep(3600);
        assertActivities();
        if (!c.stateMachine.isCompact() || !c.secondaryNotch.visible || c.batteryView.expandedContainer.visible)
            throw new Error('Charging card did not return to activity sequence');
    }
    c.cycleManager.deactivate('media');
    c.cycleManager.deactivate('recording');
    c.layoutManager.updateLayout();
    if (c.cycleManager.current() !== 'battery' || !c.notch.visible)
        throw new Error('Default battery did not return after last activity');
    e._settings.set_string('default-content', 'hidden');
    c._onBatteryChanged({...battery, isCharging: true});
    await Scripting.sleep(500);
    if (!c.notch.visible || !c.batteryView.expandedContainer.visible)
        throw new Error('Hidden default suppressed charging event');
    await Scripting.sleep(3600);
    if (c.notch.visible || c.secondaryNotch.visible) throw new Error('Hidden default not restored');
    e.disable();
    print('DYNAMIC_ISLAND_DEFAULT_BATTERY_EVENT_PASS');
}
