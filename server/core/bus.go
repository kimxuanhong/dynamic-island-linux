package core

import (
	"context"
	"log"
	"sync"
)

type Bus interface {
	Subscribe(eventType EventType, handler EventHandler)
	Use(mw Middleware)
	Publish(event *Event)
	Start()
	Stop()
}

type EventBus struct {
	subscribers map[EventType][]EventHandler
	middleware  []Middleware
	mu          sync.RWMutex
	eventChan   chan *Event
	stopChan    chan struct{}
}

func NewEventBus(bufferSize int) *EventBus {
	return &EventBus{
		subscribers: make(map[EventType][]EventHandler),
		middleware:  []Middleware{},
		eventChan:   make(chan *Event, bufferSize),
		stopChan:    make(chan struct{}),
	}
}

func (bus *EventBus) Subscribe(eventType EventType, handler EventHandler) {
	bus.mu.Lock()
	defer bus.mu.Unlock()

	bus.subscribers[eventType] = append(bus.subscribers[eventType], handler)
	log.Printf("📌 Subscribed %s to %s", handler.GetName(), eventType)
}

func (bus *EventBus) Use(mw Middleware) {
	bus.middleware = append(bus.middleware, mw)
	log.Printf("🔗 Added middleware: %s", mw.GetName())
}

func (bus *EventBus) Publish(event *Event) {
	select {
	case bus.eventChan <- event:
	default:
		log.Printf("⚠️  EventBus buffer full, dropping event: %s", event.ID)
	}
}

func (bus *EventBus) Start() {
	go func() {
		for {
			select {
			case event := <-bus.eventChan:
				bus.processEvent(event)
			case <-bus.stopChan:
				return
			}
		}
	}()
}

func (bus *EventBus) processEvent(event *Event) {

	ctx := event.GetContext()
	for _, mw := range bus.middleware {
		var err error
		ctx, err = mw.Process(ctx, event)
		if err != nil {
			log.Printf("❌ Middleware %s blocked event %s: %v", mw.GetName(), event.ID, err)
			return
		}
	}
	event.SetContext(ctx)

	bus.mu.RLock()
	handlers := bus.subscribers[event.Type]
	bus.mu.RUnlock()

	for _, handler := range handlers {
		go func(h EventHandler) {
			if err := h.Handle(event); err != nil {
				log.Printf("❌ Handler %s error: %v", h.GetName(), err)
			}
		}(handler)
	}
}

func (bus *EventBus) Stop() {
	close(bus.stopChan)
}

type Middleware interface {
	GetName() string
	Process(ctx context.Context, event *Event) (context.Context, error)
}

type EventHandler interface {
	GetName() string
	Handle(event *Event) error
}

type EventSource interface {
	GetName() string
	Start(bus Bus, stopChan <-chan struct{}) error
}
