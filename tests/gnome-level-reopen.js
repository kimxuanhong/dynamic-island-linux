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
    e._settings.set_string('default-content', 'hidden');
    e._settings.set_boolean('show-volume', true);
    e._settings.set_boolean('show-brightness', true);
    await Scripting.sleep(1000);
    for (const type of ['volume', 'brightness']) {
        const update = value => type === 'volume'
            ? c._onVolumeChanged({volume: value, isMuted: false})
            : c._onBrightnessChanged({brightness: value});
        const view = type === 'volume' ? c.volumeView : c.brightnessView;
        const assertExpanded = value => {
            if (!c.notch.visible || !c.stateMachine.isExpanded() ||
                c.presenterRegistry.getCurrent() !== type || !view.expandedContainer.visible ||
                view.valueLabel.text !== `${value}%`)
                throw new Error(`${type} failed to reopen at ${value}%: ${c.stateMachine.getState()}, view=${view.expandedContainer.visible}`);
        };
        update(40);
        await Scripting.sleep(950);
        assertExpanded(40);
        c.compactNotch(true);
        await Scripting.sleep(1000);
        if (c.notch.visible) throw new Error('Notch did not hide');
        // Registry still remembers the previous presenter, but its card is hidden.
        update(55);
        await Scripting.sleep(950);
        assertExpanded(55);
        c.compactNotch(true);
        await Scripting.sleep(80);
        update(65);
        await Scripting.sleep(450);
        assertExpanded(65);
        c.compactNotch(true);
        await Scripting.sleep(1000);
        update(70);
        for (const value of [71, 72, 73]) {
            await Scripting.sleep(35);
            update(value);
        }
        await Scripting.sleep(950);
        assertExpanded(73);
        c.compactNotch(true);
        await Scripting.sleep(1000);
    }
    // User level changes replace an already expanded card synchronously.
    e._settings.set_string('default-content', 'clock');
    await Scripting.sleep(650);
    c.inputMethodView.update({name: 'Test input method'});
    c._requestAutoExpansion('input-method', 'input-method', 10000);
    await Scripting.sleep(400);
    let collapses = 0;
    const compact = c.compactNotch.bind(c);
    c.compactNotch = (...args) => { collapses++; return compact(...args); };
    const height = c.notch.height;
    for (const [type, value] of [['volume', 80], ['brightness', 45], ['volume', 60]]) {
        if (type === 'volume') c._onVolumeChanged({volume: value, isMuted: false});
        else c._onBrightnessChanged({brightness: value});
        const view = type === 'volume' ? c.volumeView : c.brightnessView;
        if (c.presenterRegistry.getCurrent() !== type || !view.expandedContainer.visible ||
            !c.stateMachine.isExpanded() || c.notch.height !== height || collapses ||
            c._expansionQueue.some(event => ['volume', 'brightness'].includes(event.presenterName)))
            throw new Error('Level change waited instead of replacing expanded content');
    }
    c.compactNotch(true);
    await Scripting.sleep(400);
    e._settings.set_string('default-content', 'clock');
    await Scripting.sleep(650);
    e._settings.set_string('default-content', 'hidden');
    await Scripting.sleep(100);
    if (!c.notch.visible || c.notch.width >= c.width || c.notch.opacity >= 250 || c.notch.opacity <= 0)
        throw new Error(`Hide did not shrink and fade together: width=${c.notch.width}, opacity=${c.notch.opacity}`);
    await Scripting.sleep(600);
    e._settings.set_string('default-content', 'clock');
    await Scripting.sleep(100);
    if (!c.notch.visible || c.notch.width >= c.width || c.notch.opacity >= 250 || c.notch.opacity <= 0)
        throw new Error('Reveal did not grow and fade in together');
    await Scripting.sleep(550);
    e.disable();
    print('DYNAMIC_ISLAND_LEVEL_REOPEN_PASS');
}
