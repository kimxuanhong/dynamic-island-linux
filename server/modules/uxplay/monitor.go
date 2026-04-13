package uxplay

import (
	"dynamic-island-server/core"
	"fmt"
	"sync"

	"github.com/godbus/dbus/v5"
)

type UxplaySource struct {
	conn      *dbus.Conn
	stopChan  chan struct{}
	eventChan chan *dbus.Signal
	stopOnce  sync.Once
}

func NewUxplaySource() *UxplaySource {
	return &UxplaySource{
		stopChan:  make(chan struct{}),
		eventChan: make(chan *dbus.Signal, 10),
	}
}

func (s *UxplaySource) GetName() string {
	return "Uxplay Monitor"
}

func (s *UxplaySource) Start(bus core.Bus, stopChan <-chan struct{}) error {
	conn, err := dbus.ConnectSessionBus()
	if err != nil {
		return fmt.Errorf("failed to connect to session bus: %v", err)
	}
	s.conn = conn

	// Lắng nghe tất cả signal từ path và interface của app uxplay
	matchRule := "type='signal',path='/org/uxplay/Tray',interface='org.uxplay.Tray'"
	call := s.conn.BusObject().Call("org.freedesktop.DBus.AddMatch", 0, matchRule)
	if call.Err != nil {
		s.conn.Close()
		return fmt.Errorf("failed to add dbus match: %v", call.Err)
	}

	s.conn.Signal(s.eventChan)

	go func() {
		defer func() {
			if s.conn != nil {
				s.conn.Close()
			}
		}()

		for {
			select {
			case signal := <-s.eventChan:
				if signal != nil && signal.Name == "org.uxplay.Tray.SharingChanged" && len(signal.Body) > 0 {
					isSharing, ok := signal.Body[0].(bool)
					if ok {
						s.notifyCallbacks(bus, isSharing)
					}
				}
			case <-stopChan:
				return
			case <-s.stopChan:
				return
			}
		}
	}()

	return nil
}

func (s *UxplaySource) notifyCallbacks(bus core.Bus, isSharing bool) {
	// Gửi một Event qua bus chung để view xử lý mở/đóng
	event := core.NewEvent(core.EventUxplaySharing, "uxplay", 0)
	if event.Metadata == nil {
		event.Metadata = make(map[string]interface{})
	}
	event.Metadata["isSharing"] = isSharing

	// TODO: Bên Core/View của bạn cần bắt Event có type "uxplay_sharing"
	// và đọc giá trị "isSharing" để quyết định mở view (ví dụ: màn hình mirror)
	bus.Publish(event)
}

func (s *UxplaySource) Stop() {
	s.stopOnce.Do(func() {
		close(s.stopChan)
	})
}
