package volume

import (
	"bufio"
	"dynamic-island-server/core"
	"log"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

type VolumeSource struct {
	mu          sync.Mutex
	stopChan    chan struct{}
	lastLevel   int
	lastMuted   bool
	lastSink    string
	initialized bool
	stopOnce    sync.Once
	volumeRegex *regexp.Regexp
}

func NewVolumeSource() *VolumeSource {
	return &VolumeSource{
		stopChan:    make(chan struct{}),
		initialized: false,
		volumeRegex: regexp.MustCompile(`(\d+)%`),
	}
}

func (s *VolumeSource) GetName() string {
	return "Volume Monitor (PulseAudio/PipeWire)"
}

func (s *VolumeSource) Start(bus core.Bus, stopChan <-chan struct{}) error {
	log.Println("🔊 Volume Monitor started")

	s.fetchAndPublish(bus)

	go func() {

		cmd := exec.Command("sh", "-c", "LANG=C pactl subscribe")
		stdout, err := cmd.StdoutPipe()
		if err != nil {
			log.Printf("⚠️ Error creating stdout pipe for pactl: %v", err)
			return
		}

		if err := cmd.Start(); err != nil {
			log.Printf("⚠️ Error starting pactl subscribe: %v", err)
			return
		}

		defer func() {
			if cmd.Process != nil {
				cmd.Process.Kill()
				cmd.Wait()
			}
		}()

		scanner := bufio.NewScanner(stdout)

		go func() {
			select {
			case <-stopChan:
				log.Println("🔊 Volume Monitor stopped (external stop)")
			case <-s.stopChan:
				log.Println("🔊 Volume Monitor stopped (internal stop)")
			}
			if cmd.Process != nil {
				cmd.Process.Kill()
			}
		}()

		for scanner.Scan() {
			line := scanner.Text()

			if strings.Contains(line, "Event 'change' on sink") || strings.Contains(line, "Event 'new' on sink") {

				time.Sleep(50 * time.Millisecond)
				s.fetchAndPublish(bus)
			}
		}

		if err := scanner.Err(); err != nil {
			log.Printf("⚠️ pactl subscribe scanner error: %v", err)
		}
	}()

	return nil
}

func (s *VolumeSource) fetchAndPublish(bus core.Bus) {
	s.mu.Lock()
	defer s.mu.Unlock()

	sinkCmd := exec.Command("sh", "-c", "LANG=C pactl get-default-sink")
	sinkOut, err := sinkCmd.Output()
	if err != nil {
		// No default sink available (e.g., all players are off)
		// This is normal and shouldn't be treated as an error
		if !s.initialized {
			log.Printf("⚠️ No default sink available yet (this is normal when no audio is playing)")
		}
		return
	}
	currentSink := strings.TrimSpace(string(sinkOut))

	// Check if sink name is empty (shouldn't happen, but be safe)
	if currentSink == "" {
		if !s.initialized {
			log.Printf("⚠️ Default sink name is empty")
		}
		return
	}

	muteCmd := exec.Command("sh", "-c", "LANG=C pactl get-sink-mute @DEFAULT_SINK@")
	muteOut, err := muteCmd.Output()
	if err != nil {
		// Sink might have disappeared between get-default-sink and this call
		if !s.initialized {
			log.Printf("⚠️ Unable to get mute status (sink may have disappeared)")
		}
		return
	}
	isMuted := strings.Contains(string(muteOut), "yes")

	volCmd := exec.Command("sh", "-c", "LANG=C pactl get-sink-volume @DEFAULT_SINK@")
	volOut, err := volCmd.Output()
	if err != nil {
		// Sink might have disappeared between get-default-sink and this call
		if !s.initialized {
			log.Printf("⚠️ Unable to get volume level (sink may have disappeared)")
		}
		return
	}

	matches := s.volumeRegex.FindStringSubmatch(string(volOut))

	level := 0
	if len(matches) > 1 {
		if parsedLevel, err := strconv.Atoi(matches[1]); err == nil {
			level = parsedLevel
		} else {
			log.Printf("⚠️ Failed to parse volume level: %v", err)
		}
	}

	var eventType core.EventType

	if !s.initialized {

		s.lastSink = currentSink
		s.lastLevel = level
		s.lastMuted = isMuted
		s.initialized = true

		log.Printf("🔊 Initial Volume: %d%% (Muted: %v) Sink: %s", level, isMuted, currentSink)
		return
	}

	if s.lastSink != currentSink {
		log.Printf("🔌 Sink Switched: %s -> %s (Ignored Volume Event)", s.lastSink, currentSink)

		s.lastSink = currentSink
		s.lastLevel = level
		s.lastMuted = isMuted
		return
	}

	muteChanged := s.lastMuted != isMuted
	levelChanged := s.lastLevel != level

	if muteChanged {
		if isMuted {
			eventType = core.EventVolumeMuted
			log.Printf("🔇 Volume Muted (was at %d%%)", s.lastLevel)
		} else {
			eventType = core.EventVolumeUnmuted
			log.Printf("🔊 Volume Unmuted (now at %d%%)", level)
		}
	} else if levelChanged {
		eventType = core.EventVolumeChanged
		direction := "↑"
		if level < s.lastLevel {
			direction = "↓"
		}
		log.Printf("🔊 Volume Changed: %d%% %s %d%%", s.lastLevel, direction, level)
	} else {

		return
	}

	oldLevel := s.lastLevel
	oldMuted := s.lastMuted

	s.lastLevel = level
	s.lastMuted = isMuted

	icon := s.selectIcon(level, isMuted)

	event := core.NewEvent(eventType, "volume", 0)
	event.Metadata["level"] = level
	event.Metadata["muted"] = isMuted
	event.Metadata["icon"] = icon
	event.Metadata["old_level"] = oldLevel
	event.Metadata["old_muted"] = oldMuted

	bus.Publish(event)
}

func (s *VolumeSource) selectIcon(level int, isMuted bool) string {
	if isMuted || level == 0 {
		return "audio-volume-muted-symbolic"
	}
	switch {
	case level < 33:
		return "audio-volume-low-symbolic"
	case level < 66:
		return "audio-volume-medium-symbolic"
	default:
		return "audio-volume-high-symbolic"
	}
}

func (s *VolumeSource) Stop() {
	s.stopOnce.Do(func() {
		close(s.stopChan)
	})
}
