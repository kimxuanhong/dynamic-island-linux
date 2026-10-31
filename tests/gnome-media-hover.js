import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
export const METRICS = {};
export async function run() {
 const extension = Main.extensionManager.lookup('dynamic-island@xuanhong');
 for (let i=0; i<20 && !extension?.stateObj; i++) await Scripting.sleep(250);
 const c=extension?.stateObj?._notchController;
 if (!c) throw new Error('Extension failed');
 await Scripting.sleep(1800);
 Main.overview.hide();
 await Scripting.sleep(800);
 c.cycleManager.activate('battery');
 c.cycleManager.activate('media');
 c.presenterRegistry.switchTo('media', true);
 c.stateMachine.transitionTo('compact');
 c.notch.set_size(c.width,c.height);
 c.layoutManager.updateLayout();
 await Scripting.sleep(100);
 const pointer=global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
 const move=async(x,y)=>{
  pointer.notify_absolute_motion(GLib.get_monotonic_time(),x,y);
  await Scripting.sleep(100);
 };
 await move(30,400);
 await move(40,410);
 await move(20,400);
 const startX=c.notch.x;
 c._dismissMedia();
 if (Math.abs(c.notch.x-startX)>1) throw new Error('Removing media snapped compact position');
 await Scripting.sleep(70);
 await move(c._calculateNotchX(c.width)+c.width/2,c._calculateNotchY()+38);
 await move(c._calculateNotchX(c.width)+c.width/2+1,c._calculateNotchY()+39);
 await Scripting.sleep(1000);
 if (!c.notch.hover || !c.stateMachine.isExpanded() || c.presenterRegistry.getCurrent()!=='battery')
  throw new Error(`Hover did not open battery after media cleanup: ${c.stateMachine.getState()}, ${c.presenterRegistry.getCurrent()}, hover=${c.notch.hover}`);
 await Scripting.sleep(2800);
 if (!c.stateMachine.isExpanded() || !c.batteryView.expandedContainer.visible)
  throw new Error('Hovered battery collapsed because media presenter/timer was stale');
 await move(20,400);
 await Scripting.sleep(1400);
 if (!c.stateMachine.isCompact()) throw new Error(`Battery did not collapse after pointer left: ${c.stateMachine.getState()}, hover=${c.notch.hover}, pointer=${global.get_pointer()}`);
 extension.stateObj.disable();
 print('DYNAMIC_ISLAND_MEDIA_HOVER_PASS');
}
