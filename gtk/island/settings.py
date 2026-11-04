"""GTK preferences window and settings persistence."""
from gi.repository import Gdk, Gtk
from .widgets import box, label
try:
    from gi.repository import Gtk4LayerShell as Layer
except ImportError:
    Layer = None


class Settings:
    def build_settings(self):
        self.settings_window = Gtk.Window(title="Dynamic Island — Cài đặt")
        self.settings_window.add_css_class("preferences-window")
        self.settings_window.set_default_size(640, 720)
        self.settings_window.set_transient_for(self.window)
        self.settings_window.set_hide_on_close(True)
        header = Gtk.HeaderBar()
        header.set_title_widget(Gtk.Label(label="Dynamic Island"))
        self.settings_window.set_titlebar(header)
        scroller = Gtk.ScrolledWindow()
        scroller.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        self.settings_window.set_child(scroller)
        page = box(True, 24, "preferences-page")
        page.set_halign(Gtk.Align.CENTER)
        page.set_hexpand(True)
        page.set_size_request(520, -1)
        scroller.set_child(page)
        self.settings_controls = {}

        appearance = self.preferences_group(page, "Giao diện")
        self.preferences_number(appearance, "Độ đậm nền", "Chỉ thay đổi nền; chữ và biểu tượng vẫn rõ", "background_opacity", 0, 100)
        self.preferences_number(appearance, "Chiều rộng thu gọn", "Chiều rộng của notch khi chưa mở", "island_width", 120, 320)
        self.preferences_number(appearance, "Chiều cao thu gọn", "Chiều cao của notch khi chưa mở", "island_height", 36, 88)
        self.preferences_number(appearance, "Khoảng cách mép trên", "Khoảng cách từ cạnh trên màn hình", "top_margin", 0, 100)
        monitors = Gdk.Display.get_default().get_monitors()
        names = [monitors.get_item(i).get_connector() or f"Màn hình {i + 1}" for i in range(monitors.get_n_items())]
        if names:
            self.preferences_choice(appearance, "Màn hình", "Chọn màn hình hiển thị Dynamic Island", "monitor", tuple(enumerate(names)))
        self.preferences_choice(appearance, "Nội dung mặc định", "Hiện khi không có hoạt động nào", "default_content", (("battery", "Pin nếu có"), ("clock", "Đồng hồ"), ("network-speed", "Tốc độ mạng"), ("hidden", "Ẩn")))
        self.preferences_switch(appearance, "Mở khi rê chuột", "Mở rộng khi con trỏ ở trên notch", "hover")

        levels = self.preferences_group(page, "Âm lượng và độ sáng")
        self.preferences_switch(levels, "Hiện âm lượng", "Hiện thay đổi âm lượng đầu ra", "show_volume")
        self.preferences_switch(levels, "Hiện độ sáng", "Hiện thay đổi độ sáng màn hình", "show_brightness")
        self.preferences_number(levels, "Thời gian hiển thị", "Số giây trước khi thu gọn", "level_seconds", 1, 10)

        notifications = self.preferences_group(page, "Thông báo")
        self.preferences_switch(notifications, "Hiện thông báo", "Hiện thông báo ứng dụng trong Dynamic Island", "notifications")
        self.preferences_choice(notifications, "Kiểu thông báo", "Chọn cách hiển thị thông báo mới", "notification_style", (("off", "Tắt"), ("icon", "Biểu tượng thu gọn"), ("card", "Thẻ mở rộng")))
        self.preferences_number(notifications, "Thời gian thẻ", "Số giây hiển thị thẻ thông báo", "notification_seconds", 1, 10)

        connections = self.preferences_group(page, "Kết nối")
        self.preferences_switch(connections, "Wi-Fi và Ethernet", "Hiện sự kiện kết nối mạng", "show_network")
        self.preferences_switch(connections, "Bluetooth", "Hiện sự kiện kết nối thiết bị", "show_bluetooth")

        privacy = self.preferences_group(page, "Quyền riêng tư", "Nhập tên ứng dụng, app ID hoặc tên tiến trình chính xác, cách nhau bằng dấu phẩy.")
        self.preferences_exclusions(privacy, "Ứng dụng micro bị loại trừ", "microphone_excluded_apps")
        self.preferences_exclusions(privacy, "Ứng dụng camera bị loại trừ", "camera_excluded_apps")

    def preferences_group(self, page, title, description=None):
        group = box(True, 8)
        heading = label(title, "preferences-heading")
        group.append(heading)
        if description:
            text = label(description, "preferences-description")
            text.set_wrap(True)
            group.append(text)
        rows = Gtk.ListBox()
        rows.set_selection_mode(Gtk.SelectionMode.NONE)
        rows.add_css_class("preferences-card")
        group.append(rows)
        page.append(group)
        return rows

    def preferences_row(self, group, title, subtitle, control):
        row = Gtk.ListBoxRow(activatable=False, selectable=False)
        row.add_css_class("preferences-row")
        content = box(False, 18)
        text = box(True, 3)
        text.set_hexpand(True)
        title_label = label(title, "preferences-row-title")
        text.append(title_label)
        if subtitle:
            sub = label(subtitle, "preferences-description")
            sub.set_wrap(True)
            text.append(sub)
        content.append(text)
        control.set_valign(Gtk.Align.CENTER)
        content.append(control)
        row.set_child(content)
        group.append(row)
        return row

    def preferences_number(self, group, title, subtitle, key, lower, upper):
        control = Gtk.SpinButton.new_with_range(lower, upper, 1)
        control.set_value(self.settings[key])
        control.connect("value-changed", lambda widget: self.setting(key, widget.get_value_as_int()))
        self.preferences_row(group, title, subtitle, control)
        self.settings_controls[key] = control

    def preferences_switch(self, group, title, subtitle, key):
        control = Gtk.Switch(active=bool(self.settings[key]))
        control.connect("notify::active", lambda widget, *_: self.setting(key, widget.get_active()))
        self.preferences_row(group, title, subtitle, control)
        self.settings_controls[key] = control

    def preferences_choice(self, group, title, subtitle, key, choices):
        values = [value for value, _ in choices]
        control = Gtk.DropDown.new_from_strings([text for _, text in choices])
        control.set_selected(values.index(self.settings[key]) if self.settings[key] in values else 0)
        control.connect("notify::selected", lambda widget, *_: self.setting(key, values[widget.get_selected()]) if widget.get_selected() < len(values) else None)
        self.preferences_row(group, title, subtitle, control)
        self.settings_controls[key] = control

    def preferences_exclusions(self, group, title, key):
        controls = box(False, 8)
        entry = Gtk.Entry()
        entry.set_width_chars(20)
        entry.set_placeholder_text("Tên ứng dụng, app ID…")
        entry.set_text(", ".join(str(item) for item in self.settings[key]))
        apply_button = Gtk.Button(label="Lưu")
        controls.append(entry)
        controls.append(apply_button)
        def save(*_):
            value = list(dict.fromkeys(part.strip() for part in entry.get_text().split(",") if part.strip()))
            self.setting(key, value)
            entry.set_text(", ".join(value))
        entry.connect("activate", save)
        apply_button.connect("clicked", save)
        self.preferences_row(group, title, None, controls)
        self.settings_controls[key] = entry

    def setting(self, key, value):
        self.settings[key] = value
        if key in ("microphone_excluded_apps", "camera_excluded_apps"):
            device = key.removesuffix("_excluded_apps")
            self.state.privacy_exclusions[device] = value
            self.state.refresh_privacy()
            if not any(kind == device for kind, _ in self.state.privacy):
                self.queue.pending = type(self.queue.pending)(
                    (notice for notice in self.queue.pending if notice.key != device), maxlen=12)
                if self.queue.current and self.queue.current.key == device:
                    self.queue.current = None
                self.last_notice = object()
        if key == "notifications" and not value:
            self.queue.pending = type(self.queue.pending)(
                (notice for notice in self.queue.pending if not notice.key.startswith("notification:")), maxlen=12)
            if self.queue.current and self.queue.current.key.startswith("notification:"):
                self.queue.current = None
        if key == "notification_style" and value == "off":
            self.queue.pending = type(self.queue.pending)(
                (notice for notice in self.queue.pending if not notice.key.startswith("notification:")), maxlen=12)
            if self.queue.current and self.queue.current.key.startswith("notification:"):
                self.queue.current = None
        if key in ("show_volume", "show_brightness", "show_network", "show_bluetooth") and not value:
            event_key = key.removeprefix("show_")
            self.queue.pending = type(self.queue.pending)(
                (notice for notice in self.queue.pending if notice.key != event_key), maxlen=12)
            if self.queue.current and self.queue.current.key == event_key:
                self.queue.current = None
        if key in ("notifications", "notification_style", "show_volume", "show_brightness", "show_network", "show_bluetooth"):
            self.last_notice = object()
        self.apply_position()
        if key in ("island_width", "island_height", "background_opacity"):
            self.apply_appearance()
            self.secondary_island.set_size_request(56, self.settings["island_height"])
            if not self.expanded:
                self.width_to = self.settings["island_width"]
                self.height_to = self.settings["island_height"]
                if not self.width_timer:
                    self.island.set_size_request(self.width_to, self.height_to)
                    self.compact_window_width = None
        if hasattr(self, "last_notice"):
            self.render()
            self.refresh_expanded()
        if not self.options.demo:
            import json
            try:
                self.settings_path.parent.mkdir(parents=True, exist_ok=True)
                temporary = self.settings_path.with_suffix(".tmp")
                temporary.write_text(json.dumps(self.settings, ensure_ascii=False, indent=2) + "\n")
                temporary.replace(self.settings_path)
            except OSError as error:
                self.on_error("Không lưu được cài đặt", str(error))


    def apply_position(self):
        if self.layered:
            Layer.set_margin(self.window, Layer.Edge.TOP, self.settings["top_margin"])
            monitors = Gdk.Display.get_default().get_monitors()
            monitor = monitors.get_item(min(self.settings["monitor"], max(0, monitors.get_n_items() - 1)))
            if monitor:
                Layer.set_monitor(self.window, monitor)


    def apply_appearance(self):
        opacity = self.settings["background_opacity"] / 100
        self.appearance_provider.load_from_data(f".island, .battery-island {{ background-color: rgba(0, 0, 0, {opacity}); }}".encode())


    def toggle_settings(self, *_):
        if self.settings_window.get_visible():
            self.settings_window.set_visible(False)
        else:
            self.settings_window.present()




