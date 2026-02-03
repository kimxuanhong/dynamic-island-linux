# Task: Comment out all logs

## Status: Completed

## Changes
- Commented out all `log()` calls in the Gnome Extension JavaScript files.
  - `utils/layoutManager.js`
  - `controllers/notchController.js`
  - `models/notificationManager.js`
  - `models/recordingManager.js`
  - `models/brightnessManager.js`
  - `models/mediaManager.js`
  - `models/bluetoothManager.js`
  - `models/cameraManager.js`
  - `models/volumeManager.js`
  - `models/batteryManager.js`
  - `views/mediaView.js`

- Commented out all `log.Print*` calls in the Backend Server Go files.
  - `server/main.go`
  - `server/core/bus.go`
  - `server/core/middleware.go`
  - `server/modules/brightness/monitor.go`
  - `server/modules/brightness/service.go`
  - `server/modules/bluetooth/monitor.go`
  - `server/modules/camera/monitor.go`
  - `server/modules/battery/monitor.go`
  - `server/modules/notification/monitor.go`
  - `server/modules/media/monitor.go`
  - `server/modules/media/service.go`
  - `server/modules/volume/monitor.go`
  - `server/modules/volume/service.go`
  - `server/modules/handlers/dbus.go`

## Verification
- Verified using `grep` that no active logging statements remain (except for critical `log.Fatal` or filtered ones if any, though none were intended to be left).
