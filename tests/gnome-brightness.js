// Exercise GNOME Shell's brightness signal in an isolated desktop session.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
export const METRICS = {};
export async function run() {
    const extension = Main.extensionManager.lookup('dynamic-island@xuanhong');
    for (let attempt = 0; attempt < 20 && !extension?.stateObj; attempt++)
        await Scripting.sleep(250);
    if (!extension?.stateObj)
        throw new Error('Extension failed to initialize');
    const controller = extension.stateObj._notchController;
    const manager = controller.brightnessManager;
    const shellManager = Main.brightnessManager;
    let level = 0.8;
    const scale = {
        get value() { return level; },
        set value(value) { level = value; shellManager.emit('user-update'); },
    };
    // The virtual monitor has no hardware backlight. Supply a scale while
    // using the real Shell user-update signal and the real controller.
    Object.defineProperty(shellManager, 'globalScale', {value: scale, configurable: true});
    try {
        manager._currentBrightness = 75;
        shellManager.emit('user-update');
        await Scripting.sleep(100);
        if (controller.presenterRegistry.getCurrent() !== 'brightness' ||
            controller.brightnessView.valueLabel.text !== '80%')
            throw new Error('Shell brightness change did not reach the notch');
        scale.value = 0.2;
        if (controller.brightnessView.valueLabel.text !== '80%')
            throw new Error('Large brightness step was not filtered');
        let echoed = 0;
        manager.addCallback(() => echoed++);
        if (!manager.setBrightness(65) || scale.value !== 0.65)
            throw new Error('Slider did not update the Shell brightness scale');
        manager.setBrightness(66);
        if (echoed !== 0)
            throw new Error('Local slider change re-entered the presenter');
        manager._onServerEvent('brightness_changed', 'system', 0, '', JSON.stringify({level: 70, old_level: 66}));
        if (manager._currentBrightness !== 66 || echoed !== 0)
            throw new Error('Backend update overwrote the Shell brightness scale');
        Main.overview.hide();
        await Scripting.sleep(500);
        const view = controller.brightnessView;
        let hidden = 0;
        const visibleId = view.expandedContainer.connect('notify::visible', () => {
            if (!view.expandedContainer.visible) hidden++;
        });
        const pointer = global.stage.context.get_backend().get_default_seat()
            .create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        controller.notch.set_scale(0.85, 0.85);
        await Scripting.sleep(100);
        const track = view.expandedProgressBarBg;
        view.setLevel(66);
        controller.notch.set_width(280);
        await Scripting.sleep(100);
        controller.notch.set_width(440);
        await Scripting.sleep(100);
        if (Math.abs(view.expandedProgressBarFill.get_transformed_size()[0] / track.get_transformed_size()[0] - 0.66) > 0.01)
            throw new Error(`Fill disagrees with 66% after resizing: ${view.expandedProgressBarFill.width}/${track.width}`);
        const move = async fraction => {
            const [x, y] = track.get_transformed_position();
            const [width, height] = track.get_transformed_size();
            pointer.notify_absolute_motion(GLib.get_monotonic_time(), x + width * fraction, y + height / 2);
            await Scripting.sleep(120);
        };
        const button = async state => {
            pointer.notify_button(GLib.get_monotonic_time(), 1, state);
            await Scripting.sleep(120);
        };
        await move(0.5);
        await move(0.25);
        await button(Clutter.ButtonState.PRESSED);
        if (Math.abs(scale.value - 0.25) > 0.02)
            throw new Error(`Brightness click lost position: ${scale.value}`);
        await Scripting.sleep(2200);
        await move(0.75);
        if (Math.abs(scale.value - 0.75) > 0.02)
            throw new Error(`Brightness drag lost position: ${scale.value}`);
        controller.notch.set_position(controller.notch.x + 80, controller.notch.y);
        controller.notch.set_scale(1, 1);
        await Scripting.sleep(100);
        await move(0.4);
        await button(Clutter.ButtonState.RELEASED);
        if (Math.abs(scale.value - 0.4) > 0.02 || hidden)
            throw new Error(`Brightness drag interrupted: value=${scale.value}, hides=${hidden}`);
        if (Math.abs(view.expandedProgressBarFill.get_transformed_size()[0] / track.get_transformed_size()[0] - 0.4) > 0.01)
            throw new Error('Fill disagrees with pointer after drag');
        view.expandedContainer.disconnect(visibleId);
        manager.destroy();
        shellManager.emit('user-update');
        print('DYNAMIC_ISLAND_BRIGHTNESS_PASS');
    } finally {
        delete shellManager.globalScale;
    }
}
