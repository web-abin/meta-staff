# Task Plan: meta-staff（数字员工 / AI 团队工作流平台）

## Goal
搭建一个 Next.js + Go monorepo 的数字员工系统：把"产品 → 客服 → 测试 → 程序员 → 运维"抽象成可编排的 AI 角色节点，按 DAG 工作流串起来全链路开发流程，节点产物在 AI 与人之间双向交接，支持自由组装、分支、任意打回。

## Current Phase
全部完成 — Phases 1-6 + 第二轮重构落地：
- 账号模型：admin（老板）+ employee（真人 + 纯 AI）双轨；首位 admin seed 已就绪
- DAG 模型从 `type/role` 收敛到 `assignee_employee_ids` + `is_intake`；节点行为由 assignees 组成自动决定（intake / auto / confirm·会签）
- 注册流：员工自己 /register 选角色 + 绑 IM → 得到员工 ID → 老板在 /employees 一键 ACTIVATE 拉入名单
- 工作流编辑器：每节点用 chip 多选绑定员工（`●` 真人 / `○` 纯 AI），mode 实时显示
- 员工首页 /inbox：登录后看 "我归属的工作流 + 当前待办"
- 节点详情：assignee 化的产物区 + 上传区 + 提交/打回；3 人会签按绑定的真实员工动态生成投票表
- IM 分发器：per-employee 路由（飞书 MVP），任务上线后 broadcast；每条 IM 带 Web 跳转链接
- 端到端 smoke 通过；浏览器实拍验证 admin/PM 双视角完整跑通

## Phases

### Phase 1: 方案对齐与架构设计
- [x] 确认 monorepo 工具链 — **Turborepo + pnpm**
- [x] 确认工作流引擎选型 — **自研轻量 DAG**
- [x] 确认 LLM 接入方式 — **Anthropic 优先 + Provider 抽象**
- [x] 确认默认 10 步工作流的节点契约（见 findings.md）
- [x] 确认代码生成沙箱方案 — **MVP 用 API + tool use**
- [x] 确认演示部署 + 录屏方案 — **Docker 子进程 + Playwright**
- [x] 数字员工：**可配置 + 可新增 + 可插入工作流并指派**
- [x] 通知：**MVP 站内消息**，预留飞书 webhook 接口
- **Status:** complete

### Phase 2: Monorepo 骨架 + 基础设施
- [x] pnpm workspaces + Turborepo 初始化
- [x] `apps/web` (Next.js 16 App Router) + `apps/server` (Go + Chi)
- [x] `packages/shared-types`（前后端共享 schema 占位）
- [x] Postgres 17 + pgvector，docker-compose 一键起（已写 compose，未拉镜像）
- [x] /healthz 联调通过（web → /api/healthz → server 200 OK）
- [x] frontend-design 技能落地："编辑工业风" 首页（Instrument Serif + Newsreader + JetBrains Mono）
- [x] 基础登录/工作区留到 Phase 3
- **Status:** complete

### Phase 3: 核心后端（工作流引擎 + Agent 执行器）
- [ ] DB schema：workflow / workflow_version / task / node_run / artifact / employee / message
- [ ] 工作流引擎：DAG 拓扑、状态机（pending→running→awaiting_human→done/failed）、分支、任意节点回退（带版本树）
- [ ] Employee 抽象：role + system prompt + tool list + skill 检索（pgvector）
- [ ] LLM Provider 抽象（先接 Anthropic SDK，带 prompt caching）
- [ ] 节点执行器：AI 节点 / 人工审批节点 / 自动化节点（部署、通知）
- [ ] WebSocket Hub：node_run 状态 / SSE 流式输出 / 通知推送
- **Status:** pending

### Phase 4: 前端（工作流编辑器 + 任务看板 + 节点详情）
- [x] 路由：home / tasks / tasks/[id] / employees / workflow
- [x] DAG 可视化（线性时间线 + 序号 + 节点状态色，工序节点表）— React Flow 拖拽编辑留待 Phase 6
- [x] 任务看板（列表式 + 创建表单）+ 任务详情时间线
- [x] 节点详情面板：展示产物 / 编辑提交 / 三方会签 / 任意上游打回
- [x] 多人会签 UI（独立投票表 + 全通过才放行）
- [x] 通知中心：站内消息抽屉 + WS 实时刷新
- [x] 编辑工业风设计语言（Instrument Serif + Newsreader + JetBrains Mono）
- **Status:** complete

### Phase 5: 默认工作流跑通（MVP 端到端）
- [x] 默认 workflow 10 个节点全部接通（smoke 测试通过）
- [x] AI 产物：classification / PRD / testcases / build markdown / deploy URL / 验收通知
- [x] 端到端 demo：bug 提单 → 推送上线地址 全程贯通
- [x] `scripts/smoke.sh` 一键自动跑全链路
- [x] 演示环境：sandbox 子进程产真实静态 HTML 预览（`runtime/previews/{taskID}/index.html`，编辑工业风模板），server 以 `/static/*` 透出，iframe 内嵌可见
- [x] Playwright 录屏：`scripts/playwright-record.mjs` 起 chromium 录 5s `.webm`（自动滚动 + 鼠标移动），落到 `runtime/recordings/{taskID}.webm`，前端 `<video>` 直播；缺 playwright 时优雅回退
- **Status:** complete

### Phase 6: 自定义工作流 + 技能沉淀
- [x] 数字员工自定义（API + UI 创建表单）— 可作为新节点指派对象
- [x] 工作流自定义 API：`POST /workflows/:id/versions` 接收 DAG JSON，自增版本
- [x] DAG 编辑器（/workflow 页内置）— 拖排序、增删节点、改 key/title/role/type，保存生成新版本
- [x] Skill 沉淀：AI 节点完成自动写入 `skill_records`（mem 兜底；pgvector 列已建支持嵌入；ILIKE 关键词搜索可用）；员工详情页支持手动沉淀
- [x] 数字员工个人页（/employees/[id]）：技能列表、历史任务、完成 / 打回 / 胜率
- [x] 飞书 webhook：`FEISHU_WEBHOOK_URL` 配置即生效；任务上线后推送交互卡片
- [x] 上线预览页（/preview/[taskID]）：聚合 build + deploy artifact，预览 URL 内嵌 iframe，录屏 / 部署 URL 一屏可见
- **Status:** complete

## Key Questions
1. monorepo 用 Turborepo 还是 Nx？（个人倾向 Turborepo，更轻；如果你团队用过 Nx 可换）
2. 工作流引擎自研还是引入 Temporal？（自研推荐 — 业务节点种类有限，Temporal 太重）
3. LLM 默认 Provider？（推荐 Anthropic Claude，原生 prompt caching + tool use）
4. 代码生成的沙箱：MVP 阶段直接 API 调用 + 文件写盘，后续再上容器？
5. 演示部署用什么基建？（本地 Docker / 自有 VPS / Vercel）
6. 是否需要"打回任意一步"创建版本分叉？（推荐用版本树而不是线性回滚）
7. 三方会签的 UI 形态：所有人在同一面板独立投票 vs 顺序流转？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 技术栈 Next.js 16 + Go | 用户指定；前后端分明、Go 适合长任务+WS |
| Monorepo 同目录 | 用户指定，避免跨仓库联动成本 |
| 不照搬 multica | multica 是"托管编码 CLI agent"，我们要"多角色工作流" — 骨架借鉴、内核换成工作流引擎 |
| AI 节点产物落库版本化 | 支持任意步打回 + 审计追溯 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
|       | 1       |            |

## Notes
- 当前不写代码，仅完成方案讨论。Phase 1 锁定后再进入 Phase 2 实施。
- 默认工作流文档见 findings.md 的「默认工作流节点定义」节。
- 所有外部抓取/调研结果只写入 findings.md，不写入 task_plan.md（避免 hook 注入）。
