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

## 服务器端协作模式（重要）

线上部署在云服务器 `49.233.191.112`（docker `hermes` 容器 + tmux `metastaff` 进程）。用户 ssh 上去调试时反复踩三种坑：

1. **终端粘贴长命令会被拆行/吞空格**：反斜杠 `\` 续行符后被插了空格、或换行被吞，多行 `docker run` 尤其频繁炸。
2. **heredoc 难写**：`cat > x.sh <<'EOF' ... EOF` 时 `EOF` 前不小心带了缩进，shell 把它当内容，提示符卡在 `>`。
3. **vim 粘贴会被自动缩进破坏**：必须先 `:set paste` 再 `i`，否则脚本对不齐。

### 规则：所有服务器侧多步命令一律走脚本入仓库

当用户说"在服务器上跑 XX"或要在线上执行多步操作时，**不要**让他对着聊天框粘命令。流程是：

1. 把要在服务器跑的命令写成一个 shell 脚本，放进项目的 `scripts/` 目录。
2. 脚本写法约束：
   - **不要用反斜杠 `\` 续行**。一行 `docker run` 该多长就多长（一行），或者拆成多条 `&&` / 多条独立命令。
   - 顶部 `set -e`，失败立刻退出。
   - 顶部写注释说明用法和参数。
   - 路径 / 密钥从环境变量或参数解析，不硬编码。
   - `chmod +x scripts/xxx.sh`。
3. **`bash -n scripts/xxx.sh` 做一次语法预检**再提交。
4. `git add scripts/xxx.sh && git commit && git push`。
5. 给用户的指令永远是这一条：
   ```bash
   cd ~/meta-staff && git pull && bash scripts/<脚本名>.sh
   ```

### 例外：一次性短命令

**只**当命令满足"一行能放下、无反斜杠续行、无 heredoc、无特殊字符"时，可以让用户直接粘贴。除此之外（所有多行、所有续行、所有 heredoc）一律入脚本。

### 例外的例外：脚本含 secret 不能进 git

这种情况让用户在服务器上 vim 写，但必须提醒他：**先按 `Esc` 输入 `:set paste` 回车，再按 `i` 进入插入模式**，否则缩进会乱。

### 诊断脚本同样模式

看日志 / 看端口 / 看进程的诊断脚本也入仓库，统一命名 `scripts/diag-*.sh`，比如 `scripts/diag-ports.sh`、`scripts/diag-hermes-logs.sh`。

### 现有的脚本（在 `scripts/` 里）

- `smoke.sh` — 调 REST 跑完默认 10 步工作流，验证端到端。本地 / 线上都能用，`BASE=http://49.233.191.112:8080 bash scripts/smoke.sh` 就能打线上。
- `redeploy.sh` — 服务器侧一键重新部署：`git pull` → `pnpm install` → 杀掉旧 tmux → 起新 tmux `metastaff`（跑 `make demo`） → 等 20s → 检查 llm provider / 端口 / `/api/healthz`。
- `hermes-restart.sh` — 重启 `hermes` docker 容器，挂 `/workspace`。会从 `.env` / 旧容器里捞 `HERMES_API_KEY`，镜像缺了会按几个国内 mirror 依次试拉。环境变量：`HERMES_API_KEY` / `HERMES_WORKSPACE_DIR` / `HERMES_DATA_DIR` / `HERMES_IMAGE`。
- `playwright-record.mjs` — server 通过 `RECORDER_PATH` 调起的录屏脚本，**不是**给用户跑的，列在这里只是别误删。

新增脚本时记得回头来这一节补一行说明。
