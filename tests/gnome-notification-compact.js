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
    s.set_string('default-content', 'hidden');
    s.set_string('notification-style', 'icon');
    s.set_int('notification-animation-duration', 400);
    await Scripting.sleep(650);
    const starts = [];
    const animate = c._animateNotificationIcon.bind(c);
    c._animateNotificationIcon = info => {
        if (!c.notch.visible || c._revealing || Math.abs(c.notch.width - c.width) > 1 ||
            Math.abs(c.notch.height - c.height) > 1 || !c.stateMachine.isCompact())
            throw new Error('Notification animation began before compact was ready');
        if (!c.cycleManager.count() && c.notch.get_children().some(child => child.visible))
            throw new Error('Empty compact flashed old content');
        starts.push(info.title);
        animate(info);
    };
    c._onNotificationReceived({title: 'First'});
    c._onNotificationReceived({title: 'Second'});
    await Scripting.sleep(120);
    if (!c.notch.visible || !c._revealing || c._animatedIcons.size || starts.length)
        throw new Error('Hidden notification did not reveal empty compact first');
    await Scripting.sleep(500);
    if (starts.join(',') !== 'First' || !c._animatedIcons.has('notification') || c._hiding)
        throw new Error('Compact was not held during icon animation');
    await Scripting.sleep(1800);
    if (starts.join(',') !== 'First,Second' || c.notch.visible || c._animatedIcons.size)
        throw new Error('Notifications did not finish in order and return to hidden');
    s.set_string('default-content', 'clock');
    await Scripting.sleep(650);
    c._onNotificationReceived({title: 'Clock'});
    if (starts.at(-1) !== 'Clock' || !c._clockLabel.visible || c._revealing)
        throw new Error('Existing compact was unnecessarily replaced/revealed');
    await Scripting.sleep(1100);
    s.set_string('default-content', 'hidden');
    await Scripting.sleep(650);
    c._onNotificationReceived({title: 'Canceled'});
    await Scripting.sleep(100);
    s.set_string('notification-style', 'off');
    await Scripting.sleep(1000);
    if (starts.includes('Canceled') || c.notch.visible || c._expansionQueue.length)
        throw new Error('Disabling notifications left queued work or empty compact');
    e.disable();
    print('DYNAMIC_ISLAND_NOTIFICATION_COMPACT_PASS');
}
