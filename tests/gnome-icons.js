import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
export const METRICS = {};
export async function run() {
 const extension = Main.extensionManager.lookup('dynamic-island@xuanhong');
 for (let i=0; i<20 && !extension?.stateObj; i++) await Scripting.sleep(250);
 const c=extension.stateObj._notchController;
 const icon=c.brightnessView.expandedIcon;
 const {IslandIcon} = await import(`${extension.dir.get_uri()}/utils/islandIcon.js`);
 const files = extension.dir.get_child('icons').enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
 let file;
 while ((file = files.next_file(null))) {
   if (!file.get_name().endsWith('.svg')) continue;
   const sample = new IslandIcon({icon_name: file.get_name().replace(/\.svg$/, ''), icon_size: 24});
   if (!(sample.gicon instanceof Gio.FileIcon)) throw new Error(`Theme fallback: ${file.get_name()}`);
   sample.destroy();
 }
 files.close(null);
 if (!(icon.gicon instanceof Gio.FileIcon)) throw new Error('Built-in icon used theme instead of bundled SVG');
 icon.icon_name='audio-volume-muted-symbolic';
 if (!icon.gicon?.to_string().endsWith('/icons/audio-volume-muted-symbolic.svg')) throw new Error('Dynamic icon failed');
 icon.icon_name = 'missing-distro-specific-symbolic';
 if (!icon.gicon?.to_string().endsWith('/icons/application-x-executable-symbolic.svg'))
   throw new Error('Unknown icon depended on the distro theme');
 const artwork = Gio.FileIcon.new(extension.dir.get_child('icons/media-playback-start-symbolic.svg'));
 icon.gicon = artwork;
 if (!icon.gicon.equal(artwork)) throw new Error('App artwork was overwritten');
 extension.stateObj.disable();
 print('DYNAMIC_ISLAND_ICONS_PASS');
}
