Run the integration check on GNOME 51 with `gnome-shell-test-tool` installed:

```sh
gnome-extensions pack --force --out-dir=/tmp \
  --extra-source=controllers --extra-source=models \
  --extra-source=utils --extra-source=views --extra-source=icons .
dbus-run-session -- gnome-shell-test-tool --headless \
  --extension /tmp/dynamic-island@xuanhong.shell-extension.zip \
  "$PWD/tests/gnome-smoke.js"
```

The test uses an isolated D-Bus session and temporary GNOME profile. It checks
extension initialization, hover, click, slider dragging and interrupted-drag
cleanup with a virtual pointer, visualizer playback, and disable/re-enable.
Success prints `DYNAMIC_ISLAND_INPUT_PASS` and `DYNAMIC_ISLAND_SMOKE_PASS`.

GNOME 48–50 input compatibility uses feature detection in `utils/input.js`.
Those older versions require separate runtime testing.

The redesigned volume and brightness components are exercised with fake managers
and a virtual pointer; success also prints `DYNAMIC_ISLAND_LEVELS_PASS`.

To render the actual St widgets with sample data and check layout bounds, use
`tests/gnome-preview.js` instead of `tests/gnome-smoke.js` in the command above.
It saves `/tmp/dynamic-island-preview.png`,
`/tmp/dynamic-island-preview-status.png`, and a long-title variant. It checks that
labels and buttons stay inside their cards. Example renders are in
`docs/previews/`. These are isolated previews, not screenshots of your desktop.

`tests/gnome-brightness.js` checks GNOME Shell brightness events and slider
click/drag positions, including a resized and scaled notch.
`tests/gnome-event-queue.js` checks that events arriving during collapse wait
for compact geometry, then display in FIFO order using their own timers.
Use either script in place of `tests/gnome-smoke.js` in the command above.

`tests/gnome-interaction-queue.js` holds the volume slider while battery,
brightness, and Bluetooth auto-expansions arrive. It checks that volume stays
interactive and the next view opens only after release and full collapse.

`tests/gnome-media-lifecycle.js` checks ten-second pause expiry, cancellation
on resume, repeated paused updates, and cleanup when a browser disappears.

`tests/gnome-media-ready.js` checks that automatic media expansion waits
3 seconds for nonempty track metadata and is canceled on pause/player loss.

`tests/gnome-icons.js` verifies bundled SVG lookup, dynamic icon changes, and preservation of externally supplied artwork.

`tests/gnome-media-hover.js` checks smooth media removal, hover arriving during recentering, battery presenter selection, and hover/leave lifetime.
