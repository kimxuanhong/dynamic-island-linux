"""Presenter responsibilities for the GTK island."""
from datetime import datetime
import random
from gi.repository import Gdk, GdkPixbuf, Gio, GLib, Gtk
from .state import artist, duration
from .widgets import MONTHS, WEEKDAYS


class Presenter:
    def render(self):
        media, battery = self.state.media, self.state.battery
        self.sync_compact_activities()
        has_media = self.media_active and bool(media.get("player"))
        playing = media.get("status") == "Playing"
        title = media.get("title") or ""
        if has_media and title and title != self.last_title:
            colors = ("255,100,100", "100,200,255", "100,255,150", "255,200,100", "255,100,200", "200,100,255", "100,255,255", "255,255,100", "255,150,100", "150,255,200")
            color = random.choice(colors)
            self.media_color_provider.load_from_data(
                f".media-visualizer.media-active .media-visualizer-bar, .secondary-visualizer .media-visualizer-bar {{ background-color: rgb({color}); }}".encode())
            self.last_title = title
        elif not media.get("player"):
            self.last_title = None
        compact_main_privacy = self.compact_current in ("microphone", "camera")
        compact_main_uxplay = self.compact_current == "uxplay"
        device = self.compact_current if compact_main_privacy else None
        notice = self.queue.current
        compact_notice = notice and notice.key.startswith("notification:") and self.settings["notification_style"] == "icon"
        default_content = self.settings["default_content"]
        idle_text = ""
        idle_icon = "view-grid-symbolic"
        if compact_notice:
            idle_text = (notice.title or "Thông báo")[:24]
            idle_icon = notice.icon
        elif compact_main_privacy:
            app = self.state.sessions.get(device, "")
            idle_text = ""
            idle_icon = "camera-web-symbolic" if device == "camera" else "audio-input-microphone-symbolic"
        elif compact_main_uxplay:
            idle_text = ""
            idle_icon = "video-display-symbolic"
        elif self.compact_current == "media":
            idle_text = ""
            idle_icon = "audio-x-generic-symbolic"
        elif default_content == "battery":
            idle_text = f'{battery.get("percentage", 0)}%' if battery.get("isPresent") else ""
            idle_icon = "battery-good-charging-symbolic" if battery.get("isCharging") else "battery-good-symbolic"
        elif default_content == "clock":
            idle_text = datetime.now().strftime("%H:%M")
            idle_icon = ""
        elif default_content == "network-speed":
            rx, tx = (self.format_rate(value) for value in self.net_rate)
            idle_text = f"↓ {rx}  ↑ {tx}"
            idle_icon = ""
        elif default_content == "hidden":
            idle_text = ""
            idle_icon = ""
        if not self.compact_current and not compact_notice:
            if default_content == "clock":
                idle_text = datetime.now().strftime("%H:%M")
        self.compact_title.set_text(idle_text)
        self.compact_title.set_visible(not self.compact_current or bool(compact_notice))
        for css_class in ("brand", "battery-compact", "clock-compact", "network-compact"):
            self.compact_title.remove_css_class(css_class)
        if not self.compact_current and default_content == "battery" and not compact_notice:
            self.compact_title.add_css_class("battery-compact")
        elif not self.compact_current and not compact_notice:
            self.compact_title.add_css_class({"battery": "battery-compact", "clock": "clock-compact",
                                              "network-speed": "network-compact"}.get(default_content, "brand"))
        battery_compact = (default_content == "battery" and not self.compact_current and not compact_notice)
        self.compact_title.set_xalign(1.0 if battery_compact else 0.5)
        self.compact_title.set_margin_end(8 if battery_compact else 0)
        # Put media artwork slightly closer to the edge than the battery icon.
        self.compact_art_frame.set_margin_start(4 if self.compact_current == "media" and not compact_notice else 8)
        if battery_compact or ((compact_main_privacy or compact_main_uxplay) and not compact_notice):
            self.compact_art_frame.remove_css_class("compact-art")
            self.compact_art_frame.add_css_class("compact-battery")
        else:
            self.compact_art_frame.remove_css_class("compact-battery")
            self.compact_art_frame.add_css_class("compact-art")
        for css_class in ("recording", "camera", "uxplay"):
            self.compact_art_frame.remove_css_class(css_class)
        if compact_main_privacy and not compact_notice:
            self.compact_art_frame.add_css_class("camera" if device == "camera" else "recording")
        elif compact_main_uxplay and not compact_notice:
            self.compact_art_frame.add_css_class("uxplay")
        self.compact_icon.set_tooltip_text((notice.title if compact_notice else " — ".join(part for part in (media.get("title", ""), artist(media)) if part)) or "Dynamic Island")
        self.compact_art_frame.set_visible(bool(idle_icon))
        if compact_main_privacy or compact_main_uxplay or compact_notice:
            self.compact_icon.set_from_icon_name(idle_icon)
        elif has_media and self.art.get_paintable():
            self.compact_icon.set_from_paintable(self.art.get_paintable())
        elif idle_icon:
            self.compact_icon.set_from_icon_name(idle_icon)
        else:
            self.compact_icon.set_from_icon_name("audio-x-generic-symbolic" if has_media else "view-grid-symbolic")
        self.visualizer.set_visible(not compact_notice and bool(self.compact_current))
        self.visualizer.remove_css_class("recording")
        self.visualizer.remove_css_class("camera")
        self.visualizer.remove_css_class("uxplay")
        self.visualizer.remove_css_class("media-active")
        if self.compact_current == "media":
            self.visualizer.add_css_class("media-active")
        if compact_main_privacy:
            self.visualizer.add_css_class("camera" if device == "camera" else "recording")
        elif compact_main_uxplay:
            self.visualizer.add_css_class("uxplay")
        self.media_caption.set_text("ĐANG PHÁT" if playing else "TẠM DỪNG" if has_media else "MỘT CHÚT YÊN TĨNH")
        self.media_title.set_text(media.get("title") or "Chưa có nhạc đang phát")
        self.media_artist.set_text(artist(media) or "Mở Spotify, trình duyệt hoặc VLC")
        self.play.set_icon_name("media-playback-pause-symbolic" if playing else "media-playback-start-symbolic")
        for widget in (self.play, self.next, self.previous):
            widget.set_sensitive(has_media)
        self.seek.set_sensitive(bool(media.get("length")))
        idle_hidden = self.should_hide_idle()
        self.secondary_island.set_visible(self.has_secondary_activity() and not self.expanded and not idle_hidden and (not self.width_timer or self.squeezing))
        next_activity = self.next_compact_activity() if self.has_secondary_activity() else None
        self.secondary_icon.set_visible(next_activity not in (None, "media"))
        if next_activity and next_activity != "media":
            icon = {"camera": "camera-web-symbolic", "microphone": "audio-input-microphone-symbolic", "uxplay": "video-display-symbolic"}[next_activity]
            self.secondary_icon.set_from_icon_name(icon)
            self.secondary_icon.set_tooltip_text(self.state.sessions.get(next_activity, "UxPlay"))
            self.secondary_icon.add_css_class("secondary-privacy")
            if next_activity == "camera":
                self.secondary_icon.add_css_class("camera")
            else:
                self.secondary_icon.remove_css_class("camera")
            if next_activity == "uxplay":
                self.secondary_icon.add_css_class("uxplay")
            else:
                self.secondary_icon.remove_css_class("uxplay")
        self.secondary_visualizer.set_visible(next_activity == "media")
        self.visualizer.set_opacity(0.4 if self.compact_current == "media" and not playing else 1)
        self.secondary_visualizer.set_opacity(0.4 if not playing else 1)
        for css_class in ("charging", "battery-low", "battery-medium", "battery-high"):
            self.compact_art_frame.remove_css_class(css_class)
        if battery_compact and battery.get("isPresent"):
            percentage = battery.get("percentage", 0)
            color_class = "battery-high" if battery.get("isCharging") or percentage > 60 else "battery-medium" if percentage > 30 else "battery-low"
            self.compact_art_frame.add_css_class(color_class)
        self.privacy_label.set_visible(False)
        self.privacy_label.set_tooltip_text("\n".join(f"{device}: {app}" for device, app in sorted(self.state.privacy)))
        self.syncing = True
        if not self.dragging and "volume" not in self.debounce:
            self.volume.set_value(min(100, self.state.volume))
        self.volume_value.set_text(f"{self.state.volume}%")
        self.mute.set_icon_name("audio-volume-muted-symbolic" if self.state.muted else "audio-volume-high-symbolic")
        self.controls_stack.set_visible_child_name("brightness" if notice and notice.key == "brightness" else "volume")
        if self.state.brightness is not None:
            if not self.dragging and "brightness" not in self.debounce:
                self.brightness_scale.set_value(self.state.brightness)
            self.brightness_value.set_text(f"{self.state.brightness}%")
        self.syncing = False
        self.load_art(media.get("artUrl", ""))
        self.update_presenter_view()
        self.sync_surface_size()


    def update_presenter_view(self):
        notice = self.queue.current
        if notice and notice.key.startswith("notification:") and self.settings["notification_style"] == "icon":
            notice = None
        media = self.state.media
        if notice and notice.key == "media":
            page = "media"
        elif notice and notice.key in ("volume", "brightness"):
            page = "controls"
        elif notice and notice.key == "battery":
            page = "idle"
        elif notice:
            page = "notice"
        elif self.compact_current == "media":
            page = "media"
        else:
            page = "idle"

        for css_class in ("battery-low", "battery-medium", "battery-high"):
            self.idle_icon_tile.remove_css_class(css_class)
        self.idle_detail.remove_css_class("battery-active")
        if self.compact_current in ("camera", "microphone") and page == "idle" and not (notice and notice.key == "battery"):
            device = self.compact_current
            app = self.state.sessions.get(device, "")
            self.idle_icon_tile.remove_css_class("mint")
            self.idle_icon_tile.remove_css_class("violet")
            self.idle_icon_tile.add_css_class("mint" if device == "camera" else "violet")
            self.idle_summary.set_orientation(Gtk.Orientation.HORIZONTAL)
            self.idle_summary.set_size_request(-1, -1)
            self.idle_title.set_visible(True)
            self.idle_detail.set_visible(True)
            self.clock_weekday.set_visible(False)
            self.clock_day.set_visible(False)
            self.clock_date.set_visible(False)
            self.clock_time.set_visible(False)
            self.idle_icon.set_from_icon_name("camera-web-symbolic" if device == "camera" else "audio-input-microphone-symbolic")
            self.idle_icon.set_visible(True)
            self.idle_icon_tile.set_visible(True)
            self.idle_category.set_visible(True)
            self.idle_category.set_text("CAMERA" if device == "camera" else "MICRO")
            self.battery_progress.set_visible(False)
            self.idle_title.remove_css_class("status-value")
            self.idle_calendar.set_visible(False)
            self.idle_title.set_text("Camera đang hoạt động" if device == "camera" else "Microphone đang hoạt động")
            self.idle_detail.set_text(app)
        elif self.compact_current == "uxplay" and page == "idle" and not (notice and notice.key == "battery"):
            self.idle_icon_tile.remove_css_class("mint")
            self.idle_icon_tile.remove_css_class("violet")
            self.idle_summary.set_orientation(Gtk.Orientation.HORIZONTAL)
            self.idle_summary.set_size_request(-1, -1)
            self.idle_title.set_visible(True)
            self.idle_detail.set_visible(True)
            for widget in (self.clock_weekday, self.clock_day, self.clock_date, self.clock_time, self.idle_calendar, self.battery_progress):
                widget.set_visible(False)
            self.idle_icon.set_from_icon_name("video-display-symbolic")
            self.idle_icon.set_visible(True)
            self.idle_icon_tile.set_visible(True)
            self.idle_category.set_visible(True)
            self.idle_category.set_text("CHIA SẺ MÀN HÌNH")
            self.idle_title.remove_css_class("status-value")
            self.idle_title.set_text("Đang chia sẻ màn hình")
            self.idle_detail.set_text("UxPlay")
        elif (notice and notice.key == "battery") or self.settings["default_content"] == "battery":
            battery = self.state.battery
            self.idle_icon_tile.remove_css_class("violet")
            self.idle_icon_tile.add_css_class("mint")
            percentage = battery.get("percentage", 0)
            color_class = "battery-high" if battery.get("isCharging") or percentage > 60 else "battery-medium" if percentage > 30 else "battery-low"
            self.idle_icon_tile.add_css_class(color_class)
            self.idle_summary.set_orientation(Gtk.Orientation.HORIZONTAL)
            self.idle_summary.set_size_request(-1, -1)
            self.idle_title.set_visible(True)
            self.idle_detail.set_visible(True)
            self.clock_weekday.set_visible(False)
            self.clock_day.set_visible(False)
            self.clock_date.set_visible(False)
            self.clock_time.set_visible(False)
            self.idle_icon.set_from_icon_name("battery-good-charging-symbolic" if battery.get("isCharging") else "battery-good-symbolic")
            self.idle_icon.set_visible(True)
            self.idle_icon_tile.set_visible(True)
            self.idle_category.set_visible(True)
            self.idle_category.set_text("PIN")
            self.idle_title.add_css_class("status-value")
            self.battery_progress.set_visible(bool(battery.get("isPresent")))
            self.battery_progress.set_fraction(min(1, max(0, battery.get("percentage", 0) / 100)))
            for css_class in ("low", "medium"):
                self.battery_progress.remove_css_class(css_class)
            if not battery.get("isCharging"):
                percentage = battery.get("percentage", 0)
                if percentage <= 30:
                    self.battery_progress.add_css_class("low")
                elif percentage <= 60:
                    self.battery_progress.add_css_class("medium")
            self.idle_calendar.set_visible(False)
            self.idle_title.set_text(f'{battery.get("percentage", 0)}%' if battery.get("isPresent") else "Không có pin")
            remaining = battery.get("timeToFull" if battery.get("isCharging") else "timeToEmpty", 0)
            minutes = max(1, int(remaining) // 60) if remaining else 0
            hours, minutes = divmod(minutes, 60)
            time_text = " ".join(part for part in (f"{hours} giờ" if hours else "", f"{minutes} phút" if minutes else "") if part)
            estimate = f" · {time_text} {'đến khi đầy' if battery.get('isCharging') else 'còn lại'}" if time_text else ""
            status = ("Đang sạc" if battery.get("isCharging") else "Đã sạc đầy" if percentage >= 100 else "Đang dùng pin") if battery.get("isPresent") else ""
            if battery.get("isPresent") and (battery.get("isCharging") or percentage >= 100):
                self.idle_detail.add_css_class("battery-active")
            self.idle_detail.set_text(status + estimate)
        elif self.settings["default_content"] == "network-speed":
            rx, tx = (self.format_rate(value) for value in self.net_rate)
            self.idle_icon_tile.remove_css_class("mint")
            self.idle_icon_tile.remove_css_class("violet")
            self.idle_summary.set_orientation(Gtk.Orientation.HORIZONTAL)
            self.idle_summary.set_size_request(-1, -1)
            self.idle_title.set_visible(True)
            self.idle_detail.set_visible(True)
            self.clock_weekday.set_visible(False)
            self.clock_day.set_visible(False)
            self.clock_date.set_visible(False)
            self.clock_time.set_visible(False)
            network = self.state.network
            kind = network.get("kind")
            self.idle_icon.set_from_icon_name("network-wireless-symbolic" if kind == "wifi" else "network-wired-symbolic" if kind == "wired" else "network-transmit-receive-symbolic")
            self.idle_icon.set_visible(True)
            self.idle_icon_tile.set_visible(True)
            self.idle_category.set_visible(True)
            self.idle_category.set_text("MẠNG")
            self.battery_progress.set_visible(False)
            self.idle_title.remove_css_class("status-value")
            self.idle_calendar.set_visible(False)
            name = network.get("name", "")
            self.idle_title.set_text(f"{'Wi-Fi' if kind == 'wifi' else 'Ethernet'} · {name}" if name and kind in ("wifi", "wired") else "Tốc độ mạng")
            self.idle_detail.set_text(f"↓ {rx}   ↑ {tx}")
        else:
            now = datetime.now()
            self.idle_summary.set_orientation(Gtk.Orientation.VERTICAL)
            self.idle_summary.set_size_request(148, -1)
            self.idle_icon.set_visible(False)
            self.idle_icon_tile.set_visible(False)
            self.idle_category.set_visible(False)
            self.battery_progress.set_visible(False)
            self.idle_title.set_visible(False)
            self.idle_detail.set_visible(False)
            self.clock_weekday.set_visible(True)
            self.clock_day.set_visible(True)
            self.clock_date.set_visible(True)
            self.clock_time.set_visible(True)
            self.idle_calendar.set_visible(True)
            self.clock_weekday.set_text(WEEKDAYS[now.weekday()])
            self.clock_day.set_text(now.strftime("%d"))
            self.clock_date.set_text(f"{MONTHS[now.month - 1]} {now.year}")
            self.clock_time.set_text(now.strftime("%H:%M:%S"))
            if self.calendar_follow_today and (self.calendar_month.year != now.year or self.calendar_month.month != now.month):
                self.show_current_month()
            else:
                self.render_calendar()
        self.view_area.set_visible_child_name(page)


    def load_art(self, url):
        if url == self.art_url:
            return
        self.art_url = url
        if self.art_cancel:
            self.art_cancel.cancel()
        self.art_cancel = Gio.Cancellable()
        self.art.set_from_icon_name("audio-x-generic-symbolic")
        self.compact_icon.set_from_icon_name("audio-x-generic-symbolic" if self.state.media.get("player") else "view-grid-symbolic")
        if not url:
            return
        # Local artwork is cached by the Go backend. Remote artwork uses GIO's
        # installed URI handlers; unavailable schemes safely keep the music icon.
        file = Gio.File.new_for_uri(url) if "://" in url else Gio.File.new_for_path(url)
        token = self.art_cancel
        def opened(source, result):
            try:
                stream = source.read_finish(result)
                GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(stream, 60, 60, False, token, decoded, stream)
            except GLib.Error:
                pass
        def decoded(source, result, stream):
            try:
                pixbuf = GdkPixbuf.Pixbuf.new_from_stream_finish(result)
                if url == self.art_url and not token.is_cancelled():
                    texture = Gdk.Texture.new_for_pixbuf(pixbuf)
                    self.art.set_from_paintable(texture)
                    self.compact_icon.set_from_paintable(texture)
                    self.art.set_pixel_size(60)
                    self.compact_icon.set_pixel_size(24)
            except GLib.Error:
                pass
            finally:
                stream.close_async(GLib.PRIORITY_DEFAULT, None, None, None)
        file.read_async(GLib.PRIORITY_DEFAULT, token, opened)


