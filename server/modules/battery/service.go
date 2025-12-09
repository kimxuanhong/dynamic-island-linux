package battery

import (
	"fmt"
	"sync"

	"github.com/godbus/dbus/v5"
)

type BatteryService struct {
	source *BatterySource
	mu     sync.RWMutex
}

func NewBatteryService(source *BatterySource) *BatteryService {
	return &BatteryService{
		source: source,
	}
}

func (s *BatteryService) GetBatteryInfo() (percentage int32, isCharging bool, isPresent bool, err error) {
	// Sử dụng connection từ source nếu có, nếu không thì tạo connection mới
	var conn *dbus.Conn
	s.mu.RLock()
	if s.source != nil && s.source.conn != nil {
		conn = s.source.conn
		s.mu.RUnlock()
	} else {
		s.mu.RUnlock()
		var err error
		conn, err = dbus.ConnectSystemBus()
		if err != nil {
			return 0, false, false, fmt.Errorf("failed to connect to system bus: %v", err)
		}
		defer conn.Close()
	}

	obj := conn.Object(upowerDest, dbus.ObjectPath(upowerPath))

	percentageVar, err := obj.GetProperty(upowerInterface + ".Percentage")
	if err != nil {
		return 0, false, false, fmt.Errorf("failed to get Percentage: %v", err)
	}
	percentageFloat, ok := percentageVar.Value().(float64)
	if !ok {
		return 0, false, false, fmt.Errorf("invalid Percentage type")
	}
	percentage = int32(percentageFloat)

	stateVar, err := obj.GetProperty(upowerInterface + ".State")
	if err != nil {
		return 0, false, false, fmt.Errorf("failed to get State: %v", err)
	}
	state, ok := stateVar.Value().(uint32)
	if !ok {
		return 0, false, false, fmt.Errorf("invalid State type")
	}
	isCharging = (state == DeviceStateCharging || state == DeviceStateFullyCharged)

	isPresentVar, err := obj.GetProperty(upowerInterface + ".IsPresent")
	if err != nil {
		return 0, false, false, fmt.Errorf("failed to get IsPresent: %v", err)
	}
	isPresent, ok = isPresentVar.Value().(bool)
	if !ok {
		return 0, false, false, fmt.Errorf("invalid IsPresent type")
	}

	return percentage, isCharging, isPresent, nil
}

