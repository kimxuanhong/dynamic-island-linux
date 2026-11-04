# GTK parity with the GNOME Shell extension

The GTK frontend shares the Go D-Bus backend where possible. UI behavior is
ported to GTK; it does not embed the GNOME Shell extension or control GNOME
Shell internals.

## Implemented or available in the current GTK frontend

- MPRIS media metadata, artwork, transport controls, progress and seeking.
- Battery state, audio volume and mute, brightness where a supported D-Bus
  brightness service is available.
- Camera and microphone activity indicators, Bluetooth events, UxPlay sharing
  and input-method activation through the existing event interfaces.
- Notification card, compact notification icon mode, enable/disable, and
  configurable display duration.
- Hover, pin, monitor selection, top offset and default compact content
  (battery, clock, network speed or hidden).
- Compact dimensions, background opacity, and camera/microphone exclusions.
- Physical network throughput sampling and best-effort connection-change
  notices through `nmcli` when NetworkManager's command-line client is present.

## Platform limits

- **GNOME Wayland overlay placement:** GTK cannot ask Wayland to keep an
  ordinary application window above the top panel or place it at an arbitrary
  screen coordinate. The overlay therefore requires a compositor that supports
  GTK4 Layer Shell. GNOME Shell's own supported route for this is a Shell
  extension; on GNOME Wayland the GTK app cannot promise the original notch's
  position, stacking, or exclusive interaction behavior.
- **Global window open/close events:** Wayland intentionally does not expose
  other applications' window lifecycle to ordinary clients. The original gets
  this from GNOME Shell. This feature is omitted in the standalone GTK app.
- **Replacing GNOME notification banners and volume OSD:** GTK can observe
  notification and audio state, but cannot dismiss or restyle GNOME Shell's
  private banners/OSD. GTK notifications are consequently additive. GNOME
  Shell-specific OSD replacement is omitted.
- **GNOME date-panel placement/visibility and Shell preferences integration:**
  these modify GNOME Shell actors and cannot be implemented by a normal GTK
  client. GTK has its own preferences and calendar can only be provided inside
  the app surface.

## Remaining parity work

The GTK surface now uses the source dimensions (130 × 36 compact, 440 × 180
expanded), selects one expanded presenter at a time, and keeps preferences in a
separate window. Media, level, battery, clock/calendar, notice, and idle views
are arranged as presenter pages. The compact notification mode shows its icon
inline; it does not yet reproduce the flying icon animation. Compact activity
cycling covers media, microphone, camera, and UxPlay; network identity,
the flying notification icon and animation/state-queue edge cases still need
porting. The original's screen-mirroring window focus action is unavailable
on generic Wayland, and the GTK app does not share the extension's settings.
