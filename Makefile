.PHONY: dev demo web server db-up db-down install build smoke playwright-install

ROOT := $(shell pwd)
RECORDER := $(ROOT)/scripts/playwright-record.mjs
RUNTIME := $(ROOT)/runtime

install:
	pnpm install
	cd apps/server && go mod tidy

playwright-install:
	npx playwright install chromium

db-up:
	docker compose up -d postgres

db-down:
	docker compose down

web:
	pnpm --filter @meta-staff/web dev

server:
	cd apps/server && DATABASE_URL= \
	  RUNTIME_DIR=$(RUNTIME) \
	  RECORDER_PATH=$(RECORDER) \
	  go run -buildvcs=false ./cmd/server

# zero-deps demo: memory store + mock LLM + real sandbox previews + Playwright recording
demo:
	@echo "→ memory mode (no postgres, no anthropic key). Visit http://localhost:3000"
	@(cd apps/server && DATABASE_URL= \
	  RUNTIME_DIR=$(RUNTIME) \
	  RECORDER_PATH=$(RECORDER) \
	  go run -buildvcs=false ./cmd/server) & \
	 pnpm --filter @meta-staff/web dev

dev: db-up
	@echo "→ pnpm dev runs web + server in parallel via turbo"
	pnpm dev

build:
	pnpm --filter @meta-staff/web build
	cd apps/server && go build -buildvcs=false -o ../../bin/server ./cmd/server

# smoke test: create a task, drive all human gates, vote 3-way, confirm shipped
smoke:
	@bash scripts/smoke.sh
