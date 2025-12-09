package brightness

import (
	"dynamic-island-server/core"
	"fmt"
	"log"
	"math"
	"sync"

	"github.com/godbus/dbus/v5"
)

const (
	gsdPowerDest      = "org.gnome.SettingsDaemon.Power"
	gsdPowerPath      = "/org/gnome/SettingsDaemon/Power"
	gsdPowerInterface = "org.gnome.SettingsDaemon.Power.Screen"

	maxBrightnessJump = 5
)

type BrightnessSource struct {
	conn        *dbus.Conn
	stopChan    chan struct{}
	eventChan   chan *dbus.Signal
	mu          sync.Mutex
	lastPercent int
	initialized bool
	stopOnce    sync.Once
}

func NewBrightnessSource() *BrightnessSource {
	return &BrightnessSource{
		stopChan:    make(chan struct{}),
		eventChan:   make(chan *dbus.Signal, 10),
		initialized: false,
	}
}

func (s *BrightnessSource) GetName() string {
	return "Brightness Monitor (GNOME DBus)"
}

func (s *BrightnessSource) Start(bus core.Bus, stopChan <-chan struct{}) error {
	conn, err := dbus.ConnectSessionBus()
	if err != nil {
		return fmt.Errorf("failed to connect to session bus: %v", err)
	}
	s.conn = conn

	if err := s.fetchInitialValue(bus); err != nil {
		log.Printf("⚠️ Failed to get initial brightness: %v", err)

	}

	matchRule := fmt.Sprintf("type='signal',path='%s',interface='org.freedesktop.DBus.Properties',member='PropertiesChanged'", gsdPowerPath)

	call := s.conn.BusObject().Call("org.freedesktop.DBus.AddMatch", 0, matchRule)
	if call.Err != nil {
		s.conn.Close()
		return fmt.Errorf("failed to add dbus match: %v", call.Err)
	}

	s.conn.Signal(s.eventChan)
	log.Println("☀️ Brightness Monitor started (GNOME Settings Daemon)")

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
				log.Println("☀️ Brightness Monitor stopped (external stop)")
				return
			case <-s.stopChan:
				log.Println("☀️ Brightness Monitor stopped (internal stop)")
				return
			}
		}
	}()

	return nil
}

func (s *BrightnessSource) fetchInitialValue(bus core.Bus) error {
	if s.conn == nil {
		return fmt.Errorf("dbus connection not established")
	}

	obj := s.conn.Object(gsdPowerDest, dbus.ObjectPath(gsdPowerPath))

	variant, err := obj.GetProperty(gsdPowerInterface + ".Brightness")
	if err != nil {
		return fmt.Errorf("failed to get brightness property: %v", err)
	}

	value, ok := variant.Value().(int32)
	if !ok {

		if uintVal, ok := variant.Value().(uint32); ok {
			value = int32(uintVal)
		} else {
			return fmt.Errorf("invalid brightness type: %T", variant.Value())
		}
	}

	s.mu.Lock()
	s.lastPercent = int(value)
	s.initialized = true
	s.mu.Unlock()

	log.Printf("☀️ Initial Brightness: %d%%", int(value))
	return nil
}

func (s *BrightnessSource) handleSignal(signal *dbus.Signal, bus core.Bus) {

	if len(signal.Body) < 2 {
		return
	}

	ifaceName, ok := signal.Body[0].(string)
	if !ok || ifaceName != gsdPowerInterface {
		return
	}

	changedProps, ok := signal.Body[1].(map[string]dbus.Variant)
	if !ok {
		return
	}

	val, ok := changedProps["Brightness"]
	if !ok {
		return
	}

	var newLevel int32
	switch v := val.Value().(type) {
	case int32:
		newLevel = v
	case uint32:
		newLevel = int32(v)
	case int:
		newLevel = int32(v)
	case uint:
		newLevel = int32(v)
	default:
		log.Printf("⚠️ Unexpected brightness type: %T", v)
		return
	}

	percent := int(newLevel)

	s.mu.Lock()
	wasInitialized := s.initialized
	lastPercent := s.lastPercent

	if !wasInitialized {
		s.lastPercent = percent
		s.initialized = true
		s.mu.Unlock()
		log.Printf("☀️ Brightness initialized: %d%%", percent)
		return
	}

	if percent == lastPercent {
		s.mu.Unlock()
		return
	}

	oldPercent := lastPercent
	s.lastPercent = percent
	s.mu.Unlock()

	diff := int(math.Abs(float64(percent - oldPercent)))

	if diff > maxBrightnessJump {
		log.Printf("☀️ Brightness jumped %d%% -> %d%% (Ignored > %d%% jump)", oldPercent, percent, maxBrightnessJump)
		return
	}

	s.emitEvent(bus, percent, oldPercent)
}

func (s *BrightnessSource) emitEvent(bus core.Bus, percent, oldPercent int) {

	icon := s.selectIcon(percent)

	direction := "↑"
	if percent < oldPercent {
		direction = "↓"
	}
	log.Printf("☀️ Brightness Changed: %d%% %s %d%%", oldPercent, direction, percent)

	event := core.NewEvent(core.EventBrightnessChanged, "system", 0)
	event.Metadata["level"] = percent
	event.Metadata["old_level"] = oldPercent
	event.Metadata["icon"] = icon

	bus.Publish(event)
}

func (s *BrightnessSource) selectIcon(percent int) string {
	switch {
	case percent < 30:
		return "display-brightness-low-symbolic"
	case percent < 70:
		return "display-brightness-medium-symbolic"
	default:
		return "display-brightness-high-symbolic"
	}
}

func (s *BrightnessSource) Stop() {
	s.stopOnce.Do(func() {
		close(s.stopChan)
	})
}
