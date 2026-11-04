"""Runtime responsibilities for the GTK island."""
import html
from pathlib import Path
import re
import time
from gi.repository import Gio, GLib
from .state import duration


class Runtime:
    def tick(self):
        self.reconcile_pointer_hover()
        self.sample_network_rate()
        current = self.queue.step(held=self.dragging or self.pinned or self.hovered,
                                  display_seconds=self.settings["notification_seconds"])
        if current is not self.last_notice:
            self.last_notice = current
            show_card = current is not None and not (
                current.key.startswith("notification:") and self.settings["notification_style"] == "icon")
            self.notice_box.set_visible(show_card)
            if current and show_card:
                category = current.key.split(":", 1)[0]
                self.notice_category.set_text({"notification": "THÔNG BÁO", "bluetooth": "BLUETOOTH", "network": "MẠNG", "camera": "CAMERA", "microphone": "MICRO", "input_method": "BỘ GÕ", "uxplay": "CHIA SẺ MÀN HÌNH", "error": "LỖI"}.get(category, "TRẠNG THÁI"))
                self.notice_title.set_text(current.title[:200])
                self.notice_body.set_text(html.unescape(re.sub(r"<[^>]*>", "", current.body))[:400])
                self.notice_icon.set_from_icon_name(current.icon)
                self.notice_tile.remove_css_class("disconnected")
                if current.accent == "red":
                    self.notice_tile.add_css_class("disconnected")
                self.notice_progress.set_visible(current.level is not None)
                if current.level is not None:
                    self.notice_progress.set_fraction(min(1, max(0, current.level)))
            self.render()
        self.refresh_expanded()
        length = self.state.media.get("length", 0) / 1_000_000
        position = self.state.position()
        self.elapsed.set_text(duration(position))
        self.total.set_text(duration(length))
        if not self.dragging and "seek" not in self.debounce:
            self.syncing = True
            self.seek.set_value(position / length * 100 if length else 0)
            self.syncing = False
        return True


    def animate_visualizer(self):
        playing = self.state.media.get("status") == "Playing" and self.media_active
        privacy_active = self.compact_current in ("camera", "microphone", "uxplay")
        now = time.monotonic()
        if playing:
            media_heights = self.media_visualizer_motion.step(now)
            self.media_visualizer_running = True
        else:
            if self.media_visualizer_running:
                self.media_visualizer_motion.reset()
                self.media_visualizer_running = False
            media_heights = (8, 12, 16, 12, 8, 4)
        if privacy_active:
            privacy_heights = self.privacy_visualizer_motion.step(now)
            self.privacy_visualizer_running = True
        else:
            if self.privacy_visualizer_running:
                self.privacy_visualizer_motion.reset()
                self.privacy_visualizer_running = False
            privacy_heights = (8, 12, 16, 12, 8, 4)
        heights = privacy_heights if privacy_active else media_heights
        for index, height in enumerate(heights):
            self.visualizer_bars[index].set_size_request(3, height)
            self.secondary_bars[index].set_size_request(2, media_heights[index])
        return True


    @staticmethod
    def format_rate(value):
        units = ("B/s", "KB/s", "MB/s", "GB/s")
        value = float(max(0, value))
        unit = 0
        while value >= 1000 and unit < len(units) - 1:
            value /= 1000
            unit += 1
        return f"{value:.0f} {units[unit]}" if unit == 0 else f"{value:.1f} {units[unit]}"


    def sample_network_rate(self):
        now = time.monotonic()
        if now - self.net_sample_at < 1:
            return
        self.net_sample_at = now
        try:
            counters = {}
            for line in Path("/proc/net/dev").read_text().splitlines()[2:]:
                name, values = line.split(":", 1)
                name = name.strip()
                device_path = Path("/sys/class/net") / name / "device"
                if name != "lo" and device_path.exists():
                    fields = values.split()
                    counters[name] = (int(fields[0]), int(fields[8]))
            current = (sum(value[0] for value in counters.values()), sum(value[1] for value in counters.values()))
            if self.net_sample is not None:
                elapsed = max(0.001, now - self.net_sample_at_previous)
                self.net_rate = (max(0, current[0] - self.net_sample[0]) / elapsed,
                                 max(0, current[1] - self.net_sample[1]) / elapsed)
            self.net_sample = current
            self.net_sample_at_previous = now
        except (OSError, ValueError, IndexError):
            self.net_sample = None
            self.net_rate = (0, 0)
        self.render()


    def poll_network(self):
        if self.options.demo or self.network_poll_busy:
            return True
        self.network_poll_busy = True
        try:
            process = Gio.Subprocess.new(["nmcli", "-t", "-f", "TYPE,STATE,CONNECTION", "device", "status"],
                                         Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE)
            process.communicate_utf8_async(None, None, self.network_result)
        except GLib.Error:
            self.network_poll_busy = False
        return True


    def network_result(self, process, result):
        self.network_poll_busy = False
        try:
            _, output, _ = process.communicate_utf8_finish(result)
            active = []
            for line in (output or "").splitlines():
                fields = line.split(":", 2)
                if len(fields) != 3 or fields[1] != "connected":
                    continue
                kind, name = fields[0], fields[2].replace("\\:", ":")
                if kind in ("wifi", "802-11-wireless", "ethernet", "802-3-ethernet"):
                    active.append({"kind": "wifi" if "wifi" in kind else "wired", "name": name})
            current = next((item for item in active if item["kind"] == "wifi"), active[0] if active else None)
            if current == self.network_snapshot:
                return
            previous = self.network_snapshot
            self.network_snapshot = current
            initialized = self.network_initialized
            self.network_initialized = True
            if initialized:
                details = current or previous
                self.on_event("network_connected" if current else "network_disconnected", details["name"], details)
            elif current:
                self.state.network = current
        except (GLib.Error, ValueError):
            pass


    def load_demo(self):
        self.state.connected = True
        self.media_active = True
        self.state.media = {"player": "demo", "status": "Playing", "title": "A little space to breathe", "artist": "Dynamic Island · GTK Edition", "position": 83_000_000, "length": 246_000_000}
        self.state.battery = {"isPresent": True, "percentage": 86, "isCharging": True}
        self.state.volume = 42
        self.state.brightness = 68


