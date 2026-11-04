"""Diagnostics responsibilities for the GTK island."""
import logging
from gi.repository import Gsk, Gtk
try:
    from gi.repository import Gtk4LayerShell as Layer
except ImportError:
    Layer = None
LOG = logging.getLogger(__name__)


class Diagnostics:
    def smoke(self):
        try:
            assert self.window.get_mapped(), "Window did not map"
            assert self.window.get_width() > 100
            if self.layered:
                assert Layer.is_layer_window(self.window)
            self.on_event("volume_changed", "system", {"level": 48, "muted": False})
            self.queue.step()
            self.refresh_expanded()
            assert self.expanded
            self.dragging = True
            self.on_event("notification", "Test", {"summary": "Test notification", "body": "Queue while dragging"})
            self.queue.step(held=True)
            assert self.queue.current.key == "volume"
            self.dragging = False
            self.queue.current = None
            self.queue.step()
            assert self.queue.current.key == "notification:Test"
            self.queue.current = None
            self.queue.pending.clear()
            self.pinned = False
            self.hovered = False
            self.refresh_expanded()
            assert not self.expanded
            self.pinned = True
            self.refresh_expanded()
            assert self.expanded
            print("GTK_SMOKE_PASS: mapped, layer surface, events, drag queue, collapse, expand", flush=True)
        except Exception:
            LOG.exception("GTK smoke failed")
            self.options.failed = True
        self.quit()
        return False


    def capture(self):
        try:
            current = self.view_area.get_visible_child()
            print("GTK_LAYOUT",
                  "window", self.window.get_width(), self.window.get_height(),
                  "surface", self.surface.get_width(), self.surface.get_height(),
                  "island", self.island.get_width(), self.island.get_height(),
                  "header", self.header.get_width(), self.header.get_height(),
                  "revealer", self.revealer.get_width(), self.revealer.get_height(),
                  "content", self.content.get_width(), self.content.get_height(),
                  "view", self.view_area.get_width(), self.view_area.get_height(),
                  "page", current.get_width() if current else 0, current.get_height() if current else 0,
                  flush=True)
            paintable = Gtk.WidgetPaintable.new(self.surface)
            snapshot = Gtk.Snapshot.new()
            paintable.snapshot(snapshot, self.surface.get_width(), self.surface.get_height())
            node = snapshot.to_node()
            renderer = self.window.get_renderer() or Gsk.Renderer.new_for_surface(self.window.get_surface())
            if renderer and not renderer.is_realized():
                renderer.realize(self.window.get_surface())
            if not renderer:
                raise RuntimeError("No GSK renderer is available for this surface")
            texture = renderer.render_texture(node, None)
            texture.save_to_png(self.options.capture)
            print("Saved", self.options.capture, flush=True)
        except Exception:
            LOG.exception("Could not capture widget")
        return False


