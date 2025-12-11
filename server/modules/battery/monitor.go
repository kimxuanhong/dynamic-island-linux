package battery

import (
	"dynamic-island-server/core"
	"fmt"
	"log"
	"sync"

	"github.com/godbus/dbus/v5"
)

const (
	upowerDest      = "org.freedesktop.UPower"
	upowerPath      = "/org/freedesktop/UPower/devices/DisplayDevice"
	upowerInterface = "org.freedesktop.UPower.Device"
	propsInterface  = "org.freedesktop.DBus.Properties"
)

const (
	DeviceStateUnknown          = 0
	DeviceStateCharging         = 1
	DeviceStateDischarging      = 2
	DeviceStateEmpty            = 3
	DeviceStateFullyCharged     = 4
	DeviceStatePendingCharge    = 5
	DeviceStatePendingDischarge = 6
)

type BatterySource struct {
	conn         *dbus.Conn
	stopChan     chan struct{}
	eventChan    chan *dbus.Signal
	mu           sync.Mutex
	lastPercent  int
	lastCharging bool
	lastPresent  bool
	initialized  bool
	stopOnce     sync.Once
}

func NewBatterySource() *BatterySource {
	return &BatterySource{
		stopChan:    make(chan struct{}),
		eventChan:   make(chan *dbus.Signal, 10),
		initialized: false,
	}
}

func (s *BatterySource) GetName() string {
	return "Battery Monitor (UPower DBus)"
}

func (s *BatterySource) Start(bus core.Bus, stopChan <-chan struct{}) error {
	conn, err := dbus.ConnectSystemBus()
	if err != nil {
		return fmt.Errorf("failed to connect to system bus: %v", err)
	}
	s.conn = conn

	if err := s.fetchInitialValue(bus); err != nil {
		log.Printf("⚠️ Failed to get initial battery value: %v", err)
	}

	matchRule := fmt.Sprintf("type='signal',path='%s',interface='%s',member='PropertiesChanged'", upowerPath, propsInterface)

	call := s.conn.BusObject().Call("org.freedesktop.DBus.AddMatch", 0, matchRule)
	if call.Err != nil {
		s.conn.Close()
		return fmt.Errorf("failed to add dbus match: %v", call.Err)
	}

	s.conn.Signal(s.eventChan)
	log.Println("🔋 Battery Monitor started (UPower)")

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
				log.Println("🔋 Battery Monitor stopped (external stop)")
				return
			case <-s.stopChan:
				log.Println("🔋 Battery Monitor stopped (internal stop)")
				return
			}
		}
	}()

	return nil
}

func (s *BatterySource) fetchInitialValue(bus core.Bus) error {
	if s.conn == nil {
		return fmt.Errorf("dbus connection not established")
	}

	obj := s.conn.Object(upowerDest, dbus.ObjectPath(upowerPath))

	percentageVar, err := obj.GetProperty(upowerInterface + ".Percentage")
	if err != nil {
		return fmt.Errorf("failed to get Percentage: %v", err)
	}
	percentage, ok := percentageVar.Value().(float64)
	if !ok {
		return fmt.Errorf("invalid Percentage type")
	}

	stateVar, err := obj.GetProperty(upowerInterface + ".State")
	if err != nil {
		return fmt.Errorf("failed to get State: %v", err)
	}
	state, ok := stateVar.Value().(uint32)
	if !ok {
		return fmt.Errorf("invalid State type")
	}

	isPresentVar, err := obj.GetProperty(upowerInterface + ".IsPresent")
	if err != nil {
		return fmt.Errorf("failed to get IsPresent: %v", err)
	}
	isPresent, ok := isPresentVar.Value().(bool)
	if !ok {
		return fmt.Errorf("invalid IsPresent type")
	}

	s.publishEvent(bus, int(percentage), state, isPresent)
	return nil
}

func (s *BatterySource) handleSignal(signal *dbus.Signal, bus core.Bus) {
	if signal.Name != propsInterface+".PropertiesChanged" || len(signal.Body) < 2 {
		return
	}

	ifaceName, ok := signal.Body[0].(string)
	if !ok || ifaceName != upowerInterface {
		return
	}

	if signal.Path != dbus.ObjectPath(upowerPath) {
		return
	}

	changedProps, ok := signal.Body[1].(map[string]dbus.Variant)
	if !ok {
		return
	}

	obj := s.conn.Object(upowerDest, dbus.ObjectPath(upowerPath))

	var percentage float64
	var state uint32
	var isPresent bool

	if percentageVar, ok := changedProps["Percentage"]; ok {
		if p, ok := percentageVar.Value().(float64); ok {
			percentage = p
		}
	} else {
		percentageVar, err := obj.GetProperty(upowerInterface + ".Percentage")
		if err == nil {
			if p, ok := percentageVar.Value().(float64); ok {
				percentage = p
			}
		}
	}

	if stateVar, ok := changedProps["State"]; ok {
		if s, ok := stateVar.Value().(uint32); ok {
			state = s
		}
	} else {
		stateVar, err := obj.GetProperty(upowerInterface + ".State")
		if err == nil {
			if s, ok := stateVar.Value().(uint32); ok {
				state = s
			}
		}
	}

	if isPresentVar, ok := changedProps["IsPresent"]; ok {
		if p, ok := isPresentVar.Value().(bool); ok {
			isPresent = p
		}
	} else {
		isPresentVar, err := obj.GetProperty(upowerInterface + ".IsPresent")
		if err == nil {
			if p, ok := isPresentVar.Value().(bool); ok {
				isPresent = p
			}
		}
	}

	s.publishEvent(bus, int(percentage), state, isPresent)
}

func (s *BatterySource) publishEvent(bus core.Bus, percentage int, state uint32, isPresent bool) {
	s.mu.Lock()
	isCharging := (state == DeviceStateCharging || state == DeviceStateFullyCharged)

	shouldPublish := !s.initialized ||
		s.lastPercent != percentage ||
		s.lastCharging != isCharging ||
		s.lastPresent != isPresent

	if shouldPublish {
		s.lastPercent = percentage
		s.lastCharging = isCharging
		s.lastPresent = isPresent
		s.initialized = true
	}
	s.mu.Unlock()

	if !shouldPublish {
		return
	}

	event := core.NewEvent(core.EventBatteryChanged, "system", 0)
	event.Metadata["percentage"] = percentage
	event.Metadata["isCharging"] = isCharging
	event.Metadata["isPresent"] = isPresent
	event.Metadata["state"] = int(state)

	log.Printf("🔋 Battery: %d%% (%s, Present: %v)", percentage, map[bool]string{true: "Charging", false: "Discharging"}[isCharging], isPresent)
	bus.Publish(event)
}

func (s *BatterySource) Stop() {
	s.stopOnce.Do(func() {
		close(s.stopChan)
	})
}
