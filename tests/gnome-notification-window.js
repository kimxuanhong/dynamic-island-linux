import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
export const METRICS = {};
export async function run() {
    const extension = Main.extensionManager.lookup('dynamic-island@xuanhong');
    for (let i = 0; i < 20 && !extension?.stateObj; i++) await Scripting.sleep(250);
    const e = extension?.stateObj;
    if (!e) throw new Error('Extension failed');
    Main.overview.hide();
    await Scripting.sleep(1300);
    const c = e._notchController;
    const s = e._settings;
    s.set_string('notification-style', 'off');
    c._onNotificationReceived({title: 'Silent'});
    if (c._animatedIcons.size || c.notch.visible) throw new Error('Disabled notification shown');
    s.set_string('notification-style', 'icon');
    s.set_string('notification-icon', 'airplane');
    s.set_int('notification-animation-duration', 200);
    c._onNotificationReceived({title: 'Flying'});
    if (!c._animatedIcons.has('notification')) throw new Error('Flying icon missing');
    await Scripting.sleep(800);
    if (c._animatedIcons.size) throw new Error('Flying icon leaked');
    s.set_string('notification-style', 'card');
    s.set_int('notification-display-time', 1);
    c._onNotificationReceived({title: 'Hello', body: 'Body text', appName: 'Test app'});
    await Scripting.sleep(500);
    if (!c.notch.visible || c.notificationView.statusLabel.text !== 'Hello' ||
        !c.notificationView.detailsLabel.text.includes('Body text')) throw new Error('Notification card missing');
    await Scripting.sleep(1500);
    if (c.notch.visible) throw new Error('Notification card did not expire');
    const child = Gio.Subprocess.new(['gjs', '-c', `
        imports.gi.versions.Gtk = '4.0';
        const {Gtk} = imports.gi;
        const app = new Gtk.Application({application_id: 'org.example.IslandWindowTest'});
        app.connect('activate', () => {
            const window = new Gtk.ApplicationWindow({application: app, title: 'Island window event test', default_width: 300, default_height: 200});
            window.present();
        });
        app.run([]);
    `], Gio.SubprocessFlags.NONE);
    try {
        await Scripting.sleep(1800);
        if (!c.notch.visible || c.presenterRegistry.getCurrent() !== 'window' ||
            c.windowView.statusLabel.text !== 'Window Opened') throw new Error('Real window open event missing');
        child.force_exit();
        await Scripting.sleep(800);
        if (c.windowView.statusLabel.text !== 'Window Closed') throw new Error('Real window close event missing');
        s.set_boolean('show-window-events', false);
        await Scripting.sleep(900);
        c._onWindowLaunched({event: 'launched', appName: 'Ignored'});
        if (c.notch.visible) throw new Error('Disabled window event shown');
    } finally { if (!child.get_if_exited()) child.force_exit(); }
    e.disable();
    print('DYNAMIC_ISLAND_NOTIFICATION_WINDOW_PASS');
}
