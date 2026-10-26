Run the integration check on GNOME 51 with `gnome-shell-test-tool` installed:

```sh
gnome-extensions pack --force --out-dir=/tmp \
  --extra-source=controllers --extra-source=models \
  --extra-source=utils --extra-source=views .
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
