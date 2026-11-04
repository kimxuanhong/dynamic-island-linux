"""MediaView responsibilities for the GTK island."""
from gi.repository import Gtk
from ..widgets import box, button, label


class MediaView:
    def build_media(self):
        self.media_box = box(True, 7)
        row = box(False, 14)
        self.art_frame = box(False, 0, "art")
        self.art_frame.set_size_request(60, 60)
        self.art_frame.set_hexpand(False)
        self.art_frame.set_overflow(Gtk.Overflow.HIDDEN)
        self.art = Gtk.Image.new_from_icon_name("audio-x-generic-symbolic")
        self.art.set_pixel_size(60)
        self.art.set_halign(Gtk.Align.CENTER)
        self.art.set_valign(Gtk.Align.CENTER)
        self.art_frame.append(self.art)
        row.append(self.art_frame)
        info = box(True, 4)
        info.set_hexpand(True)
        self.media_caption = label("SẴN SÀNG", "eyebrow")
        self.media_title = label("Không có nhạc đang phát", "title")
        self.media_title.set_max_width_chars(25)
        self.media_artist = label("Mở trình phát nhạc bạn yêu thích", "muted")
        self.media_artist.set_max_width_chars(30)
        info.append(self.media_caption)
        info.append(self.media_title)
        info.append(self.media_artist)
        row.append(info)
        self.media_box.append(row)
        self.seek = self.scale(0, 100, self.seek_changed)
        self.seek.add_css_class("seek")
        self.media_box.append(self.seek)
        transport = box(False, 10)
        transport.set_halign(Gtk.Align.CENTER)
        self.elapsed = label("0:00", "muted")
        self.previous = button("media-skip-backward-symbolic", "Bài trước", lambda *_: self.command("MediaPrevious"))
        self.play = button("media-playback-start-symbolic", "Phát / tạm dừng", lambda *_: self.command("MediaPlayPause"), "play")
        self.next = button("media-skip-forward-symbolic", "Bài tiếp", lambda *_: self.command("MediaNext"))
        for widget in (self.previous, self.play, self.next):
            widget.add_css_class("media-control")
            widget.add_css_class("circular")
            transport.append(widget)
        self.total = label("0:00", "muted", 1)
        time_controls = Gtk.CenterBox()
        time_controls.set_hexpand(True)
        time_controls.set_start_widget(self.elapsed)
        time_controls.set_center_widget(transport)
        time_controls.set_end_widget(self.total)
        self.media_box.append(time_controls)
        self.view_area.add_named(self.media_box, "media")


