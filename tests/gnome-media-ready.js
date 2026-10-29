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
    const update = (title, status = 'Playing', artist = '') => c.mediaManager._updateMediaState({
        player: 'org.mpris.MediaPlayer2.firefox', status, title, artist,
        length: 120000000, position: 1000000,
    });
    update('');
    await Scripting.sleep(N.TIMEOUT_MEDIA_READY + 400);
    if (c.mediaView.expandedContainer.visible || c._expansionQueue.some(e => e.presenterName === 'media'))
        throw new Error('Blank metadata opened the media view');
    update('Ready track');
    await Scripting.sleep(500);
    update('Ready track', 'Playing', 'Late artist');
    await Scripting.sleep(N.TIMEOUT_MEDIA_READY - 400);
    if (c.mediaView.expandedContainer.visible)
        throw new Error('Artist metadata did not restart the readiness wait');
    await Scripting.sleep(N.ANIMATION_EXPAND_DURATION + 600);
    if (c.presenterRegistry.getCurrent() !== 'media' || !c.stateMachine.isExpanded() ||
        c.mediaView._titleLabel.text !== 'Ready track' || c.mediaView._artistLabel.text !== 'Late artist')
        throw new Error('Ready metadata did not open the populated media view');
    update('Next track');
    update('Next track', 'Paused');
    if (c.timeoutManager.has('media-ready')) throw new Error('Pause left a pending auto-expansion');
    c.mediaManager._updateMediaState({player: '', status: ''});
    await Scripting.sleep(N.TIMEOUT_MEDIA_READY + 700);
    if (c.mediaView.expandedContainer.visible || c._expansionQueue.some(e => e.presenterName === 'media'))
        throw new Error('Stale readiness callback reopened a vanished player');
    extension.stateObj.disable();
    print('DYNAMIC_ISLAND_MEDIA_READY_PASS');
}
