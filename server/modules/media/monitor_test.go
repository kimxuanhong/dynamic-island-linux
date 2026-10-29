package media

import (
	"dynamic-island-server/core"
	"github.com/godbus/dbus/v5"
	"testing"
)

type captureBus struct {
	core.Bus
	events []*core.Event
}

func (b *captureBus) Publish(event *core.Event) { b.events = append(b.events, event) }

func TestLastPlayerDisappears(t *testing.T) {
	s := NewMediaSource()
	s.currentPlayer = "org.mpris.MediaPlayer2.firefox"
	s.currentStatus = "Playing"
	s.playerList = []string{s.currentPlayer}
	bus := &captureBus{}
	s.handleSignal(&dbus.Signal{Name: dbusInterface + ".NameOwnerChanged", Body: []interface{}{s.currentPlayer, ":1.42", ""}}, bus)
	if s.currentPlayer != "" || s.currentStatus != "" || len(s.playerList) != 0 {
		t.Fatal("player state was not cleared")
	}
	if len(bus.events) != 1 || bus.events[0].Metadata["player"] != "" {
		t.Fatalf("missing empty-player event: %+v", bus.events)
	}
}

func TestInactivePlayerDisappears(t *testing.T) {
	s := NewMediaSource()
	s.currentPlayer = "org.mpris.MediaPlayer2.firefox"
	s.currentStatus = "Playing"
	other := "org.mpris.MediaPlayer2.chromium"
	s.playerList = []string{s.currentPlayer, other}
	bus := &captureBus{}
	s.handleSignal(&dbus.Signal{Name: dbusInterface + ".NameOwnerChanged", Body: []interface{}{other, ":1.43", ""}}, bus)
	if s.currentStatus != "Playing" || s.currentPlayer != "org.mpris.MediaPlayer2.firefox" || len(bus.events) != 0 {
		t.Fatal("closing inactive browser interrupted active media")
	}
}
