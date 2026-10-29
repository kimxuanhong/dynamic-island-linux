// Render the real St components in a separate GNOME test session.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
export const METRICS = {};

export async function run() {
    const extension = Main.extensionManager.lookup('dynamic-island@xuanhong');
    for (let attempt = 0; attempt < 20 && !extension?.stateObj; attempt++)
        await Scripting.sleep(250);
    if (!extension?.stateObj)
        throw new Error(`Extension failed: ${JSON.stringify(extension?.errors)}`);
    Main.overview.hide();
    const c = extension.stateObj._notchController;
    const {NotchConstants} = await import(`${extension.dir.get_uri()}/utils/constants.js`);
    c.notch.hide();
    c.secondaryNotch.hide();
    const wallpaper = Gio.File.new_for_uri(import.meta.url).get_parent().get_child('fixtures/glass-wallpaper.svg').get_uri();
    const backdrop = new St.Widget({width: 1280, height: 720,
        style: `background-image: url("${wallpaper}"); background-size: cover;`});
    Main.layoutManager.addTopChrome(backdrop);
    const canvas = new St.Widget({width: 1280, height: 720});
    Main.layoutManager.addTopChrome(canvas);
    canvas.add_child(new St.Label({text: 'DYNAMIC ISLAND', x: 140, y: 44, width: 500,
        style: 'color: #9babc9; font-size: 11px; font-weight: 700; letter-spacing: 3px;'}));
    canvas.add_child(new St.Label({text: 'A little more alive.', x: 140, y: 65,
        style: 'color: #edf3ff; font-size: 30px; font-weight: 700;'}));
    const cards = [];
    function add(view, x, y) {
        const content = view.expandedContainer;
        content.get_parent()?.remove_child(content);
        const card = new St.BoxLayout({style_class: 'notch expanded-state',
            x, y, width: NotchConstants.EXPANDED_WIDTH,
            height: NotchConstants.EXPANDED_HEIGHT});
        card.add_child(content);
        canvas.add_child(card);
        content.show();
        cards.push({card, content});
    }
    async function capture(name) {
        await Scripting.sleep(600);
        for (const {card, content} of cards) {
            const [cardX, cardY] = card.get_transformed_position();
            const checkBounds = actor => {
                if (!actor.visible) return;
                if (actor instanceof St.Label || actor instanceof St.Button) {
                    const [x, y] = actor.get_transformed_position();
                    const [width, height] = actor.get_transformed_size();
                    if (x < cardX || y < cardY || x + width > cardX + card.width + 1 || y + height > cardY + card.height + 1)
                        throw new Error(`Widget overflows card: ${actor.style_class}`);
                }
                actor.get_children().forEach(checkBounds);
            };
            checkBounds(content);
            const [, naturalHeight] = content.get_preferred_height(content.width);
            if (naturalHeight > card.height)
                throw new Error(`Content overflows: ${content.style_class}, ${naturalHeight} > ${card.height}`);
        }
        const stream = Gio.File.new_for_path(`/tmp/${name}.png`).replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        const screenshot = new Shell.Screenshot();
        await new Promise((resolve, reject) => screenshot.screenshot(false, stream, (obj, res) => {
            try { obj.screenshot_finish(res); resolve(); } catch (error) { reject(error); }
        }));
        stream.close(null);
    }
    const m = c.mediaView;
    m._setLocalAlbumArt(Gio.File.new_for_uri(wallpaper).get_path());
    m._titleLabel.text = 'Midnight City';
    m._artistLabel.text = 'M83 · Hurry Up, We’re Dreaming';
    m._artistLabel.show();
    m._updatePlayPauseIcon('Playing');
    add(m, 140, 126);
    add(c.volumeView, 700, 126);
    c.volumeView.updateVolume({volume: 68, isMuted: false});
    add(c.batteryView, 140, 402);
    c.batteryView.updateBattery({percentage: 82, isCharging: true, isPresent: true, timeToFull: 1680});
    add(c.recordingView, 700, 402);
    c.recordingView.updateRecording({isRecording: true, appName: 'Voice Recorder'});
    await Scripting.sleep(300);
    m.updateProgress(108000000, 243000000);
    const compactX = 140;
    const compactY = 650;
    const compact = new St.BoxLayout({style_class: 'notch compact-state',
        x: compactX, y: compactY, width: NotchConstants.COMPACT_WIDTH,
        height: NotchConstants.COMPACT_HEIGHT});
    m.compactContainer.get_parent()?.remove_child(m.compactContainer);
    compact.add_child(m.compactContainer);
    m.compactContainer.show();
    m._thumbnailWrapper.show();
    canvas.add_child(compact);
    const minimal = new St.Bin({style_class: 'notch-secondary',
        x: compactX + NotchConstants.COMPACT_WIDTH + NotchConstants.SPLIT_GAP,
        y: compactY, width: NotchConstants.SECONDARY_WIDTH,
        height: NotchConstants.SECONDARY_HEIGHT});
    c.batteryView.secondaryContainer.get_parent()?.remove_child(c.batteryView.secondaryContainer);
    minimal.set_child(c.batteryView.secondaryContainer);
    canvas.add_child(minimal);
    await capture('dynamic-island-preview');
    m._titleLabel.text = 'A very long track title that must stay inside the player instead of pushing controls outside';
    m._artistLabel.text = 'An equally long artist name and album title for checking ellipsized text';
    await capture('dynamic-island-preview-long-text');
    compact.remove_child(m.compactContainer);
    minimal.set_child(null);
    compact.destroy();
    minimal.destroy();
    for (const {card, content} of cards) { card.remove_child(content); card.destroy(); }
    cards.length = 0;
    add(c.brightnessView, 140, 126);
    c.brightnessView.updateBrightness({brightness: 76});
    add(c.bluetoothView, 700, 126);
    c.bluetoothView.updateBluetooth({isConnected: true, deviceName: 'Studio Headphones', deviceType: 'audio-headphones'});
    add(c.cameraView, 140, 402);
    c.cameraView.updateCamera({isCameraInUse: true, appName: 'Camera'});
    add(c.uxplayView, 700, 402);
    c.uxplayView.updateUxplay({isSharing: true, appName: 'AirPlay'});
    await capture('dynamic-island-preview-status');
    for (const {card, content} of cards) { card.remove_child(content); card.destroy(); }
    Main.layoutManager.removeChrome(canvas);
    canvas.destroy();
    Main.layoutManager.removeChrome(backdrop);
    backdrop.destroy();
    extension.stateObj.disable();
    print('DYNAMIC_ISLAND_LAYOUT_PASS');
}
