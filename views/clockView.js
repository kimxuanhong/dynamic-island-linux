import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';
import {connectClick} from '../utils/input.js';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthTitle = date => `${MONTHS[date.get_month() - 1]} ${date.get_year()}`;

function label(styleClass, text = '') {
    const actor = new St.Label({text, style_class: styleClass, x_expand: true,
        y_align: Clutter.ActorAlign.CENTER});
    actor.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return actor;
}

export class ClockView {
    constructor() {
        this.compactLabel = label('clock-compact');
        this.secondaryLabel = label('clock-compact');
        for (const text of [this.compactLabel, this.secondaryLabel]) {
            text.x_expand = false;
            text.x_align = Clutter.ActorAlign.CENTER;
        }
        this.compactContainer = new St.Bin({child: this.compactLabel, x_expand: true, y_expand: true});
        this.secondaryContainer = new St.Bin({child: this.secondaryLabel, x_expand: true, y_expand: true});
        this._weekday = label('clock-weekday');
        this._day = label('clock-day');
        this._date = label('clock-date');
        this._time = label('clock-time');
        const summary = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            style_class: 'clock-summary', width: 148, y_align: Clutter.ActorAlign.CENTER});
        for (const actor of [this._weekday, this._day, this._date, this._time]) summary.add_child(actor);
        const calendar = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            style_class: 'clock-calendar', width: 244, y_align: Clutter.ActorAlign.CENTER});
        const header = new St.BoxLayout({height: 24});
        const previous = new St.Button({label: '‹', accessible_name: 'Previous month', style_class: 'clock-month-button', width: 24});
        const next = new St.Button({label: '›', accessible_name: 'Next month', style_class: 'clock-month-button', width: 24});
        this._monthButton = new St.Button({style_class: 'clock-month-heading', accessible_name: 'Return to current month', x_expand: true});
        connectClick(previous, () => this.browseMonth(-1));
        connectClick(next, () => this.browseMonth(1));
        connectClick(this._monthButton, () => this.showToday());
        header.add_child(previous);
        header.add_child(this._monthButton);
        header.add_child(next);
        calendar.add_child(header);
        const layout = new Clutter.GridLayout({column_homogeneous: true, row_homogeneous: true});
        this._calendarGrid = new St.Widget({layout_manager: layout, width: 244, height: 112});
        this._weekdayLabels = [];
        this._dayLabels = [];
        this._dayCells = [];
        const cell = (text, column, row, styleClass) => {
            // Center the label actor itself. Centering its ClutterText alone
            // leaves short text aligned to the start of a wider St.Label.
            text.x_expand = false;
            text.x_align = Clutter.ActorAlign.CENTER;
            const bin = new St.Bin({child: text, style_class: styleClass,
                x_expand: true, y_expand: true});
            layout.attach(bin, column, row, 1, 1);
            return bin;
        };
        for (let column = 0; column < 7; column++) {
            const day = label('clock-calendar-weekday');
            this._weekdayLabels.push(day);
            cell(day, column, 0, 'clock-calendar-cell');
        }
        for (let row = 0; row < 6; row++) {
            for (let column = 0; column < 7; column++) {
                const day = label('clock-calendar-day');
                this._dayLabels.push(day);
                this._dayCells.push(cell(day, column, row + 1, 'clock-calendar-cell'));
            }
        }
        calendar.add_child(this._calendarGrid);
        this.expandedContainer = new St.BoxLayout({style_class: 'clock-expanded',
            x_expand: true, y_expand: true, visible: false});
        this.expandedContainer.add_child(summary);
        this.expandedContainer.add_child(calendar);
        this._followToday = true;
        this.updateClock();
    }

    updateClock(now = GLib.DateTime.new_now_local()) {
        this._now = now;
        this.compactLabel.text = now.format('%H:%M');
        this.secondaryLabel.text = this.compactLabel.text;
        this._time.text = now.format('%H:%M:%S');
        const dateKey = now.format('%F');
        if (this._dateKey === dateKey) return;
        this._dateKey = dateKey;
        this._weekday.text = WEEKDAYS[now.get_day_of_week() - 1];
        this._day.text = now.format('%d');
        this._date.text = monthTitle(now);
        if (this._followToday) this.setMonth(now.get_year(), now.get_month());
        else this._renderMonth();
    }

    setMonth(year, month) {
        this._month = GLib.DateTime.new_local(year, month, 1, 12, 0, 0);
        this._renderMonth();
    }

    browseMonth(delta) {
        this._followToday = false;
        this._month = this._month.add_months(delta);
        this._renderMonth();
    }

    showToday() {
        this._followToday = true;
        this.setMonth(this._now.get_year(), this._now.get_month());
    }

    _renderMonth() {
        this._monthButton.label = monthTitle(this._month);
        const first = this._month.add_days(1 - this._month.get_day_of_week());
        this._weekdayLabels.forEach((actor, i) => { actor.text = WEEKDAYS[i].slice(0, 3); });
        this._dayLabels.forEach((actor, i) => {
            const date = first.add_days(i);
            actor.text = date.format('%e').trim();
            actor.accessible_name = `${WEEKDAYS[date.get_day_of_week() - 1]}, ${date.format('%d')} ${monthTitle(date)}`;
            actor.set_style_class_name('clock-calendar-day');
            this._dayCells[i].set_style_class_name('clock-calendar-cell');
            if (date.get_month() !== this._month.get_month()) actor.add_style_class_name('other-month');
            if (date.format('%F') === this._dateKey) {
                actor.add_style_class_name('today');
                this._dayCells[i].add_style_class_name('today');
            }
        });
    }

    show() { this.compactContainer.show(); this.expandedContainer.show(); }
    hide() { this.compactContainer.hide(); this.secondaryContainer.hide(); this.expandedContainer.hide(); }
    destroy() {
        this.compactContainer.destroy();
        this.secondaryContainer.destroy();
        this.expandedContainer.destroy();
    }
}
