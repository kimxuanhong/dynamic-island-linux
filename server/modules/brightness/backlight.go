package brightness

import (
	"fmt"
	"math"
	"strings"

	"github.com/godbus/dbus/v5"
)

const (
	mutterInterface = "org.gnome.Mutter.DisplayConfig"
	mutterPath      = "/org/gnome/Mutter/DisplayConfig"
)

type backlightState struct {
	Serial          uint32
	Connector       string
	Min, Max, Value int32
}

func (b backlightState) percent() int {
	return int(math.Round(100 * float64(b.Value-b.Min) / float64(b.Max-b.Min)))
}

func readBacklight(conn *dbus.Conn) (backlightState, error) {
	value, err := conn.Object(mutterInterface, dbus.ObjectPath(mutterPath)).GetProperty(mutterInterface + ".Backlight")
	if err != nil {
		return backlightState{}, err
	}
	return parseBacklight(value)
}

func parseBacklight(value dbus.Variant) (backlightState, error) {
	var state struct {
		Serial  uint32
		Outputs []map[string]dbus.Variant
	}
	if err := dbus.Store([]interface{}{value.Value()}, &state); err != nil {
		return backlightState{}, err
	}
	var selected *backlightState
	for _, output := range state.Outputs {
		connector, ok := output["connector"].Value().(string)
		active, _ := output["active"].Value().(bool)
		min, minOK := output["min"].Value().(int32)
		max, maxOK := output["max"].Value().(int32)
		current, currentOK := output["value"].Value().(int32)
		if !ok || !active || !minOK || !maxOK || !currentOK || max <= min || current < min || current > max {
			continue
		}
		candidate := backlightState{state.Serial, connector, min, max, current}
		// Prefer the laptop panel when multiple controllable outputs exist.
		if selected == nil {
			selected = &candidate
		}
		if strings.HasPrefix(connector, "eDP") || strings.HasPrefix(connector, "LVDS") || strings.HasPrefix(connector, "DSI") {
			return candidate, nil
		}
	}
	if selected != nil {
		return *selected, nil
	}
	return backlightState{}, fmt.Errorf("no active display with controllable backlight")
}
