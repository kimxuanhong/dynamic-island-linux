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
    const update = status => c.mediaManager._updateMediaState({
        player: 'org.mpris.MediaPlayer2.firefox', status, title: 'Test track',
        artist: 'Test artist', length: 120000000, position: 1000000,
    });
    update('Playing');
    await Scripting.sleep(500);
    update('Paused');
    await Scripting.sleep(200);
    update('Playing');
    if (c.timeoutManager.has('media-switch'))
        throw new Error('Resume did not cancel media expiry');
    update('Paused');
    await Scripting.sleep(200);
    if (!c.cycleManager.has('media')) throw new Error('Pause removed media immediately');
    await Scripting.sleep(5000);
    update('Paused'); // Repeated status updates must not restart the expiry.
    await Scripting.sleep(N.TIMEOUT_MEDIA_SWITCH - 5000 + N.ANIMATION_COMPACT_DURATION + 600);
    if (c.cycleManager.has('media') || c.mediaView._lastMetadata || c.mediaView._progressUpdateInterval)
        throw new Error('Paused media was not cleaned after ten seconds');
    update('Playing');
    await Scripting.sleep(100); // Close while the new media view is opening.
    c._expansionQueue.push({presenterName: 'media'});
    c.mediaManager._updateMediaState({player: '', status: ''});
    await Scripting.sleep(900);
    if (c.cycleManager.has('media') || c._expansionQueue.some(e => e.presenterName === 'media') ||
        c.mediaView.expandedContainer.visible || c.mediaView._lastMetadata)
        throw new Error('Browser disappearance left media or queued media visible');
    extension.stateObj.disable();
    print('DYNAMIC_ISLAND_MEDIA_LIFECYCLE_PASS');
}
