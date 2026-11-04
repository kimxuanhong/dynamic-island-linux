"""Async D-Bus integration. The UI never waits for a command or a player."""
import json
import logging
import os
from pathlib import Path
import subprocess
import time
from gi.repository import Gio, GLib

NAME = "com.github.dynamic_island.Server"
PATH = "/com/github/dynamic_island/Server"
KDE = "org.kde.Solid.PowerManagement"
KPATH = "/org/kde/Solid/PowerManagement/Actions/BrightnessControl"
KIFACE = KDE + ".Actions.BrightnessControl"
LOG = logging.getLogger(__name__)


class Backend:
    def __init__(self, on_event, on_connection, on_error):
        self.on_event, self.on_connection, self.on_error = on_event, on_connection, on_error
        self.bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
        self.child = None
        self.closed = False
        self.online = False
        self.next_start = 0
        self.subscriptions = []
        self.monitor = None
        self.kde_max = 0
        self.player = ""
        self.poll_busy = False
        self.sub(NAME, NAME, "EventOccurred", PATH, self.event)
        self.sub(None, "com.github.dynamic_island.InputMethod", "Activated", "/com/github/dynamic_island/InputMethod", self.input_method)
        self.sub(KDE, KIFACE, "brightnessChanged", KPATH, self.brightness)
        self.sub(KDE, KIFACE, "brightnessMaxChanged", KPATH, self.brightness_max)
        self.watch = Gio.bus_watch_name_on_connection(self.bus, NAME, Gio.BusNameWatcherFlags.NONE, self.appeared, self.vanished)
        self.call(KDE, KPATH, KIFACE, "brightnessMax", callback=self.brightness_max_result)
        self.timer = GLib.timeout_add_seconds(2, self.poll)
        GLib.idle_add(self.start_notifications)

    def sub(self, sender, interface, signal, path, callback):
        self.subscriptions.append(self.bus.signal_subscribe(sender, interface, signal, path, None, Gio.DBusSignalFlags.NONE, callback))

    def call(self, name, path, interface, method, args=None, callback=None, report=False):
        def done(connection, result):
            if self.closed:
                return
            try:
                value = connection.call_finish(result).unpack()
                if callback:
                    callback(value)
            except GLib.Error as error:
                LOG.debug("%s: %s", method, error.message)
                if callback:
                    callback(None)
                if report:
                    self.on_error("Không thực hiện được thao tác", error.message.split(":")[-1].strip())
        self.bus.call(name, path, interface, method, args, None, Gio.DBusCallFlags.NONE, 2500, None, done)

    def command(self, method, signature=None, values=()):
        self.call(NAME, PATH, NAME, method, GLib.Variant(signature, values) if signature else None, report=True)

    def appeared(self, *_):
        self.online = True
        self.on_connection(True)
        self.command_initial()

    def vanished(self, *_):
        self.online = False
        self.player = ""
        self.on_connection(False)
        self.ensure_server()

    def ensure_server(self):
        if self.closed or self.online or time.monotonic() < self.next_start:
            return
        if self.child and self.child.poll() is None:
            return
        binary = Path(os.environ.get("DYNAMIC_ISLAND_BACKEND", Path(__file__).resolve().parents[1] / "bin/dynamic-island-server"))
        self.next_start = time.monotonic() + 15
        if binary.is_file():
            self.child = subprocess.Popen([str(binary)], stdin=subprocess.DEVNULL)
        else:
            self.on_error("Chưa có backend", "Chạy ./gtk/run.sh để build backend Go.")

    def command_initial(self):
        self.call(NAME, PATH, NAME, "GetBatteryInfo", callback=self.battery_initial)
        self.call(NAME, PATH, NAME, "GetMediaInfo", callback=self.media_initial)
        try:
            process = Gio.Subprocess.new(["pactl", "--format=json", "get-sink-volume", "@DEFAULT_SINK@"], Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE)
            # pactl get-sink-volume is plain text even with --format=json.
            process.communicate_utf8_async(None, None, self.volume_initial)
        except GLib.Error:
            pass
        try:
            process = Gio.Subprocess.new(["pactl", "get-sink-mute", "@DEFAULT_SINK@"], Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE)
            process.communicate_utf8_async(None, None, self.mute_initial)
        except GLib.Error:
            pass

    def volume_initial(self, process, result):
        import re
        try:
            _, output, _ = process.communicate_utf8_finish(result)
            match = re.search(r"(\d+)%", output or "")
            if match and not self.closed:
                self.on_event("volume_initial", "", {"level": int(match[1])})
        except GLib.Error:
            pass

    def mute_initial(self, process, result):
        try:
            _, output, _ = process.communicate_utf8_finish(result)
            if output and not self.closed:
                self.on_event("volume_initial", "", {"muted": "yes" in output.lower()})
        except GLib.Error:
            pass

    def battery_initial(self, value):
        if value:
            self.on_event("battery_initial", "", dict(zip(("percentage", "isCharging", "isPresent", "timeToEmpty", "timeToFull"), value)))

    def media_initial(self, value):
        if value:
            data = dict(zip(("player", "status", "title", "artist", "artUrl"), value))
            self.player = data["player"]
            self.on_event("media_changed", "", data)
            self.poll_player()

    def event(self, connection, sender, path, interface, member, parameters):
        try:
            kind, app, pid, timestamp, raw = parameters.unpack()
            data = json.loads(raw)
            if not isinstance(data, dict):
                return
            if kind in ("camera_start", "camera_stop", "microphone_start", "microphone_stop"):
                data["_pid"] = pid
            if kind == "media_changed":
                self.player = data.get("player", "")
            if kind == "brightness_changed" and self.kde_max:
                return
            self.on_event(kind, app, data)
        except (ValueError, TypeError):
            LOG.warning("Ignored malformed backend event")

    def input_method(self, *args):
        values = args[-1].unpack()
        self.on_event("input_method", "", {"name": values[1]})

    def brightness_max_result(self, value):
        self.kde_max = max(0, value[0]) if value else 0
        if self.kde_max:
            self.call(KDE, KPATH, KIFACE, "brightness", callback=lambda v: self.on_event("brightness_initial", "", {"level": round(v[0] / self.kde_max * 100)}) if v else None)

    def brightness_max(self, *args):
        self.brightness_max_result(args[-1].unpack())

    def brightness(self, *args):
        if self.kde_max:
            self.on_event("brightness_changed", "", {"level": round(args[-1].unpack()[0] / self.kde_max * 100)})

    def set_brightness(self, percent):
        if self.kde_max:
            self.call(KDE, KPATH, KIFACE, "setBrightness", GLib.Variant("(i)", (max(1, round(percent * self.kde_max / 100)),)), report=True)
        else:
            self.command("SetBrightness", "(i)", (percent,))

    def poll(self):
        if self.closed:
            return False
        self.ensure_server()
        self.poll_player()
        return True

    def poll_player(self):
        if not self.player or self.poll_busy:
            return
        player = self.player
        self.poll_busy = True
        def received(value):
            self.poll_busy = False
            if not value or player != self.player:
                return
            props = value[0]
            metadata = props.get("Metadata", {})
            self.on_event("media_sync", "", {"player": player, "status": props.get("PlaybackStatus", "Stopped"), "title": metadata.get("xesam:title", ""), "artist": metadata.get("xesam:artist", []), "artUrl": metadata.get("mpris:artUrl", ""), "length": metadata.get("mpris:length", 0), "position": props.get("Position", 0)})
        self.call(player, "/org/mpris/MediaPlayer2", "org.freedesktop.DBus.Properties", "GetAll", GLib.Variant("(s)", ("org.mpris.MediaPlayer2.Player",)), callback=received)

    def start_notifications(self):
        # A dedicated connection is required: a monitor may no longer send calls.
        # Observe Notify only; Plasma remains the notification server.
        try:
            address = Gio.dbus_address_get_for_bus_sync(Gio.BusType.SESSION, None)
            self.monitor = Gio.DBusConnection.new_for_address_sync(address, Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION, None, None)
            self.monitor.set_exit_on_close(False)
            self.filter_id = self.monitor.add_filter(self.notification_filter, None)
            rule = "type='method_call',interface='org.freedesktop.Notifications',member='Notify',path='/org/freedesktop/Notifications'"
            self.monitor.call("org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus.Monitoring", "BecomeMonitor", GLib.Variant("(asu)", ([rule], 0)), None, Gio.DBusCallFlags.NONE, 2500, None, self.monitor_ready)
        except GLib.Error as error:
            LOG.warning("Notifications unavailable: %s", error.message)
        return False

    def monitor_ready(self, connection, result):
        try:
            connection.call_finish(result)
        except GLib.Error as error:
            LOG.warning("Notification monitoring denied: %s", error.message)
            if not self.closed:
                self.on_error("Thông báo chưa khả dụng", "D-Bus không cho phép theo dõi thông báo.")

    def notification_filter(self, connection, message, incoming, data):
        if incoming and message.get_interface() == "org.freedesktop.Notifications" and message.get_member() == "Notify":
            body = message.get_body()
            if body:
                values = body.unpack()
                if len(values) >= 5:
                    GLib.idle_add(self.deliver_notification, values[0], values[3], values[4])
        return message

    def deliver_notification(self, app, title, body):
        if not self.closed:
            self.on_event("notification", app, {"summary": title, "body": body})
        return False

    def close(self):
        self.closed = True
        GLib.source_remove(self.timer)
        Gio.bus_unwatch_name(self.watch)
        for subscription in self.subscriptions:
            self.bus.signal_unsubscribe(subscription)
        if self.monitor:
            self.monitor.remove_filter(self.filter_id)
            self.monitor.close(None, None, None)
        if self.child and self.child.poll() is None:
            self.child.terminate()
            try:
                self.child.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self.child.kill()
                self.child.wait()
