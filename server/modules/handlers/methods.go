package handlers

import (
	"dynamic-island-server/modules/battery"
	"dynamic-island-server/modules/brightness"
	"dynamic-island-server/modules/media"
	"dynamic-island-server/modules/volume"
	"fmt"

	"github.com/godbus/dbus/v5"
)

type ServerMethods struct {
	batteryService    *battery.BatteryService
	brightnessService *brightness.BrightnessService
	volumeService     *volume.VolumeService
	mediaService      *media.MediaService
}

func NewServerMethods(batteryService *battery.BatteryService, brightnessService *brightness.BrightnessService, volumeService *volume.VolumeService, mediaService *media.MediaService) *ServerMethods {
	return &ServerMethods{
		batteryService:    batteryService,
		brightnessService: brightnessService,
		volumeService:     volumeService,
		mediaService:      mediaService,
	}
}

func (m *ServerMethods) SetVolume(level int32) *dbus.Error {
	if err := m.volumeService.SetVolume(level); err != nil {
		return dbus.MakeFailedError(err)
	}
	return nil
}

func (m *ServerMethods) ToggleMute() *dbus.Error {
	if err := m.volumeService.ToggleMute(); err != nil {
		return dbus.MakeFailedError(err)
	}
	return nil
}

func (m *ServerMethods) SetBrightness(level int32) *dbus.Error {
	if err := m.brightnessService.SetBrightness(level); err != nil {
		return dbus.MakeFailedError(fmt.Errorf("failed to set brightness: %v", err))
	}
	return nil
}

func (m *ServerMethods) MediaNext() *dbus.Error {
	if err := m.mediaService.Next(); err != nil {
		return dbus.MakeFailedError(fmt.Errorf("failed to skip to next track: %v", err))
	}
	return nil
}

func (m *ServerMethods) MediaPrevious() *dbus.Error {
	if err := m.mediaService.Previous(); err != nil {
		return dbus.MakeFailedError(fmt.Errorf("failed to skip to previous track: %v", err))
	}
	return nil
}

func (m *ServerMethods) MediaPlayPause() *dbus.Error {
	if err := m.mediaService.PlayPause(); err != nil {
		return dbus.MakeFailedError(fmt.Errorf("failed to toggle play/pause: %v", err))
	}
	return nil
}

func (m *ServerMethods) GetBatteryInfo() (percentage int32, isCharging bool, isPresent bool, err *dbus.Error) {
	if m.batteryService == nil {
		return 0, false, false, dbus.MakeFailedError(fmt.Errorf("battery service not available"))
	}
	p, c, pr, e := m.batteryService.GetBatteryInfo()
	if e != nil {
		return 0, false, false, dbus.MakeFailedError(e)
	}
	return p, c, pr, nil
}
