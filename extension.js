/* extension.js - Floating Notch (iPhone X Notch Style) cho GNOME Shell
 *
 * Phiên bản: Compact KÉO DÀI, ART VÀ NỐT NHẠC CẠNH NHAU (GIỐNG B5623E.PNG).
 * Expand khi HOVER.
 */

const { Clutter, Gio, GLib, GObject, St } = imports.gi;
const Main = imports.ui.main;
const Mainloop = imports.mainloop; 
const Lang = imports.lang;

let floatingIsland = null;
let contentBox = null;
let mprisProxy = null;
let signalId = null;
let retryTimeout = null;
let retryCount = 0;
let monitorsChangedId = null;
let stageResizeId = null;
let hoverTimeoutId = null; 

// Kích thước cố định (Giữ nguyên)
const FLOAT_IDLE_W = 120; 
const FLOAT_COMPACT_W = 350; 
const FLOAT_EXPANDED_W = 420; 
const FLOAT_H = 40;          
const FLOAT_TOP_MARGIN = 0; 
const MAX_RETRY = 20;

const COLLAPSE_DELAY_MS = 300; 

// =======================================================================
// LỚP 1: FLOATING ISLAND (NOTCH)
// =======================================================================

const FloatingIsland = GObject.registerClass(
class FloatingIsland extends St.BoxLayout {
    _init() {
        super._init({
            style_class: 'floating-notch',
            reactive: true,
            vertical: false,
            x_expand: false,
            y_expand: false,
            track_hover: true, 
        });

        this.set_style(`
            background-color: rgba(0, 0, 0, 1.0);     
            border-radius: 0 0 20px 20px;             
            padding: 4px 10px;                         
            box-shadow: 0px 4px 10px rgba(0,0,0,0.5); 
            height: ${FLOAT_H}px;                     
        `);

        this._isExpanded = false;
        this._metadata = null;
        this._status = null;

        contentBox = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 0px; align-items: center; width: 100%;', 
        });
        this.add_child(contentBox);

        this._createIdleContent();

        // ------------------ LOGIC HOVER/CLICK ------------------

        this.connect('enter-event', () => {
            if (this._metadata) { 
                if (hoverTimeoutId) {
                    GLib.source_remove(hoverTimeoutId);
                    hoverTimeoutId = null;
                }
                if (!this._isExpanded) {
                    this.showExpanded(this._metadata, this._status);
                }
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this.connect('leave-event', () => {
            if (this._metadata && this._isExpanded) { 
                if (hoverTimeoutId) {
                    GLib.source_remove(hoverTimeoutId);
                }
                hoverTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, COLLAPSE_DELAY_MS, () => {
                    this.showCompact(this._metadata, this._status);
                    hoverTimeoutId = null;
                    return GLIB.SOURCE_REMOVE;
                });
            }
            return Clutter.EVENT_PROPAGATE;
        });
        
        // Click để Play/Pause
        this.connect('button-press-event', (actor, event) => {
            if (this._metadata) {
                this._mediaControl('PlayPause'); 
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    _createIdleContent() {
        contentBox.destroy_all_children();
        contentBox.set_style('spacing: 4px; align-items: center; justify-content: center; width: 100%; padding: 0 4px;'); 

        const sensorIcon = new St.Icon({
            icon_name: 'face-recognize-symbolic', 
            icon_size: 18, 
            style: 'color: #999999; margin-left: 2px;' 
        });

        const label = new St.Label({
            text: ' . . . ',
            style: 'color: #999999; font-weight: bold; font-size: 10pt; margin-right: 2px;'
        });

        contentBox.add_child(sensorIcon);
        contentBox.add_child(label);

        this.set_size(FLOAT_IDLE_W, FLOAT_H);
    }
    
    // TRẠNG THÁI COMPACT: KÉO DÀI, ART VÀ NỐT NHẠC CẠNH NHAU
    _createCompactContent(metadata, status) {
        contentBox.destroy_all_children();
        // Justify content start để tất cả thành phần nằm sát bên trái
        contentBox.set_style('spacing: 8px; align-items: center; justify-content: start; width: 100%; padding: 0 10px;'); 
        
        // --- TẠO HỘP CHỨA (LEFT CONTENT BOX) ---
        const leftContentBox = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 8px; align-items: center;', // Khoảng cách 8px giữa Art và Icon
        });

        // Album Art (Left)
        let art = null;
        const artUrl = this._extractArtUrl(metadata);
        
        if (artUrl) {
            try {
                const gicon = Gio.icon_new_for_string ? Gio.icon_new_for_string(artUrl) : Gio.ThemedIcon.new('audio-x-generic');
                art = new St.Icon({
                    gicon: gicon,
                    icon_size: 30, 
                    style: 'border-radius: 6px;'
                });
            } catch (e) { art = null; }
        }

        if (!art) {
            art = new St.Icon({
                icon_name: 'audio-x-generic-symbolic',
                icon_size: 30,
                style: 'border-radius: 6px; color: #eeeeee;'
            });
        }
        leftContentBox.add_child(art);

        // Icon nốt nhạc (Bên phải Art)
        const musicNoteIcon = new St.Icon({
            icon_name: 'audio-x-generic-symbolic', 
            icon_size: 20, 
            style: 'color: #ffffff;'
        });

        leftContentBox.add_child(musicNoteIcon);
        
        // Thêm hộp nội dung đã nhóm vào Notch
        contentBox.add_child(leftContentBox);

        this.set_size(FLOAT_COMPACT_W, FLOAT_H); 
    }

    // TRẠNG THÁI EXPANDED: TOÀN BỘ NỘI DUNG (Giữ nguyên)
    _createExpandedContent(metadata, status) {
        contentBox.destroy_all_children();
        contentBox.set_style('spacing: 14px; align-items: center; width: 100%; padding: 0 14px;');

        let art;
        const artUrl = this._extractArtUrl(metadata);
        
        if (!art) {
            art = new St.Icon({
                icon_name: 'audio-x-generic-symbolic',
                icon_size: 30,
                style: 'border-radius: 6px; color: #ffffff;'
            });
        }
        contentBox.add_child(art);

        // center: title & artist
        const centerBox = new St.BoxLayout({ vertical: true, x_expand: true, style: 'spacing: 3px;' });
        const title = new St.Label({
            text: this._shorten(this._extractTitle(metadata), 25), 
            style: 'color: #ffffff; font-weight: bold; font-size: 11pt;'
        });
        const artist = new St.Label({
            text: this._shorten(this._extractArtist(metadata), 25), 
            style: 'color: #cccccc; font-size: 9pt;'
        });
        centerBox.add_child(title);
        centerBox.add_child(artist);

        contentBox.add_child(centerBox);

        // right: controls
        const controls = new St.BoxLayout({ vertical: false, style: 'spacing: 8px; align-items: center;' });

        const prevBtn = new St.Button({ style: 'padding: 4px; border-radius: 6px; background-color: rgba(60,60,60,0.8);' });
        prevBtn.add_actor(new St.Icon({ icon_name: 'media-skip-backward-symbolic', icon_size: 16 }));
        prevBtn.connect('clicked', () => { this._mediaControl('Previous'); }); 

        const playBtn = new St.Button({ style: 'padding: 6px; border-radius: 8px; background-color: #1e90ff;' }); 
        playBtn.add_actor(new St.Icon({ icon_name: status === 'Playing' ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic', icon_size: 18, style: 'color: white;' }));
        playBtn.connect('clicked', () => { this._mediaControl('PlayPause'); }); 

        const nextBtn = new St.Button({ style: 'padding: 4px; border-radius: 6px; background-color: rgba(60,60,60,0.8);' }); 
        nextBtn.add_actor(new St.Icon({ icon_name: 'media-skip-forward-symbolic', icon_size: 16 }));
        nextBtn.connect('clicked', () => { this._mediaControl('Next'); }); 

        controls.add_child(prevBtn);
        controls.add_child(playBtn);
        controls.add_child(nextBtn);

        contentBox.add_child(controls);

        this.set_size(FLOAT_EXPANDED_W, FLOAT_H);
    }
    
    // --- HÀM HELPER VÀ LOGIC CHUYỂN TRẠNG THÁI ---
    // (Giữ nguyên các hàm này)

    _extractTitle(metadata) { 
        try {
            if (!metadata) return 'Unknown Track';
            if (metadata['xesam:title']) {
                const v = metadata['xesam:title'];
                return v.unpack ? v.unpack() : v.toString();
            }
        } catch (e) {}
        return 'Unknown Track';
    }

    _extractArtist(metadata) { 
        try {
            if (!metadata) return 'Unknown Artist';
            if (metadata['xesam:artist']) {
                const v = metadata['xesam:artist'];
                if (v.deep_unpack) {
                    const arr = v.deep_unpack();
                    return Array.isArray(arr) && arr.length ? arr[0] : 'Unknown Artist';
                } else {
                    return v.toString();
                }
            }
        } catch (e) {}
        return 'Unknown Artist';
    }

    _extractArtUrl(metadata) { 
        try {
            if (!metadata) return null;
            const keys = ['mpris:artUrl', 'xesam:artUrl', 'mpris:arturl'];
            for (let k of keys) {
                if (metadata[k]) {
                    const v = metadata[k];
                    return v.unpack ? v.unpack() : v.toString();
                }
            }
        } catch (e) {}
        return null;
    }

    _shorten(s, max) { 
        if (!s) return '';
        return s.length > max ? s.substr(0, max - 3) + '...' : s;
    }

    _mediaControl(action) { 
        if (!mprisProxy) return;
        try {
            const methodName = action === 'PlayPause' ? 'PlayPause' :
                               action === 'Next' ? 'Next' : 'Previous';
            mprisProxy.call_sync(
                methodName,
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null
            );
        } catch (e) {
            global.logError(e, `MPRIS call failed: ${action}`);
        }
    }
    
    _stopWaveform() {} 

    showIdle() {
        this._isExpanded = false;
        this._metadata = null;
        this._status = null;
        this._createIdleContent();
        this._animateCollapse(FLOAT_IDLE_W);
        this._updateNotchStyle(false);
    }

    showCompact(metadata, status) {
        this._metadata = metadata;
        this._status = status;
        this._isExpanded = false; 
        this._createCompactContent(metadata, status);
        this._animateCollapse(FLOAT_COMPACT_W); 
        this._updateNotchStyle(false);
    }

    showExpanded(metadata, status) {
        this._metadata = metadata;
        this._status = status;
        this._isExpanded = true; 
        this._createExpandedContent(metadata, status);
        this._animateExpand();
        this._updateNotchStyle(true);
    }

    _updateNotchStyle(isExpanded) {
        const radius = isExpanded ? '0 0 15px 15px' : '0 0 20px 20px'; 

        this.set_style(`
            background-color: rgba(0, 0, 0, 1.0);
            border-radius: ${radius};
            padding: 4px 10px;
            box-shadow: 0px 4px 10px rgba(0,0,0,0.5);
            height: ${FLOAT_H}px;
        `);
    }

    _animateExpand() {
        try {
            this.ease({ width: FLOAT_EXPANDED_W, duration: 260, mode: Clutter.AnimationMode.EASE_OUT_CUBIC });
        } catch (e) {
            this.set_size(FLOAT_EXPANDED_W, FLOAT_H);
        }
        _repositionFloatingIsland();
    }

    _animateCollapse(targetW) {
        try {
            this.ease({ width: targetW, duration: 200, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
        } catch (e) {
            this.set_size(targetW, FLOAT_H);
        }
        _repositionFloatingIsland();
    }
}
);

// =======================================================================
// HÀM HỆ THỐNG (GIỮ NGUYÊN)
// =======================================================================

function _repositionFloatingIsland() {
    if (!floatingIsland) return;
    try {
        const monitor = Main.layoutManager.primaryMonitor;
        const x = Math.floor(monitor.x + (monitor.width - floatingIsland.width) / 2);
        const y = monitor.y + FLOAT_TOP_MARGIN; 
        floatingIsland.set_position(x, y);
    } catch (e) {
        global.logError(e, 'reposition error');
    }
}

function connectToMPRIS() {
    if (mprisProxy) {
        global.log('Already connected to MPRIS');
        return true;
    }

    try {
        const result = Gio.DBus.session.call_sync(
            'org.freedesktop.DBus',
            '/org/freedesktop/DBus',
            'org.freedesktop.DBus',
            'ListNames',
            null,
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null
        );

        const [names] = result.deep_unpack();
        const players = names.filter(n => n.startsWith('org.mpris.MediaPlayer2.') && !n.endsWith('.playerctld'));

        global.log(`Found MPRIS players: ${players.join(', ')}`);

        if (players.length === 0) {
            floatingIsland.showIdle(); // Nếu không có player, hiển thị trạng thái Idle
            if (retryCount < MAX_RETRY) {
                retryCount++;
                retryTimeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
                    connectToMPRIS();
                    retryTimeout = null;
                    return GLIB.SOURCE_REMOVE;
                });
            }
            return false;
        }

        retryCount = 0;
        const playerName = players[0];
        mprisProxy = Gio.DBusProxy.new_for_bus_sync(
            Gio.BusType.SESSION,
            Gio.DBusProxyFlags.NONE,
            null,
            playerName,
            '/org/mpris/MediaPlayer2',
            'org.mpris.MediaPlayer2.Player',
            null
        );

        signalId = mprisProxy.connect('g-properties-changed', () => {
            global.log('MPRIS properties changed');
            updateIslandFromMPRIS();
        });

        updateIslandFromMPRIS();

        Main.notify('Dynamic Notch', `Connected to ${playerName.split('.').pop()}`);
        return true;
    } catch (e) {
        global.logError(e, 'connectToMPRIS failed');
        return false;
    }
}

function updateIslandFromMPRIS() {
    if (!floatingIsland) return;
    
    if (!mprisProxy) {
        floatingIsland.showIdle();
        connectToMPRIS();
        return;
    }
    
    try {
        const metadataVariant = mprisProxy.get_cached_property('Metadata');
        const statusVariant = mprisProxy.get_cached_property('PlaybackStatus');

        if (!metadataVariant || !statusVariant) {
            floatingIsland.showIdle();
            return;
        }

        const metadata = metadataVariant.deep_unpack();
        const status = statusVariant.unpack ? statusVariant.unpack() : statusVariant.toString();

        global.log(`MPRIS update: status=${status}`);

        if (metadata && (status === 'Playing' || status === 'Paused')) {
            if (floatingIsland._isExpanded) {
                floatingIsland.showExpanded(metadata, status);
            } else {
                floatingIsland.showCompact(metadata, status);
            }
        } else {
            floatingIsland.showIdle();
        }
    } catch (e) {
        global.logError(e, 'Error updating island from MPRIS');
        floatingIsland.showIdle();
    }
}

function _monitorLayoutChanged() { 
    _repositionFloatingIsland();
}

function enable() { 
    global.log('=== ENABLE Dynamic Notch (iPhone X) ===');

    if (!floatingIsland) {
        floatingIsland = new FloatingIsland();
        Main.uiGroup.add_child(floatingIsland);
        floatingIsland.set_size(FLOAT_IDLE_W, FLOAT_H);
        _repositionFloatingIsland();
    }

    if (!monitorsChangedId) {
        monitorsChangedId = Main.layoutManager.connect('monitors-changed', _monitorLayoutChanged);
    }
    if (!stageResizeId) {
        stageResizeId = global.stage.connect('notify::allocation', _monitorLayoutChanged);
    }

    connectToMPRIS();
}

function disable() { 
    global.log('=== DISABLE Dynamic Notch ===');

    if (hoverTimeoutId) {
        GLib.source_remove(hoverTimeoutId);
        hoverTimeoutId = null;
    }
    if (retryTimeout) {
        GLib.source_remove(retryTimeout);
        retryTimeout = null;
    }

    if (signalId && mprisProxy) {
        try { mprisProxy.disconnect(signalId); } catch(e){}
        signalId = null;
    }
    mprisProxy = null;
    retryCount = 0;

    if (floatingIsland) {
        try { floatingIsland.destroy(); } catch(e){}
        floatingIsland = null;
        contentBox = null;
    }

    if (monitorsChangedId) {
        try { Main.layoutManager.disconnect(monitorsChangedId); } catch(e){}
        monitorsChangedId = null;
    }
    if (stageResizeId) {
        try { global.stage.disconnect(stageResizeId); } catch(e){}
        stageResizeId = null;
    }
}

function init() { 
    global.log('Dynamic Notch initialized');
}