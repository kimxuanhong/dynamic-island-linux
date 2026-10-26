import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
export const METRICS = {};
export async function run() {
    await Scripting.sleep(1500);
    const extension = Main.extensionManager.lookup('dynamic-island@xuanhong');
    if (!extension?.stateObj?._notchController)
        throw new Error(`Extension failed: ${JSON.stringify(extension?.errors)}`);
    const controller = extension.stateObj._notchController;
    Main.overview.hide();
    await Scripting.sleep(500);
    const {connectClick, connectMotion, connectSlider, blockScroll} =
        await import(`${extension.dir.get_uri()}/utils/input.js`);
    const actor = new St.Widget({reactive: true, width: 300, height: 40,
        x: 100, y: 300, style: 'background-color: white;'});
    Main.layoutManager.addTopChrome(actor);
    let entered = 0;
    let left = 0;
    let began = 0;
    let ended = 0;
    const values = [];
    connectMotion(actor, 'enter', () => entered++);
    connectMotion(actor, 'leave', () => left++);
    const disconnectSlider = connectSlider(actor, x => values.push(x),
        () => began++, () => ended++);
    blockScroll(actor);
    let parentScrolled = 0;
    const parentScroll = new Clutter.ScrollController({
        flags: Clutter.ScrollControllerFlags.SCROLL_VERTICAL,
    });
    parentScroll.connect('scroll', () => parentScrolled++);
    Main.uiGroup.add_action(parentScroll);
    const pointer = global.stage.context.get_backend().get_default_seat()
        .create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    const motion = async (x, y) => {
        pointer.notify_absolute_motion(GLib.get_monotonic_time(), x, y);
        await Scripting.sleep(120);
    };
    const button = async state => {
        pointer.notify_button(GLib.get_monotonic_time(), 1, state);
        await Scripting.sleep(120);
    };
    await Scripting.sleep(300);
    // The first absolute motion initializes the virtual pointer position.
    await motion(140, 310);
    await motion(150, 320);
    pointer.notify_discrete_scroll(GLib.get_monotonic_time(),
        Clutter.ScrollDirection.DOWN, Clutter.ScrollSource.WHEEL);
    await Scripting.sleep(120);
    Main.uiGroup.remove_action(parentScroll);
    if (parentScrolled !== 0)
        throw new Error('Scroll escaped the child controller');
    await button(Clutter.ButtonState.PRESSED);
    await motion(450, 320);
    await motion(350, 320);
    await button(Clutter.ButtonState.RELEASED);
    await motion(500, 400);
    if (!entered || !left || began !== 1 || ended !== 1 ||
        !values.some(x => Math.abs(x - 50) < 5) ||
        !values.some(x => Math.abs(x - 250) < 5) ||
        !values.some(x => x > actor.width))
        throw new Error(`Input failure: ${JSON.stringify({entered, left, began, ended, values})}`);
    // Destroying a view mid-drag must release the modal stage grab.
    await motion(200, 320);
    await button(Clutter.ButtonState.PRESSED);
    disconnectSlider();
    await button(Clutter.ButtonState.RELEASED);
    if (ended !== 2)
        throw new Error('Drag cleanup failed');
    let clicked = 0;
    connectClick(actor, () => clicked++);
    await button(Clutter.ButtonState.PRESSED);
    await button(Clutter.ButtonState.RELEASED);
    if (clicked !== 1)
        throw new Error(`Click failure: ${clicked}`);
    Main.layoutManager.removeChrome(actor);
    actor.destroy();
    print('DYNAMIC_ISLAND_INPUT_PASS');

    controller.mediaView.updatePlaybackState(true, 'Playing');
    await Scripting.sleep(300);
    controller.mediaView.updatePlaybackState(false, 'Paused');
    controller.updatePosition();
    controller.animationController.squeeze();
    await Scripting.sleep(700);
    extension.stateObj.disable();
    await Scripting.sleep(700);
    extension.stateObj.enable();
    await Scripting.sleep(700);
    if (!extension.stateObj._notchController.notch)
        throw new Error('Re-enable failed');
    extension.stateObj.disable();
    print('DYNAMIC_ISLAND_SMOKE_PASS');
}
