import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
export const METRICS = {};
export async function run() {
    const extension = Main.extensionManager.lookup('dynamic-island@xuanhong');
    for (let i = 0; i < 20 && !extension?.stateObj; i++) await Scripting.sleep(250);
    const e = extension?.stateObj;
    if (!e) throw new Error('Extension failed');
    const c = e._notchController;
    const s = e._settings;
    Main.overview.hide();
    s.set_string('default-content', 'clock');
    await Scripting.sleep(1000);
    for (const [width, height] of [[160, 36], [188, 44], [280, 70]]) {
        s.set_int('island-width', width);
        s.set_int('island-height', height);
        await Scripting.sleep(100);
        const [x] = c.notch.get_transformed_position();
        const [actualWidth, actualHeight] = c.notch.get_transformed_size();
        if (Math.abs(actualWidth - width) > 1 || Math.abs(actualHeight - height) > 1 ||
            Math.abs(x + actualWidth / 2 - c.monitorWidth / 2) > 1)
            throw new Error(`Compact dimensions/center wrong for ${width}x${height}`);
        c.cycleManager.activate('media');
        c.cycleManager.activate('recording');
        c.layoutManager.updateLayout();
        await Scripting.sleep(100);
        if (c.secondaryNotch.height !== height || c.notch.height !== height)
            throw new Error('Split notch heights did not match setting');
        c.cycleManager.deactivate('media');
        c.cycleManager.deactivate('recording');
        c.layoutManager.updateLayout();
    }
    s.set_string('default-content', 'hidden');
    await Scripting.sleep(650);
    let reveals = 0;
    const reveal = c.animationController.reveal.bind(c.animationController);
    c.animationController.reveal = (...args) => { reveals++; return reveal(...args); };
    c._onBrightnessChanged({brightness: 45});
    if (c._revealing || !c.notch.has_style_class_name('expanded-state') || reveals)
        throw new Error('Hidden expanded event inserted a compact reveal');
    await Scripting.sleep(400);
    if (!c.stateMachine.isExpanded() || c.notch.height !== 180 ||
        c.notch.width !== 440 || c.notch.opacity !== 255 || !c.brightnessView.expandedContainer.visible)
        throw new Error('Expanded dimensions must remain 440x180');
    for (const [width, height] of [[120, 36], [320, 88], [240, 60]]) {
        s.set_int('island-width', width);
        s.set_int('island-height', height);
        await Scripting.sleep(100);
        const [x] = c.notch.get_transformed_position();
        if (c.notch.width !== 440 || c.notch.height !== 180 ||
            Math.abs(x + 220 - c.monitorWidth / 2) > 1)
            throw new Error('Compact settings resized or moved the expanded card');
    }
    s.set_string('default-content', 'clock');
    c.compactNotch(true);
    await Scripting.sleep(1000);
    if (c.notch.width !== 240 || c.notch.height !== 60)
        throw new Error('Collapse did not apply selected compact dimensions');
    s.set_string('default-content', 'hidden');
    await Scripting.sleep(650);
    c.compactNotch(true);
    await Scripting.sleep(1000);
    s.set_string('notification-style', 'icon');
    s.set_int('notification-animation-duration', 200);
    c._onNotificationReceived({title: 'Still compact first'});
    await Scripting.sleep(100);
    if (!c._revealing || reveals !== 1 || c._animatedIcons.size)
        throw new Error('Flying notification lost its empty compact reveal');
    await Scripting.sleep(1200);
    e.disable();
    print('DYNAMIC_ISLAND_DIMENSIONS_EXPAND_PASS');
}
