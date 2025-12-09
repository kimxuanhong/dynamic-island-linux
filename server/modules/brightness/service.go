package brightness

import (
	"fmt"
	"log"
	"os/exec"

	"github.com/godbus/dbus/v5"
)

type BrightnessService struct {
	conn *dbus.Conn
}

func NewBrightnessService(conn *dbus.Conn) *BrightnessService {
	return &BrightnessService{conn: conn}
}

func (s *BrightnessService) SetBrightness(level int32) error {
	if level < 0 {
		level = 0
	}
	if level > 100 {
		level = 100
	}

	log.Printf("☀️ SetBrightness called: %d%%", level)

	if s.conn == nil {

		return s.setBrightnessViaCLI(level)
	}

	obj := s.conn.Object(gsdPowerDest, dbus.ObjectPath(gsdPowerPath))

	call := obj.Call("org.freedesktop.DBus.Properties.Set", 0,
		gsdPowerInterface,
		"Brightness",
		dbus.MakeVariant(int32(level)))

	if call.Err != nil {
		log.Printf("Error setting brightness via DBus: %v", call.Err)

		return s.setBrightnessViaCLI(level)
	}

	return nil
}

func (s *BrightnessService) setBrightnessViaCLI(level int32) error {
	cmd := exec.Command("busctl", "--user", "set-property",
		gsdPowerDest,
		gsdPowerPath,
		gsdPowerInterface,
		"Brightness", "i", fmt.Sprintf("%d", level))

	if err := cmd.Run(); err != nil {
		log.Printf("Error setting brightness via CLI: %v", err)
		return fmt.Errorf("failed to set brightness: %v", err)
	}
	return nil
}
