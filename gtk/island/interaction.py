"""Interaction responsibilities for the GTK island."""
import time
import cairo
from gi.repository import Gdk, GLib, Gtk
from .widgets import COMPACT_WIDTH, COMPACT_HEIGHT, EXPANDED_WIDTH, EXPANDED_HEIGHT


class Interaction:
    def toggle_pin(self, *_):
        self.pinned = not self.pinned
        if not self.pinned:
            self.hovered = False
            self.queue.current = None
        self.refresh_expanded()


    def enter(self, *_):
        # A transparent layer surface may still receive a crossing event while
        # the compositor applies its new input region. It must not reveal an
        # island that has no compact content or is already hiding.
        no_content = not self.compact_current and not self.queue.current and (
            self.settings["default_content"] == "hidden" or
            (self.settings["default_content"] == "battery" and not self.state.battery.get("isPresent")))
        if self.hiding or not self.island.get_visible() or no_content:
            return
        if self.leave_timer:
            GLib.source_remove(self.leave_timer)
            self.leave_timer = 0
        self.hovered = True
        self.refresh_expanded()


    def leave(self, *_):
        def finish():
            self.leave_timer = 0
            self.hovered = False
            self.refresh_expanded()
            return False
        if self.leave_timer:
            GLib.source_remove(self.leave_timer)
        self.leave_timer = GLib.timeout_add(300, finish)


    def key_pressed(self, controller, key, keycode, modifiers):
        if key == Gdk.KEY_Escape:
            self.pinned = False
            self.hovered = False
            if self.settings_window.get_visible():
                self.settings_window.set_visible(False)
            self.refresh_expanded()
            return True
        if key == Gdk.KEY_comma and modifiers & Gdk.ModifierType.CONTROL_MASK:
            self.toggle_settings()
            return True
        return False


    def refresh_expanded(self):
        card_notice = self.queue.current and not (
            self.queue.current.key.startswith("notification:") and self.settings["notification_style"] == "icon")
        wanted = bool(self.pinned or self.dragging or (self.hovered and self.settings["hover"]) or card_notice)
        idle_hidden = self.should_hide_idle()
        if wanted or not idle_hidden:
            self.set_hidden_input(False)
        if self.hiding and (wanted or not idle_hidden):
            self.island.remove_tick_callback(self.width_timer)
            self.width_timer = 0
            self.hiding = False
            self.island.set_opacity(1)
            if not wanted:
                self.header.set_visible(True)
                self.animate_size(self.settings["island_width"], self.settings["island_height"])
                self.revealing_hidden = True
        if wanted != self.expanded:
            self.expanded = wanted
            self.animate_size(EXPANDED_WIDTH if wanted else self.settings["island_width"],
                              EXPANDED_HEIGHT if wanted else self.settings["island_height"])
            if wanted:
                self.header.set_visible(False)
                self.content.set_visible(True)
            self.revealer.set_reveal_child(wanted)
            if wanted:
                self.island.add_css_class("expanded")
            else:
                self.island.remove_css_class("expanded")
        self.secondary_island.set_visible(self.has_secondary_activity() and not wanted and not idle_hidden and (not self.width_timer or self.squeezing))
        # Keep the widget mapped until its frame-clock collapse finishes.
        if idle_hidden and not wanted and not self.width_timer and self.island.get_visible():
            self.start_hide()
        self.island.set_visible(not idle_hidden or wanted or bool(self.width_timer))
        self.sync_surface_size()


    def has_secondary_activity(self):
        return len(self.compact_activities) > 1


    def sync_compact_activities(self):
        active = []
        if self.media_active and self.state.media.get("player"):
            active.append("media")
        for device in ("microphone", "camera"):
            if any(kind == device for kind, _ in self.state.privacy):
                active.append(device)
        if self.state.uxplay:
            active.append("uxplay")
        added = [name for name in active if name not in self.compact_activities]
        self.compact_activities = [name for name in self.compact_activities if name in active] + added
        if added:
            self.compact_current = added[-1]
        elif self.compact_current not in self.compact_activities:
            self.compact_current = self.compact_activities[0] if self.compact_activities else None


    def next_compact_activity(self):
        if not self.compact_activities:
            return None
        index = self.compact_activities.index(self.compact_current)
        return self.compact_activities[(index + 1) % len(self.compact_activities)]


    def toggle_compact_swap(self, *_):
        if not self.has_secondary_activity():
            return
        self.compact_current = self.next_compact_activity()
        self.render()


    def sync_surface_size(self):
        # GTK remeasures when visibility or a size request changes.
        if self.expanded or self.width_timer:
            self.compact_window_width = None
            return
        width = self.settings["island_width"]
        if self.secondary_island.get_visible():
            minimum, _, _, _ = self.secondary_island.measure(Gtk.Orientation.HORIZONTAL, -1)
            width += self.surface.get_spacing() + minimum
        if getattr(self, "compact_window_width", None) != width:
            self.compact_window_width = width
            self.window.set_default_size(width, self.settings["island_height"])


    def should_hide_idle(self):
        if self.compact_current or self.queue.current or self.pinned or self.hovered:
            return False
        content = self.settings["default_content"]
        return content == "hidden" or (content == "battery" and not self.state.battery.get("isPresent"))


    def reconcile_pointer_hover(self):
        if not self.hovered or self.dragging:
            return
        seat = self.window.get_display().get_default_seat()
        pointer = seat.get_pointer() if seat else None
        if not pointer:
            return
        surface, x, y = pointer.get_surface_at_position()
        inside = (surface is not None and surface == self.window.get_surface()
                  and 0 <= x < self.window.get_width() and 0 <= y < self.window.get_height())
        if inside and self.leave_timer:
            GLib.source_remove(self.leave_timer)
            self.leave_timer = 0
        elif not inside and not self.leave_timer:
            self.leave()


    def animate_size(self, target_width, target_height):
        self.squeezing = False
        self.revealing_hidden = False
        if self.width_timer:
            self.island.remove_tick_callback(self.width_timer)
            self.width_timer = 0
        current = self.island.get_width()
        self.width_from = current if current > 0 else (COMPACT_WIDTH if target_width > COMPACT_WIDTH else EXPANDED_WIDTH)
        self.height_from = self.island.get_height() or (COMPACT_HEIGHT if target_height > COMPACT_HEIGHT else EXPANDED_HEIGHT)
        self.width_to = target_width
        self.height_to = target_height
        self.size_duration = 0.30 if self.expanded else 0.35
        self.width_started = time.monotonic()
        self.width_timer = self.island.add_tick_callback(self.animate_width_step)


    def animate_width_step(self, widget, frame_clock):
        progress = min(1.0, (time.monotonic() - self.width_started) / self.size_duration)
        eased = 1 - (1 - progress) ** 2
        width = round(self.width_from + (self.width_to - self.width_from) * eased)
        height = round(self.height_from + (self.height_to - self.height_from) * eased)
        self.island.set_size_request(width, height)
        self.window.set_default_size(width, height)
        if progress < 1:
            return True
        self.island.set_size_request(self.width_to, self.height_to)
        self.width_timer = 0
        was_revealing = self.revealing_hidden
        self.revealing_hidden = False
        if not self.expanded:
            self.header.set_visible(True)
        self.refresh_expanded()
        if not self.expanded and self.island.get_visible() and not self.width_timer and not was_revealing:
            self.squeezing = True
            self.squeeze_started = time.monotonic()
            self.width_timer = self.island.add_tick_callback(self.squeeze_step)
        return False


    def start_hide(self):
        self.hiding = True
        self.hide_started = time.monotonic()
        self.hide_width = self.island.get_width() or self.settings["island_width"]
        self.header.set_visible(False)
        self.width_timer = self.island.add_tick_callback(self.hide_step)


    def set_hidden_input(self, hidden):
        surface = self.window.get_surface()
        if surface and getattr(self, "input_hidden", None) != hidden:
            surface.set_input_region(cairo.Region() if hidden else None)
            self.input_hidden = hidden


    def hide_step(self, widget, frame_clock):
        progress = min(1.0, (time.monotonic() - self.hide_started) / 0.45)
        eased = 2 * progress * progress if progress < 0.5 else 1 - ((-2 * progress + 2) ** 2) / 2
        width = max(1, round(self.hide_width * (1 - eased)))
        self.island.set_size_request(width, self.settings["island_height"])
        self.window.set_default_size(width, self.settings["island_height"])
        self.island.set_opacity(1 - eased)
        if progress < 1:
            return True
        self.width_timer = 0
        self.hiding = False
        self.island.set_visible(False)
        self.set_hidden_input(True)
        self.island.set_opacity(1)
        self.header.set_visible(True)
        self.island.set_size_request(self.settings["island_width"], self.settings["island_height"])
        self.compact_window_width = None
        self.sync_surface_size()
        return False


    def squeeze_step(self, widget, frame_clock):
        elapsed = time.monotonic() - self.squeeze_started
        if elapsed < 0.2:
            progress = elapsed / 0.2
            scale = 1 - 0.25 * (1 - (1 - progress) ** 2)
        else:
            progress = min(1, (elapsed - 0.2) / 0.25)
            back = 1 + 2.70158 * (progress - 1) ** 3 + 1.70158 * (progress - 1) ** 2
            scale = 0.75 + 0.25 * back
        width = round(self.settings["island_width"] * scale)
        height = self.settings["island_height"]
        self.island.set_size_request(width, height)
        extra = 0
        if self.secondary_island.get_visible():
            extra = self.surface.get_spacing() + self.secondary_island.measure(Gtk.Orientation.HORIZONTAL, -1)[0]
        self.window.set_default_size(width + extra, height)
        if elapsed < 0.45:
            return True
        self.island.set_size_request(self.settings["island_width"], height)
        self.width_timer = 0
        self.squeezing = False
        self.compact_window_width = None
        self.refresh_expanded()
        return False


    def revealer_changed(self, revealer, *_):
        if not revealer.get_reveal_child() and not revealer.get_child_revealed():
            self.content.set_visible(False)
            if not self.width_timer:
                self.header.set_visible(True)


