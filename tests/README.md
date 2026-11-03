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

`tests/gnome-battery-presence.js` checks battery appearance/removal, hiding the idle
island without a battery, and showing temporary volume events while idle is hidden.

`tests/gnome-appearance.js` checks live opacity and size changes, centering, split
spacing, expansion, and preserving scale after collapse. The brightness test
checks pointer interactions on scaled controls.

`tests/gnome-level-settings.js` checks live level toggles, OSD replacement and
fallback, display duration, dismissal, and restoration of the OSD method on disable.

`tests/gnome-idle-settings.js` checks default battery/clock/network-speed/hidden content,
replacement by every activity, two-notch sequencing without fallback leakage,
returning to the default, and stopping unused speed polling.
`tests/gnome-default-battery-event.js` checks charging/unplugging events while the
battery is replaced by media/mic, restoration of active or hidden content,
and silent percentage/full-charge updates while external power stays unchanged.
`gjs -m tests/network-rate.js` checks rate units, elapsed time, new interfaces,
loopback exclusion, and counter resets.

`tests/gnome-privacy.js` checks concurrent mic/camera sessions, exact app exclusions,
live exclusion changes during expansion, queue removal, and indicator dismissal.
Backend monitor-source parsing tests run with `go test ./modules/microphone/...` from `server/`.

`tests/gnome-network.js` checks startup silence, Wi-Fi/Ethernet transitions,
deduplication, disconnect identity, VPN fallback, disabling events, and cleanup.

`tests/gnome-notification-window.js` checks notification modes and timing, opens
and closes a real GTK window, and verifies disabling window events.
`tests/gnome-preferences.js` opens and closes the actual extension preferences window.

`tests/gnome-animation-center.js` samples the horizontal center throughout squeeze,
expansion, and collapse at every size, checks both actors in split mode, and changes
size during running animations to catch stale scale targets.

`tests/gnome-hidden-animation.js` samples centered hide/reveal in all sizes,
checks direct hidden-to-expanded and compact-before-hide ordering, and reverses a running hide when
a default choice or a new event arrives.

`tests/gnome-notification-compact.js` checks empty compact reveal before flying icons,
FIFO notifications, keeping compact visible, reusing existing content, and canceling
queued notifications when disabled.

`tests/gnome-level-reopen.js` checks repeated volume/brightness actions after hiding,
reversal during collapse, rapid key presses, immediate replacement of an expanded
card without collapsing, and simultaneous width/opacity transitions in both directions.

`tests/gnome-dimensions-expand.js` checks independent width/height changes, matching
split heights, live expanded height changes, direct expansion from hidden, and
retaining empty-compact-first behavior for flying notifications.
