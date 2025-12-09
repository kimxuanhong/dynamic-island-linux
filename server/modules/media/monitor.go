package media

import (
	"crypto/md5"
	"dynamic-island-server/core"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/godbus/dbus/v5"
)

const (
	mprisPlayerInterface = "org.mpris.MediaPlayer2.Player"
	mprisPath            = "/org/mpris/MediaPlayer2"
	propsInterface       = "org.freedesktop.DBus.Properties"
	dbusInterface        = "org.freedesktop.DBus"
	batchUpdateDelay     = 50 * time.Millisecond
)

type MediaSource struct {
	conn          *dbus.Conn
	stopChan      chan struct{}
	eventChan     chan *dbus.Signal
	stopOnce      sync.Once
	mu            sync.Mutex
	playerList    []string
	currentPlayer string
	pendingUpdate *time.Timer

	currentStatus   string
	currentMetadata map[string]dbus.Variant
	currentArtPath  string
	artCache        map[string]string
	httpClient      *http.Client
}

func NewMediaSource() *MediaSource {
	return &MediaSource{
		stopChan:        make(chan struct{}),
		eventChan:       make(chan *dbus.Signal, 10),
		playerList:      make([]string, 0),
		currentMetadata: make(map[string]dbus.Variant),
		artCache:        make(map[string]string),
		httpClient:      &http.Client{Timeout: 10 * time.Second},
	}
}

func (s *MediaSource) GetName() string {
	return "Media Monitor (MPRIS)"
}

func (s *MediaSource) Start(bus core.Bus, stopChan <-chan struct{}) error {
	conn, err := dbus.ConnectSessionBus()
	if err != nil {
		return fmt.Errorf("failed to connect to session bus: %v", err)
	}
	s.conn = conn

	matchRule := fmt.Sprintf("type='signal',interface='%s',member='NameOwnerChanged'", dbusInterface)
	call := s.conn.BusObject().Call("org.freedesktop.DBus.AddMatch", 0, matchRule)
	if call.Err != nil {
		s.conn.Close()
		return fmt.Errorf("failed to add dbus match: %v", call.Err)
	}

	propsMatchRule := fmt.Sprintf("type='signal',interface='%s',member='PropertiesChanged'", propsInterface)
	call = s.conn.BusObject().Call("org.freedesktop.DBus.AddMatch", 0, propsMatchRule)
	if call.Err != nil {
		s.conn.Close()
		return fmt.Errorf("failed to add properties match: %v", call.Err)
	}

	s.conn.Signal(s.eventChan)
	log.Println("🎵 Media Monitor started (MPRIS)")

	s.scanAndUpdatePlayers(bus)

	go func() {
		defer func() {
			if s.conn != nil {
				s.conn.Close()
			}
		}()

		for {
			select {
			case signal := <-s.eventChan:
				if signal != nil {
					s.handleSignal(signal, bus)
				}
			case <-stopChan:
				log.Println("🎵 Media Monitor stopped (external stop)")
				return
			case <-s.stopChan:
				log.Println("🎵 Media Monitor stopped (internal stop)")
				return
			}
		}
	}()

	return nil
}

func (s *MediaSource) handleSignal(signal *dbus.Signal, bus core.Bus) {

	if signal.Name == dbusInterface+".NameOwnerChanged" && len(signal.Body) >= 3 {
		name, ok := signal.Body[0].(string)
		if !ok {
			return
		}

		if strings.HasPrefix(name, "org.mpris.MediaPlayer2.") && name != "org.mpris.MediaPlayer2" {
			if s.isInvalidPlayer(name) {
				return
			}

			oldOwner, _ := signal.Body[1].(string)
			newOwner, _ := signal.Body[2].(string)

			if oldOwner == "" && newOwner != "" {

				log.Printf("🎵 MPRIS player appeared: %s", name)
				s.disconnectPlayer()
				s.addToPlayerList(name)
				s.connectToPlayer(name, bus)
			} else if oldOwner != "" && newOwner == "" {

				log.Printf("🎵 MPRIS player disappeared: %s", name)
				s.removeFromPlayerList(name)

				s.disconnectPlayer()
				s.mu.Lock()
				playerList := s.playerList
				s.mu.Unlock()
				if len(playerList) > 0 {
					s.connectToPlayer(playerList[0], bus)
				}
			}
		}
		return
	}

	if signal.Name == propsInterface+".PropertiesChanged" && len(signal.Body) >= 2 {
		ifaceName, ok := signal.Body[0].(string)
		if !ok || ifaceName != mprisPlayerInterface {
			return
		}

		changedProps, ok := signal.Body[1].(map[string]dbus.Variant)
		if !ok {
			return
		}

		if signal.Path != dbus.ObjectPath(mprisPath) {
			return
		}

		playerName := signal.Sender
		if playerName == "" || !strings.HasPrefix(playerName, "org.mpris.MediaPlayer2.") {

			s.mu.Lock()
			playerName = s.currentPlayer
			s.mu.Unlock()

			if playerName == "" {
				return
			}
		}

		s.mu.Lock()
		isCurrentPlayer := (s.currentPlayer == playerName)
		s.mu.Unlock()

		if !isCurrentPlayer {
			return
		}

		s.handlePropertiesChanged(changedProps, bus)
	}
}

func (s *MediaSource) isInvalidPlayer(name string) bool {
	nameLower := strings.ToLower(name)
	invalidPatterns := []string{"bluetooth", "mouse", "keyboard", "input", "device"}
	for _, pattern := range invalidPatterns {
		if strings.Contains(nameLower, pattern) {
			return true
		}
	}
	return false
}

func (s *MediaSource) scanAndUpdatePlayers(bus core.Bus) {
	var names []string
	err := s.conn.BusObject().Call("org.freedesktop.DBus.ListNames", 0).Store(&names)
	if err != nil {
		log.Printf("⚠️ Failed to list DBus names: %v", err)
		return
	}

	var validPlayers []string
	for _, name := range names {
		if strings.HasPrefix(name, "org.mpris.MediaPlayer2.") && name != "org.mpris.MediaPlayer2" {
			if !s.isInvalidPlayer(name) {
				validPlayers = append(validPlayers, name)
			}
		}
	}

	log.Printf("🎵 Found %d media player(s)", len(validPlayers))

	s.mu.Lock()
	s.playerList = validPlayers
	s.mu.Unlock()

	if len(validPlayers) > 0 {
		s.connectToPlayer(validPlayers[0], bus)
	}
}

func (s *MediaSource) addToPlayerList(playerName string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, p := range s.playerList {
		if p == playerName {
			return
		}
	}
	s.playerList = append(s.playerList, playerName)
}

func (s *MediaSource) removeFromPlayerList(playerName string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	newList := make([]string, 0)
	for _, p := range s.playerList {
		if p != playerName {
			newList = append(newList, p)
		}
	}
	s.playerList = newList
}

func (s *MediaSource) disconnectPlayer() {
	s.mu.Lock()

	s.currentPlayer = ""
	s.currentStatus = ""
	s.currentMetadata = make(map[string]dbus.Variant)
	s.currentArtPath = ""

	if s.pendingUpdate != nil {
		s.pendingUpdate.Stop()
		s.pendingUpdate = nil
	}
	s.mu.Unlock()
}

func (s *MediaSource) connectToPlayer(playerName string, bus core.Bus) {
	s.mu.Lock()
	s.currentPlayer = playerName
	s.mu.Unlock()

	log.Printf("🎵 Connected to player: %s", playerName)

	s.performInitialUpdate(bus, playerName)
}

func (s *MediaSource) GetCurrentPlayer() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.currentPlayer
}

func (s *MediaSource) performInitialUpdate(bus core.Bus, playerName string) {
	obj := s.conn.Object(playerName, dbus.ObjectPath(mprisPath))

	statusVariant, err := obj.GetProperty(mprisPlayerInterface + ".PlaybackStatus")
	if err != nil {
		return
	}
	status, ok := statusVariant.Value().(string)
	if !ok {
		return
	}

	metadataVariant, err := obj.GetProperty(mprisPlayerInterface + ".Metadata")
	if err != nil {
		return
	}
	metadata, ok := metadataVariant.Value().(map[string]dbus.Variant)
	if !ok {
		return
	}

	if metadata != nil || status != "" {
		updates := make(map[string]interface{})
		updates["metadata"] = metadata
		updates["playbackStatus"] = status
		s.batchUpdate(bus, updates)
	}
}

func (s *MediaSource) handlePropertiesChanged(changedProps map[string]dbus.Variant, bus core.Bus) {

	updates := make(map[string]interface{})

	if metadataVar, ok := changedProps["Metadata"]; ok {
		if metadata, ok := metadataVar.Value().(map[string]dbus.Variant); ok {
			updates["metadata"] = metadata
		}
	}

	if statusVar, ok := changedProps["PlaybackStatus"]; ok {
		if status, ok := statusVar.Value().(string); ok {
			updates["playbackStatus"] = status
		}
	}

	if len(updates) > 0 {
		s.batchUpdate(bus, updates)
	}
}

func (s *MediaSource) batchUpdate(bus core.Bus, updates map[string]interface{}) {
	s.mu.Lock()

	if s.pendingUpdate != nil {
		s.pendingUpdate.Stop()
		s.pendingUpdate = nil
	}

	if metadata, ok := updates["metadata"].(map[string]dbus.Variant); ok {
		s.currentMetadata = metadata

		artUrl := s.extractArtUrl(metadata)
		if artUrl != "" {
			if strings.HasPrefix(artUrl, "http://") || strings.HasPrefix(artUrl, "https://") {

				if cachedPath, ok := s.artCache[artUrl]; ok {
					s.currentArtPath = cachedPath
				} else {

					s.currentArtPath = ""
					go s.downloadAndCacheImage(artUrl, bus)
				}
			} else {

				s.currentArtPath = artUrl
			}
		} else {
			s.currentArtPath = ""
		}
	}

	if status, ok := updates["playbackStatus"].(string); ok {
		s.currentStatus = status
	}

	s.pendingUpdate = time.AfterFunc(batchUpdateDelay, func() {
		s.mu.Lock()
		s.pendingUpdate = nil
		status := s.currentStatus
		metadata := s.currentMetadata
		artPath := s.currentArtPath
		playerName := s.currentPlayer
		s.mu.Unlock()

		s.notifyCallbacks(bus, playerName, status, metadata, artPath)
	})
	s.mu.Unlock()
}

func (s *MediaSource) extractMetadataValue(metadata map[string]dbus.Variant, keys []string) string {
	if metadata == nil {
		return ""
	}
	for _, key := range keys {
		if varVal, ok := metadata[key]; ok {
			value := varVal.Value()
			if str, ok := value.(string); ok {
				return str
			}
			if arr, ok := value.([]string); ok && len(arr) > 0 {
				return arr[0]
			}
		}
	}
	return ""
}

func (s *MediaSource) extractArtUrl(metadata map[string]dbus.Variant) string {
	return s.extractMetadataValue(metadata, []string{"mpris:artUrl", "xesam:artUrl", "mpris:arturl"})
}

func (s *MediaSource) extractTitle(metadata map[string]dbus.Variant) string {
	return s.extractMetadataValue(metadata, []string{"xesam:title", "mpris:title"})
}

func (s *MediaSource) extractArtist(metadata map[string]dbus.Variant) string {
	if metadata == nil {
		return ""
	}

	keys := []string{"xesam:artist", "xesam:albumArtist"}
	for _, key := range keys {
		if varVal, ok := metadata[key]; ok {
			value := varVal.Value()

			if arr, ok := value.([]interface{}); ok {
				artists := make([]string, 0)
				for _, item := range arr {
					if str, ok := item.(string); ok && str != "" {
						artists = append(artists, str)
					} else if variant, ok := item.(dbus.Variant); ok {
						if str, ok := variant.Value().(string); ok && str != "" {
							artists = append(artists, str)
						}
					}
				}
				if len(artists) > 0 {
					return strings.Join(artists, ", ")
				}
			} else if arr, ok := value.([]string); ok {
				artists := make([]string, 0)
				for _, a := range arr {
					if a != "" {
						artists = append(artists, a)
					}
				}
				if len(artists) > 0 {
					return strings.Join(artists, ", ")
				}
			} else if str, ok := value.(string); ok {
				return str
			}
		}
	}
	return ""
}

func (s *MediaSource) notifyCallbacks(bus core.Bus, playerName string, status string, metadata map[string]dbus.Variant, artPath string) {
	if playerName == "" {

		event := core.NewEvent(core.EventMediaChanged, "", 0)
		event.Metadata["status"] = ""
		event.Metadata["title"] = ""
		event.Metadata["artist"] = ""
		event.Metadata["album"] = ""
		event.Metadata["artUrl"] = ""
		event.Metadata["player"] = ""
		bus.Publish(event)
		return
	}

	appName := strings.TrimPrefix(playerName, "org.mpris.MediaPlayer2.")
	if appName == "" {
		appName = "unknown"
	}

	pid := s.getPlayerPID(playerName)

	title := s.extractTitle(metadata)
	artist := s.extractArtist(metadata)

	album := ""
	if metadata != nil {
		if albumVar, ok := metadata["xesam:album"]; ok {
			if a, ok := albumVar.Value().(string); ok {
				album = a
			}
		}
	}

	artUrl := artPath

	isPlaying := status == "Playing"

	event := core.NewEvent(core.EventMediaChanged, appName, pid)
	event.Metadata["status"] = status
	event.Metadata["isPlaying"] = isPlaying
	event.Metadata["title"] = title
	event.Metadata["artist"] = artist
	event.Metadata["album"] = album
	event.Metadata["artUrl"] = artUrl
	event.Metadata["player"] = playerName

	log.Printf("🎵 Media: [%s] %s - %s (%s) PID: %d", appName, artist, title, status, pid)
	bus.Publish(event)
}

func (s *MediaSource) getPlayerPID(serviceName string) int {
	if s.conn == nil || serviceName == "" {
		return 0
	}

	dbusObj := s.conn.Object("org.freedesktop.DBus", "/org/freedesktop/DBus")
	call := dbusObj.Call("org.freedesktop.DBus.GetConnectionUnixProcessID", 0, serviceName)
	if call.Err != nil {
		return 0
	}

	var pid uint32
	if err := call.Store(&pid); err != nil {
		return 0
	}

	return int(pid)
}

func (s *MediaSource) downloadAndCacheImage(url string, bus core.Bus) {
	resp, err := s.httpClient.Get(url)
	if err != nil {
		log.Printf("⚠️ MediaSource: Error downloading album art from %s: %v", url, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("⚠️ MediaSource: Failed to download album art from %s: status %d", url, resp.StatusCode)
		return
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("⚠️ MediaSource: Error reading album art bytes from %s: %v", url, err)
		return
	}

	path := s.saveAndCacheImage(url, data)
	if path != "" {

		s.mu.Lock()
		s.artCache[url] = path
		s.currentArtPath = path
		status := s.currentStatus
		metadata := s.currentMetadata
		playerName := s.currentPlayer
		s.mu.Unlock()

		s.notifyCallbacks(bus, playerName, status, metadata, path)
	}
}

func (s *MediaSource) saveAndCacheImage(url string, data []byte) string {
	cacheDir, err := os.UserCacheDir()
	if err != nil {
		log.Printf("⚠️ MediaSource: Error getting cache directory: %v", err)
		return ""
	}

	dir := filepath.Join(cacheDir, "dynamic-island-art")
	if err := os.MkdirAll(dir, 0755); err != nil {
		log.Printf("⚠️ MediaSource: Error creating cache directory: %v", err)
		return ""
	}

	hash := md5.Sum([]byte(url))
	filename := fmt.Sprintf("%x.jpg", hash)
	path := filepath.Join(dir, filename)

	if err := os.WriteFile(path, data, 0644); err != nil {
		log.Printf("⚠️ MediaSource: Error saving album art to cache: %v", err)
		return ""
	}

	return path
}

func (s *MediaSource) Stop() {
	s.stopOnce.Do(func() {
		s.mu.Lock()
		if s.pendingUpdate != nil {
			s.pendingUpdate.Stop()
			s.pendingUpdate = nil
		}
		s.mu.Unlock()
		close(s.stopChan)
	})
}
