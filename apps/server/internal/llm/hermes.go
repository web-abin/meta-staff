package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// hermes drives the NousResearch hermes-agent API Server
// (gateway/platforms/api_server.py). Endpoint is OpenAI-compatible
// `/v1/chat/completions` but server-side runs the FULL autonomous agent loop
// (tool use, code execution, IM sends, etc.) before returning. So a single
// Complete() call may translate into many internal LLM turns + tool runs.
type hermes struct {
	base  string // e.g. https://hermes.example.com:8642
	key   string // API_SERVER_KEY on the hermes side
	model string
	hc    *http.Client
}

func NewHermes(baseURL, apiKey string) Provider {
	model := os.Getenv("HERMES_MODEL")
	if model == "" {
		model = "hermes-agent"
	}
	return &hermes{
		base:  strings.TrimRight(baseURL, "/"),
		key:   apiKey,
		model: model,
		hc:    &http.Client{Timeout: 600 * time.Second}, // agent loops can be long
	}
}

func (h *hermes) Name() string { return "hermes" }

type hermesMsg struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type hermesReq struct {
	Model    string      `json:"model"`
	Messages []hermesMsg `json:"messages"`
	Stream   bool        `json:"stream"`
}

type hermesResp struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error,omitempty"`
}

func (h *hermes) Complete(ctx context.Context, req Request) (string, error) {
	model := req.Model
	if model == "" {
		model = h.model
	}

	msgs := make([]hermesMsg, 0, len(req.Messages)+1)
	if req.System != "" {
		msgs = append(msgs, hermesMsg{Role: "system", Content: req.System})
	}
	for _, m := range req.Messages {
		msgs = append(msgs, hermesMsg{Role: m.Role, Content: m.Content})
	}

	raw, err := json.Marshal(hermesReq{Model: model, Messages: msgs, Stream: false})
	if err != nil {
		return "", err
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", h.base+"/v1/chat/completions", bytes.NewReader(raw))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("content-type", "application/json")
	if h.key != "" {
		httpReq.Header.Set("Authorization", "Bearer "+h.key)
	}

	resp, err := h.hc.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("hermes %d: %s", resp.StatusCode, string(body))
	}

	var out hermesResp
	if err := json.Unmarshal(body, &out); err != nil {
		return "", err
	}
	if out.Error != nil {
		return "", errors.New(out.Error.Message)
	}
	if len(out.Choices) == 0 {
		return "", errors.New("empty choices")
	}
	return out.Choices[0].Message.Content, nil
}
