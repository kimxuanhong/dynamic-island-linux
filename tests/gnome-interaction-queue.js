import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
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
    const {NotchConstants: N} = await import(`${extension.dir.get_uri()}/utils/constants.js`);
    // Exercise the real view/controller without changing system audio.
    c.volumeManager.setVolume = () => true;
    c._onVolumeChanged({volume: 50, isMuted: false});
    await Scripting.sleep(N.ANIMATION_EXPAND_DURATION + 200);
    const pointer = global.stage.context.get_backend().get_default_seat()
        .create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    const track = c.volumeView.expandedProgressBarBg;
    const move = async fraction => {
        const [x, y] = track.get_transformed_position();
        const [width, height] = track.get_transformed_size();
        pointer.notify_absolute_motion(GLib.get_monotonic_time(), x + width * fraction, y + height / 2);
        await Scripting.sleep(100);
    };
    await move(0.4);
    await move(0.5);
    pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
    await Scripting.sleep(100);
    c.batteryView._expandCallback();
    c._onBrightnessChanged({brightness: 40});
    c._onBluetoothChanged({isConnected: true, deviceName: 'Test headphones', deviceType: 'audio-headphones'});
    await Scripting.sleep(N.TIMEOUT_BATTERY_AUTO_COLLAPSE + 100);
    if (!c.volumeView.isDragging || c.presenterRegistry.getCurrent() !== 'volume' || !c.stateMachine.isExpanded())
        throw new Error('Automatic event interrupted active volume adjustment');
    if (c._expansionQueue.map(event => event.presenterName).join(',') !== 'battery,brightness,bluetooth')
        throw new Error('Automatic expansions did not queue in arrival order');
    await move(0.75);
    if (Math.abs(c.volumeView._level - 75) > 2)
        throw new Error('Volume adjustment stopped working while events waited');
    pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
    await Scripting.sleep(150);
    if (c.presenterRegistry.getCurrent() !== 'volume')
        throw new Error('Queued view appeared immediately on release');
    let finished = false;
    const finish = c._finishCollapse.bind(c);
    c._finishCollapse = () => {
        if (Math.abs(c.notch.height - c.height) > 1)
            throw new Error('Queued view opened before collapse completed');
        finished = true;
        finish();
    };
    await Scripting.sleep(N.TIMEOUT_VOLUME + N.ANIMATION_COMPACT_DURATION + N.ANIMATION_EXPAND_DURATION + 150);
    if (!finished || c.presenterRegistry.getCurrent() !== 'battery' || !c.stateMachine.isExpanded())
        throw new Error('First queued event did not open after adjustment and collapse');
    extension.stateObj.disable();
    print('DYNAMIC_ISLAND_INTERACTION_QUEUE_PASS');
}
