package config

import "os"

type Config struct {
	Port          string
	Env           string
	DatabaseURL   string
	RuntimeDir    string // where sandbox writes previews/ + recordings/
	PublicBaseURL string // absolute base URL used inside sandbox URLs
	RecorderPath  string // path to scripts/playwright-record.mjs ("" = disabled)
	// HermesWorkspaceDir 是宿主机上挂载给 hermes 容器作工作目录的路径
	// （hermes 容器内看到的是 /workspace，宿主机看到的是这个值）。
	// meta-staff 把它通过 /static/workspace/* 暴露给浏览器，hermes 写完文件
	// 用户直接浏览器可见。空字符串 = 不暴露。
	HermesWorkspaceDir string
}

func Load() Config {
	return Config{
		Port:               env("SERVER_PORT", "8080"),
		Env:                env("SERVER_ENV", "dev"),
		DatabaseURL:        env("DATABASE_URL", ""),
		RuntimeDir:         env("RUNTIME_DIR", "./runtime"),
		PublicBaseURL:      env("PUBLIC_BASE_URL", "http://localhost:8080"),
		RecorderPath:       env("RECORDER_PATH", ""),
		HermesWorkspaceDir: env("HERMES_WORKSPACE_DIR", ""),
	}
}

func env(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}
