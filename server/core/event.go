package core

import (
	"context"
	"fmt"
	"time"
)

type EventType string

const (
	EventMicrophoneStart       EventType = "microphone_start"
	EventMicrophoneStop        EventType = "microphone_stop"
	EventCameraStart           EventType = "camera_start"
	EventCameraStop            EventType = "camera_stop"
	EventBluetoothConnected    EventType = "bluetooth_connected"
	EventBluetoothDisconnected EventType = "bluetooth_disconnected"
	EventNotification          EventType = "notification"
	EventVolumeChanged         EventType = "volume_changed"
	EventVolumeMuted           EventType = "volume_muted"
	EventVolumeUnmuted         EventType = "volume_unmuted"
	EventBrightnessChanged     EventType = "brightness_changed"
	EventMediaChanged          EventType = "media_changed"
	EventBatteryChanged        EventType = "battery_changed"
)

type Event struct {
	ID        string
	Type      EventType
	AppName   string
	PID       int
	Timestamp time.Time
	Metadata  map[string]interface{}

	ctx context.Context
}

func NewEvent(eventType EventType, appName string, pid int) *Event {
	return &Event{
		ID:        fmt.Sprintf("%d-%s-%d", time.Now().UnixNano(), appName, pid),
		Type:      eventType,
		AppName:   appName,
		PID:       pid,
		Timestamp: time.Now(),
		Metadata:  make(map[string]interface{}),
		ctx:       context.Background(),
	}
}

func (e *Event) GetContext() context.Context {
	return e.ctx
}

func (e *Event) SetContext(ctx context.Context) {
	e.ctx = ctx
}
