package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/meta-staff/server/internal/model"
)

// IMDispatcher routes outgoing notifications to per-employee IM channels
// (currently feishu) with an opt-in workspace-wide fallback webhook for
// broadcast announcements ("task shipped" etc).
//
// Per-employee path: looks at employee.IMProvider + IMExternalID, posts a card
// to the right channel. Workspace path: uses FEISHU_WEBHOOK_URL.
type IMDispatcher struct {
	Client            *http.Client
	BroadcastFeishuWH string // FEISHU_WEBHOOK_URL — workspace-level
	WebBase           string // WEB_BASE_URL — used to embed jump-back links
}

func NewIMDispatcher() *IMDispatcher {
	web := os.Getenv("WEB_BASE_URL")
	if web == "" {
		web = "http://localhost:3000"
	}
	return &IMDispatcher{
		Client:            &http.Client{Timeout: 5 * time.Second},
		BroadcastFeishuWH: os.Getenv("FEISHU_WEBHOOK_URL"),
		WebBase:           web,
	}
}

func (d *IMDispatcher) WebBaseURL() string { return d.WebBase }

type Recipient struct {
	Employee model.Employee
}

// Send fires a per-employee IM. Currently only feishu is wired; other
// providers log + no-op. If the employee has no IM binding, returns silently.
func (d *IMDispatcher) Send(ctx context.Context, r Recipient, title, body string) {
	if d == nil {
		return
	}
	e := r.Employee
	if e.IMProvider == nil || e.IMExternalID == nil || *e.IMExternalID == "" {
		return
	}
	switch *e.IMProvider {
	case "feishu":
		// MVP: route per-recipient through the same workspace webhook with
		// the @mention prefixed. Real implementation would call the tenant
		// access token + im/v1/messages send_user API.
		prefix := ""
		if e.IMHandle != nil && *e.IMHandle != "" {
			prefix = *e.IMHandle + " "
		}
		d.postFeishuCard(ctx, d.BroadcastFeishuWH, title, prefix+body)
	default:
		slog.Info("IM provider not implemented; skipping", "provider", *e.IMProvider, "employee", e.ID)
	}
}

// Broadcast sends a workspace-level announcement (no specific recipient).
func (d *IMDispatcher) Broadcast(ctx context.Context, title, body string) {
	if d == nil || d.BroadcastFeishuWH == "" {
		return
	}
	d.postFeishuCard(ctx, d.BroadcastFeishuWH, title, body)
}

func (d *IMDispatcher) postFeishuCard(ctx context.Context, url, title, body string) {
	if url == "" {
		return
	}
	envelope := map[string]any{
		"msg_type": "interactive",
		"card": map[string]any{
			"header": map[string]any{
				"title":    map[string]any{"tag": "plain_text", "content": title},
				"template": "blue",
			},
			"elements": []any{
				map[string]any{"tag": "div", "text": map[string]any{"tag": "lark_md", "content": body}},
			},
		},
	}
	buf, _ := json.Marshal(envelope)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		slog.Warn("im build req failed", "err", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := d.Client.Do(req)
	if err != nil {
		slog.Warn("im send failed", "err", err)
		return
	}
	_ = resp.Body.Close()
	if resp.StatusCode >= 300 {
		slog.Warn("im non-2xx", "status", resp.StatusCode)
	}
}
