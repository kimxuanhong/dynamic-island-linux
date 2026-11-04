"""LevelView responsibilities for the GTK island."""
from gi.repository import Gtk
from ..widgets import box, button, label


class LevelView:
    def scale(self, lower, upper, callback):
        widget = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, lower, upper, 1)
        widget.set_draw_value(False)
        widget.set_hexpand(True)
        widget.connect("value-changed", lambda s: callback(s) if not self.syncing else None)
        drag = Gtk.GestureClick.new()
        drag.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
        drag.connect("pressed", lambda *_: setattr(self, "dragging", True))
        drag.connect("released", self.end_drag)
        drag.connect("cancel", self.end_drag)
        widget.add_controller(drag)
        return widget


    def end_drag(self, *_):
        self.dragging = False
        self.refresh_expanded()


    def build_controls(self):
        self.controls_stack = Gtk.Stack()
        self.controls_stack.set_hhomogeneous(False)
        self.controls_stack.set_vhomogeneous(False)
        self.controls_stack.set_transition_type(Gtk.StackTransitionType.CROSSFADE)
        self.controls_stack.set_transition_duration(120)
        self.volume = self.scale(0, 100, lambda s: self.schedule_command("volume", lambda: self.command("SetVolume", "(i)", (round(s.get_value()),))))
        self.volume.add_css_class("level-scale-control")
        self.volume.set_tooltip_text("Âm lượng")
        self.mute = button("audio-volume-high-symbolic", "Bật / tắt âm", lambda *_: self.command("ToggleMute"))
        self.mute.get_child().set_pixel_size(26)
        self.volume_value = label("—", "muted", 1)
        self.volume_value.set_width_chars(4)
        self.volume_row = self.level_page(self.mute, "Âm lượng", "Âm thanh đầu ra", self.volume, self.volume_value, "Nhấn biểu tượng để tắt / bật âm")
        self.mute.add_css_class("accent-blue")
        self.volume_value.add_css_class("accent-blue")
        brightness_tile = Gtk.Button(icon_name="display-brightness-symbolic")
        brightness_tile.get_child().set_pixel_size(26)
        brightness_tile.set_can_target(False)
        brightness_tile.set_focusable(False)
        self.brightness_scale = self.scale(1, 100, lambda s: self.schedule_command("brightness", lambda: self.backend.set_brightness(round(s.get_value())) if self.backend else None))
        self.brightness_scale.add_css_class("level-scale-control")
        self.brightness_scale.set_tooltip_text("Độ sáng màn hình")
        self.brightness_value = label("—", "muted", 1)
        self.brightness_value.set_width_chars(4)
        self.brightness_row = self.level_page(brightness_tile, "Độ sáng", "Màn hình", self.brightness_scale, self.brightness_value, "Kéo thanh để điều chỉnh")
        brightness_tile.add_css_class("accent-amber")
        self.brightness_value.add_css_class("accent-amber")
        self.controls_stack.add_named(self.volume_row, "volume")
        self.controls_stack.add_named(self.brightness_row, "brightness")
        self.view_area.add_named(self.controls_stack, "controls")


    def level_page(self, icon, title, subtitle, scale, value, footer):
        page = box(True, 14, "level-card")
        header = box(False, 12, "level-header")
        icon.add_css_class("level-icon-tile")
        icon.set_size_request(52, 52)
        icon.set_halign(Gtk.Align.START)
        icon.set_valign(Gtk.Align.CENTER)
        header.append(icon)
        labels = box(True, 2)
        labels.set_hexpand(True)
        labels.set_valign(Gtk.Align.CENTER)
        labels.append(label(title, "level-title"))
        labels.append(label(subtitle, "level-subtitle"))
        header.append(labels)
        value.add_css_class("level-value")
        value.set_valign(Gtk.Align.CENTER)
        value.set_width_chars(5)
        header.append(value)
        page.append(header)
        slider_section = box(True, 2)
        slider_section.append(scale)
        bounds = box(False, 0, "level-bounds")
        low = label("0")
        low.set_hexpand(True)
        bounds.append(low)
        bounds.append(label("100%", align=1))
        slider_section.append(bounds)
        page.append(slider_section)
        page.append(label(footer, "level-footer"))
        return page


