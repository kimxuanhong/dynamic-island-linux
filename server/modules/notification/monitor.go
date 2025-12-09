package notification

import (
	"dynamic-island-server/core"
	"fmt"
	"log"
	"sync"

	"github.com/godbus/dbus/v5"
)

const (
	extInterface = "com.github.dynamic_island.Extension"
	extSignal    = "Notification"
)

type NotificationSource struct {
	conn      *dbus.Conn
	stopChan  chan struct{}
	eventChan chan *dbus.Signal
	stopOnce  sync.Once
}

func NewNotificationSource() *NotificationSource {
	return &NotificationSource{
		stopChan:  make(chan struct{}),
		eventChan: make(chan *dbus.Signal, 10),
	}
}

func (s *NotificationSource) GetName() string {
	return "Notification Monitor (From JS)"
}

func (s *NotificationSource) Start(bus core.Bus, stopChan <-chan struct{}) error {
	conn, err := dbus.ConnectSessionBus()
	if err != nil {
		return fmt.Errorf("failed to connect to session bus: %v", err)
	}
	s.conn = conn

	matchRule := fmt.Sprintf("type='signal',interface='%s',member='%s'", extInterface, extSignal)

	call := s.conn.BusObject().Call("org.freedesktop.DBus.AddMatch", 0, matchRule)
	if call.Err != nil {
		s.conn.Close()
		return fmt.Errorf("failed to add match rule: %v", call.Err)
	}

	s.conn.Signal(s.eventChan)

	log.Println("🔔 Notification Listener started (Waiting for JS signal)")

	go func() {
		defer func() {
			if s.conn != nil {
				s.conn.Close()
			}
		}()

		for {
			select {
			case signal := <-s.eventChan:
				if signal != nil {
					s.handleSignal(signal, bus)
				}
			case <-stopChan:
				log.Println("🔔 Notification Monitor stopped (external stop)")
				return
			case <-s.stopChan:
				log.Println("🔔 Notification Monitor stopped (internal stop)")
				return
			}
		}
	}()

	return nil
}

func (s *NotificationSource) handleSignal(signal *dbus.Signal, bus core.Bus) {

	expectedSignalName := extInterface + "." + extSignal
	if signal.Name != expectedSignalName {
		return
	}

	if len(signal.Body) < 4 {
		log.Printf("⚠️ Invalid notification signal: expected 4 arguments, got %d", len(signal.Body))
		return
	}

	appName, ok := signal.Body[0].(string)
	if !ok {
		log.Printf("⚠️ Invalid app_name type: %T", signal.Body[0])
		return
	}

	title, ok := signal.Body[1].(string)
	if !ok {
		log.Printf("⚠️ Invalid title type: %T", signal.Body[1])
		return
	}

	body, ok := signal.Body[2].(string)
	if !ok {
		log.Printf("⚠️ Invalid body type: %T", signal.Body[2])
		return
	}

	icon, ok := signal.Body[3].(string)
	if !ok {
		log.Printf("⚠️ Invalid icon type: %T", signal.Body[3])
		return
	}

	event := core.NewEvent(core.EventNotification, appName, 0)
	event.Metadata["summary"] = title
	event.Metadata["body"] = body
	event.Metadata["icon"] = icon

	log.Printf("📥 Notification from JS: [%s] %s", appName, title)
	bus.Publish(event)
}

func (s *NotificationSource) Stop() {
	s.stopOnce.Do(func() {
		close(s.stopChan)
	})
}
