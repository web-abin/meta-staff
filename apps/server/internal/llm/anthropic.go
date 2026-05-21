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
	"time"
)

type anthropic struct {
	key   string
	model string
	hc    *http.Client
}

func NewAnthropic(key string) Provider {
	model := os.Getenv("ANTHROPIC_MODEL")
	if model == "" {
		model = "claude-opus-4-7"
	}
	return &anthropic{
		key:   key,
		model: model,
		hc:    &http.Client{Timeout: 120 * time.Second},
	}
}

func (a *anthropic) Name() string { return "anthropic" }

type anthroMsg struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type anthroReq struct {
	Model     string      `json:"model"`
	System    string      `json:"system,omitempty"`
	MaxTokens int         `json:"max_tokens"`
	Messages  []anthroMsg `json:"messages"`
}

type anthroResp struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	Error *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func (a *anthropic) Complete(ctx context.Context, req Request) (string, error) {
	model := req.Model
	if model == "" {
		model = a.model
	}
	max := req.MaxTokens
	if max <= 0 {
		max = 4096
	}
	body := anthroReq{Model: model, System: req.System, MaxTokens: max}
	for _, m := range req.Messages {
		body.Messages = append(body.Messages, anthroMsg{Role: m.Role, Content: m.Content})
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	httpReq, err := http.NewRequestWithContext(ctx, "POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(raw))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("x-api-key", a.key)
	httpReq.Header.Set("anthropic-version", "2023-06-01")
	httpReq.Header.Set("content-type", "application/json")
	resp, err := a.hc.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	rawResp, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("anthropic %d: %s", resp.StatusCode, string(rawResp))
	}
	var out anthroResp
	if err := json.Unmarshal(rawResp, &out); err != nil {
		return "", err
	}
	if out.Error != nil {
		return "", errors.New(out.Error.Message)
	}
	if len(out.Content) == 0 {
		return "", errors.New("empty content")
	}
	return out.Content[0].Text, nil
}
