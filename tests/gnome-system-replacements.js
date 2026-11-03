import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
export const METRICS = {};
export async function run() {
    const extension = Main.extensionManager.lookup('dynamic-island@xuanhong');
    for (let i = 0; i < 20 && !extension?.stateObj; i++) await Scripting.sleep(250);
    const e = extension?.stateObj;
    if (!e) throw new Error('Extension failed');
    Main.overview.hide();
    await Scripting.sleep(1000);
    const s = e._settings;
    const c = e._notchController;
    for (const [key, expected] of [['background-opacity', 80], ['island-width', 130], ['island-height', 36]]) {
        if (s.get_default_value(key).unpack() !== expected) throw new Error(`Wrong default for ${key}`);
        s.reset(key);
    }
    s.set_string('default-content', 'clock');
    await Scripting.sleep(650);
    if (c.notch.width !== 130 || c.notch.height !== 36 || !c.notch.get_style().includes('0.8'))
        throw new Error('Appearance defaults did not reach actors');
    const osd = Main.osdWindowManager;
    e._osdInjection.clear();
    const nativeOsd = osd._showOsdWindow;
    let osds = 0;
    const osdSpy = () => osds++;
    osd._showOsdWindow = osdSpy;
    e._setupSystemOsd();
    const tray = Main.messageTray;
    e._notificationInjection.clear();
    const nativeShow = tray._showNotification;
    let banners = 0;
    const bannerSpy = function (...args) { banners++; return nativeShow.apply(this, args); };
    tray._showNotification = bannerSpy;
    e._setupNotificationBanners();
    const source = new MessageTray.Source({title: 'Island replacement test'});
    Main.messageTray.add(source);
    try {
        s.set_boolean('hide-system-osd', false);
        s.set_boolean('show-brightness', true);
        osd._showOsdWindow(0, new Gio.ThemedIcon({name: 'display-brightness-symbolic'}), null, 0.55, 1);
        if (osds || c.brightnessView.valueLabel.text !== '55%')
            throw new Error('Enabled brightness did not automatically replace native OSD');
        s.set_boolean('show-brightness', false);
        osd._showOsdWindow(0, new Gio.ThemedIcon({name: 'display-brightness-symbolic'}), null, 0.6, 1);
        if (osds !== 1) throw new Error('Disabled brightness did not restore native OSD');
        s.set_string('notification-style', 'card');
        const card = new MessageTray.Notification({source, title: 'Card only', body: 'Keep history', urgency: MessageTray.Urgency.CRITICAL});
        source.addNotification(card);
        await Scripting.sleep(500);
        if (banners || tray._notificationQueue.includes(card) || !source.notifications.includes(card) || card.acknowledged)
            throw new Error('Card duplicated banner or changed notification history/read state');
        if (c.notificationView.statusLabel.text !== 'Card only') throw new Error('Island card was not delivered');
        s.set_string('notification-style', 'off');
        const normal = new MessageTray.Notification({source, title: 'Native banner', body: 'Restored', urgency: MessageTray.Urgency.CRITICAL});
        source.addNotification(normal);
        await Scripting.sleep(500);
        if (banners !== 1 || tray._notification !== normal) throw new Error('Leaving card mode did not restore native banners');
        source.destroy();
        await Scripting.sleep(350);
        e.disable();
        if (tray._showNotification !== bannerSpy || osd._showOsdWindow !== osdSpy)
            throw new Error('Disable did not restore original methods');
        print('DYNAMIC_ISLAND_SYSTEM_REPLACEMENTS_PASS');
    } finally {
        e._notificationInjection?.clear();
        e._osdInjection?.clear();
        tray._showNotification = nativeShow;
        osd._showOsdWindow = nativeOsd;
    }
}
