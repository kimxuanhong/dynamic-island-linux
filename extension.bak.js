// const { Clutter, St, Gio, Soup, GLib } = imports.gi;
// const Main = imports.ui.main;
// const Lang = imports.lang;
// const mainloop = imports.mainloop;
//
// let notch;
//
// // =========================================================================
// // HẰNG SỐ CHUNG & D-BUS INTERFACE
// // =========================================================================
//
// // HẰNG SỐ UPOWER CHO DBusProxy CƠ BẢN (ĐÃ FIX LỖI "Percentage")
// const UPOWER_BUS_NAME = 'org.freedesktop.UPower';
// const UPOWER_OBJECT_PATH = '/org/freedesktop/UPower/devices/DisplayDevice';
// const UPOWER_INTERFACE_NAME = 'org.freedesktop.UPower.Device';
//
//
// const MPRIS_BUS_NAME_PREFIX = 'org.mpris.MediaPlayer2.';
// const MPRIS_PLAYER_INTERFACE = `
//     <node>
//         <interface name="org.mpris.MediaPlayer2.Player">
//             <property name="PlaybackStatus" type="s" access="read"/>
//             <property name="Metadata" type="a{sv}" access="read"/>
//             <method name="PlayPause"/>
//             <method name="Next"/>
//             <method name="Previous"/>
//         </interface>
//     </node>
// `;
// // Tạo Proxy Wrapper từ định nghĩa XML (Không xung đột tên phổ biến)
// const MPRIS_PLAYER_PROXY_WRAPPER = Gio.DBusProxy.makeProxyWrapper(MPRIS_PLAYER_INTERFACE);
//
// // =========================================================================
// // 1. SERVICES (Quản lý Data & D-Bus)
// // =========================================================================
//
// // --- BatteryManager (ĐÃ FIX LỖI "Percentage" DÙNG DBusProxy CƠ BẢN) ---
// class BatteryManager {
//     constructor() {
//         this._proxy = null;
//         this._signalId = null;
//         this._callbacks = [];
//         this._initProxy();
//     }
//
//     _initProxy() {
//         // SỬ DỤNG Gio.DBusProxy CƠ BẢN để tránh lỗi xung đột thuộc tính
//         this._proxy = new Gio.DBusProxy({
//             g_connection: Gio.DBus.system,
//             g_name: UPOWER_BUS_NAME,
//             g_object_path: UPOWER_OBJECT_PATH,
//             g_interface_name: UPOWER_INTERFACE_NAME,
//         });
//
//         this._signalId = this._proxy.connect('g-properties-changed', () => this._notifyCallbacks());
//         this._proxy.init(null);
//     }
//
//     addCallback(callback) {
//         this._callbacks.push(callback);
//         // Khởi tạo proxy nếu chưa init, sau đó gọi callback
//         this._proxy.init(null, Lang.bind(this, () => {
//             callback(this.getBatteryInfo());
//         }));
//     }
//
//     _notifyCallbacks() {
//         let info = this.getBatteryInfo();
//         this._callbacks.forEach(cb => cb(info));
//     }
//
//     getBatteryInfo() {
//         // Truy cập thuộc tính thông qua get_cached_property() và deep_unpack()
//         if (!this._proxy) {
//             return {percentage: 0, isCharging: false, isPresent: false};
//         }
//
//         const percentageVariant = this._proxy.get_cached_property('Percentage');
//         const stateVariant = this._proxy.get_cached_property('State');
//         const isPresentVariant = this._proxy.get_cached_property('IsPresent');
//
//         // Cần đảm bảo có State để xác định trạng thái pin
//         if (!stateVariant) {
//             return {percentage: 0, isCharging: false, isPresent: false};
//         }
//
//         let percentage = Math.round(percentageVariant ? percentageVariant.deep_unpack() : 0);
//         let state = stateVariant ? stateVariant.deep_unpack() : 0;
//         let isPresent = isPresentVariant ? isPresentVariant.deep_unpack() : false;
//
//         // State: 1 = Charging, 4 = Fully Charged
//         let isCharging = (state === 1 || state === 4);
//         return {percentage, isCharging, isPresent};
//     }
//
//     destroy() {
//         if (this._signalId && this._proxy) this._proxy.disconnect(this._signalId);
//         this._proxy = null;
//         this._callbacks = [];
//     }
// }
//
// // --- MediaManager (ĐÃ TỐI ƯU HÓA LẮNG NGHE) ---
// class MediaManager {
//     constructor() {
//         this.playerProxy = null;
//         this.signalIds = [];
//         this.callbacks = [];
//         this.currentPlayerName = null;
//         this.metadata = {};
//         this.playbackStatus = 'Stopped';
//         this._httpSession = new Soup.Session();
//         this._artCache = new Map();
//         this._dbusNameOwnerProxy = null;
//         this._dbusSignalId = null;
//
//         this._initDBusListeners();
//         this._watchForMediaPlayers();
//     }
//
//     _initDBusListeners() {
//         try {
//             this._dbusNameOwnerProxy = new Gio.DBusProxy({
//                 g_connection: Gio.DBus.session, g_name: 'org.freedesktop.DBus',
//                 g_object_path: '/org/freedesktop/DBus', g_interface_name: 'org.freedesktop.DBus',
//             });
//             this._dbusNameOwnerProxy.init(null);
//
//             this._dbusSignalId = this._dbusNameOwnerProxy.connectSignal('NameOwnerChanged', (proxy, sender, [name, oldOwner, newOwner]) => {
//                 if (name && name.startsWith(MPRIS_BUS_NAME_PREFIX)) {
//                     if (newOwner && !oldOwner) {
//                         if (!this.playerProxy || name.includes('spotify')) {
//                             this._connectToPlayer(name);
//                         }
//                     } else if (oldOwner && !newOwner) {
//                         if (this.currentPlayerName && this.currentPlayerName === name) {
//                             this._disconnectPlayer();
//                             this._watchForMediaPlayers();
//                         }
//                     }
//                 }
//             });
//         } catch (e) {
//             log(`[Notch] Error setting up DBus listener: ${e.message}`);
//         }
//     }
//
//     _findBestPlayer(playerNames) {
//         if (playerNames.includes('org.mpris.MediaPlayer2.spotify')) return 'org.mpris.MediaPlayer2.spotify';
//         return playerNames.length > 0 ? playerNames[0] : null;
//     }
//
//     _watchForMediaPlayers() {
//         try {
//             Gio.DBus.session.call(
//                 'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'ListNames', null, null,
//                 Gio.DBusCallFlags.NONE, -1, null,
//                 (conn, res) => {
//                     try {
//                         const names = conn.call_finish(res).deep_unpack()[0];
//                         const players = names.filter(n => n.includes(MPRIS_BUS_NAME_PREFIX));
//                         const playerBusName = this._findBestPlayer(players);
//
//                         if (playerBusName && (!this.playerProxy || this.playerProxy.g_name !== playerBusName)) {
//                             this._connectToPlayer(playerBusName);
//                         } else if (!playerBusName && this.playerProxy) {
//                             this._disconnectPlayer();
//                         }
//                     } catch (e) {
//                         log(`[Notch] Error watching media players: ${e}`);
//                     }
//                 }
//             );
//         } catch (e) {
//             log(`[Notch] Error calling ListNames: ${e}`);
//         }
//     }
//
//     _connectToPlayer(busName) {
//         this._disconnectPlayer();
//         this.currentPlayerName = busName;
//
//         this.playerProxy = new MPRIS_PLAYER_PROXY_WRAPPER(
//             Gio.DBus.session, busName, '/org/mpris/MediaPlayer2',
//             (proxy, error) => {
//                 if (error) {
//                     log(`[Notch] Failed to connect to player ${busName}: ${error.message}`);
//                     this._disconnectPlayer();
//                 } else {
//                     this._setupPlayerConnection();
//                 }
//             }
//         );
//     }
//
//     _setupPlayerConnection() {
//         // Lắng nghe tín hiệu PropertiesChanged
//         this.signalIds.push(this.playerProxy.connect('g-properties-changed', (proxy, changed, invalidated) => {
//             try {
//                 const changedProps = changed?.deep_unpack?.() ?? {};
//                 this._updateStateFromProps(changedProps);
//                 this._notifyCallbacks();
//             } catch (e) {
//                 log(`[Notch] Error in properties-changed callback: ${e.message}`);
//             }
//         }));
//
//         // Lấy thông tin ban đầu từ các thuộc tính đã được cache
//         this._updateStateFromProps({
//             Metadata: this.playerProxy.Metadata,
//             PlaybackStatus: this.playerProxy.PlaybackStatus
//         });
//
//         // Bổ sung lắng nghe riêng cho Metadata để đảm bảo cập nhật
//         this.signalIds.push(this.playerProxy.connect('g-property-notify::Metadata', () => {
//             this._updateStateFromProps({ Metadata: this.playerProxy.Metadata });
//             this._notifyCallbacks();
//         }));
//
//         this._notifyCallbacks();
//     }
//
//     _updateStateFromProps(props) {
//         if (props.PlaybackStatus !== undefined) {
//             this.playbackStatus = props.PlaybackStatus;
//         }
//         if (props.Metadata !== undefined) {
//             this.metadata = props.Metadata;
//         }
//
//         if (!this.metadata && this.playerProxy) {
//             this.metadata = this.playerProxy.Metadata || {};
//         }
//     }
//
//     _disconnectPlayer() {
//         if (this.playerProxy) {
//             this.signalIds.forEach(id => this.playerProxy.disconnect(id));
//             this.signalIds = [];
//             this.playerProxy = null;
//         }
//         this.currentPlayerName = null;
//         this.metadata = {};
//         this.playbackStatus = 'Stopped';
//         this._notifyCallbacks();
//     }
//
//     addCallback(callback) {
//         this.callbacks.push(callback);
//         callback(this.getMediaInfo());
//     }
//
//     getMediaInfo() {
//         const title = this.metadata['xesam:title'] || 'Không có Tiêu đề';
//         const artist = (this.metadata['xesam:artist'] && this.metadata['xesam:artist'][0]) || 'Không rõ Nghệ sĩ';
//         const artUrl = this.metadata['mpris:artUrl'] || this.metadata['xesam:artUrl'];
//         const isPlaying = this.playbackStatus === 'Playing';
//         const isPaused = this.playbackStatus === 'Paused';
//         const isStopped = this.playbackStatus === 'Stopped' || !this.currentPlayerName;
//
//         return {title, artist, artUrl, isPlaying, isPaused, isStopped, artCache: this._artCache};
//     }
//
//     _downloadImage(url, callback) {
//         const msg = Soup.Message.new('GET', url);
//
//         if (this._httpSession.send_and_read_async) { // Soup 3.0+
//             this._httpSession.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (session, result) => {
//                 try {
//                     const bytes = session.send_and_read_finish(result);
//                     const data = bytes.toArray();
//                     this._saveImage(url, data, callback);
//                 } catch (e) {
//                     log(`[Notch] Error downloading image (Soup 3): ${e.message}`);
//                 }
//             });
//         } else if (this._httpSession.queue_message) { // Soup 2.4
//             this._httpSession.queue_message(msg, (session, message) => {
//                 if (message.status_code === 200) {
//                     this._saveImage(url, message.response_body.data, callback);
//                 }
//             });
//         }
//     }
//
//     _saveImage(url, data, callback) {
//         try {
//             const dir = GLib.get_user_cache_dir() + '/notch-art';
//             GLib.mkdir_with_parents(dir, 0o755);
//
//             const checksum = new GLib.Checksum(GLib.ChecksumType.MD5);
//             checksum.update(url);
//             const path = dir + '/' + checksum.get_string() + '.jpg';
//
//             const file = Gio.File.new_for_path(path);
//             file.replace_contents(data, null, false, Gio.FileCreateFlags.NONE, null);
//
//             this._artCache.set(url, path);
//             callback(path);
//         } catch (e) {
//             log(`[Notch] Failed to save image: ${e.message}`);
//         }
//     }
//
//     sendPlayerCommand(method) {
//         if (!this.playerProxy) return;
//         try {
//             this.playerProxy[method]();
//         } catch (e) {
//             log(`[Notch] Failed to send ${method}: ${e.message}`);
//         }
//     }
//
//     destroy() {
//         if (this._dbusSignalId && this._dbusNameOwnerProxy) this._dbusNameOwnerProxy.disconnect(this._dbusSignalId);
//         this._dbusNameOwnerProxy = null;
//         this._disconnectPlayer();
//         this._httpSession?.abort();
//         this._artCache.clear();
//         this._httpSession = null;
//         this.callbacks = [];
//     }
// }
//
// // =========================================================================
// // 2. VIEWS (UI Actors)
// // =========================================================================
//
// class BatteryView {
//     constructor() {
//         this.compactContainer = new St.BoxLayout({x_expand: true, y_expand: true, style: 'padding: 0 16px;'});
//         this.iconLeft = new St.Icon({
//             icon_name: 'battery-good-symbolic',
//             icon_size: 24,
//             x_align: Clutter.ActorAlign.START,
//             x_expand: true
//         });
//         this.percentageLabel = new St.Label({
//             text: '0%',
//             style: 'font-weight: bold; font-size: 14px;',
//             x_align: Clutter.ActorAlign.END,
//             x_expand: true
//         });
//         this.compactContainer.add_child(this.iconLeft);
//         this.compactContainer.add_child(this.percentageLabel);
//
//         this.expandedContainer = new St.BoxLayout({
//             style_class: 'battery-expanded',
//             vertical: true,
//             x_align: Clutter.ActorAlign.CENTER,
//             y_align: Clutter.ActorAlign.CENTER,
//             visible: false
//         });
//         this.iconExpanded = new St.Icon({icon_name: 'battery-good-symbolic', icon_size: 64});
//         this.statusLabel = new St.Label({
//             text: 'Đang sạc...',
//             style: 'color: white; font-size: 18px; font-weight: bold; margin-top: 10px;'
//         });
//         this.expandedContainer.add_child(this.iconExpanded);
//         this.expandedContainer.add_child(this.statusLabel);
//     }
//
//     getCompactWidget() {
//         return this.compactContainer;
//     }
//
//     getExpandedWidget() {
//         return this.expandedContainer;
//     }
//
//     update(batteryInfo) {
//         let {percentage, isCharging, isPresent} = batteryInfo;
//         if (!isPresent) {
//             this.percentageLabel.set_text('N/A');
//             return;
//         }
//
//         let iconName = isCharging
//             ? 'battery-charging-symbolic'
//             : (percentage === 100 ? 'battery-full-charged-symbolic' : 'battery-good-symbolic');
//
//         this.percentageLabel.set_text(`${percentage}%`);
//         this.iconLeft.icon_name = iconName;
//         this.iconExpanded.icon_name = iconName;
//         this.statusLabel.set_text(isCharging ? `⚡ Đang sạc - ${percentage}%` : `Pin: ${percentage}%`);
//     }
//
//     destroy() {
//         this.compactContainer.destroy();
//         this.expandedContainer.destroy();
//     }
// }
//
// class MediaView {
//     constructor(manager) {
//         this.manager = manager;
//         this._artCache = manager._artCache;
//
//         this.compactContainer = new St.BoxLayout({x_expand: true, y_expand: true});
//         this.thumbnail = new St.Icon({
//             style_class: 'media-thumbnail',
//             icon_name: 'audio-x-generic-symbolic',
//             icon_size: 24,
//             opacity: 255
//         });
//         this.thumbnailWrapper = new St.Bin({
//             child: this.thumbnail,
//             x_align: Clutter.ActorAlign.START,
//             x_expand: true,
//             style_class: 'media-thumbnail-wrapper',
//             clip_to_allocation: true,
//             style: 'padding-left: 16px;'
//         });
//         this.audioIcon = new St.Icon({
//             style_class: 'media-audio-icon',
//             icon_name: 'audio-volume-high-symbolic',
//             icon_size: 20
//         });
//         this.audioIconWrapper = new St.Bin({
//             child: this.audioIcon,
//             x_align: Clutter.ActorAlign.END,
//             x_expand: true,
//             style: 'padding-right: 16px;'
//         });
//         this.compactContainer.add_child(this.thumbnailWrapper);
//         this.compactContainer.add_child(this.audioIconWrapper);
//
//         this.expandedContainer = new St.BoxLayout({
//             style_class: 'media-expanded-view',
//             vertical: false,
//             x_align: Clutter.ActorAlign.CENTER,
//             y_align: Clutter.ActorAlign.CENTER,
//             visible: false,
//             style: 'padding: 10px;'
//         });
//
//         this.expandedArt = new St.Icon({
//             style_class: 'media-expanded-art',
//             icon_name: 'audio-x-generic-symbolic',
//             icon_size: 96,
//             opacity: 255
//         });
//         this.expandedArtWrapper = new St.Bin({
//             child: this.expandedArt,
//             style_class: 'media-expanded-art-wrapper',
//             reactive: true,
//             clip_to_allocation: true,
//             x_align: Clutter.ActorAlign.START,
//             y_align: Clutter.ActorAlign.CENTER,
//             style: 'min-width: 120px; min-height: 120px; max-width: 120px; max-height: 120px; border-radius: 16px;'
//         });
//
//         this.infoControlsBox = new St.BoxLayout({vertical: true, x_expand: true, style: 'padding-left: 20px;'});
//         this.titleLabel = new St.Label({
//             style_class: 'media-title-label',
//             text: 'Tiêu đề',
//             x_align: Clutter.ActorAlign.START,
//             style: 'font-size: 16px; font-weight: bold; max-width: 250px;'
//         });
//         this.artistLabel = new St.Label({
//             style_class: 'media-artist-label',
//             text: 'Nghệ sĩ',
//             x_align: Clutter.ActorAlign.START,
//             style: 'font-size: 14px;'
//         });
//
//         this.controlsBox = this._buildControlsBox();
//
//         this.infoControlsBox.add_child(this.titleLabel);
//         this.infoControlsBox.add_child(this.artistLabel);
//         this.infoControlsBox.add_child(this.controlsBox);
//
//         this.expandedContainer.add_child(this.expandedArtWrapper);
//         this.expandedContainer.add_child(this.infoControlsBox);
//     }
//
//     _buildControlsBox() {
//         const box = new St.BoxLayout({
//             style_class: 'media-controls-box',
//             x_expand: true,
//             x_align: Clutter.ActorAlign.START,
//             style: 'margin-top: 10px;'
//         });
//         const controlConfig = [
//             {icon: 'media-skip-backward-symbolic', handler: 'Previous'},
//             {icon: 'media-playback-start-symbolic', handler: 'PlayPause', playPause: true},
//             {icon: 'media-skip-forward-symbolic', handler: 'Next'},
//         ];
//
//         controlConfig.forEach(config => {
//             const button = new St.Button({style_class: 'media-control-button', reactive: true, can_focus: true});
//             const icon = new St.Icon({style_class: 'media-control-icon', icon_name: config.icon, icon_size: 32});
//             button.set_child(icon);
//             button.connect('clicked', () => this.manager.sendPlayerCommand(config.handler));
//
//             if (config.playPause) {
//                 this.playPauseIcon = icon;
//             }
//             box.add_child(button);
//         });
//         return box;
//     }
//
//     getCompactWidget() {
//         return this.compactContainer;
//     }
//
//     getExpandedWidget() {
//         return this.expandedContainer;
//     }
//
//     update(mediaInfo) {
//         let {title, artist, artUrl, isPlaying, isStopped} = mediaInfo;
//
//         if (isStopped) {
//             this.compactContainer.hide();
//             this.expandedContainer.hide();
//             return;
//         }
//
//         this.compactContainer.show();
//         this.titleLabel.set_text(title);
//         this.artistLabel.set_text(artist);
//
//         const iconName = isPlaying ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
//         this.playPauseIcon.icon_name = iconName;
//
//         this._updateArt(artUrl);
//     }
//
//     _updateArt(artUrl) {
//         if (!artUrl) {
//             this._resetArt();
//             return;
//         }
//
//         if (this._artCache.has(artUrl)) {
//             this._setArtFromFile(this._artCache.get(artUrl));
//             return;
//         }
//
//         if (artUrl.startsWith('http')) {
//             this.manager._downloadImage(artUrl, (path) => this._setArtFromFile(path));
//         } else {
//             try {
//                 let path = artUrl.replace('file://', '');
//                 this._setArtFromFile(path);
//             } catch (e) {
//                 this._resetArt();
//             }
//         }
//     }
//
//     _setArtFromFile(path) {
//         const cssUrl = `file://${path}`.replace(/'/g, "\\'");
//         this.thumbnailWrapper.style = `background-image: url("${cssUrl}"); background-size: cover; border-radius: 99px;`;
//         this.thumbnail.opacity = 0;
//
//         this.expandedArtWrapper.style = `background-image: url("${cssUrl}"); background-size: cover; border-radius: 16px;`;
//         this.expandedArt.opacity = 0;
//     }
//
//     _resetArt() {
//         this.thumbnail.opacity = 255;
//         this.thumbnailWrapper.style = null;
//
//         this.expandedArt.opacity = 255;
//         this.expandedArtWrapper.style = null;
//     }
//
//     destroy() {
//         this.compactContainer.destroy();
//         this.expandedContainer.destroy();
//     }
// }
//
// // =========================================================================
// // 3. MODULES (Logic Điều khiển và Ưu tiên)
// // =========================================================================
//
// class BatteryModule {
//     constructor(notch, manager, view) {
//         this.notch = notch;
//         this.manager = manager;
//         this.view = view;
//         this._wasCharging = false;
//         this._autoExpandTimeoutId = null;
//         this.manager.addCallback(Lang.bind(this, this._onUpdate));
//     }
//
//     _onUpdate(info) {
//         this.view.update(info);
//         if (info.isCharging) this.notch.add_style_class_name('charging');
//         else this.notch.remove_style_class_name('charging');
//
//         let shouldAutoExpand = info.isCharging && !this._wasCharging;
//         this._wasCharging = info.isCharging;
//
//         if (shouldAutoExpand && !this.notch.isExpanded) {
//             this.notch.expandNotch(true);
//             if (this._autoExpandTimeoutId) GLib.source_remove(this._autoExpandTimeoutId);
//             this._autoExpandTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
//                 if (this.notch.isExpanded) this.notch.compactNotch();
//                 this._autoExpandTimeoutId = null;
//                 return GLib.SOURCE_REMOVE;
//             });
//         }
//         this.notch._updateNotchContent();
//     }
//
//     isActive() {
//         return this.manager.getBatteryInfo().isPresent;
//     }
//
//     isPriority() {
//         let info = this.manager.getBatteryInfo();
//         return info.percentage <= 20 || (info.isCharging && this.notch.isExpanded);
//     }
//
//     destroy() {
//         if (this._autoExpandTimeoutId) GLib.source_remove(this._autoExpandTimeoutId);
//     }
// }
//
// class MediaModule {
//     constructor(notch, manager, view) {
//         this.notch = notch;
//         this.manager = manager;
//         this.view = view;
//         this.manager.addCallback(Lang.bind(this, this._onUpdate));
//     }
//
//     _onUpdate(info) {
//         this.view.update(info);
//         this.notch._updateNotchContent();
//     }
//
//     isActive() {
//         let info = this.manager.getMediaInfo();
//         return info.isPlaying || info.isPaused;
//     }
//
//     isPriority() {
//         return this.manager.getMediaInfo().isPlaying;
//     }
//
//     destroy() {
//     }
// }
//
// // =========================================================================
// // 4. CLASS NOTCH (Controller chính và UI)
// // =========================================================================
// class Notch {
//     constructor() {
//         this.width = 220;
//         this.height = 40;
//         this.expandedWidth = 440;
//         this.expandedHeight = 160;
//         this.isExpanded = false;
//         this.originalScale = 1.0;
//         this._collapseTimeoutId = null;
//
//         let monitor = Main.layoutManager.primaryMonitor;
//         this.monitorWidth = monitor.width;
//
//         this.batteryManager = new BatteryManager();
//         this.mediaManager = new MediaManager();
//         this.batteryView = new BatteryView();
//         this.mediaView = new MediaView(this.mediaManager);
//
//         this.modules = [];
//         // MediaModule (vị trí 0) sẽ được kiểm tra ưu tiên trước BatteryModule
//         this.modules.push(new MediaModule(this, this.mediaManager, this.mediaView));
//         this.modules.push(new BatteryModule(this, this.batteryManager, this.batteryView));
//
//         this.notch = new St.BoxLayout({
//             style_class: 'notch compact-state', vertical: true, reactive: true, track_hover: true,
//             x_expand: false, can_focus: true, clip_to_allocation: true
//         });
//         this.notch.set_width(this.width);
//         this.notch.set_height(this.height);
//         this.notch.set_pivot_point(0.5, 0.5);
//
//         this.contentContainer = new St.Bin({
//             x_align: Clutter.ActorAlign.CENTER,
//             y_align: Clutter.ActorAlign.CENTER,
//             x_expand: true,
//             y_expand: true
//         });
//         this.notch.add_child(this.contentContainer);
//
//         this.notch.set_position(Math.floor((this.monitorWidth - this.width) / 2), 0);
//         Main.layoutManager.addChrome(this.notch, {affectsInputRegion: true, trackFullscreen: false});
//
//         this.expandedView = null;
//         this._setupMouseEvents();
//         this._updateNotchContent();
//     }
//
//     _updateNotchContent() {
//         let activeModule = null;
//
//         // 1. Tìm module có độ ưu tiên cao nhất (đang phát hoặc pin sắp hết/đang sạc mở rộng)
//         activeModule = this.modules.find(m => m.isPriority());
//
//         // 2. Nếu không có ưu tiên, tìm module đang hoạt động (media tạm dừng hoặc pin ở trạng thái thường)
//         if (!activeModule) {
//             activeModule = this.modules.find(m => m.isActive());
//         }
//
//         if (activeModule) {
//             this._switchView(activeModule.view);
//         }
//     }
//
//     _switchView(newView) {
//         if (!newView) return;
//
//         let currentCompactChild = this.contentContainer.get_child();
//         if (currentCompactChild !== newView.getCompactWidget()) {
//             if (currentCompactChild) {
//                 currentCompactChild.hide();
//                 this.contentContainer.remove_child(currentCompactChild);
//             }
//             this.contentContainer.set_child(newView.getCompactWidget());
//             newView.getCompactWidget().show();
//         }
//
//         this.expandedView = newView.getExpandedWidget();
//     }
//
//     _setupMouseEvents() {
//         this._motionEventId = this.notch.connect('motion-event', () => {
//             this._cancelAutoCollapse();
//             if (!this.isExpanded) this.expandNotch(false);
//             return Clutter.EVENT_PROPAGATE;
//         });
//
//         this._leaveEventId = this.notch.connect('leave-event', () => {
//             if (this.isExpanded && !this._collapseTimeoutId) {
//                 this._collapseTimeoutId = mainloop.timeout_add(200, () => {
//                     this.compactNotch();
//                     this._collapseTimeoutId = null;
//                     return false;
//                 });
//             }
//         });
//     }
//
//     _cancelAutoCollapse() {
//         if (this._collapseTimeoutId) {
//             mainloop.source_remove(this._collapseTimeoutId);
//             this._collapseTimeoutId = null;
//         }
//     }
//
//     expandNotch(isAuto = false) {
//         if (this.isExpanded) return;
//         this.isExpanded = true;
//         this.notch.remove_all_transitions();
//
//         let compactView = this.contentContainer.get_child();
//         if (compactView) compactView.hide();
//
//         if (this.expandedView) {
//             if (this.expandedView.get_parent() !== this.notch) this.notch.add_child(this.expandedView);
//             this.expandedView.show();
//         }
//
//         this.notch.add_style_class_name('expanded-state');
//         this.notch.remove_style_class_name('compact-state');
//
//         let newX = Math.floor((this.monitorWidth - this.expandedWidth) / 2);
//
//         this.notch.ease({
//             width: this.expandedWidth, height: this.expandedHeight, x: newX,
//             duration: 200, mode: Clutter.AnimationMode.EASE_OUT_QUAD
//         });
//     }
//
//     compactNotch() {
//         if (!this.isExpanded) return;
//         this.isExpanded = false;
//         this.notch.remove_all_transitions();
//
//         if (this.expandedView) {
//             this.expandedView.hide();
//             if (this.expandedView.get_parent() === this.notch) this.notch.remove_child(this.expandedView);
//         }
//
//         let compactView = this.contentContainer.get_child();
//         if (compactView) compactView.show();
//
//         this.notch.add_style_class_name('compact-state');
//         this.notch.remove_style_class_name('expanded-state');
//
//         let originalX = Math.floor((this.monitorWidth - this.width) / 2);
//
//         this.notch.ease({
//             width: this.width, height: this.height, x: originalX,
//             duration: 200, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
//             onComplete: () => {
//                 this.squeeze();
//             }
//         });
//     }
//
//     squeeze() {
//         this.notch.remove_all_transitions();
//         this.notch.ease({
//             scale_x: 0.75, scale_y: 1.0, duration: 150, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
//             onComplete: () => {
//                 this.notch.ease({
//                     scale_x: this.originalScale, scale_y: this.originalScale,
//                     duration: 200, mode: Clutter.AnimationMode.EASE_OUT_BACK
//                 });
//             }
//         });
//     }
//
//     destroy() {
//         this._cancelAutoCollapse();
//         this.modules.forEach(m => m.destroy());
//         if (this.batteryManager) this.batteryManager.destroy();
//         if (this.mediaManager) this.mediaManager.destroy();
//         if (this.batteryView) this.batteryView.destroy();
//         if (this.mediaView) this.mediaView.destroy();
//
//         if (this.notch) {
//             if (this._motionEventId) this.notch.disconnect(this._motionEventId);
//             if (this._leaveEventId) this.notch.disconnect(this._leaveEventId);
//             Main.layoutManager.removeChrome(this.notch);
//             this.notch.destroy();
//         }
//     }
// }
//
// // ============================================
// // GNOME SHELL EXTENSION API
// // ============================================
// function init() {
// }
//
// function enable() {
//     notch = new Notch();
// }
//
// function disable() {
//     if (notch) {
//         notch.destroy();
//         notch = null;
//     }
// }