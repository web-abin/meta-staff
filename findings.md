# Findings & Decisions — meta-staff

## Requirements（来自用户原话归纳）

- **技术栈**：Next.js + Go，monorepo，与当前空项目同目录
- **核心定位**：覆盖"互联网开发链路"全岗位的数字员工 — 客服、产品、测试、程序员、运维
- **工作流**：从 需求/Bug → AI分析 → AI 出需求文档 → 人工校验 → AI 出测试用例 → 测试人员校验 → AI 写代码 → 三方会签 → AI 部署 → 推送验收
- **节点交接**：每个节点完成后，产物**自动或手动**进入下一节点；下一节点的"接收人"（AI/人）收到通知后接管
- **AI 产物**：演示地址、测试执行结果、SSE 录屏视频
- **会签**：程序员 + 产品 + 测试三方独立通过才放行
- **打回**：默认打回上一步，可选打回到之前任意一步；可附问题描述、修复建议
- **可编排**：工作流默认有一套，但每一步都可调整、可拆入新节点、可分支

## 默认工作流节点定义（10 步）

| # | 节点名 | 执行者 | 输入 | 产物 | 提交方式 |
|---|-------|--------|------|------|---------|
| 1 | 收单 | 人（产品/客服） | 原始需求或 bug 描述 | RawRequest | 手动 |
| 2 | AI 分析与分类 | AI（PM agent） | RawRequest | 类型（feat/bug/...）+ 关键信息抽取 + 缺失项追问 | 自动 |
| 3 | AI 整理需求文档 | AI（PM agent） | 步骤2产物 | 标准 PRD（用户故事/验收标准/边界） | 自动 |
| 4 | 需求验证与编辑 | 人（产品/客服） | PRD | 已校对的 PRD | **手动** |
| 5 | AI 生成测试用例 | AI（QA agent） | PRD | TestCase 列表（Gherkin/JSON） | 自动 |
| 6 | 测试用例校对 | 人（测试） | PRD + TestCase | 已校对的 TestCase | **手动** |
| 7 | AI 编码 | AI（Dev agent） | PRD + TestCase | 代码变更 + 部署预览 URL + 测试执行报告 + SSE 录屏 mp4 | 自动 |
| 8 | 三方会签 | 人（开发/产品/测试，独立投票） | 步骤7全部产物 | 通过 / 打回（带任意上游 step + 修复建议） | **手动**（需三人都通过） |
| 9 | AI 自动部署 | AI（Ops agent） | 步骤7代码 | 线上 URL | 自动 |
| 10 | 验收推送 | 系统 | 步骤9 URL | 通知所有相关人 | 自动 |

> 节点 2/3/5/7/9 是 AI 节点；4/6/8 是人工节点；10 是系统节点。

## 与 Multica 的对比（已抓取分析）

| 维度 | Multica | meta-staff（我们） |
|-----|---------|----------------|
| 定位 | 托管"编码 CLI Agent" | 多角色岗位的工作流编排平台 |
| 工作单元 | 单个 issue → 单个 agent 跑完 | DAG 工作流，多节点、多角色协作 |
| 执行内核 | 本地 daemon 调 Claude Code/Copilot CLI | Go server 直接调 LLM API + 工具 |
| 协作模型 | 1 agent → 1 task | 多 agent + 多人 在同一 task 下流转 |
| 记忆 | pgvector skill 沉淀 | 同样用 pgvector，但按"员工 / 节点"维度沉淀 |
| 实时 | WebSocket | 同 |
| 隔离 | Workspace 级 | Workspace 级 |

**可借鉴**：任务生命周期状态机、WS Hub、pgvector skill 记忆、workspace 多租户。
**要替换**：CLI Agent 执行内核 → 工作流引擎 + 多角色 AI 节点。

## Technical Decisions（候选 — 待用户确认）

| Decision | Rationale |
|----------|-----------|
| Monorepo：Turborepo + pnpm | 轻量、增量构建、与 Next.js 官方推荐一致；Nx 也可但更重 |
| 后端：Go + Chi + sqlc + pgx | 与 multica 一致；适合长任务/WS/流式 |
| DB：Postgres 17 + pgvector | 关系型 + 向量检索 一站搞定 skill 记忆 |
| 工作流引擎：**自研轻量 DAG** | 业务节点种类有限（AI/人工/自动化三类），自研可控；Temporal 太重，LangGraph 是 Python 不与 Go 协同 |
| LLM Provider：Anthropic 优先 | Prompt caching + tool use 成熟；通过 `pkg/llm` 抽象层留 OpenAI/Gemini 扩展位 |
| AI 代理执行：API + tool use（MVP） | 不引入 CLI sandbox 复杂度；待真实开发节点验证后再考虑容器化 |
| 实时通信：WebSocket + SSE 流式 | WS 推状态，SSE 推 token 流 |
| 节点产物：版本化 artifact 表 | 支持任意步打回 + 创建版本分叉 |
| 三方会签：独立投票 + 全员通过才放行 | 避免顺序流转造成等待瓶颈 |
| 录屏：Playwright + ffmpeg | Playwright 自带视频录制，配合测试用例自动跑 |

## 顶层架构草图

```
┌─────────────────────────────────────────────────────────┐
│  apps/web (Next.js 16 App Router)                       │
│  - 工作流编辑器（React Flow）                            │
│  - 任务看板 / 节点详情 / 会签 UI / 通知中心              │
└────────────────────┬──────────────────WS/SSE────────────┘
                     │ tRPC or REST
┌────────────────────▼────────────────────────────────────┐
│  apps/server (Go)                                       │
│  ├─ internal/workflow   DAG 引擎 + 状态机                │
│  ├─ internal/employee   角色定义 / Prompt / 工具集       │
│  ├─ internal/executor   AI节点/人工节点/自动化节点 执行  │
│  ├─ internal/artifact   产物存储 + 版本树                │
│  ├─ internal/ws         WebSocket Hub                   │
│  ├─ pkg/llm             Provider 抽象（Anthropic 默认）  │
│  └─ pkg/skill           pgvector skill 检索             │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┼──────────────┐
        ▼            ▼              ▼
   PostgreSQL    Object Store    Playwright Runner
   + pgvector   (本地/S3)        (录屏 + 测试)
```

## 核心数据模型（草案）

```
workspace(id, name, ...)
employee(id, ws_id, role, name, system_prompt, tools[], avatar)
workflow(id, ws_id, name, dag_json, is_default)
workflow_version(id, workflow_id, version, dag_json)
task(id, ws_id, workflow_version_id, title, source, status, created_by)
node_run(id, task_id, node_key, executor_type, executor_id, status,
         started_at, finished_at, parent_run_id)  -- parent 用于打回分叉
artifact(id, node_run_id, kind, payload_json|payload_url, version)
review(id, node_run_id, reviewer_user_id, vote, comment)  -- 三方会签
message(id, task_id, kind, to_user_id|to_employee_id, body, read_at)
skill(id, employee_id, embedding, summary, source_node_run_id)
```

## Issues Encountered
| Issue | Resolution |
|-------|------------|
|       |            |

## Resources
- Multica 仓库：https://github.com/multica-ai/multica（已抓取分析，仅借鉴架构、不复用代码）
- React Flow：https://reactflow.dev/（工作流可视化）
- Anthropic SDK：prompt caching + tool use（待 Phase 3 引入 claude-api skill）

## Visual/Browser Findings
- Multica 主页：定位 "Turn coding agents into real teammates"
- Multica server 目录：`cmd/ internal/ migrations/ pkg/` + `sqlc.yaml` — 标准 Go 项目结构，sqlc 驱动数据库
- 技术栈：Next.js 16 App Router + Go(Chi/sqlc/WS) + Postgres17/pgvector + 本地 daemon
- 支持 11 种 Agent CLI（Claude Code / Codex / Copilot CLI / Cursor Agent / Kimi / Gemini / ...）

---

## Hermes Agent 集成（2026-05-21）

### Hermes 是什么 + 关键能力
- 来源：[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)
- 形态：**自主 agent**（不是单纯 LLM），自带 40+ 工具：代码执行、文件读写、HTTP、Telegram/Discord/Slack/WhatsApp/Email 网关、cron、MCP client
- 长期记忆：SQLite `~/.hermes/state.db`，WAL 模式支持并发多 session
- LLM 后端可换：OpenAI / Anthropic / OpenRouter / 任意自定义 endpoint

### 暴露的接口（实测代码确认）
| Endpoint | 用途 | 说明 |
|---|---|---|
| `POST /v1/chat/completions` | OpenAI 兼容，**单次调用 = 一次完整 agent run** | hermes 内部跑完工具循环再返回最终文本 |
| `POST /v1/runs` → `run_id` | 异步 agent run | 配 SSE 流式拿 tool call 进度 |
| `GET /v1/runs/{id}/events` | SSE 事件流 | `message.delta` / `tool.start` / `tool.result` / `approval.request` |
| `POST /v1/runs/{id}/approval` | 解 approval | 人工卡点放行 |
| `POST /v1/runs/{id}/stop` | 中断 | |

- 默认端口 **8642**，Bearer token (`API_SERVER_KEY`) 鉴权
- `API_SERVER_HOST=0.0.0.0` 才能跨机访问（不设强制 127.0.0.1）
- 可选 header：`X-Hermes-Session-Id` 续 session，`X-Hermes-Session-Key` 长期记忆隔离

### 验证来源
- `/tmp/hermes-agent/gateway/platforms/api_server.py`：
  - 路由注册 line 3405-3423
  - `_handle_chat_completions` line 1024+（含 `_create_agent`、`_on_tool_start`，确认是完整 agent loop 而非单次 LLM）
  - `_handle_runs` line 2863+（async, 返回 run_id）
  - `_handle_run_events` line 3173+（SSE）
  - 鉴权常量 line 642-647

### 决定：用 `/v1/chat/completions` 做 PoC（不用 `/v1/runs`）

**理由**：
- chat completions 在 hermes 是**完整 agent run 的同步外壳** —— `Provider.Complete()` 接口零改动可对接
- runs API 是异步的（202 + 轮询/SSE），现阶段不需要细粒度进度推送，留 Phase 3 再做
- 已有 mock / anthropic 两个 provider 走同样的 sync 接口，hermes 加成第三个，调用侧（`workflow/engine.go` 的 `runAgent`）零修改

### 切换语义对比
| Provider | "AI 写代码" 节点输出 |
|---|---|
| `mock` | 写死的伪 markdown（含 preview_url 占位） |
| `anthropic` | LLM 生成的 markdown 描述代码（**不真的运行**） |
| `hermes` | LLM + hermes 内置工具**真的执行**：写文件、跑命令、发 IM、调 MCP，最终回报告 |

这是用户"AI 自动写代码、自动发 IM"这个核心需求的**实际兑现路径** —— 之前 anthropic 模式下永远只是描述，hermes 模式才会真做。

### 实施落地
- 新增：`apps/server/internal/llm/hermes.go`（mirror anthropic 结构）
- 改：`internal/llm/llm.go` 的 `Default()`：优先级 `HERMES_BASE_URL > ANTHROPIC_API_KEY > mock`
- 改：`.env.example` 加 `HERMES_BASE_URL / HERMES_API_KEY / HERMES_MODEL` 三段
- 验证：`go build ./... + go vet ./internal/llm/...` 通过

### 用户侧待办（云服务器）
1. `git clone https://github.com/NousResearch/hermes-agent.git`
2. 配 `.env`：`API_SERVER_KEY=<openssl rand -hex 32>` + `API_SERVER_HOST=0.0.0.0` + `OPENROUTER_API_KEY=` 或其他 LLM key
3. `docker-compose up -d`（仓库自带 `docker-compose.yml`）
4. 防火墙开 8642（或反代到 443）
5. meta-staff 这边 `.env` 填 `HERMES_BASE_URL=http://<cloud-ip>:8642 / HERMES_API_KEY=<same key>`，重启 server 即生效

### Phase 2 计划（后续）
- meta-staff 提供 MCP server：把 `submit_artifact / advance_node / send_im_via_feishu / mark_node_done` 暴露成 MCP tools
- hermes 配 `~/.hermes/config.yaml` 加入这个 MCP server，hermes 在 agent loop 中可反向调回 meta-staff
- 这样数字员工节点的"产物落库 / 节点推进 / 飞书通知"由 hermes 主动完成，meta-staff 引擎只编排 DAG

### Phase 3 计划（流式可视化）
- 切到 `/v1/runs` + SSE，把 `tool.start / tool.result / message.delta` 透传到 meta-staff WebSocket
- 前端 `/tasks/[id]` 节点卡实时显示 hermes 正在跑哪个工具

### 还需验证的（动手部署后才能确认）
- hermes 的工具列表在 docker 镜像里**默认启用了哪些**？docker-entrypoint 是否需要额外参数
- 配置 LLM 后端：用 OpenRouter（多模型）还是直连 Anthropic 自己的 API key？
- 长任务超时：当前 hermes provider 设了 600s timeout，hermes 的写代码节点可能更长，要观察

---
*Update this file after every 2 view/browser/search operations*
