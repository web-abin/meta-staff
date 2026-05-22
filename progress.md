# Progress Log — meta-staff

## Session: 2026-05-14

### Phase 1: 方案对齐与架构设计
- **Status:** in_progress
- **Started:** 2026-05-14
- Actions taken:
  - 抓取并分析 multica-ai/multica，明确其"托管编码 CLI Agent"定位
  - 与用户对齐 meta-staff 目标：多角色岗位的可编排工作流平台
  - 用户敲定技术栈：Next.js + Go monorepo，同目录实施
  - 用户给出默认 10 步工作流细节
  - 在 findings.md 沉淀：默认工作流节点表、与 multica 对比、技术选型候选、架构草图、数据模型草案
  - 在 task_plan.md 沉淀：6 个阶段 + 关键问题清单
- Files created/modified:
  - task_plan.md (created)
  - findings.md (created)
  - progress.md (created)

### Phase 2: Monorepo 骨架 + 基础设施
- **Status:** complete
- Actions taken:
  - 初始化 pnpm workspaces + Turborepo
  - apps/web：Next.js 16.2.6 + React 19 + Tailwind + next/font/google
  - apps/server：Go 1.26 + Chi + CORS，/api/healthz 联调通过
  - packages/shared-types：占位 + NodeRunStatus/EmployeeRole 类型
  - docker-compose：pgvector/pgvector:pg17（未启动）
  - 装入 anthropics/skills@frontend-design（全局），首页应用「编辑工业风」
  - Next.js dev 起在 :3000，Go server 起在 :8080，rewrites /api/* 已联通
- Files created/modified:
  - package.json / pnpm-workspace.yaml / turbo.json / .gitignore / .env.example / docker-compose.yml / Makefile
  - apps/web/{package.json, tsconfig.json, next.config.ts, postcss.config.js, tailwind.config.ts, next-env.d.ts}
  - apps/web/app/{layout.tsx, page.tsx, globals.css, _components/health-badge.tsx}
  - apps/server/{go.mod, sqlc.yaml, cmd/server/main.go, internal/config/config.go, internal/http/router.go, migrations/.keep, internal/db/queries/.keep}
  - packages/shared-types/{package.json, tsconfig.json, src/index.ts}

### Phase 3: 核心后端
- **Status:** complete
- Actions taken:
  - migrations 0001_init.sql + 0002_seed.sql（含 6 个员工：PM/QA/DEV/OPS/CS/Growth）
  - model + DAG 类型，store + pgQ（pgx）+ memQ（in-memory fallback）
  - workflow engine：DAG 加载 / 状态机 / advance / scheduleNode / runAgent / Vote(三方会签) / RollbackTo
  - LLM：anthropic.go（HTTP）+ mock.go（角色感知 fakeResponses，含 fakeGrowth）
  - WS hub（gorilla/websocket，多客户端广播）
  - REST API：tasks / employees / workflows / node-runs/{submit,review} / tasks/{rollback} / messages
- Files: apps/server/internal/{model,store,llm,workflow,ws,api,config}/* + cmd/server/main.go + migrations/*

### Phase 4: 前端
- **Status:** complete
- Actions taken:
  - lib：types / api client（带 X-User-Id header）/ ws hook / user provider
  - app router：`(app)` route group 含 layout + sidebar + nav
  - 页面：/tasks (列表+创建) / /tasks/[id] (时间线+节点卡+三方会签+打回) / /employees (列表+创建) / /workflow (节点表+JSON 模板)
  - 组件：UserSwitcher / Notifications (WS 实时刷) / NodeCard / NodeTimeline / RollbackButton
  - 沿用 editorial industrial 设计语言

### Phase 5: MVP 端到端
- **Status:** complete
- Actions taken:
  - 内存模式 Store 投产（DATABASE_URL 留空启用，零依赖）
  - scripts/smoke.sh 一键测：create task → AI 自动 triage/spec → 提交 review → AI cases → 提交 audit → AI build → 三方会签 → AI deploy → push accept
  - smoke 通过：全 10 节点 status=done，11 条通知生成（含 6 条 task-shipped 到每个用户）
- Files: scripts/smoke.sh + Makefile `make demo` + `make smoke` targets

### Phase 7（2026-05-16）: 账号模型 + 节点 assignee 重构
- **Status:** complete
- 用户拍板的设计：
  1. 老板 admin + 员工（真人 + 纯 AI）两种账号；真人自己注册→把 employee_id 给老板拉入
  2. 节点不再设 mode 字段，由 assignees 组成自动决定：全员纯 AI = auto；任一真人 = 会签全员通过；intake = 任一提交
  3. 每个真人 employee 绑 1 个 IM 联系人；IM 只做通知 + 跳回 Web 确认
- Backend：
  - migration 0003：employees 加 `bound_user_id` / `im_provider` / `im_external_id` / `im_handle` / `is_active`；admin seed
  - DAGNode 加 `is_intake` + `assignee_employee_ids`；旧 type/role/auto_submit 仍可读做向后兼容
  - memQ seed 重写：1 admin + 6 纯 AI + 6 真人（各绑 mock 飞书 open_id）；默认 DAG 用新字段表达
  - engine `nodeRoute(node)` 按 assignees 路由；Vote 按节点动态会签人集合算 quorum；空 assignees 的终端节点（如 accept）走 auto-no-op
  - notify/feishu.go 重构成 `IMDispatcher`：per-employee 路由 + 工作区广播 + `WEB_BASE_URL` 跳转链接
  - API 新增：`POST /auth/register` `/auth/login` `GET /me/assignments` `PATCH /employees/:id`；老 endpoints 兼容
- Frontend：
  - 未登录默认拿不到 me；landing 右上角 LOG IN / REGISTER；(app) 守卫未登录跳 /login
  - /register：单页 + 角色选择卡片 + IM 三段；注册成功展示 employee ID（"发给老板"）
  - /login：仅邮箱
  - /inbox（员工首页）：列出 `me/assignments` 待办 + 跳转节点详情
  - /workflow：assignee 多选 chips，mode 实时 (intake / auto / confirm · N人会签)；仅 admin 可改
  - /employees：每张卡 `●` 真人 / `○` 纯 AI + IM handle；admin 可见 ACTIVATE / DEACTIVATE 按钮
  - /tasks/[id]：节点头展示 mode + assignees + IM handle；HumanSubmit / ReviewPanel 都按节点 assignee 化（不再写死 PM/QA/DEV）
- 验证：
  - `go build ./...` + `pnpm exec tsc --noEmit` 通过
  - `scripts/smoke.sh` 全 10 节点 done（admin 投票 fallback 旧 user-ID 仍兼容）
  - 浏览器：admin 登录看 workflow editor（chips + mode 显示正确）；切换 PM 身份看 inbox 出现新待办；节点详情 EDIT & SUBMIT + 打回 上行节点
  - register 新 qa "小陈" → 在 admin 端看到 INACTIVE · AWAITING ADMIN → ACTIVATE 后可被绑定到节点

### Phase 6: 自定义工作流与技能沉淀
- **Status:** complete
- Actions taken:
  - 数字员工自定义（API POST /employees + UI 创建卡片）
  - 工作流版本自定义 API（POST /workflows/:id/versions），DAG 以 JSON 描述
  - DAG 编辑器：/workflow 页内置上下拖、增删、编辑 key/title/role/type，保存即推 v2
  - Skill 沉淀：模型 + memQ + pgQ（ILIKE，pgvector 列预留）；engine 在 AI 节点完成后自动写入 `skill_records`；员工详情页支持手动新增
  - 员工详情页 /employees/[id]：头像 + 头衔 + 4 项统计（runs / done / 打回 / 胜率）+ 技能列表 + 历史节点流 + system prompt
  - 飞书 webhook：`internal/notify/feishu.go`，env `FEISHU_WEBHOOK_URL` 触发；任务上线后推交互卡片
  - 上线预览页 /preview/[taskID]：聚合 build + deploy artifact，preview/recording/deploy URL 一屏，preview_url 嵌入 iframe
  - 首页 phase 状态从 02 进行中翻新为 06 完成，全部 6 阶段标 ✓
- Verification:
  - `go build ./...` 通过
  - `pnpm exec tsc --noEmit` 通过
  - `scripts/smoke.sh` 全 10 节点 done；PM agent 2 条 skill 自动沉淀；DAG v2 通过 API 保存成功

### Phase 8（2026-05-18）: 真实预览 + Playwright 录屏
- **Status:** complete
- Actions taken:
  - 新增 `internal/sandbox` 包：写真实预览 HTML（编辑工业风模板，含 BUILD SUMMARY / UNIT 14/14 / BUNDLE·CHANGES·PREVIEW 三栏 / Next step 面板 / footer），并 spawn `scripts/playwright-record.mjs` 子进程
  - `playwright-record.mjs` 起 chromium headless，1280×800 录制 ~5s 视频（滚动 + 鼠标移动），落到 `runtime/recordings/{taskID}.webm`；Playwright 缺失时 exit-code 3 优雅降级
  - `config` 加 `RUNTIME_DIR` / `PUBLIC_BASE_URL` / `RECORDER_PATH`；Makefile demo/server 目标自动注入这些 env
  - `cmd/server/main.go` 初始化 sandbox，注入 engine 与 api.Deps
  - `api.Router`：`r.Handle("/static/*", FileServer)` 透出 previews/ + recordings/；CORS allowedMethods 补 HEAD
  - `workflow/engine.go` build 节点改为调 `sandbox.Build(taskID, title, summary)`，将真 URL 写入 artifact；deploy 节点复用同一 preview URL 作为 "线上地址"
  - 前端 `/preview/[taskID]` 增加 `<RecordingPlayer>`：HEAD 探测 .webm 是否就绪（4s 轮询，40s 上限），ready 后挂 `<video autoplay loop muted>`，未就绪展示"录屏不可用 / 生成中"
  - 安装 `playwright` 至 root devDependencies，`npx playwright install chromium` 完成 chromium 二进制下载
- Verification:
  - `go build ./...` + `pnpm exec tsc --noEmit` 通过
  - smoke 全 10 节点 done；磁盘落 `runtime/previews/<id>/index.html`（4.6KB） + `runtime/recordings/<id>.webm`（500KB+）
  - 浏览器实拍 `/preview/<id>`：iframe 内嵌真实静态预览页（编辑工业风），`<video controls>` 0:00/0:05 时间轴展示录屏，0 console errors

### Phase 9（2026-05-21）：Hermes Agent 集成 PoC
- **Status:** code complete, awaiting cloud deploy
- 起因：用户希望"数字员工平台和 agent hermes 打通，让 AI 自动写代码 + 发 IM"。最初误判 hermes 是 facebook/hermes（JS 引擎），用户澄清为 NousResearch/hermes-agent
- 调研：
  - clone `https://github.com/NousResearch/hermes-agent` → `/tmp/hermes-agent`
  - Explore agent 摸 API surface：发现 hermes 自带 **HTTP API Server**（`gateway/platforms/api_server.py`），默认 8642，Bearer auth
  - 实测验证 `/v1/chat/completions` 内部跑 `_create_agent(...)` 完整 agent loop（含 `_on_tool_start` 工具回调），不是单纯 LLM 转发
  - 验证 `/v1/runs` 异步 + SSE 模式存在（line 2863+ / 3173+），Phase 3 用
- 关键架构判断：
  - hermes 是 **agent**，不是 LLM；本来想塞 `pkg/llm/`，结论是能塞 —— 因为它的 `/v1/chat/completions` 把 agent run 包装成了同步 OpenAI 兼容接口
  - **PoC 用 chat completions（同步）而非 runs（异步）**：现有 `Provider.Complete(ctx, Request) (string, error)` 接口零修改可对接；流式可视化留 Phase 3
- 实施：
  - 新增 `apps/server/internal/llm/hermes.go`（mirror `anthropic.go` 结构，HTTP timeout 600s 适配长 agent loop）
  - 改 `internal/llm/llm.go` 的 `Default()`：优先级 `HERMES_BASE_URL > ANTHROPIC_API_KEY > mock`
  - 改 `.env.example` 加 `HERMES_BASE_URL / HERMES_API_KEY / HERMES_MODEL`
- Verification:
  - `go build -buildvcs=false ./...` ✅
  - `go vet ./internal/llm/...` ✅
  - 端到端实测需要用户在云服务器先部署 hermes（docker-compose up + 开 8642 + 配 LLM key），暂未跑通
- Files created/modified:
  - apps/server/internal/llm/hermes.go (created, 109 lines)
  - apps/server/internal/llm/llm.go (Default 优先级调整)
  - .env.example (HERMES_* 三段 + 注释说明)
  - findings.md（Hermes Agent 集成 章节）
  - task_plan.md（Phase 9）
- 用户侧 next step：
  1. 云服务器 clone hermes-agent + `docker-compose up`
  2. 配 `API_SERVER_KEY` + `API_SERVER_HOST=0.0.0.0` + `OPENROUTER_API_KEY` 之类
  3. 开 8642 端口（或反代 443）
  4. meta-staff `.env` 填 hermes URL + key → `make demo` 重启 → 创建任务实测
- 已知未确认项：hermes 工具默认启用范围 / LLM 后端选择 / 长任务超时阈值，要部署后观察

## Test Results
| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|
|      |       |          |        |        |

## Error Log
| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
|           |       | 1       |            |

## 5-Question Reboot Check
| Question | Answer |
|----------|--------|
| Where am I? | Phase 1（方案对齐），尚未动代码 |
| Where am I going? | Phase 2 monorepo 搭骨架 → Phase 3 后端引擎 → Phase 4 前端 → Phase 5 MVP → Phase 6 扩展 |
| What's the goal? | 见 task_plan.md Goal — 数字员工 + DAG 工作流平台 |
| What have I learned? | 见 findings.md |
| What have I done? | 完成 multica 抓取分析、默认流程沉淀、架构选型候选、6 阶段计划起草 |
