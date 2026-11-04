"""A small layer-shell surface with native GTK controls and async integrations."""
import argparse
import ctypes
import ctypes.util
import logging
import os
from pathlib import Path
import signal
import sys
import time
import cairo

# Layer shell must interpose Wayland symbols before GTK is loaded.
layer_lib = ctypes.util.find_library("gtk4-layer-shell")
if layer_lib:
    ctypes.CDLL(layer_lib, mode=ctypes.RTLD_GLOBAL)
import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Gdk", "4.0")
gi.require_version("GdkPixbuf", "2.0")
gi.require_version("Gsk", "4.0")
from gi.repository import Gdk, Gio, GLib, Gtk
try:
    gi.require_version("GdkWayland", "4.0")
    from gi.repository import GdkWayland
except (ValueError, ImportError):
    GdkWayland = None
try:
    gi.require_version("GdkX11", "4.0")
    from gi.repository import GdkX11
except (ValueError, ImportError):
    GdkX11 = None
try:
    gi.require_version("Gtk4LayerShell", "1.0")
    from gi.repository import Gtk4LayerShell as Layer
except (ValueError, ImportError):
    Layer = None

from .backend import Backend
from .state import NoticeQueue, State
from .widgets import COMPACT_WIDTH, COMPACT_HEIGHT, SECONDARY_WIDTH, box, label
from .views.notice import NoticeView
from .views.media import MediaView
from .views.levels import LevelView
from .views.idle import IdleView
from .settings import Settings
from .interaction import Interaction
from .events import Events
from .presenter import Presenter
from .runtime import Runtime
from .diagnostics import Diagnostics
from .visualizer import Visualizer

ROOT = Path(__file__).resolve().parent
WINDOW_CLASS = "dynamic-island-gtk"
LOG = logging.getLogger(__name__)


class Island(NoticeView, MediaView, LevelView, IdleView, Settings, Interaction, Events, Presenter, Runtime, Diagnostics, Gtk.Application):
    def __init__(self, options):
        super().__init__(application_id="com.github.dynamic_island.Gtk" + (".Demo" if options.demo else ""), flags=Gio.ApplicationFlags.DEFAULT_FLAGS)
        self.options = options
        self.state = State()
        self.queue = NoticeQueue()
        self.backend = None
        self.window = None
        self.hovered = False
        self.pinned = options.expanded
        self.expanded = False
        self.compact_activities = []
        self.compact_current = None
        self.media_active = False
        self.media_dismiss_timer = 0
        self.dragging = False
        self.syncing = False
        self.timers = []
        self.leave_timer = 0
        self.width_timer = 0
        self.squeezing = False
        self.hiding = False
        self.revealing_hidden = False
        self.width_started = 0.0
        self.width_from = COMPACT_WIDTH
        self.width_to = COMPACT_WIDTH
        self.debounce = {}
        self.art_url = None
        self.art_cancel = None
        self.art_stream = None
        self.art_bytes = bytearray()
        self.last_notice = None
        self.last_title = None
        self.net_sample_at = 0.0
        self.net_sample = None
        self.net_rate = (0, 0)
        self.network_snapshot = None
        self.network_initialized = False
        self.network_poll_busy = False
        self.settings_path = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "dynamic-island/gtk.json"
        self.settings = {
            "top_margin": 5, "monitor": 0, "notifications": True, "hover": True,
            "notification_style": "card", "notification_seconds": 3,
            "level_seconds": 2, "default_content": "battery",
            "island_width": 130, "island_height": 36, "background_opacity": 80,
            "microphone_excluded_apps": [], "camera_excluded_apps": [],
            "show_volume": True, "show_brightness": True,
            "show_network": True, "show_bluetooth": True,
        }
        try:
            import json
            data = json.loads(self.settings_path.read_text())
            self.settings.update({k: v for k, v in data.items() if k in self.settings})
            self.settings["top_margin"] = min(100, max(0, int(self.settings["top_margin"])))
            self.settings["monitor"] = max(0, int(self.settings["monitor"]))
            self.settings["island_width"] = min(320, max(120, int(self.settings["island_width"])))
            self.settings["island_height"] = min(88, max(36, int(self.settings["island_height"])))
            self.settings["background_opacity"] = min(100, max(0, int(self.settings["background_opacity"])))
            self.settings["notification_seconds"] = min(10, max(1, int(self.settings["notification_seconds"])))
            self.settings["level_seconds"] = min(10, max(1, int(self.settings["level_seconds"])))
            if self.settings["notification_style"] not in ("off", "icon", "card"):
                self.settings["notification_style"] = "card"
            if self.settings["default_content"] not in ("battery", "clock", "network-speed", "hidden"):
                self.settings["default_content"] = "battery"
        except (OSError, ValueError, TypeError, AttributeError):
            pass
        for device in ("microphone", "camera"):
            key = device + "_excluded_apps"
            if not isinstance(self.settings[key], list):
                self.settings[key] = []
            self.state.privacy_exclusions[device] = self.settings[key]
        self.connect("activate", self.activate)
        self.connect("shutdown", self.shutdown)
        action = Gio.SimpleAction.new("quit", None)
        action.connect("activate", lambda *_: self.quit())
        self.add_action(action)
        self.set_accels_for_action("app.quit", ["<Control>q"])

    def activate(self, *_):
        if self.window:
            self.pinned = not self.pinned
            self.refresh_expanded()
            return
        display = Gdk.Display.get_default()
        if GdkX11 and isinstance(display, GdkX11.X11Display):
            display.set_program_class(WINDOW_CLASS)
            LOG.debug("Set X11 WM_CLASS to %s", WINDOW_CLASS)
        self.window = Gtk.ApplicationWindow(application=self, title="Dynamic Island")
        self.window.add_css_class("island-window")
        self.window.set_decorated(False)
        self.window.connect("realize", self.set_wayland_app_id)
        # The layer surface must be allowed to grow from compact to expanded.
        self.window.set_resizable(True)
        self.window.set_default_size(COMPACT_WIDTH, COMPACT_HEIGHT)
        self.layered = bool(not self.options.window and Layer and Layer.is_supported())
        if not self.options.window and not self.layered:
            LOG.error("Desktop không hỗ trợ layer-shell. Dùng --window để xem thử; GNOME cần extension hiện có.")
            self.quit()
            return
        if self.layered:
            Layer.init_for_window(self.window)
            Layer.set_namespace(self.window, "dynamic-island")
            Layer.set_layer(self.window, Layer.Layer.TOP)
            Layer.set_anchor(self.window, Layer.Edge.TOP, True)
            Layer.set_keyboard_mode(self.window, Layer.KeyboardMode.NONE)
            Layer.set_exclusive_zone(self.window, -1)
            self.apply_position()
            self.monitors = Gdk.Display.get_default().get_monitors()
            self.monitors.connect("items-changed", lambda *_: self.apply_position())
        provider = Gtk.CssProvider()
        provider.load_from_path(str(ROOT / "style.css"))
        Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), provider, Gtk.STYLE_PROVIDER_PRIORITY_USER)
        self.appearance_provider = Gtk.CssProvider()
        Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), self.appearance_provider, Gtk.STYLE_PROVIDER_PRIORITY_USER + 1)
        self.media_color_provider = Gtk.CssProvider()
        Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), self.media_color_provider, Gtk.STYLE_PROVIDER_PRIORITY_USER + 2)
        self.apply_appearance()
        self.surface = box(False, 10, "island-row")
        self.window.set_child(self.surface)
        self.island = box(True, 0, "island")
        self.island.set_size_request(self.settings["island_width"], self.settings["island_height"])
        self.island.set_overflow(Gtk.Overflow.HIDDEN)
        self.surface.append(self.island)
        self.header = box(False, 0, "header")
        self.header.set_hexpand(True)
        self.compact_art_frame = box(False, 0, "compact-art")
        self.compact_art_frame.set_size_request(24, 24)
        self.compact_art_frame.set_hexpand(True)
        self.compact_art_frame.set_halign(Gtk.Align.START)
        self.compact_art_frame.set_valign(Gtk.Align.CENTER)
        self.compact_art_frame.set_margin_start(16)
        self.compact_art_frame.set_overflow(Gtk.Overflow.HIDDEN)
        self.compact_icon = Gtk.Image.new_from_icon_name("view-grid-symbolic")
        self.compact_icon.set_pixel_size(24)
        self.compact_art_frame.append(self.compact_icon)
        self.header.append(self.compact_art_frame)
        self.compact_title = label("DYNAMIC ISLAND", "brand")
        self.compact_title.set_max_width_chars(14)
        self.compact_title.set_hexpand(True)
        self.header.append(self.compact_title)
        self.visualizer = box(False, 3, "media-visualizer")
        self.visualizer.set_hexpand(True)
        self.visualizer.set_halign(Gtk.Align.END)
        self.visualizer.set_margin_end(3)
        self.visualizer_bars = []
        for height in (8, 12, 16, 12, 8, 4):
            bar = Gtk.Box()
            bar.add_css_class("media-visualizer-bar")
            bar.set_size_request(3, height)
            bar.set_valign(Gtk.Align.CENTER)
            self.visualizer.append(bar)
            self.visualizer_bars.append(bar)
        self.visualizer.set_visible(False)
        self.header.append(self.visualizer)
        self.media_visualizer_motion = Visualizer(bpm=140)
        self.privacy_visualizer_motion = Visualizer(bpm=120)
        self.media_visualizer_running = False
        self.privacy_visualizer_running = False
        self.privacy_label = label("●", "privacy")
        self.privacy_label.set_visible(False)
        self.header.append(self.privacy_label)
        self.island.append(self.header)
        self.secondary_icon = Gtk.Image.new_from_icon_name("audio-input-microphone-symbolic")
        self.secondary_icon.set_pixel_size(24)
        self.secondary_icon.set_hexpand(True)
        self.secondary_icon.set_valign(Gtk.Align.CENTER)
        self.secondary_island = box(False, 0, "battery-island")
        self.secondary_island.set_size_request(SECONDARY_WIDTH, self.settings["island_height"])
        self.secondary_island.append(self.secondary_icon)
        self.secondary_visualizer = box(False, 2, "secondary-visualizer")
        self.secondary_visualizer.set_halign(Gtk.Align.CENTER)
        self.secondary_visualizer.set_valign(Gtk.Align.CENTER)
        self.secondary_visualizer.set_hexpand(True)
        self.secondary_bars = []
        for height in (8, 12, 16, 12, 8, 4):
            bar = Gtk.Box()
            bar.add_css_class("media-visualizer-bar")
            bar.set_size_request(2, height)
            bar.set_valign(Gtk.Align.CENTER)
            self.secondary_visualizer.append(bar)
            self.secondary_bars.append(bar)
        self.secondary_visualizer.set_visible(False)
        self.secondary_island.append(self.secondary_visualizer)
        battery_click = Gtk.GestureClick.new()
        battery_click.set_button(1)
        battery_click.connect("released", self.toggle_compact_swap)
        self.secondary_island.add_controller(battery_click)
        self.surface.append(self.secondary_island)
        click = Gtk.GestureClick.new()
        click.set_button(1)
        click.connect("released", self.toggle_pin)
        self.header.add_controller(click)
        self.context_click = Gtk.GestureClick.new()
        self.context_click.set_button(3)
        self.context_click.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
        self.context_click.connect("released", lambda *_: self.toggle_settings())
        self.island.add_controller(self.context_click)
        self.header.set_tooltip_text("Rê chuột để mở · Nhấn để ghim / thu gọn")
        self.revealer = Gtk.Revealer(transition_type=Gtk.RevealerTransitionType.CROSSFADE, transition_duration=180)
        self.content = box(True, 0, "content")
        self.view_area = Gtk.Stack()
        self.view_area.set_hhomogeneous(False)
        self.view_area.set_vhomogeneous(False)
        self.view_area.set_transition_type(Gtk.StackTransitionType.CROSSFADE)
        self.view_area.set_transition_duration(180)
        self.view_area.set_hexpand(True)
        self.view_area.set_vexpand(True)
        self.content.append(self.view_area)
        # Clip the content while the island is narrower than its natural size.
        # Otherwise GTK's minimum width makes the first animation frame jump.
        self.content_clip = Gtk.ScrolledWindow()
        self.content_clip.set_policy(Gtk.PolicyType.EXTERNAL, Gtk.PolicyType.EXTERNAL)
        self.content_clip.set_child(self.content)
        self.revealer.set_child(self.content_clip)
        self.content.set_visible(False)
        self.revealer.connect("notify::child-revealed", self.revealer_changed)
        self.island.append(self.revealer)
        self.build_notice()
        self.build_media()
        self.build_controls()
        self.build_idle_view()
        self.build_settings()
        motion = Gtk.EventControllerMotion.new()
        motion.connect("enter", self.enter)
        motion.connect("leave", self.leave)
        # Track the whole toplevel. The island changes size while expanding;
        # tracking only its child surface can miss the pointer leaving during
        # that resize/reveal transition on GTK/Wayland.
        self.window.add_controller(motion)
        keys = Gtk.EventControllerKey.new()
        keys.connect("key-pressed", self.key_pressed)
        self.window.add_controller(keys)
        self.window.connect("close-request", lambda *_: self.quit() or False)
        self.window.present()
        self.timers.append(GLib.timeout_add(100, self.tick))
        self.timers.append(GLib.timeout_add(80, self.animate_visualizer))
        if not self.options.demo:
            self.timers.append(GLib.timeout_add_seconds(2, self.poll_network))
        if self.options.demo:
            self.load_demo()
        else:
            try:
                self.backend = Backend(self.on_event, self.on_connection, self.on_error)
            except GLib.Error as error:
                self.on_error("Không kết nối được D-Bus", error.message)
        self.render()
        self.refresh_expanded()
        if self.options.smoke:
            self.timers.append(GLib.timeout_add(1800, self.smoke))
        if self.options.capture:
            self.timers.append(GLib.timeout_add(1400, self.capture))

    def set_wayland_app_id(self, window):
        if not GdkWayland or not isinstance(window.get_display(), GdkWayland.WaylandDisplay):
            return
        surface = window.get_surface()
        surface.set_opaque_region(cairo.Region())
        if isinstance(surface, GdkWayland.WaylandToplevel):
            surface.set_application_id(WINDOW_CLASS)
            LOG.debug("Set Wayland app_id to %s with transparent opaque region", WINDOW_CLASS)














































    def shutdown(self, *_):
        if self.backend:
            self.backend.close()
        if self.art_cancel:
            self.art_cancel.cancel()
        if self.leave_timer:
            GLib.source_remove(self.leave_timer)
        if self.width_timer:
            self.island.remove_tick_callback(self.width_timer)
        if self.media_dismiss_timer:
            GLib.source_remove(self.media_dismiss_timer)
        for timer in self.timers:
            if GLib.MainContext.default().find_source_by_id(timer):
                GLib.source_remove(timer)
        for timer in self.debounce.values():
            GLib.source_remove(timer)


def main():
    parser = argparse.ArgumentParser(description="Dynamic Island — GTK4 / Wayland")
    parser.add_argument("--demo", action="store_true", help="Sample data, no system controls")
    parser.add_argument("--window", action="store_true", help="Normal preview window instead of layer-shell")
    parser.add_argument("--expanded", action="store_true")
    parser.add_argument("--smoke", action="store_true", help="Run UI smoke check and exit")
    parser.add_argument("--capture", metavar="PNG", help="Capture just the island widget")
    parser.add_argument("--quit", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    options = parser.parse_args()
    logging.basicConfig(level=logging.DEBUG if options.verbose else logging.INFO, format="%(levelname)s %(message)s")
    app = Island(options)
    if options.quit:
        app.register(None)
        if app.get_is_remote():
            app.activate_action("quit", None)
        return 0
    GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGTERM, lambda: app.quit() or False)
    GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGINT, lambda: app.quit() or False)
    result = app.run([sys.argv[0]])
    return 1 if getattr(options, "failed", False) else result
