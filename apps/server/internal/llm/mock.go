package llm

import (
	"context"
	"strings"
	"time"
)

// Mock returns deterministic, role-aware fake responses so the engine can run
// end-to-end without any external API key.
type Mock struct{}

func (Mock) Name() string { return "mock" }

func (Mock) Complete(ctx context.Context, req Request) (string, error) {
	// simulate latency so UI streaming/status feels real
	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case <-time.After(800 * time.Millisecond):
	}

	sys := strings.ToLower(req.System)
	last := ""
	if n := len(req.Messages); n > 0 {
		last = req.Messages[n-1].Content
	}

	switch {
	case strings.Contains(sys, "产品经理") && strings.Contains(sys, "分类"):
		return fakeTriage(last), nil
	case strings.Contains(sys, "产品经理"):
		return fakePRD(last), nil
	case strings.Contains(sys, "测试"):
		return fakeTestcases(last), nil
	case strings.Contains(sys, "开发"):
		return fakeBuild(last), nil
	case strings.Contains(sys, "运维"):
		return fakeDeploy(last), nil
	case strings.Contains(sys, "客服"):
		return fakeSupport(last), nil
	case strings.Contains(sys, "运营"):
		return fakeGrowth(last), nil
	}
	return "OK\n\n（mock 模式：未识别角色，回声内容如下）\n\n" + last, nil
}

func fakeTriage(input string) string {
	return `{
  "type": "feature",
  "severity": "P2",
  "area": "用户中心",
  "summary": "` + firstLine(input) + `",
  "missing_info": ["目标用户群体", "成功指标"],
  "tags": ["mock-triage"]
}`
}

func fakePRD(_ string) string {
	return `# 需求文档（PRD）

## 1. 背景
基于上游收单与分类，本节将原始诉求整理为可交付的标准 PRD。

## 2. 用户故事
- 作为登录用户，我希望 X，以便 Y。

## 3. 验收标准
- [ ] 基本场景：…
- [ ] 边界场景：…
- [ ] 异常场景：…

## 4. 边界与风险
- 与 A 模块耦合；需评估对 B 模块的影响。

> mock 模式产物；接入真实 LLM 后会替换为详细内容。`
}

func fakeTestcases(_ string) string {
	return `[
  {"id": "TC-01", "scenario": "正常路径 - 登录后访问目标页面", "priority": "P0", "gherkin": "Given 已登录\nWhen 访问 /feature\nThen 看到结果"},
  {"id": "TC-02", "scenario": "边界 - 长字段输入", "priority": "P1", "gherkin": "Given 表单\nWhen 输入 10k 字\nThen 提示截断"},
  {"id": "TC-03", "scenario": "异常 - 网络断开", "priority": "P1", "gherkin": "Given 提交中\nWhen 断网\nThen 提示并允许重试"}
]`
}

func fakeBuild(_ string) string {
	return `## 实现思路
- 前端新增页面 ` + "`/feature`" + ` 与对应组件；
- 后端新增 ` + "`GET /api/feature`" + ` 接口；
- 数据流：FE → BE → DB；
- 覆盖测试用例 TC-01/02/03。

## 关键 diff（节选）
` + "```diff\n+ apps/web/app/feature/page.tsx\n+ apps/server/internal/api/feature.go\n```\n" + `

## 测试执行
- TC-01 ✅ pass
- TC-02 ✅ pass
- TC-03 ✅ pass

## 预览
- preview_url: https://preview.local/mock/feature
- recording_url: https://preview.local/mock/feature/run.mp4
`
}

func fakeDeploy(_ string) string {
	return `## 部署计划
- [x] 构建镜像
- [x] 蓝绿切换
- [x] 健康检查
- [x] 灰度 10% → 50% → 100%

## 上线地址
- url: https://app.meta-staff.local/mock/feature
- rollback: kubectl rollout undo deploy/feature
`
}

func fakeSupport(input string) string {
	return `## 客服整理
**情绪**：困惑+轻微焦虑
**核心诉求**：` + firstLine(input) + `
**复现步骤**（推断）：
1. 进入 /xxx
2. 点击 …
3. 期望 A，实际 B
**建议优先级**：P2
`
}

func fakeGrowth(input string) string {
	return `## 业务运营视角
**背景**：` + firstLine(input) + `
**目标用户**：新增 / 流失 / 沉默 用户分层
**关键指标**：DAU · 转化率 · 留存
**活动机制**（若适用）：拉新 → 激活 → 留存 漏斗
**风险与依赖**：与产品节奏、客服承接量耦合
**建议优先级**：P1
`
}

func firstLine(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.IndexByte(s, '\n'); i > 0 {
		return s[:i]
	}
	if len(s) > 80 {
		return s[:80] + "…"
	}
	if s == "" {
		return "（空输入）"
	}
	return s
}
