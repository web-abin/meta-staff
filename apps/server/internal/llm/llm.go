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
func Default() Provider {
	if key := os.Getenv("ANTHROPIC_API_KEY"); key != "" {
		return NewAnthropic(key)
	}
	return Mock{}
}
