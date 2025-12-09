package bluetooth

import (
	"dynamic-island-server/core"
	"fmt"
	"log"
	"strings"
	"sync"

	"github.com/godbus/dbus/v5"
)

const (
	bluezInterface = "org.bluez"
	deviceIntf     = "org.bluez.Device1"
	propsIntf      = "org.freedesktop.DBus.Properties"
)

type BluetoothSource struct {
	conn      *dbus.Conn
	stopChan  chan struct{}
	eventChan chan *dbus.Signal
	stopOnce  sync.Once
}

func NewBluetoothSource() *BluetoothSource {
	return &BluetoothSource{
		stopChan:  make(chan struct{}),
		eventChan: make(chan *dbus.Signal, 10),
	}
}

func (s *BluetoothSource) GetName() string {
	return "Bluetooth Monitor"
}

func (s *BluetoothSource) Start(bus core.Bus, stopChan <-chan struct{}) error {

	conn, err := dbus.SystemBus()
	if err != nil {
		return fmt.Errorf("failed to connect to system bus: %v", err)
	}
	s.conn = conn

	matchRule := "type='signal',interface='org.freedesktop.DBus.Properties',member='PropertiesChanged',arg0='org.bluez.Device1'"

	call := s.conn.BusObject().Call("org.freedesktop.DBus.AddMatch", 0, matchRule)
	if call.Err != nil {
		s.conn.Close()
		return fmt.Errorf("failed to add dbus match: %v", call.Err)
	}

	s.conn.Signal(s.eventChan)

	log.Println("🔵 Bluetooth Monitor started (System Bus)")

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
				log.Println("🔵 Bluetooth Monitor stopped (external stop)")
				return
			case <-s.stopChan:
				log.Println("🔵 Bluetooth Monitor stopped (internal stop)")
				return
			}
		}
	}()

	return nil
}

func (s *BluetoothSource) handleSignal(signal *dbus.Signal, bus core.Bus) {

	if len(signal.Body) < 2 {
		return
	}

	changedProps, ok := signal.Body[1].(map[string]dbus.Variant)
	if !ok {
		return
	}

	devicePath := signal.Path
	if devicePath == "" {
		return
	}

	if connectedVar, ok := changedProps["Connected"]; ok {
		connected, ok := connectedVar.Value().(bool)
		if !ok {
			log.Printf("⚠️ Invalid Connected property type: %T", connectedVar.Value())
			return
		}

		props, err := s.getDeviceProperties(devicePath)
		if err != nil {
			log.Printf("⚠️ Failed to get device properties for %s: %v", devicePath, err)
			return
		}

		if !props.Paired {
			return
		}

		s.emitBluetoothEvent(bus, connected, props)
		return
	}

	if pairedVar, ok := changedProps["Paired"]; ok {
		paired, ok := pairedVar.Value().(bool)
		if !ok {
			log.Printf("⚠️ Invalid Paired property type: %T", pairedVar.Value())
			return
		}

		if paired {
			props, err := s.getDeviceProperties(devicePath)
			if err != nil {
				log.Printf("⚠️ Failed to get device properties for %s: %v", devicePath, err)
				return
			}

			if props.Connected {
				s.emitBluetoothEvent(bus, true, props)
			}
		}
	}
}

func (s *BluetoothSource) emitBluetoothEvent(bus core.Bus, connected bool, props *DeviceProps) {
	var event *core.Event

	deviceType := classifyDeviceType(props.Icon)

	if connected {
		event = core.NewEvent(core.EventBluetoothConnected, props.Alias, 0)
		event.Metadata["device"] = "bluetooth"
		event.Metadata["address"] = props.Address
		event.Metadata["icon"] = props.Icon
		event.Metadata["device_type"] = deviceType
		log.Printf("🔵 BT Connected: %s (%s) Type: %s", props.Alias, props.Address, deviceType)
	} else {
		event = core.NewEvent(core.EventBluetoothDisconnected, props.Alias, 0)
		event.Metadata["device"] = "bluetooth"
		event.Metadata["address"] = props.Address
		event.Metadata["device_type"] = deviceType
		log.Printf("⚪ BT Disconnected: %s (%s)", props.Alias, props.Address)
	}

	bus.Publish(event)
}

func classifyDeviceType(icon string) string {

	switch {
	case strings.Contains(icon, "headset"), strings.Contains(icon, "headphone"):
		return "headphone"
	case strings.Contains(icon, "mouse"):
		return "mouse"
	case strings.Contains(icon, "keyboard"):
		return "keyboard"
	case strings.Contains(icon, "audio-card"), strings.Contains(icon, "speaker"):
		return "speaker"
	case strings.Contains(icon, "phone"), strings.Contains(icon, "smartphone"):
		return "phone"
	case strings.Contains(icon, "computer"), strings.Contains(icon, "laptop"):
		return "computer"
	case strings.Contains(icon, "joystick"), strings.Contains(icon, "gamepad"):
		return "gamepad"
	default:
		return "bluetooth"
	}
}

type DeviceProps struct {
	Name      string
	Alias     string
	Address   string
	Icon      string
	Paired    bool
	Trusted   bool
	Connected bool
}

func (s *BluetoothSource) getDeviceProperties(path dbus.ObjectPath) (*DeviceProps, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("dbus connection not established")
	}

	obj := s.conn.Object(bluezInterface, path)

	var result map[string]dbus.Variant
	call := obj.Call(propsIntf+".GetAll", 0, deviceIntf)
	if call.Err != nil {
		return nil, fmt.Errorf("failed to call GetAll: %v", call.Err)
	}

	if err := call.Store(&result); err != nil {
		return nil, fmt.Errorf("failed to store result: %v", err)
	}

	d := &DeviceProps{}

	if v, ok := result["Name"]; ok {
		if name, ok := v.Value().(string); ok {
			d.Name = name
		}
	}

	if v, ok := result["Alias"]; ok {
		if alias, ok := v.Value().(string); ok {
			d.Alias = alias
		}
	}
	if d.Alias == "" {
		d.Alias = d.Name
	}

	if v, ok := result["Address"]; ok {
		if address, ok := v.Value().(string); ok {
			d.Address = address
		}
	}

	if v, ok := result["Icon"]; ok {
		if icon, ok := v.Value().(string); ok {
			d.Icon = icon
		}
	}

	if v, ok := result["Paired"]; ok {
		if paired, ok := v.Value().(bool); ok {
			d.Paired = paired
		}
	}

	if v, ok := result["Trusted"]; ok {
		if trusted, ok := v.Value().(bool); ok {
			d.Trusted = trusted
		}
	}

	if v, ok := result["Connected"]; ok {
		if connected, ok := v.Value().(bool); ok {
			d.Connected = connected
		}
	}

	return d, nil
}

func (s *BluetoothSource) Stop() {
	s.stopOnce.Do(func() {
		close(s.stopChan)
	})
}
