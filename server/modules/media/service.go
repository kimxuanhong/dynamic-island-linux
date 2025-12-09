package media

import (
	"fmt"
	"log"

	"github.com/godbus/dbus/v5"
)

type MediaService struct {
	conn        *dbus.Conn
	mediaSource *MediaSource
}

func NewMediaService(conn *dbus.Conn, mediaSource *MediaSource) *MediaService {
	return &MediaService{
		conn:        conn,
		mediaSource: mediaSource,
	}
}

func (s *MediaService) getCurrentPlayer() (string, error) {
	if s.mediaSource == nil {
		return "", fmt.Errorf("media source not available")
	}

	playerName := s.mediaSource.GetCurrentPlayer()
	if playerName == "" {
		return "", fmt.Errorf("no active player")
	}

	return playerName, nil
}

func (s *MediaService) sendPlayerCommand(method string) error {
	playerName, err := s.getCurrentPlayer()
	if err != nil {

		log.Printf("⚠️ MediaService: No active player for %s command", method)
		return nil
	}

	obj := s.conn.Object(playerName, dbus.ObjectPath(mprisPath))
	var call *dbus.Call

	switch method {
	case "PlayPause":
		log.Printf("⏯️ Media PlayPause: %s", playerName)
		call = obj.Call(mprisPlayerInterface+".PlayPause", 0)
	case "Next":
		log.Printf("⏭️ Media Next: %s", playerName)
		call = obj.Call(mprisPlayerInterface+".Next", 0)
	case "Previous":
		log.Printf("⏮️ Media Previous: %s", playerName)
		call = obj.Call(mprisPlayerInterface+".Previous", 0)
	default:
		return fmt.Errorf("unknown method: %s", method)
	}

	if call.Err != nil {

		log.Printf("⚠️ MediaService: Error sending %s command to %s: %v", method, playerName, call.Err)
		return nil
	}

	return nil
}

func (s *MediaService) Next() error {
	return s.sendPlayerCommand("Next")
}

func (s *MediaService) Previous() error {
	return s.sendPlayerCommand("Previous")
}

func (s *MediaService) PlayPause() error {
	return s.sendPlayerCommand("PlayPause")
}
