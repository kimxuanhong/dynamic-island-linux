import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
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
    const emit = () => Gio.DBus.session.emit_signal(null,
        '/com/github/dynamic_island/InputMethod',
        'com.github.dynamic_island.InputMethod', 'Activated',
        new GLib.Variant('(sss)', ['areca', 'Bộ gõ ArecaIME', 'org.fcitx.Fcitx5.fcitx-areca']));
    await Scripting.sleep(700);
    emit();
    await Scripting.sleep(700);
    if (c.presenterRegistry.getCurrent() !== 'input-method' ||
        !c.stateMachine.isExpanded() ||
        c.inputMethodView.statusLabel.text !== 'Bộ gõ ArecaIME' ||
        !c.inputMethodView.expandedContainer.visible)
        throw new Error('Input method announcement not displayed');
    await Scripting.sleep(2400);
    if (!c.stateMachine.isCompact()) throw new Error('Announcement did not collapse');
    extension.stateObj.disable();
    emit();
    await Scripting.sleep(100);
    extension.stateObj.enable();
    await Scripting.sleep(500);
    emit();
    await Scripting.sleep(700);
    if (extension.stateObj._notchController.inputMethodView.statusLabel.text !== 'Bộ gõ ArecaIME')
        throw new Error('Subscription failed after re-enable');
    extension.stateObj.disable();
    print('DYNAMIC_ISLAND_INPUT_METHOD_PASS');
}
