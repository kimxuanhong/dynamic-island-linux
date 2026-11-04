"""NoticeView responsibilities for the GTK island."""
from gi.repository import Gtk, Pango
from ..widgets import box, label


class NoticeView:
    def build_notice(self):
        self.notice_box = box(False, 14, "status-card")
        self.notice_box.set_valign(Gtk.Align.CENTER)
        tile = box(False, 0, "status-icon-tile")
        self.notice_tile = tile
        tile.set_hexpand(False)
        tile.set_size_request(64, 64)
        tile.set_halign(Gtk.Align.START)
        tile.set_valign(Gtk.Align.CENTER)
        self.notice_icon = Gtk.Image(pixel_size=32)
        self.notice_icon.set_halign(Gtk.Align.CENTER)
        self.notice_icon.set_valign(Gtk.Align.CENTER)
        self.notice_icon.set_hexpand(True)
        tile.append(self.notice_icon)
        self.notice_box.append(tile)
        texts = box(True, 3)
        texts.set_hexpand(True)
        texts.set_valign(Gtk.Align.CENTER)
        self.notice_category = label("Thông báo", "status-eyebrow")
        self.notice_title = label("", "status-title")
        self.notice_body = label("", "status-detail")
        self.notice_body.set_max_width_chars(38)
        self.notice_body.set_wrap(True)
        self.notice_body.set_wrap_mode(Pango.WrapMode.WORD_CHAR)
        self.notice_body.set_lines(2)
        texts.append(self.notice_category)
        texts.append(self.notice_title)
        texts.append(self.notice_body)
        self.notice_progress = Gtk.ProgressBar()
        texts.append(self.notice_progress)
        self.notice_box.append(texts)
        self.notice_box.set_visible(False)
        self.view_area.add_named(self.notice_box, "notice")


