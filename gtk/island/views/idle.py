"""IdleView responsibilities for the GTK island."""
import calendar as calendar_module
from datetime import date, timedelta
from gi.repository import Gtk
from ..widgets import MONTHS, box, label


class IdleView:
    def build_idle_view(self):
        self.idle_view = box(False, 16, "idle-view")
        summary = box(True, 14, "idle-summary")
        self.idle_summary = summary
        summary.set_hexpand(True)
        summary.set_valign(Gtk.Align.CENTER)
        self.idle_icon = Gtk.Image.new_from_icon_name("battery-good-symbolic")
        self.idle_icon.set_pixel_size(32)
        self.idle_icon.set_halign(Gtk.Align.CENTER)
        self.idle_icon.set_valign(Gtk.Align.CENTER)
        self.idle_icon.set_hexpand(True)
        self.idle_icon_tile = box(False, 0, "status-icon-tile")
        self.idle_icon_tile.add_css_class("mint")
        self.idle_icon_tile.set_hexpand(False)
        self.idle_icon_tile.set_size_request(64, 64)
        self.idle_icon_tile.set_halign(Gtk.Align.START)
        self.idle_icon_tile.set_valign(Gtk.Align.CENTER)
        self.idle_icon_tile.append(self.idle_icon)
        self.idle_title = label("", "battery-detail-title")
        self.idle_detail = label("", "status-detail")
        summary.append(self.idle_icon_tile)
        self.idle_text = box(True, 3, "idle-text")
        self.idle_text.set_hexpand(True)
        self.idle_text.set_valign(Gtk.Align.CENTER)
        self.idle_category = label("", "status-eyebrow")
        self.idle_text.append(self.idle_category)
        self.idle_text.append(self.idle_title)
        self.idle_text.append(self.idle_detail)
        self.battery_progress = Gtk.ProgressBar()
        self.battery_progress.add_css_class("battery-progress")
        self.battery_progress.set_size_request(160, -1)
        self.battery_progress.set_halign(Gtk.Align.START)
        self.idle_text.append(self.battery_progress)
        self.clock_weekday = label("", "clock-weekday")
        self.clock_day = label("", "clock-day")
        self.clock_date = label("", "clock-date")
        self.clock_time = label("", "clock-time")
        self.idle_text.append(self.clock_weekday)
        self.idle_text.append(self.clock_day)
        self.idle_text.append(self.clock_date)
        self.idle_text.append(self.clock_time)
        summary.append(self.idle_text)
        self.idle_view.append(summary)
        self.idle_calendar = box(True, 3, "clock-calendar")
        self.idle_calendar.set_valign(Gtk.Align.CENTER)
        calendar_header = box(False, 0, "clock-calendar-header")
        previous_month = Gtk.Button(label="‹")
        previous_month.add_css_class("clock-month-button")
        previous_month.set_size_request(24, 24)
        previous_month.set_tooltip_text("Tháng trước")
        previous_month.connect("clicked", lambda *_: self.browse_calendar(-1))
        self.month_heading = Gtk.Button(label="")
        self.month_heading.add_css_class("clock-month-heading")
        self.month_heading.set_hexpand(True)
        self.month_heading.set_tooltip_text("Về tháng hiện tại")
        self.month_heading.connect("clicked", lambda *_: self.show_current_month())
        next_month = Gtk.Button(label="›")
        next_month.add_css_class("clock-month-button")
        next_month.set_size_request(24, 24)
        next_month.set_tooltip_text("Tháng sau")
        next_month.connect("clicked", lambda *_: self.browse_calendar(1))
        calendar_header.append(previous_month)
        calendar_header.append(self.month_heading)
        calendar_header.append(next_month)
        self.idle_calendar.append(calendar_header)
        self.calendar_grid = Gtk.Grid()
        self.calendar_grid.set_column_homogeneous(True)
        self.calendar_grid.set_row_homogeneous(True)
        self.calendar_grid.add_css_class("clock-calendar-grid")
        self.calendar_days = []
        for column, weekday in enumerate(("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")):
            day_label = label(weekday, "clock-calendar-weekday", 0.5)
            self.calendar_grid.attach(day_label, column, 0, 1, 1)
        for row in range(6):
            for column in range(7):
                day_label = label("", "clock-calendar-day", 0.5)
                day_label.set_hexpand(True)
                day_label.set_vexpand(True)
                self.calendar_grid.attach(day_label, column, row + 1, 1, 1)
                self.calendar_days.append(day_label)
        self.idle_calendar.append(self.calendar_grid)
        self.calendar_month = date.today().replace(day=1)
        self.calendar_follow_today = True
        self.idle_calendar.set_hexpand(True)
        self.idle_calendar.set_size_request(244, 140)
        self.render_calendar()
        self.idle_view.append(self.idle_calendar)
        self.view_area.add_named(self.idle_view, "idle")


    def browse_calendar(self, delta):
        self.calendar_follow_today = False
        month_index = self.calendar_month.month - 1 + delta
        year = self.calendar_month.year + month_index // 12
        month = month_index % 12 + 1
        self.calendar_month = date(year, month, 1)
        self.render_calendar()


    def show_current_month(self):
        self.calendar_follow_today = True
        self.calendar_month = date.today().replace(day=1)
        self.render_calendar()


    def render_calendar(self):
        month = self.calendar_month
        self.month_heading.set_label(f"{MONTHS[month.month - 1]} {month.year}")
        first_weekday = calendar_module.monthrange(month.year, month.month)[0]
        start = month - timedelta(days=first_weekday)
        today = date.today()
        for index, day_label in enumerate(self.calendar_days):
            day = start + timedelta(days=index)
            day_label.set_text(str(day.day))
            day_label.remove_css_class("other-month")
            day_label.remove_css_class("today")
            if day.month != month.month:
                day_label.add_css_class("other-month")
            if day == today:
                day_label.add_css_class("today")


