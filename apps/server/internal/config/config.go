package config

import "os"

type Config struct {
	Port          string
	Env           string
	DatabaseURL   string
	RuntimeDir    string // where sandbox writes previews/ + recordings/
	PublicBaseURL string // absolute base URL used inside sandbox URLs
	RecorderPath  string // path to scripts/playwright-record.mjs ("" = disabled)
}

func Load() Config {
	return Config{
		Port:          env("SERVER_PORT", "8080"),
		Env:           env("SERVER_ENV", "dev"),
		DatabaseURL:   env("DATABASE_URL", ""),
		RuntimeDir:    env("RUNTIME_DIR", "./runtime"),
		PublicBaseURL: env("PUBLIC_BASE_URL", "http://localhost:8080"),
		RecorderPath:  env("RECORDER_PATH", ""),
	}
}

func env(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}
