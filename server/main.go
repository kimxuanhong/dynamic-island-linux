package main

import (
	"dynamic-island-server/core"
	"dynamic-island-server/modules/battery"
	"dynamic-island-server/modules/bluetooth"
	"dynamic-island-server/modules/brightness"
	"dynamic-island-server/modules/camera"
	"dynamic-island-server/modules/handlers"
	"dynamic-island-server/modules/media"
	"dynamic-island-server/modules/microphone"
	"dynamic-island-server/modules/notification"
	"dynamic-island-server/modules/volume"
	"fmt"
	"log"
	"time"

	"github.com/godbus/dbus/v5"
	"github.com/godbus/dbus/v5/introspect"
)

const (
	serviceName = "com.github.dynamic_island.Server"
	objectPath  = "/com/github/dynamic_island/Server"
)

const introspectXML = `
<node>
	<interface name="com.github.dynamic_island.Server">
		<method name="SetVolume">
			<arg name="level" type="i" direction="in"/>
		</method>
		<method name="ToggleMute">
		</method>
		<method name="SetBrightness">
			<arg name="level" type="i" direction="in"/>
		</method>
		<method name="MediaNext">
		</method>
		<method name="MediaPrevious">
		</method>
		<method name="MediaPlayPause">
		</method>
		<method name="GetBatteryInfo">
			<arg name="percentage" type="i" direction="out"/>
			<arg name="isCharging" type="b" direction="out"/>
			<arg name="isPresent" type="b" direction="out"/>
		</method>
		<signal name="EventOccurred">
			<arg name="event_type" type="s" direction="out"/>
			<arg name="app_name" type="s" direction="out"/>
			<arg name="pid" type="i" direction="out"/>
			<arg name="timestamp" type="s" direction="out"/>
			<arg name="metadata" type="s" direction="out"/>
		</signal>
	</interface>
	<interface name="org.freedesktop.DBus.Introspectable">
		<method name="Introspect">
			<arg name="data" type="s" direction="out"/>
		</method>
	</interface>
</node>
`

type EventMonitor struct {
	conn          *dbus.Conn
	bus           *core.EventBus
	sources       []core.EventSource
	stopChan      chan struct{}
	mediaSource   *media.MediaSource
	batterySource *battery.BatterySource
}

func NewEventMonitor() (*EventMonitor, error) {
	conn, err := dbus.ConnectSessionBus()
	if err != nil {
		return nil, fmt.Errorf("failed to connect to session bus: %v", err)
	}

	reply, err := conn.RequestName(serviceName, dbus.NameFlagDoNotQueue)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to request name: %v", err)
	}

	if reply != dbus.RequestNameReplyPrimaryOwner {
		conn.Close()
		return nil, fmt.Errorf("name already taken")
	}

	if err := conn.Export(introspect.Introspectable(introspectXML), objectPath,
		"org.freedesktop.DBus.Introspectable"); err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to export introspection: %v", err)
	}

	mediaSource := media.NewMediaSource()
	batterySource := battery.NewBatterySource()

	brightnessService := brightness.NewBrightnessService(conn)
	volumeService := volume.NewVolumeService()
	mediaService := media.NewMediaService(conn, mediaSource)
	batteryService := battery.NewBatteryService(batterySource)

	serverMethods := handlers.NewServerMethods(batteryService, brightnessService, volumeService, mediaService)
	if err := conn.Export(serverMethods, objectPath, serviceName); err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to export methods: %v", err)
	}

	m := &EventMonitor{
		conn:          conn,
		bus:           core.NewEventBus(100),
		sources:       []core.EventSource{},
		stopChan:      make(chan struct{}),
		mediaSource:   mediaSource,
		batterySource: batterySource,
	}

	return m, nil
}

func (m *EventMonitor) RegisterSource(source core.EventSource) {
	m.sources = append(m.sources, source)
	log.Printf("✓ Registered source: %s", source.GetName())
}

func (m *EventMonitor) Start() {
	log.Println("🚀 Starting Dynamic Island Server with EventBus...")

	m.bus.Start()

	for _, source := range m.sources {
		if err := source.Start(m.bus, m.stopChan); err != nil {
			log.Printf("Error starting source %s: %v", source.GetName(), err)
		}
	}

	<-m.stopChan
	log.Println("Server stopped")
}

func (m *EventMonitor) Stop() {
	close(m.stopChan)
	m.bus.Stop()
}

func (m *EventMonitor) Close() {
	if m.conn != nil {
		m.conn.Close()
	}
}

func main() {
	log.Println("Initializing...")

	monitor, err := NewEventMonitor()
	if err != nil {
		log.Fatalf("Failed to create monitor: %v", err)
	}
	defer monitor.Close()

	debounce := core.NewDebounceMiddleware(500 * time.Millisecond)
	debounce.Exclude(core.EventVolumeChanged)
	debounce.Exclude(core.EventBrightnessChanged)
	debounce.Exclude(core.EventMediaChanged)

	monitor.bus.Use(debounce)
	monitor.bus.Use(core.NewRateLimitMiddleware(100, 1*time.Minute))
	monitor.bus.Use(&core.EnrichmentMiddleware{})
	monitor.bus.Use(&core.LoggingMiddleware{})

	handler := handlers.NewDBusEmitHandler(monitor.conn)
	monitor.bus.Subscribe(core.EventMicrophoneStart, handler)
	monitor.bus.Subscribe(core.EventMicrophoneStop, handler)
	monitor.bus.Subscribe(core.EventCameraStart, handler)
	monitor.bus.Subscribe(core.EventCameraStop, handler)
	monitor.bus.Subscribe(core.EventBluetoothConnected, handler)
	monitor.bus.Subscribe(core.EventBluetoothDisconnected, handler)
	monitor.bus.Subscribe(core.EventNotification, handler)
	monitor.bus.Subscribe(core.EventVolumeChanged, handler)
	monitor.bus.Subscribe(core.EventVolumeMuted, handler)
	monitor.bus.Subscribe(core.EventVolumeUnmuted, handler)
	monitor.bus.Subscribe(core.EventBrightnessChanged, handler)
	monitor.bus.Subscribe(core.EventMediaChanged, handler)
	monitor.bus.Subscribe(core.EventBatteryChanged, handler)

	monitor.RegisterSource(microphone.NewMicrophoneSource())
	monitor.RegisterSource(camera.NewCameraSource())
	monitor.RegisterSource(bluetooth.NewBluetoothSource())
	monitor.RegisterSource(notification.NewNotificationSource())
	monitor.RegisterSource(volume.NewVolumeSource())
	monitor.RegisterSource(brightness.NewBrightnessSource())
	monitor.RegisterSource(monitor.batterySource)
	monitor.RegisterSource(monitor.mediaSource)

	log.Printf("D-Bus service started at %s", serviceName)
	monitor.Start()
}
