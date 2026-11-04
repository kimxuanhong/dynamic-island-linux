"""Shared widget factories and dimensions for the GTK frontend."""
from gi.repository import Gtk, Pango

COMPACT_WIDTH = 130
COMPACT_HEIGHT = 36
SECONDARY_WIDTH = 56
EXPANDED_WIDTH = 440
EXPANDED_HEIGHT = 180
WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
MONTHS = ("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December")

def label(text="", css=None, align=0):
    widget = Gtk.Label(label=text, xalign=align)
    widget.set_ellipsize(Pango.EllipsizeMode.END)
    if css:
        widget.add_css_class(css)
    return widget


def box(vertical=False, spacing=8, css=None):
    widget = Gtk.Box(orientation=Gtk.Orientation.VERTICAL if vertical else Gtk.Orientation.HORIZONTAL, spacing=spacing)
    if css:
        widget.add_css_class(css)
    return widget


def button(icon, tooltip, callback, css=None):
    widget = Gtk.Button(icon_name=icon, tooltip_text=tooltip)
    widget.connect("clicked", callback)
    if css:
        widget.add_css_class(css)
    return widget


