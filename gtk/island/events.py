"""Events responsibilities for the GTK island."""
import logging
import time
from gi.repository import GLib
from .state import Notice
LOG = logging.getLogger(__name__)


class Events:
    def on_connection(self, connected):
        self.state.connected = connected
        if not connected:
            if self.media_dismiss_timer:
                GLib.source_remove(self.media_dismiss_timer)
                self.media_dismiss_timer = 0
            self.media_active = False
            self.state.media = {}
            self.state.privacy.clear()
            self.state.sessions.clear()
            self.state.privacy_records.clear()
            self.state.bluetooth.clear()
            self.state.uxplay = False
        self.render()
        self.refresh_expanded()


    def on_error(self, title, body):
        LOG.warning("%s: %s", title, body)
        self.queue.push(Notice("error", title, body, "dialog-warning-symbolic"))


    def on_event(self, kind, app, data):
        if kind == "battery_initial":
            self.state.battery = data
        elif kind == "volume_initial":
            self.state.volume = data.get("level", self.state.volume)
            self.state.muted = data.get("muted", self.state.muted)
        elif kind == "brightness_initial":
            self.state.brightness = data["level"]
        elif kind == "media_sync":
            self.state.media.update(data)
            self.state.position_at = time.monotonic()
        else:
            notice = self.state.update(kind, app, data)
            enabled = (
                (kind != "notification" or self.settings["notifications"])
                and (not kind.startswith("volume_") or self.settings["show_volume"])
                and (kind != "brightness_changed" or self.settings["show_brightness"])
                and (not kind.startswith("bluetooth_") or self.settings["show_bluetooth"])
                and (not kind.startswith("network_") or self.settings["show_network"])
                and (kind != "notification" or self.settings["notification_style"] != "off")
            )
            if notice and enabled:
                seconds = self.settings["notification_seconds"] if kind == "notification" else self.settings["level_seconds"] if kind.startswith(("volume_", "brightness_")) else 3.5
                self.queue.push(notice, display_seconds=seconds)
        if kind in ("media_sync", "media_changed"):
            self.update_media_activity()
        self.render()


    def update_media_activity(self):
        media = self.state.media
        if media.get("player") and media.get("status") == "Playing":
            if self.media_dismiss_timer:
                GLib.source_remove(self.media_dismiss_timer)
                self.media_dismiss_timer = 0
            self.media_active = True
        elif not media.get("player"):
            if self.media_dismiss_timer:
                GLib.source_remove(self.media_dismiss_timer)
                self.media_dismiss_timer = 0
            self.dismiss_media()
        elif self.media_active and not self.media_dismiss_timer:
            self.media_dismiss_timer = GLib.timeout_add_seconds(10, self.dismiss_media)


    def dismiss_media(self):
        self.media_dismiss_timer = 0
        self.media_active = False
        self.last_title = None
        self.queue.pending = type(self.queue.pending)((notice for notice in self.queue.pending if notice.key != "media"), maxlen=12)
        if self.queue.current and self.queue.current.key == "media":
            self.queue.current = None
        self.render()
        self.refresh_expanded()
        return False


    def command(self, method, signature=None, values=()):
        if self.backend:
            self.backend.command(method, signature, values)
        elif self.options.demo and method == "MediaPlayPause":
            self.state.media["status"] = "Paused" if self.state.media.get("status") == "Playing" else "Playing"
            self.update_media_activity()
            self.render()


    def schedule_command(self, key, callback):
        if key in self.debounce:
            GLib.source_remove(self.debounce.pop(key))
        def run():
            self.debounce.pop(key, None)
            callback()
            return False
        self.debounce[key] = GLib.timeout_add(100, run)


    def seek_changed(self, scale):
        if self.state.media.get("length"):
            position = round(scale.get_value() / 100 * self.state.media["length"])
            self.state.media["position"] = position
            self.state.position_at = time.monotonic()
            self.schedule_command("seek", lambda: self.command("MediaSeek", "(x)", (position,)))


