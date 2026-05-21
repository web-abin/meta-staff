package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/meta-staff/server/internal/api"
	"github.com/meta-staff/server/internal/config"
	"github.com/meta-staff/server/internal/llm"
	"github.com/meta-staff/server/internal/sandbox"
	"github.com/meta-staff/server/internal/store"
	"github.com/meta-staff/server/internal/workflow"
	"github.com/meta-staff/server/internal/ws"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg := config.Load()
	ctx := context.Background()

	st, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("db open failed", "err", err)
		os.Exit(1)
	}
	defer st.Close()

	if err := st.Migrate(ctx); err != nil {
		slog.Error("migrate failed", "err", err)
		os.Exit(1)
	}
	slog.Info("migrations applied")

	provider := llm.Default()
	slog.Info("llm provider", "name", provider.Name())

	hub := ws.NewHub()

	sb, err := sandbox.New(cfg.RuntimeDir, cfg.PublicBaseURL, cfg.RecorderPath)
	if err != nil {
		slog.Error("sandbox init failed", "err", err)
		os.Exit(1)
	}
	slog.Info("sandbox ready", "runtime_dir", sb.RuntimeDir, "recorder", cfg.RecorderPath != "")

	engine := workflow.NewEngine(st, provider, hub, sb)

	router := api.Router(api.Deps{
		Cfg:     cfg,
		Store:   st,
		Engine:  engine,
		Hub:     hub,
		Sandbox: sb,
	})

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		slog.Info("server listening", "addr", srv.Addr, "env", cfg.Env)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server exited", "err", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	slog.Info("shutdown signal received")

	shCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shCtx); err != nil {
		slog.Error("graceful shutdown failed", "err", err)
	}
}
