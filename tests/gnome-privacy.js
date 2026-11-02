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
    for (const [kind, manager, presenter] of [
        ['microphone', c.recordingManager, 'recording'], ['camera', c.cameraManager, 'camera'],
    ]) {
        const send = (start, app, pid, data = {}) => manager._onServerEvent(
            `${kind}_${start ? 'start' : 'stop'}`, app, pid, '', JSON.stringify(data));
        e._settings.set_strv(`${kind}-excluded-apps`, ['org.example.Visualizer.desktop']);
        send(true, 'Visualizer', 100, {app_id: 'org.example.Visualizer'});
        if (c.cycleManager.has(presenter)) throw new Error('Excluded app shown');
        send(true, 'Call', 101);
        send(true, 'Recorder', 102);
        send(false, 'Call', 101);
        if (!c.cycleManager.has(presenter) || !manager._info().appName.includes('Recorder'))
            throw new Error('One app stopping hid another active app');
        e._settings.set_strv(`${kind}-excluded-apps`, ['Recorder', 'org.example.Visualizer']);
        await Scripting.sleep(900);
        if (c.cycleManager.has(presenter) || c.notch.visible ||
            c._expansionQueue.some(event => event.presenterName === presenter))
            throw new Error('Live exclusions did not dismiss indicator/queue');
        e._settings.set_strv(`${kind}-excluded-apps`, []);
        if (!c.cycleManager.has(presenter)) throw new Error('Removing exclusions lost active sessions');
        send(false, 'Visualizer', 100);
        send(false, 'Recorder', 102);
        await Scripting.sleep(900);
        if (c.cycleManager.has(presenter)) throw new Error('Stopped app still visible');
    }
    e.disable();
    print('DYNAMIC_ISLAND_PRIVACY_PASS');
}
