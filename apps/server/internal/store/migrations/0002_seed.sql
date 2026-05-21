-- idempotent seed: default workspace, users, 6 default digital employees, default workflow

with ws as (
  insert into workspaces (id, name)
  values ('00000000-0000-0000-0000-000000000001', '默认工作区')
  on conflict (id) do nothing
  returning id
), ws_existing as (
  select id from workspaces where id = '00000000-0000-0000-0000-000000000001'
)
select 1;

insert into users (id, workspace_id, name, email, role) values
  ('11111111-1111-1111-1111-111111111101', '00000000-0000-0000-0000-000000000001', '产品负责人', 'pm@meta-staff.local', 'pm'),
  ('11111111-1111-1111-1111-111111111102', '00000000-0000-0000-0000-000000000001', '测试负责人', 'qa@meta-staff.local', 'qa'),
  ('11111111-1111-1111-1111-111111111103', '00000000-0000-0000-0000-000000000001', '开发负责人', 'dev@meta-staff.local', 'dev'),
  ('11111111-1111-1111-1111-111111111104', '00000000-0000-0000-0000-000000000001', '客服小张',   'cs@meta-staff.local', 'cs'),
  ('11111111-1111-1111-1111-111111111105', '00000000-0000-0000-0000-000000000001', '运维老李',   'ops@meta-staff.local', 'ops'),
  ('11111111-1111-1111-1111-111111111106', '00000000-0000-0000-0000-000000000001', '运营小苓',   'growth@meta-staff.local', 'growth')
on conflict (workspace_id, email) do nothing;

insert into employees (id, workspace_id, role, name, avatar, system_prompt, tools, model) values
  ('22222222-2222-2222-2222-222222222201', '00000000-0000-0000-0000-000000000001', 'pm-agent', '产品经理', '产',
   $$你是产品经理 AI。
- 输入：原始需求 / Bug 描述
- 输出：先对内容做分类与关键信息抽取（type/severity/area/缺失项），再整理成 PRD（用户故事 · 验收标准 · 边界 · 风险）
- 风格：用结构化 markdown，简洁、可执行、不堆形容词。$$,
   '["search-skill","summarize"]'::jsonb, 'claude-opus-4-7'),

  ('22222222-2222-2222-2222-222222222202', '00000000-0000-0000-0000-000000000001', 'qa-agent', '测试', '测',
   $$你是测试 AI。
- 输入：PRD（含验收标准）
- 输出：覆盖正常、边界、异常、性能、兼容性五维的测试用例（Gherkin 风格），每条带 priority。
- 风格：穷尽不臃肿，给出 case 编号。$$,
   '["search-skill"]'::jsonb, 'claude-opus-4-7'),

  ('22222222-2222-2222-2222-222222222203', '00000000-0000-0000-0000-000000000001', 'dev-agent', '开发', '开',
   $$你是全栈开发 AI。
- 输入：PRD + 已校对测试用例
- 输出：实现方案 + 关键代码 diff + 测试执行结果占位 + 预览 URL 占位 + 录屏占位
- 风格：先讲实现思路再给代码；命名清晰、注释少而精。$$,
   '["search-skill","write-file","run-tests"]'::jsonb, 'claude-opus-4-7'),

  ('22222222-2222-2222-2222-222222222204', '00000000-0000-0000-0000-000000000001', 'ops-agent', '运维', '运',
   $$你是运维 AI。
- 输入：开发产物（代码 + 预览 URL）
- 输出：部署计划 + 上线 URL + 回滚预案
- 风格：用 checklist 输出，必要时附 docker / k8s 片段。$$,
   '["deploy","notify"]'::jsonb, 'claude-opus-4-7'),

  ('22222222-2222-2222-2222-222222222205', '00000000-0000-0000-0000-000000000001', 'cs-agent', '客服', '客',
   $$你是客服 AI。
- 输入：用户反馈
- 输出：情绪识别 + 复现步骤补全 + 优先级建议
- 风格：先共情后理性，输出 markdown。$$,
   '["search-skill"]'::jsonb, 'claude-opus-4-7'),

  ('22222222-2222-2222-2222-222222222206', '00000000-0000-0000-0000-000000000001', 'growth-agent', '运营', '营',
   $$你是运营 AI。
- 输入：业务侧诉求 / 活动需求 / 数据异常线索
- 输出：背景、目标用户、关键指标、活动机制（若有）、风险、依赖
- 风格：以业务效果驱动；先讲为什么，再讲怎么做；输出 markdown。$$,
   '["search-skill"]'::jsonb, 'claude-opus-4-7')
on conflict (id) do nothing;

-- default workflow + first version
insert into workflows (id, workspace_id, name, description, is_default, active_version)
values ('33333333-3333-3333-3333-333333333301', '00000000-0000-0000-0000-000000000001',
        '默认开发链路', '产品/客服提单 → AI 协作 → 三方会签 → 上线推送', true, 1)
on conflict (id) do nothing;

insert into workflow_versions (id, workflow_id, version, dag) values
  ('44444444-4444-4444-4444-444444444401', '33333333-3333-3333-3333-333333333301', 1,
   $${
  "nodes": [
    {"key": "intake",   "title": "收单",         "type": "human",     "role": "any",      "auto_submit": false, "produces": "raw"},
    {"key": "triage",   "title": "AI 分析分类",   "type": "ai",        "role": "pm-agent", "auto_submit": true,  "produces": "classification"},
    {"key": "spec",     "title": "AI 整理 PRD",   "type": "ai",        "role": "pm-agent", "auto_submit": true,  "produces": "prd"},
    {"key": "review",   "title": "PRD 校对",      "type": "human",     "role": "pm",       "auto_submit": false, "produces": "prd"},
    {"key": "cases",    "title": "AI 生成用例",   "type": "ai",        "role": "qa-agent", "auto_submit": true,  "produces": "testcases"},
    {"key": "audit",    "title": "测试用例校对", "type": "human",     "role": "qa",       "auto_submit": false, "produces": "testcases"},
    {"key": "build",    "title": "AI 编码",       "type": "ai",        "role": "dev-agent","auto_submit": true,  "produces": "build"},
    {"key": "signoff",  "title": "三方会签",      "type": "review",    "role": "trio",     "auto_submit": false, "produces": "vote"},
    {"key": "deploy",   "title": "AI 上线",       "type": "auto",      "role": "ops-agent","auto_submit": true,  "produces": "deploy"},
    {"key": "accept",   "title": "推送验收",      "type": "auto",      "role": "system",   "auto_submit": true,  "produces": "notice"}
  ],
  "edges": [
    {"from": "intake",  "to": "triage"},
    {"from": "triage",  "to": "spec"},
    {"from": "spec",    "to": "review"},
    {"from": "review",  "to": "cases"},
    {"from": "cases",   "to": "audit"},
    {"from": "audit",   "to": "build"},
    {"from": "build",   "to": "signoff"},
    {"from": "signoff", "to": "deploy"},
    {"from": "deploy",  "to": "accept"}
  ],
  "entry": "intake"
}$$::jsonb)
on conflict (id) do nothing;
