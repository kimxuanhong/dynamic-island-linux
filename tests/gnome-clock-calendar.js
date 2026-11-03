import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
export const METRICS = {};
export async function run() {
    const extension = Main.extensionManager.lookup('dynamic-island@xuanhong');
    for (let i = 0; i < 20 && !extension?.stateObj; i++) await Scripting.sleep(250);
    const e = extension?.stateObj;
    if (!e) throw new Error('Extension failed');
    Main.overview.hide();
    const c = e._notchController;
    e._settings.set_string('default-content', 'clock');
    await Scripting.sleep(1000);
    const pointer = global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    const move = async (x, y) => {
        pointer.notify_absolute_motion(GLib.get_monotonic_time(), x, y);
        await Scripting.sleep(120);
    };
    await move(20, 400);
    const [x, y] = c.notch.get_transformed_position();
    const [w, h] = c.notch.get_transformed_size();
    await move(x + w / 2, y + h - 2);
    await move(x + w / 2 + 1, y + h - 1);
    await Scripting.sleep(450);
    const view = c.clockView;
    if (!c.stateMachine.isExpanded() || !view.expandedContainer.visible || c.notch.width !== 440 || c.notch.height !== 180)
        throw new Error(`Hover did not open fixed-size clock calendar: state=${c.stateMachine.getState()}, hover=${c.notch.hover}, current=${c.presenterRegistry.getCurrent()}, visible=${view.expandedContainer.visible}, size=${c.notch.width}x${c.notch.height}`);
    const now = GLib.DateTime.new_now_local();
    if (view._date.text !== now.format('%B %Y') || view._day.text !== now.format('%d') ||
        view._dayLabels.filter(day => day.has_style_class_name('today')).length !== 1)
        throw new Error('Current date or today highlight incorrect');
    const [cardX, cardY] = c.notch.get_transformed_position();
    for (const actor of [view._day, view._date, view._time, view._monthButton, ...view._dayLabels]) {
        const [ax, ay] = actor.get_transformed_position();
        const [aw, ah] = actor.get_transformed_size();
        if (ax < cardX - 1 || ay < cardY - 1 || ax + aw > cardX + 441 || ay + ah > cardY + 181)
            throw new Error('Calendar content overflowed fixed card');
    }
    view._followToday = false;
    view.setMonth(2024, 2);
    if (view._dayLabels.filter(day => !day.has_style_class_name('other-month')).length !== 29 || view._dayLabels[3].text !== '1')
        throw new Error('Leap-year calendar layout incorrect');
    view.setMonth(2024, 12);
    const next = view._monthButton.get_parent().get_last_child();
    const [nx, ny] = next.get_transformed_position();
    const [nw, nh] = next.get_transformed_size();
    await move(nx + nw / 2, ny + nh / 2);
    pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
    await Scripting.sleep(80);
    pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
    await Scripting.sleep(100);
    if (view._month.get_year() !== 2025 || view._month.get_month() !== 1)
        throw new Error('Month navigation failed across year boundary');
    view.showToday();
    await move(20, 400);
    await Scripting.sleep(1300);
    if (!c.stateMachine.isCompact() || view.expandedContainer.visible || !view.compactContainer.visible)
        throw new Error('Leaving clock did not restore compact time');
    e.disable();
    print('DYNAMIC_ISLAND_CLOCK_CALENDAR_PASS');
}
