# meta-staff

> A workshop of digital employees — compose PM / QA / Dev / Ops / Support agents into one shippable DAG workflow.

把"互联网开发链路"的五个工序（产品、客服、测试、开发、运维）抽象成可编排的 AI 节点，按 DAG 串成端到端工作流。AI 接管重复劳动，人留在创意、判断、验收三件事上。

---

## 核心理念

| 概念 | 说明 |
|------|------|
| **Workflow（DAG）** | 节点 + 连线，支持分支与任意打回。打回 = 基于上游节点 fork 新分支，旧产物保留可比对。 |
| **Employee（数字员工）** | role + system prompt + tools + skill 检索池。可配置、可新增、可指派到任意节点。 |
| **NodeRun（节点执行）** | 状态机：`pending → running → awaiting_human → done | failed | rolled_back`。三类节点：AI / 人工 / 自动化。 |
| **Artifact（产物）** | 节点输出版本化落库，支持回退到任意版本并 fork。 |

## 默认 10 步工作流

| # | 节点 | 执行者 | 产物 |
|---|------|--------|------|
| 01 | 收单 | 人（产品/客服） | RawRequest |
| 02 | AI 分析与分类 | PM-Agent | 类型 + 关键信息 + 追问 |
| 03 | AI 整理需求文档 | PM-Agent | PRD |
| 04 | 需求校对 | 人（产品/客服） | 已校对 PRD |
| 05 | AI 生成测试用例 | QA-Agent | TestCase 列表 |
| 06 | 测试用例校对 | 人（测试） | 已校对 TestCase |
| 07 | AI 编码 | DEV-Agent | 代码 + 预览 URL + 测试报告 + 录屏 |
| 08 | 三方会签 | 人（PM/QA/DEV 独立投票） | 通过 / 打回 |
| 09 | AI 自动部署 | OPS-Agent | 线上 URL |
| 10 | 推送验收 | 系统 | 通知 |

> 每个节点都可被替换、增删、并行；可指派任意数字员工执行；产物版本化，任意一步可打回。

---

## 技术栈

- **Frontend**: Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind
- **Backend**: Go 1.26 · Chi · sqlc · pgx/v5
- **Database**: Postgres 17 + pgvector
- **LLM**: Anthropic Claude（prompt caching + tool use）— Provider 层留 OpenAI/Gemini 扩展位
- **Realtime**: WebSocket（状态推送）+ SSE（token 流）
- **Build**: pnpm 10 + Turborepo 2
- **Design**: `anthropics/skills@frontend-design` — Editorial Industrial（Instrument Serif + Newsreader + JetBrains Mono）

## 快速开始

**前置**：Node 20+、pnpm 10+、Go 1.26+；Postgres 模式额外要 Docker。

### 零依赖快速 demo（推荐先跑这个）

无需 Postgres、无需 Anthropic key。Store 用内存模式，LLM 用 mock。

```bash
cp .env.example .env
make install        # = pnpm install + (cd apps/server && go mod tidy)

make demo           # 同时起 server(:8080) + web(:3000)
make smoke          # 另一个终端：自动跑完整 10 步工作流，验证端到端
```

打开 http://localhost:3000 — 创建一个任务，看 AI 链条自动推进。

> 第一次跑录屏节点时如果报缺浏览器，执行一次 `make playwright-install`。

### 常用命令

| 命令 | 作用 |
|------|------|
| `make demo`   | server + web 一起起，内存模式 + mock LLM |
| `make web`    | 只起前端 |
| `make server` | 只起后端（内存模式） |
| `make dev`    | `db-up` + turbo 并行跑 web/server |
| `make db-up` / `make db-down` | 起/停 Postgres17 + pgvector |
| `make build`  | 前端 `next build` + 后端 `go build -o bin/server` |
| `make smoke`  | 调 REST 跑完默认 10 步工作流 |

### 接入真实环境

```bash
# 1) 起 Postgres17+pgvector（需要 Docker，或 brew install postgresql@17 pgvector）
make db-up

# 2) .env 设置 DATABASE_URL（取消注释那一行即可）
DATABASE_URL=postgres://meta:meta@localhost:5432/meta_staff?sslmode=disable

# 3) 起服务（migrate 会自动跑）
make web        # 一个终端
make server     # 另一个终端

# 4) 接入 Anthropic（可选；不设置就用 mock）
# .env: ANTHROPIC_API_KEY=sk-ant-...
```

> 更详细的开发笔记 / 改动入口 / 常见坑见 [`CLAUDE.md`](./CLAUDE.md)。

---

## 仓库结构

```
meta-staff/
├── apps/
│   ├── web/                Next.js 16 应用（工作流编辑器 / 任务看板 / 节点详情）
│   │   ├── app/            App Router
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── globals.css
│   │   │   └── _components/
│   │   └── next.config.ts
│   └── server/             Go 服务（工作流引擎 / Agent 执行器 / WS Hub）
│       ├── cmd/server/     入口
│       ├── internal/
│       │   ├── config/     配置
│       │   ├── http/       Chi 路由 + 中间件
│       │   ├── workflow/   DAG 引擎（Phase 3）
│       │   ├── employee/   员工抽象（Phase 3）
│       │   ├── executor/   节点执行器（Phase 3）
│       │   ├── artifact/   产物 + 版本树（Phase 3）
│       │   ├── ws/         WebSocket Hub（Phase 3）
│       │   └── db/         sqlc 生成（Phase 3）
│       ├── pkg/
│       │   ├── llm/        LLM Provider 抽象
│       │   └── skill/      pgvector skill 检索
│       ├── migrations/     SQL migrations
│       └── sqlc.yaml
├── packages/
│   └── shared-types/       前后端共享 TypeScript 类型
├── docker-compose.yml      pgvector/pgvector:pg17
├── Makefile                常用脚本
├── turbo.json              Turborepo 任务编排
└── pnpm-workspace.yaml
```

## 架构图

```
┌──────────────────────────────────────────────┐
│  apps/web (Next.js 16 · React 19)            │
│  · 工作流编辑器（React Flow）                  │
│  · 任务看板 / 节点详情 / 会签 UI / 通知中心   │
└──────────┬─────────────────────────WS / SSE──┘
           │
           │ REST + WebSocket
           ▼
┌──────────────────────────────────────────────┐
│  apps/server (Go · Chi)                      │
│  ├ internal/workflow   DAG 引擎 + 状态机      │
│  ├ internal/employee   角色/Prompt/工具集     │
│  ├ internal/executor   AI / 人工 / 自动化     │
│  ├ internal/artifact   产物 + 版本树          │
│  ├ internal/ws         WebSocket Hub          │
│  ├ pkg/llm             Anthropic 优先         │
│  └ pkg/skill           pgvector skill 检索    │
└──────────┬─────────────────┬─────────────────┘
           │                 │
           ▼                 ▼
   PostgreSQL 17        Playwright Runner
   + pgvector           (录屏 + 测试用例)
```

---

## 路线图

- [x] **Phase 1** 方案对齐 — 选型 / 默认工作流 / 关键决策
- [x] **Phase 2** Monorepo 骨架 — Next.js / Go server / docker-compose / `/api/healthz` 联通
- [x] **Phase 3** 核心后端 — DB schema + 工作流引擎 + Employee 抽象 + LLM Provider + WS Hub
- [x] **Phase 4** 前端 — 任务看板 + 节点详情 + 三方会签 + 通知中心
- [x] **Phase 5** MVP 端到端 — `scripts/smoke.sh` 一键跑通默认 10 步工作流
- [x] **Phase 6** 自定义员工 + DAG 编辑器（内置）+ 技能沉淀（自动 + 手动）+ 员工详情 + 上线预览 + 飞书 webhook

详细计划见 [`task_plan.md`](./task_plan.md)；技术决策与调研见 [`findings.md`](./findings.md)；进度日志见 [`progress.md`](./progress.md)。

## 关键设计决策

| 决策 | 理由 |
|------|------|
| 自研轻量 DAG 引擎 | 业务节点只有 AI / 人工 / 自动化三类，自研可控；Temporal 太重，LangGraph 是 Python 不与 Go 协同 |
| Anthropic 为默认 LLM | Prompt caching + tool use 成熟，留 Provider 抽象层支持多模型 |
| MVP 不上代码沙箱容器 | 用 Anthropic tool use 直接写盘；后续视真实开发节点表现再决定 |
| 产物版本化 + 打回 fork | 任意一步打回都创建分支，旧产物不丢失，可比对 |
| 三方会签独立投票 | 避免顺序流转造成等待瓶颈 |
| 通知 MVP 仅站内 | 预留飞书 webhook 接入点，后期接入企业微信 / Slack |

---

## 灵感与差异

借鉴自 [multica-ai/multica](https://github.com/multica-ai/multica)（托管 CLI Agent 平台）的：任务生命周期状态机、WebSocket 双向通信、pgvector skill 沉淀、Workspace 多租户。

不同点：multica 是"1 task → 1 编码 CLI Agent 跑完"，meta-staff 是"多节点 DAG + 多角色 AI/人工协作"。

## License

私有项目，暂未发布。



ssh-keygen -t ed25519 -C "1872495742@qq.com"


ssh-keygen -t ed25519 -C "abc@163.com"