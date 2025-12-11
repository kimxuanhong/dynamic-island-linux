package core

import (
	"context"
	"fmt"
	"log"
	"os/exec"
	"strings"
	"sync"
	"time"
)

type DebounceMiddleware struct {
	window   time.Duration
	lastSeen map[string]time.Time
	mu       sync.Mutex
	excluded map[EventType]bool
}

func NewDebounceMiddleware(window time.Duration) *DebounceMiddleware {
	return &DebounceMiddleware{
		window:   window,
		lastSeen: make(map[string]time.Time),
		excluded: make(map[EventType]bool),
	}
}

func (m *DebounceMiddleware) Exclude(eventType EventType) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.excluded[eventType] = true
}

func (m *DebounceMiddleware) GetName() string {
	return "Debounce"
}

func (m *DebounceMiddleware) Process(ctx context.Context, event *Event) (context.Context, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.excluded[event.Type] {
		return ctx, nil
	}

	key := fmt.Sprintf("%s:%s:%d", event.Type, event.AppName, event.PID)
	lastTime, exists := m.lastSeen[key]

	if exists && time.Since(lastTime) < m.window {
		return ctx, fmt.Errorf("debounced (within %v)", m.window)
	}

	m.lastSeen[key] = time.Now()
	return ctx, nil
}

type LoggingMiddleware struct{}

func (m *LoggingMiddleware) GetName() string {
	return "Logger"
}

func (m *LoggingMiddleware) Process(ctx context.Context, event *Event) (context.Context, error) {
	icon := "🔴"
	if strings.HasSuffix(string(event.Type), "_stop") {
		icon = "⚫"
	}
	log.Printf("%s [%s] %s (PID: %d) - Meta: %v", icon, event.Type, event.AppName, event.PID, event.Metadata)
	return ctx, nil
}

type FilterMiddleware struct {
	allowedApps map[string]bool
}

func NewFilterMiddleware(allowedApps []string) *FilterMiddleware {
	m := &FilterMiddleware{
		allowedApps: make(map[string]bool),
	}
	for _, app := range allowedApps {
		m.allowedApps[app] = true
	}
	return m
}

func (m *FilterMiddleware) GetName() string {
	return "Filter"
}

func (m *FilterMiddleware) Process(ctx context.Context, event *Event) (context.Context, error) {
	if len(m.allowedApps) == 0 {
		return ctx, nil
	}

	if !m.allowedApps[event.AppName] {
		return ctx, fmt.Errorf("app %s not in allowed list", event.AppName)
	}

	return ctx, nil
}

type RateLimitMiddleware struct {
	maxEvents int
	window    time.Duration
	counts    map[EventType][]time.Time
	mu        sync.Mutex
	excluded  map[EventType]bool
}

func NewRateLimitMiddleware(maxEvents int, window time.Duration) *RateLimitMiddleware {
	return &RateLimitMiddleware{
		maxEvents: maxEvents,
		window:    window,
		counts:    make(map[EventType][]time.Time),
		excluded:  make(map[EventType]bool),
	}
}

func (m *RateLimitMiddleware) Exclude(eventType EventType) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.excluded[eventType] = true
}

func (m *RateLimitMiddleware) GetName() string {
	return "RateLimit"
}

func (m *RateLimitMiddleware) Process(ctx context.Context, event *Event) (context.Context, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.excluded[event.Type] {
		return ctx, nil
	}

	now := time.Now()
	eventType := event.Type

	var valid []time.Time
	for _, t := range m.counts[eventType] {
		if now.Sub(t) < m.window {
			valid = append(valid, t)
		}
	}

	if len(valid) >= m.maxEvents {
		return ctx, fmt.Errorf("rate limit exceeded: %d events in %v", m.maxEvents, m.window)
	}

	m.counts[eventType] = append(valid, now)
	return ctx, nil
}

type EnrichmentMiddleware struct{}

func (m *EnrichmentMiddleware) GetName() string {
	return "Enrichment"
}

func (m *EnrichmentMiddleware) Process(ctx context.Context, event *Event) (context.Context, error) {

	if hostname, err := exec.Command("hostname").Output(); err == nil {
		event.Metadata["hostname"] = strings.TrimSpace(string(hostname))
	}

	if event.PID > 0 {
		cmdline := fmt.Sprintf("/proc/%d/cmdline", event.PID)
		if data, err := exec.Command("cat", cmdline).Output(); err == nil {
			event.Metadata["cmdline"] = strings.ReplaceAll(string(data), "\x00", " ")
		}
	}

	return ctx, nil
}
