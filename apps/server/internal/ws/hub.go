package ws

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

type Event struct {
	Type    string          `json:"type"`
	TaskID  *uuid.UUID      `json:"task_id,omitempty"`
	NodeRun *uuid.UUID      `json:"node_run_id,omitempty"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

type Hub struct {
	upgrader websocket.Upgrader
	mu       sync.RWMutex
	clients  map[*client]struct{}
}

type client struct {
	conn *websocket.Conn
	send chan []byte
	hub  *Hub
}

func NewHub() *Hub {
	return &Hub{
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
		clients: make(map[*client]struct{}),
	}
}

func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Warn("ws upgrade failed", "err", err)
		return
	}
	c := &client{conn: conn, send: make(chan []byte, 32), hub: h}
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()

	go c.writeLoop()
	c.readLoop()
}

func (c *client) readLoop() {
	defer func() {
		c.hub.mu.Lock()
		delete(c.hub.clients, c)
		c.hub.mu.Unlock()
		close(c.send)
		_ = c.conn.Close()
	}()
	for {
		if _, _, err := c.conn.NextReader(); err != nil {
			return
		}
		// We don't accept any inbound messages for MVP.
	}
}

func (c *client) writeLoop() {
	for msg := range c.send {
		if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			return
		}
	}
}

func (h *Hub) Broadcast(ev Event) {
	raw, err := json.Marshal(ev)
	if err != nil {
		slog.Warn("ws marshal failed", "err", err)
		return
	}
	h.mu.RLock()
	for c := range h.clients {
		select {
		case c.send <- raw:
		default: // drop if slow consumer
		}
	}
	h.mu.RUnlock()
}
