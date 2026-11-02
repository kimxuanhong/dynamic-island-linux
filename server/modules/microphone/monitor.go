package microphone

import (
	"bufio"
	"bytes"
	"dynamic-island-server/core"
	"encoding/json"
	"fmt"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

type MicrophoneSource struct {
	activeApps  map[string]bool
	mu          sync.Mutex
	initialized bool
}

func NewMicrophoneSource() *MicrophoneSource {
	return &MicrophoneSource{
		activeApps:  make(map[string]bool),
		initialized: false,
	}
}

func (s *MicrophoneSource) GetName() string {
	return "Microphone Monitor"
}

func (s *MicrophoneSource) Start(bus core.Bus, stopChan <-chan struct{}) error {
	// Initialize activeApps without publishing events (silent initialization)
	s.initializeActiveApps()

	cmd := exec.Command("pactl", "subscribe")
	cmd.Env = append(cmd.Environ(), "LC_ALL=C")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}

	if err := cmd.Start(); err != nil {
		return err
	}

	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.Contains(line, "source-output") {

				time.Sleep(100 * time.Millisecond)
				s.checkAndPublish(bus)
			}
		}
	}()

	go func() {
		<-stopChan
		cmd.Process.Kill()
	}()

	return nil
}

func (s *MicrophoneSource) initializeActiveApps() {
	s.mu.Lock()
	defer s.mu.Unlock()

	current := getMicrophoneApps()
	for _, app := range current {
		key := fmt.Sprintf("%s:%d", app.AppName, app.PID)
		s.activeApps[key] = true
	}
	s.initialized = true
}

func (s *MicrophoneSource) checkAndPublish(bus core.Bus) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.initialized {
		// Should not happen, but be safe
		s.initialized = true
	}

	current := getMicrophoneApps()
	currentMap := make(map[string]bool)

	for _, app := range current {
		key := fmt.Sprintf("%s:%d", app.AppName, app.PID)
		currentMap[key] = true

		if !s.activeApps[key] {
			s.activeApps[key] = true
			event := core.NewEvent(core.EventMicrophoneStart, app.AppName, app.PID)
			event.Metadata["device"] = "microphone"
			event.Metadata["app_id"] = app.AppID
			event.Metadata["process"] = app.Process
			bus.Publish(event)
		}
	}

	for key := range s.activeApps {
		if !currentMap[key] {
			separator := strings.LastIndex(key, ":")
			if separator >= 0 {
				appName := key[:separator]
				pid, _ := strconv.Atoi(key[separator+1:])
				delete(s.activeApps, key)

				event := core.NewEvent(core.EventMicrophoneStop, appName, pid)
				event.Metadata["device"] = "microphone"
				bus.Publish(event)
			}
		}
	}
}

type AppInfo struct {
	AppID       string
	Process     string
	SourceIndex int
	AppName     string
	PID         int
}

func getMicrophoneApps() []AppInfo {
	cmd := exec.Command("pactl", "list", "source-outputs")
	cmd.Env = append(cmd.Environ(), "LC_ALL=C")
	output, err := cmd.Output()
	if err != nil {
		return []AppInfo{}
	}
	apps := parsePactlOutput(string(output))
	// A source-output may capture playback rather than a physical microphone.
	// Classify its source through PulseAudio/PipeWire's monitor_of_sink field.
	sourcesCmd := exec.Command("pactl", "--format=json", "list", "sources")
	sourcesCmd.Env = append(sourcesCmd.Environ(), "LC_ALL=C")
	sources, sourceErr := sourcesCmd.Output()
	if sourceErr != nil {
		return apps
	} // Unknown sources remain visible.
	monitors, err := monitorSources(sources)
	if err != nil {
		return apps
	}
	filtered := make([]AppInfo, 0, len(apps))
	for _, app := range apps {
		if !monitors[app.SourceIndex] {
			filtered = append(filtered, app)
		}
	}
	return filtered
}

func parsePactlOutput(output string) []AppInfo {
	var results []AppInfo
	var curBlock bytes.Buffer
	inBlock := false

	for _, line := range strings.Split(output, "\n") {
		if strings.HasPrefix(line, "Source Output #") {
			if inBlock {
				if bi := parsePactlBlock(curBlock.String()); bi != nil {
					results = append(results, *bi)
				}
				curBlock.Reset()
			}
			inBlock = true
		}
		if inBlock {
			curBlock.WriteString(line + "\n")
		}
	}

	if inBlock && curBlock.Len() > 0 {
		if bi := parsePactlBlock(curBlock.String()); bi != nil {
			results = append(results, *bi)
		}
	}

	return results
}

var reAppName = regexp.MustCompile(`application.name\s*=\s*"([^"]+)"`)
var reSource = regexp.MustCompile(`(?m)^\s*Source:\s*(\d+)`)
var reAppID = regexp.MustCompile(`application.id\s*=\s*"([^"]+)"`)
var reProcess = regexp.MustCompile(`application.process.binary\s*=\s*"([^"]+)"`)

// PulseAudio uses null, "n/a", or UINT32_MAX when a source is not a monitor.
func monitorSources(data []byte) (map[int]bool, error) {
	var sources []struct {
		Index   int             `json:"index"`
		Monitor json.RawMessage `json:"monitor_of_sink"`
	}
	if err := json.Unmarshal(data, &sources); err != nil {
		return nil, err
	}
	result := make(map[int]bool)
	for _, source := range sources {
		value := strings.Trim(string(source.Monitor), "\"")
		if value == "" || value == "null" || value == "n/a" || value == "4294967295" || value == "-1" {
			continue
		}
		// Numeric monitor sink index or a named sink are both valid.
		result[source.Index] = true
	}
	return result, nil
}

var rePID = regexp.MustCompile(`application.process.id\s*=\s*"?(\d+)"?`)

// Blacklist of apps that should NOT trigger microphone recording events
// These are typically audio processors, effects, or system components
var microphoneBlacklist = map[string]bool{
	"PulseEffects": true,
	"pulseeffects": true,
	"EasyEffects":  true,
	"easyeffects":  true,
	"PulseAudio":   true,
	"pulseaudio":   true,
	"PipeWire":     true,
	"pipewire":     true,
	"GNOME Shell":  true,
	"gnome-shell":  true,
}

func parsePactlBlock(block string) *AppInfo {
	app := "unknown"
	pid := 0

	if m := reAppName.FindStringSubmatch(block); len(m) == 2 {
		app = m[1]
	}
	if m := rePID.FindStringSubmatch(block); len(m) == 2 {
		pid, _ = strconv.Atoi(m[1])
	}

	if app == "unknown" {
		for _, l := range strings.Split(block, "\n") {
			l = strings.TrimSpace(l)
			if strings.HasPrefix(l, "Client Name:") {
				app = strings.TrimSpace(strings.TrimPrefix(l, "Client Name:"))
				break
			}
		}
	}

	if app == "unknown" && pid == 0 {
		return nil
	}

	// Filter out blacklisted apps
	if microphoneBlacklist[app] {
		return nil
	}

	info := &AppInfo{AppName: app, PID: pid, SourceIndex: -1}
	if m := reSource.FindStringSubmatch(block); len(m) == 2 {
		info.SourceIndex, _ = strconv.Atoi(m[1])
	}
	if m := reAppID.FindStringSubmatch(block); len(m) == 2 {
		info.AppID = m[1]
	}
	if m := reProcess.FindStringSubmatch(block); len(m) == 2 {
		info.Process = m[1]
	}
	return info
}
