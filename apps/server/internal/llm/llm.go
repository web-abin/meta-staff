package llm

import (
	"context"
	"os"
)

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type Request struct {
	Model     string
	System    string
	Messages  []Message
	MaxTokens int
}

type Provider interface {
	Name() string
	Complete(ctx context.Context, req Request) (string, error)
}

// Default chooses based on env. Returns mock if no API key.
// HERMES_BASE_URL wins over ANTHROPIC_API_KEY when both are set, because
// hermes-agent is itself an autonomous agent that calls an LLM internally —
// running both would double-pay for the same conversation.
func Default() Provider {
	if base := os.Getenv("HERMES_BASE_URL"); base != "" {
		return NewHermes(base, os.Getenv("HERMES_API_KEY"))
	}
	if key := os.Getenv("ANTHROPIC_API_KEY"); key != "" {
		return NewAnthropic(key)
	}
	return Mock{}
}
