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
    const completed = [];
    const finish = c._finishCollapse.bind(c);
    c._finishCollapse = () => {
        const geometry = c.animationController.calculateCompactGeometry();
        if (Math.abs(c.notch.width - geometry.width) > 1 || Math.abs(c.notch.height - c.height) > 1)
            throw new Error('Queue resumed before the notch finished collapsing');
        completed.push(c._expansionQueue[0]?.presenterName);
        finish();
    };
    c.presenterRegistry.switchTo('battery', true);
    c.expandNotch(true);
    await Scripting.sleep(N.ANIMATION_EXPAND_DURATION + 150);
    c.compactNotch();
    await Scripting.sleep(80);
    c._onVolumeChanged({volume: 30, isMuted: false});
    c._onBrightnessChanged({brightness: 40});
    c._onVolumeChanged({volume: 70, isMuted: false});
    if (c._expansionQueue.length !== 3 || !c._collapsing)
        throw new Error('Events interrupted collapse instead of being queued');
    if (c.volumeView.expandedContainer.visible || c.brightnessView.expandedContainer.visible)
        throw new Error('Queued content appeared in the shrinking frame');
    await Scripting.sleep(N.ANIMATION_COMPACT_DURATION + N.ANIMATION_EXPAND_DURATION + 150);
    for (const [index, name] of ['volume', 'brightness', 'volume'].entries()) {
        if (c.presenterRegistry.getCurrent() !== name || !c.stateMachine.isExpanded())
            throw new Error(`Queue order mismatch at ${index}: ${c.presenterRegistry.getCurrent()}`);
        if (index < 2) {
            // Let the queued event's own display timer close it and drain
            // the next entry, rather than advancing the queue manually.
            await Scripting.sleep(N.TIMEOUT_VOLUME + N.ANIMATION_COMPACT_DURATION +
                N.ANIMATION_EXPAND_DURATION + 100);
        }
    }
    if (completed.join(',') !== 'volume,brightness,volume' || c._expansionQueue.length)
        throw new Error(`Queue did not drain in order: ${completed}`);
    extension.stateObj.disable();
    print('DYNAMIC_ISLAND_EVENT_QUEUE_PASS');
}
