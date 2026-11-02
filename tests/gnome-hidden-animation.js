import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
export const METRICS = {};
export async function run() {
    const extension = Main.extensionManager.lookup('dynamic-island@xuanhong');
    for (let i = 0; i < 20 && !extension?.stateObj; i++) await Scripting.sleep(250);
    const e = extension?.stateObj;
    if (!e) throw new Error('Extension failed');
    const c = e._notchController;
    Main.overview.hide();
    await Scripting.sleep(1000);
    const s = e._settings;
    const checkCenter = () => {
        const [x] = c.notch.get_transformed_position();
        const [width] = c.notch.get_transformed_size();
        if (Math.abs(x + width / 2 - c.monitorWidth / 2) > 1)
            throw new Error('Hide/reveal drifted away from center');
    };
    for (const size of ['small', 'normal', 'large']) {
        s.set_string('island-size', size);
        s.set_string('default-content', 'clock');
        await Scripting.sleep(650);
        s.set_string('default-content', 'hidden');
        let previous = c.width;
        let intermediate = false;
        for (let i = 0; i < 28; i++) {
            await Scripting.sleep(20);
            if (!c.notch.visible) break;
            checkCenter();
            if (c.notch.width > previous + 1) throw new Error('Hide grew instead of shrinking');
            intermediate ||= c.notch.width > 1 && c.notch.width < c.width - 1;
            previous = c.notch.width;
        }
        if (!intermediate || c.notch.visible) throw new Error('Compact hide was not gradual');
        s.set_string('default-content', 'clock');
        previous = 0;
        intermediate = false;
        for (let i = 0; i < 28; i++) {
            await Scripting.sleep(20);
            checkCenter();
            if (c.notch.width < previous - 1) throw new Error('Reveal shrank instead of growing');
            intermediate ||= c.notch.width > 1 && c.notch.width < c.width - 1;
            previous = c.notch.width;
        }
        if (!intermediate || !c.notch.visible || c._revealing) throw new Error('Compact reveal was not gradual');
    }
    s.set_string('default-content', 'hidden');
    await Scripting.sleep(150);
    const partialWidth = c.notch.width;
    s.set_string('default-content', 'clock');
    if (Math.abs(c.notch.width - partialWidth) > 1) throw new Error('Reversing hide jumped in width');
    await Scripting.sleep(650);
    s.set_string('default-content', 'hidden');
    await Scripting.sleep(650);
    c._onVolumeChanged({volume: 42, isMuted: false});
    await Scripting.sleep(200);
    if (!c._revealing || c.notch.height !== c.height || c.notch.width >= c.width)
        throw new Error('Hidden event expanded before revealing compact geometry');
    await Scripting.sleep(700);
    if (!c.stateMachine.isExpanded()) throw new Error('Event failed to expand after reveal');
    let compactBeforeHide = false;
    const hide = c.animationController.hide.bind(c.animationController);
    c.animationController.hide = () => {
        if (!c._hiding && c.notch.visible)
            compactBeforeHide = Math.abs(c.notch.width - c.width) < 1 && Math.abs(c.notch.height - c.height) < 1;
        hide();
    };
    c.compactNotch(true);
    await Scripting.sleep(500);
    if (!compactBeforeHide || !c._hiding || !c.notch.visible) throw new Error('Expanded event skipped compact-before-hide');
    const interrupted = c.notch.width;
    c._onVolumeChanged({volume: 60, isMuted: false});
    if (Math.abs(c.notch.width - interrupted) > 1) throw new Error('Interrupting hide jumped in width');
    await Scripting.sleep(900);
    if (!c.notch.visible || !c.stateMachine.isExpanded() || c.volumeView.valueLabel.text !== '60%')
        throw new Error('New event failed to interrupt hide and expand');
    e.disable();
    print('DYNAMIC_ISLAND_HIDDEN_ANIMATION_PASS');
}
