package store

import (
	"context"
	"embed"
	"fmt"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

type Store struct {
	Pool *pgxpool.Pool
	mem  *memQ // non-nil → in-memory demo mode (no postgres)
}

// Open builds a Store. If dsn is empty or starts with "memory://", returns an
// in-memory store pre-seeded with the default workspace + 6 digital employees +
// default 10-step workflow. Otherwise connects to Postgres.
func Open(ctx context.Context, dsn string) (*Store, error) {
	if dsn == "" || strings.HasPrefix(dsn, "memory://") {
		return &Store{mem: newMemQ()}, nil
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("pgx pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}
	return &Store{Pool: pool}, nil
}

func (s *Store) Close() {
	if s.Pool != nil {
		s.Pool.Close()
	}
}

func (s *Store) Mode() string {
	if s.mem != nil {
		return "memory"
	}
	return "postgres"
}

// Migrate runs every SQL file in embed migrations/ in lexical order.
// Idempotent: tracks applied filenames in schema_migrations table.
// No-op when running in memory mode (the mem store self-seeds at construction).
func (s *Store) Migrate(ctx context.Context) error {
	if s.mem != nil {
		return nil
	}
	_, err := s.Pool.Exec(ctx, `
		create table if not exists schema_migrations (
			name text primary key,
			applied_at timestamptz not null default now()
		)
	`)
	if err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read embed: %w", err)
	}
	var names []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)

	for _, name := range names {
		var exists bool
		if err := s.Pool.QueryRow(ctx, `select exists(select 1 from schema_migrations where name=$1)`, name).Scan(&exists); err != nil {
			return fmt.Errorf("check %s: %w", name, err)
		}
		if exists {
			continue
		}
		raw, err := migrationsFS.ReadFile("migrations/" + name)
		if err != nil {
			return fmt.Errorf("read %s: %w", name, err)
		}
		if _, err := s.Pool.Exec(ctx, string(raw)); err != nil {
			return fmt.Errorf("apply %s: %w", name, err)
		}
		if _, err := s.Pool.Exec(ctx, `insert into schema_migrations(name) values($1)`, name); err != nil {
			return fmt.Errorf("record %s: %w", name, err)
		}
	}
	return nil
}
