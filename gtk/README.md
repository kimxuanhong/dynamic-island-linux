# Dynamic Island GTK

The GTK frontend is a standalone Wayland layer-shell app. It uses the existing
Go D-Bus backend and does not replace or disable the GNOME Shell extension.

## Run

From the repository root:

```bash
./gtk/run.sh
```

To preview the interface without connecting to system controls:

```bash
./gtk/run.sh --demo --window
```

The normal overlay needs a Wayland compositor with GTK4 layer-shell support.
GNOME Shell on Wayland does not provide arbitrary top-panel placement to a
regular GTK application, so the standalone overlay cannot guarantee the
original extension's location or stacking there. The window preview can also
run under X11 with `GDK_BACKEND=x11`. See [PARITY.md](PARITY.md) for platform
limits and the porting checklist. The launcher builds the Go backend on first
run when needed; Go 1.23 or newer must be installed. Python GObject
introspection for GTK 4, GDK Pixbuf, and GTK4 Layer Shell must also be
available from the system packages.

## Desktop Launcher

Install a launcher in the user's application menu:

```bash
./gtk/install.sh
```

To launch the overlay automatically at login:

```bash
./gtk/install.sh --autostart
```

The installer only writes `dynamic-island-gtk.desktop` under the user's XDG
application and, optionally, autostart directories. It does not install system
packages or modify the GNOME extension setup.

## Controls

- Hover over the island to expand it; click its header to pin or unpin it.
- Use the media controls to play, pause, skip, and seek MPRIS-compatible media.
- Adjust volume and brightness with the sliders. Brightness is shown when KDE
  Power Management or the Go backend exposes it.
- Open settings to choose a monitor, set the top offset, and control hover and
  notification behavior.
- Right-click the island (compact or expanded) to open settings.
- Use `Escape` to collapse the panel and `Ctrl+Q` to quit.

The settings panel also exposes default compact content, notification style
and timing, compact dimensions and opacity, privacy exclusions, and volume,
brightness, network, and Bluetooth event toggles. Enter privacy exclusions as
comma-separated exact app names, app IDs, or process names, then press Enter or
click “Lưu” to save them. The preferences window uses GTK 4 and follows the
desktop theme.

## Code layout

`island/app.py` initializes the application and composes the frontend. The
`island/views/` package builds the media, level, idle and notice views;
`widgets.py` contains shared widget helpers. `presenter.py` maps state to the
views, while `events.py`, `interaction.py`, `runtime.py` and `settings.py`
handle backend events, interaction, polling and settings respectively.
`state.py` and `backend.py` contain the UI-independent state and D-Bus client.
