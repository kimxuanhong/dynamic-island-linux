package handlers

import (
	"dynamic-island-server/core"
	"encoding/json"
	"log"
	"time"

	"github.com/godbus/dbus/v5"
)

const (
	serviceName = "com.github.dynamic_island.Server"
	objectPath  = "/com/github/dynamic_island/Server"
)

type DBusEmitHandler struct {
	conn *dbus.Conn
}

func NewDBusEmitHandler(conn *dbus.Conn) *DBusEmitHandler {
	return &DBusEmitHandler{conn: conn}
}

func (h *DBusEmitHandler) GetName() string {
	return "D-Bus Emitter"
}

func (h *DBusEmitHandler) Handle(event *core.Event) error {

	metadataJSON := "{}"
	if len(event.Metadata) > 0 {
		if bytes, err := json.Marshal(event.Metadata); err == nil {
			metadataJSON = string(bytes)
		} else {
			log.Printf("⚠️ Failed to marshal metadata: %v", err)
		}
	}

	log.Printf("📡 Emitting DBus Signal: [%s] App: %s, PID: %d, Meta: %s", event.Type, event.AppName, event.PID, metadataJSON)

	return h.conn.Emit(objectPath, serviceName+".EventOccurred",
		string(event.Type), event.AppName, int32(event.PID),
		event.Timestamp.Format(time.RFC3339), metadataJSON)
}
