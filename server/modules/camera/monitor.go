package camera

import (
	"dynamic-island-server/core"
	"fmt"
	"log"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

type CameraSource struct {
	activeApps map[string]bool
	mu         sync.Mutex
}

func NewCameraSource() *CameraSource {
	return &CameraSource{
		activeApps: make(map[string]bool),
	}
}

func (s *CameraSource) GetName() string {
	return "Camera Monitor"
}

func (s *CameraSource) Start(bus core.Bus, stopChan <-chan struct{}) error {

	s.checkAndPublish(bus)

	videoDevices := s.findVideoDevices()
	if len(videoDevices) == 0 {
		log.Println("⚠️  No video devices found, camera monitoring disabled")
		return nil
	}

	log.Printf("📹 Monitoring %d video devices: %v", len(videoDevices), videoDevices)

	go s.watchWithInotify(videoDevices, bus, stopChan)

	ticker := time.NewTicker(10 * time.Second)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				s.checkAndPublish(bus)
			case <-stopChan:
				return
			}
		}
	}()

	return nil
}

func (s *CameraSource) findVideoDevices() []string {
	var devices []string

	for i := 0; i < 10; i++ {
		device := fmt.Sprintf("/dev/video%d", i)
		if _, err := exec.Command("test", "-e", device).CombinedOutput(); err == nil {
			devices = append(devices, device)
		}
	}

	return devices
}

func (s *CameraSource) watchWithInotify(devices []string, bus core.Bus, stopChan <-chan struct{}) {

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Printf("Failed to create fsnotify watcher: %v", err)
		return
	}
	defer watcher.Close()

	for _, device := range devices {
		if err := watcher.Add(device); err != nil {
			log.Printf("Failed to watch %s: %v", device, err)
		} else {
			log.Printf("👁️  Watching: %s", device)
		}
	}

	debounce := make(chan struct{}, 1)

	go func() {
		for {
			select {
			case event, ok := <-watcher.Events:
				if !ok {
					return
				}

				if event.Op&fsnotify.Write == fsnotify.Write ||
					event.Op&fsnotify.Create == fsnotify.Create ||
					event.Op&fsnotify.Chmod == fsnotify.Chmod {

					select {
					case debounce <- struct{}{}:
					default:
					}
				}

			case err, ok := <-watcher.Errors:
				if !ok {
					return
				}
				log.Printf("fsnotify error: %v", err)

			case <-stopChan:
				return
			}
		}
	}()

	go func() {
		for {
			select {
			case <-debounce:

				time.Sleep(200 * time.Millisecond)

				for len(debounce) > 0 {
					<-debounce
				}

				s.checkAndPublish(bus)

			case <-stopChan:
				return
			}
		}
	}()

	<-stopChan
}

func (s *CameraSource) checkAndPublish(bus core.Bus) {
	s.mu.Lock()
	defer s.mu.Unlock()

	current := getCameraApps()
	currentMap := make(map[string]bool)

	for _, app := range current {
		key := fmt.Sprintf("%s:%d", app.AppName, app.PID)
		currentMap[key] = true

		if !s.activeApps[key] {
			s.activeApps[key] = true
			event := core.NewEvent(core.EventCameraStart, app.AppName, app.PID)
			event.Metadata["device"] = "camera"
			if app.DevicePath != "" {
				event.Metadata["device_path"] = app.DevicePath
			}
			bus.Publish(event)
		}
	}

	for key := range s.activeApps {
		if !currentMap[key] {
			parts := strings.Split(key, ":")
			if len(parts) >= 2 {
				pid, _ := strconv.Atoi(parts[1])
				delete(s.activeApps, key)

				event := core.NewEvent(core.EventCameraStop, parts[0], pid)
				event.Metadata["device"] = "camera"
				bus.Publish(event)
			}
		}
	}
}

type AppInfo struct {
	AppName    string
	PID        int
	DevicePath string
}

func getCameraApps() []AppInfo {
	var apps []AppInfo

	videoDevices := []string{"/dev/video0", "/dev/video1", "/dev/video2", "/dev/video3"}

	for _, device := range videoDevices {

		if _, err := exec.Command("test", "-e", device).Output(); err != nil {
			continue
		}

		cmd := exec.Command("lsof", "-t", device)
		output, err := cmd.Output()
		if err != nil {
			continue
		}

		pids := strings.Split(strings.TrimSpace(string(output)), "\n")
		for _, pidStr := range pids {
			if pidStr == "" {
				continue
			}

			pid, err := strconv.Atoi(pidStr)
			if err != nil {
				continue
			}

			commPath := fmt.Sprintf("/proc/%d/comm", pid)
			cmd := exec.Command("cat", commPath)
			if out, err := cmd.Output(); err == nil {
				appName := strings.TrimSpace(string(out))

				cmdlinePath := fmt.Sprintf("/proc/%d/cmdline", pid)
				cmd := exec.Command("cat", cmdlinePath)
				if cmdlineOut, err := cmd.Output(); err == nil {
					cmdline := strings.ReplaceAll(string(cmdlineOut), "\x00", " ")
					cmdline = strings.TrimSpace(cmdline)

					if parts := strings.Fields(cmdline); len(parts) > 0 {
						execName := parts[0]
						if strings.Contains(execName, "/") {
							execName = execName[strings.LastIndex(execName, "/")+1:]
						}

						if execName != "" && execName != appName {
							appName = execName
						}
					}
				}

				apps = append(apps, AppInfo{
					AppName:    appName,
					PID:        pid,
					DevicePath: device,
				})
			}
		}
	}

	return apps
}
