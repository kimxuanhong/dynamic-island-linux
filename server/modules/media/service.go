package media

import (
	"fmt"

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

		// log.Printf("⚠️ MediaService: No active player for %s command", method)
		return nil
	}

	obj := s.conn.Object(playerName, dbus.ObjectPath(mprisPath))
	var call *dbus.Call

	switch method {
	case "PlayPause":
		// log.Printf("⏯️ Media PlayPause: %s", playerName)
		call = obj.Call(mprisPlayerInterface+".PlayPause", 0)
	case "Next":
		// log.Printf("⏭️ Media Next: %s", playerName)
		call = obj.Call(mprisPlayerInterface+".Next", 0)
	case "Previous":
		// log.Printf("⏮️ Media Previous: %s", playerName)
		call = obj.Call(mprisPlayerInterface+".Previous", 0)
	case "Pause":
		// log.Printf("⏸️ Media Pause: %s", playerName)
		call = obj.Call(mprisPlayerInterface+".Pause", 0)
	default:
		return fmt.Errorf("unknown method: %s", method)
	}

	if call.Err != nil {

		// log.Printf("⚠️ MediaService: Error sending %s command to %s: %v", method, playerName, call.Err)
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

func (s *MediaService) Pause() error {
	return s.sendPlayerCommand("Pause")
}

func (s *MediaService) Seek(position int64) error {
	playerName, err := s.getCurrentPlayer()
	if err != nil {
		return nil
	}

	obj := s.conn.Object(playerName, dbus.ObjectPath(mprisPath))

	// Try to get current metadata to extract trackId
	metadataVariant, err := obj.GetProperty(mprisPlayerInterface + ".Metadata")
	if err == nil {
		if metadata, ok := metadataVariant.Value().(map[string]dbus.Variant); ok {
			// Try to get trackId from metadata
			if trackIdVar, ok := metadata["mpris:trackid"]; ok {
				if trackId, ok := trackIdVar.Value().(dbus.ObjectPath); ok {
					// Use SetPosition with trackId (more accurate)
					call := obj.Call(mprisPlayerInterface+".SetPosition", 0, trackId, position)
					if call.Err == nil {
						return nil
					}
					// If SetPosition fails, fall through to Seek method
				}
			}
		}
	}

	// Fallback: Get current position and calculate offset for Seek
	currentPos := int64(0)
	if posVariant, err := obj.GetProperty(mprisPlayerInterface + ".Position"); err == nil {
		if pos, ok := posVariant.Value().(int64); ok {
			currentPos = pos
		}
	}

	// Use Seek with offset (works with most players)
	offset := position - currentPos
	call := obj.Call(mprisPlayerInterface+".Seek", 0, offset)
	if call.Err != nil {
		// log.Printf("⚠️ MediaService: Seek failed: %v", call.Err)
		return nil
	}

	return nil
}

func (s *MediaService) GetMediaInfo() (string, string, string, string, string, error) {
	if s.mediaSource == nil {
		return "", "", "", "", "", fmt.Errorf("media source not available")
	}

	player, status, metadata, artPath := s.mediaSource.GetState()
	if player == "" {
		return "", "", "", "", "", nil
	}

	title := s.mediaSource.ExtractTitle(metadata)
	artist := s.mediaSource.ExtractArtist(metadata)
	// If artPath is cached (from GetState), use it. otherwise extract from metadata.
	// GetState returns currentArtPath which is the cached local path if available, or just the URL.
	artUrl := artPath
	if artUrl == "" {
		artUrl = s.mediaSource.ExtractArtUrl(metadata)
	}

	return player, status, title, artist, artUrl, nil
}
