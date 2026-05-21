# CLAUDE.md — meta-staff 开发说明

> 给 Claude（和未来的自己）看的：怎么把这个项目跑起来、目录长什么样、改东西去哪改。

## TL;DR — 三条命令跑起来

```bash
# 1. 装依赖（首次/拉取后）
make install            # = pnpm install + cd apps/server && go mod tidy

# 2. 零依赖 demo（推荐先跑这个，无需 Postgres / 无需 Anthropic key）
make demo               # server :8080 + web :3000 一起起

# 3. 端到端冒烟（另开一个终端）
make smoke              # 自动驱动默认 10 步工作流跑完
```

打开 http://localhost:3000 — 创建任务，看 AI 链条自动推进。

> 第一次跑 server 时如果报缺浏览器，执行一次 `make playwright-install`。

## 启动方式速查

| 命令 | 作用 | 依赖 |
|------|------|------|
| `make demo`   | server + web 一起起，内存模式 + mock LLM | 仅 Node 20+ / Go 1.26+ |
| `make web`    | 只起前端（`pnpm --filter @meta-staff/web dev`） | server 已起 |
| `make server` | 只起后端（`go run ./cmd/server`），内存模式 | — |
| `make dev`    | `docker compose up postgres` + turbo 并行跑 web/server | Docker |
| `make db-up` / `make db-down` | 起/停 Postgres17 + pgvector | Docker |
| `make build`  | 前端 `next build` + 后端 `go build -o bin/server` | — |
| `make smoke`  | 调 REST 跑完默认 10 步工作流，验证端到端 | server 在 :8080 |

server 默认端口 `:8080`，web 默认 `:3000`，web 通过 `NEXT_PUBLIC_API_BASE` 连 server。

## 三档环境

| 档位 | 何时用 | 怎么切 |
|------|--------|--------|
| **内存 + mock LLM**（demo 默认） | 跑通流程、调 UI、写 e2e | `DATABASE_URL=` 留空，`ANTHROPIC_API_KEY=` 留空 |
| **Postgres + mock LLM**         | 验证落库 / migration | `make db-up`，`.env` 填 `DATABASE_URL=postgres://meta:meta@localhost:5432/meta_staff?sslmode=disable` |
| **Postgres + 真实 Anthropic**   | 真跑 AI 节点          | 额外 `.env` 填 `ANTHROPIC_API_KEY=sk-ant-...` |

`.env` 从 `.env.example` 复制：`cp .env.example .env`。

## 端口 / 路径

- Web: `http://localhost:3000`
- Server: `http://localhost:8080`，健康检查 `GET /api/healthz`
- Postgres: `localhost:5432`（user/db = `meta` / `meta_staff`）
- Runtime 工作目录: `./runtime/`（预览产物、录屏落地）
- Playwright 录制脚本: `scripts/playwright-record.mjs`（由 server 通过 `RECORDER_PATH` 调用）

## 目录速览

```
apps/web        Next.js 16 · React 19 · Tailwind（App Router）
apps/server     Go 1.26 · Chi · sqlc · pgx/v5
  cmd/server      入口
  internal/       workflow / employee / executor / artifact / ws / http / db / config
  pkg/            llm（Anthropic + mock）/ skill（pgvector 检索）
packages/shared-types  前后端共享 TS 类型
runtime/        sandbox 预览 + 录屏产物（已 gitignore 之外的部分）
scripts/        smoke.sh + playwright-record.mjs
```

## 改东西去哪改

- **加一个工作流节点 / 改 DAG**：`apps/server/internal/workflow/`
- **加 / 改数字员工角色 + prompt + tools**：`apps/server/internal/employee/`
- **节点执行器（AI / 人工 / 自动化）**：`apps/server/internal/executor/`
- **LLM Provider**：`apps/server/pkg/llm/`（Anthropic 默认，留 OpenAI/Gemini 扩展位）
- **REST 路由**：`apps/server/internal/http/`
- **WebSocket Hub**（状态推送）：`apps/server/internal/ws/`
- **前端任务看板 / 节点详情 / 会签 UI**：`apps/web/app/`
- **DB schema / migration**：`apps/server/migrations/` + `apps/server/sqlc.yaml`

## 三份滚动文档

跨 session 工作模式（Manus 风格文件规划），改完代码顺手刷新这三份：

- `task_plan.md`   — 计划与待办
- `findings.md`    — 技术决策与调研结论
- `progress.md`    — 进度日志（每一步做了什么 / 卡在哪）

## 常见坑

- `make server` 报 `buildvcs`：Makefile 已加 `-buildvcs=false`，无需手动处理。
- web 报 `fetch failed`：八成是 server 没起或端口被占，先 `curl localhost:8080/api/healthz`。
- smoke 报 `python3` 找不到：`brew install python3` 或 `PYTHON=python make smoke`。
- 切到 Postgres 模式后第一次起 server 会自动跑 migration；如果连不上，先 `docker compose ps` 看 healthcheck。
