package volume

import (
	"fmt"
	"log"
	"os/exec"
)

type VolumeService struct{}

func NewVolumeService() *VolumeService {
	return &VolumeService{}
}

func (s *VolumeService) SetVolume(level int32) error {

	if level < 0 {
		level = 0
	}
	if level > 120 {
		level = 120
	}

	log.Printf("🎚️ SetVolume called: %d%%", level)

	cmd := exec.Command("pactl", "set-sink-volume", "@DEFAULT_SINK@", fmt.Sprintf("%d%%", level))
	if err := cmd.Run(); err != nil {
		log.Printf("Error setting volume: %v", err)
		return fmt.Errorf("failed to set volume: %v", err)
	}
	return nil
}

func (s *VolumeService) ToggleMute() error {
	log.Println("🔇 ToggleMute called")

	cmd := exec.Command("pactl", "set-sink-mute", "@DEFAULT_SINK@", "toggle")
	if err := cmd.Run(); err != nil {
		log.Printf("Error toggling mute: %v", err)
		return fmt.Errorf("failed to toggle mute: %v", err)
	}
	return nil
}
