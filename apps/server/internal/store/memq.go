package store

import (
	"context"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/meta-staff/server/internal/model"
)

// memQ is an in-memory implementation of Q used when DATABASE_URL is empty
// or "memory://". It is seeded on construction with the same default
// workspace / users / employees / workflow as migrations/0002_seed.sql.
type memQ struct {
	mu sync.RWMutex

	workspaces map[uuid.UUID]model.Workspace
	users      map[uuid.UUID]model.User
	employees  map[uuid.UUID]model.Employee
	workflows  map[uuid.UUID]model.Workflow
	wfVersions map[uuid.UUID]model.WorkflowVersion
	tasks      map[uuid.UUID]model.Task
	runs       map[uuid.UUID]model.NodeRun
	artifacts  map[uuid.UUID]model.Artifact
	reviews    map[uuid.UUID]model.Review
	messages   map[uuid.UUID]model.Message
	skills     map[uuid.UUID]model.Skill

	// secondary index for unique(node_run_id, reviewer_user_id) on reviews
	reviewByKey map[string]uuid.UUID

	// workflow_employees: key = workflowID|employeeID, value = added_at
	wfEmployees map[string]time.Time
}

func newMemQ() *memQ {
	m := &memQ{
		workspaces:  map[uuid.UUID]model.Workspace{},
		users:       map[uuid.UUID]model.User{},
		employees:   map[uuid.UUID]model.Employee{},
		workflows:   map[uuid.UUID]model.Workflow{},
		wfVersions:  map[uuid.UUID]model.WorkflowVersion{},
		tasks:       map[uuid.UUID]model.Task{},
		runs:        map[uuid.UUID]model.NodeRun{},
		artifacts:   map[uuid.UUID]model.Artifact{},
		reviews:     map[uuid.UUID]model.Review{},
		messages:    map[uuid.UUID]model.Message{},
		skills:      map[uuid.UUID]model.Skill{},
		reviewByKey: map[string]uuid.UUID{},
		wfEmployees: map[string]time.Time{},
	}
	m.seed()
	return m
}

func (m *memQ) seed() {
	now := time.Now().UTC()
	wsID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	m.workspaces[wsID] = model.Workspace{ID: wsID, Name: "默认工作区", CreatedAt: now}

	// 1) Admin (老板) — the only seeded human user. Everyone else registers.
	adminID := uuid.MustParse("11111111-1111-1111-1111-1111111111aa")
	adminUsername := "admin"
	m.users[adminID] = model.User{
		ID: adminID, WorkspaceID: wsID,
		Name: "管理员", Email: "admin@meta-staff.local",
		Username: &adminUsername, Password: "1234",
		Role: "admin", CreatedAt: now,
	}

	// admin 同时是一个 Employee（bound_user_id = adminID），这样 admin 也能
	// 出现在工作流员工列表 / 被绑定到节点。
	adminEmpID := uuid.MustParse("22222222-2222-2222-2222-2222222222ad")
	adminAv := "管"
	adminTools, _ := json.Marshal([]string{"search-skill"})
	uidCopy := adminID
	m.employees[adminEmpID] = model.Employee{
		ID: adminEmpID, WorkspaceID: wsID, Role: "admin", Name: "管理员",
		Avatar: &adminAv, SystemPrompt: "你是管理员/老板 · 拥有完整权限，可在任何节点把关。",
		Tools: adminTools, Model: "claude-opus-4-7",
		BoundUserID: &uidCopy, IsActive: true, CreatedAt: now,
	}

	// 2) Six pure-AI employees (no bound user, no IM, active).
	//    Admin can immediately bind them to nodes for AI-auto execution.
	addPureAI := func(idStr, role, name, avatar, prompt string, tools []string) {
		id := uuid.MustParse(idStr)
		raw, _ := json.Marshal(tools)
		av := avatar
		m.employees[id] = model.Employee{
			ID: id, WorkspaceID: wsID, Role: role, Name: name,
			Avatar: &av, SystemPrompt: prompt, Tools: raw,
			Model: "claude-opus-4-7", IsActive: true, CreatedAt: now,
		}
	}
	addPureAI("22222222-2222-2222-2222-222222222201", "pm-agent", "产品经理", "产",
		"你是产品经理 AI。\n- 输入：原始需求 / Bug 描述\n- 输出：先对内容做分类与关键信息抽取（type/severity/area/缺失项），再整理成 PRD（用户故事 · 验收标准 · 边界 · 风险）\n- 风格：用结构化 markdown，简洁、可执行、不堆形容词。",
		[]string{"search-skill", "summarize"})
	addPureAI("22222222-2222-2222-2222-222222222202", "qa-agent", "测试", "测",
		"你是测试 AI。\n- 输入：PRD（含验收标准）\n- 输出：覆盖正常、边界、异常、性能、兼容性五维的测试用例（Gherkin 风格），每条带 priority。\n- 风格：穷尽不臃肿，给出 case 编号。",
		[]string{"search-skill"})
	addPureAI("22222222-2222-2222-2222-222222222203", "dev-agent", "开发", "开",
		"你是全栈开发 AI。\n- 输入：PRD + 已校对测试用例\n- 输出：实现方案 + 关键代码 diff + 测试执行结果占位 + 预览 URL 占位 + 录屏占位\n- 风格：先讲实现思路再给代码；命名清晰、注释少而精。",
		[]string{"search-skill", "write-file", "run-tests"})
	addPureAI("22222222-2222-2222-2222-222222222204", "ops-agent", "运维", "运",
		"你是运维 AI。\n- 输入：开发产物（代码 + 预览 URL）\n- 输出：部署计划 + 上线 URL + 回滚预案\n- 风格：用 checklist 输出，必要时附 docker / k8s 片段。",
		[]string{"deploy", "notify"})
	addPureAI("22222222-2222-2222-2222-222222222205", "cs-agent", "客服", "客",
		"你是客服 AI。\n- 输入：用户反馈\n- 输出：情绪识别 + 复现步骤补全 + 优先级建议\n- 风格：先共情后理性，输出 markdown。",
		[]string{"search-skill"})
	addPureAI("22222222-2222-2222-2222-222222222206", "growth-agent", "运营", "营",
		"你是运营 AI。\n- 输入：业务侧诉求 / 活动需求 / 数据异常线索\n- 输出：背景、目标用户、关键指标、活动机制（若有）、风险、依赖\n- 风格：以业务效果驱动；先讲为什么，再讲怎么做；输出 markdown。",
		[]string{"search-skill"})

	// 3) 默认工作流不预绑真人员工 —— 管理员注册真人后，自己用"+ 新建员工"
	//    的"人类员工"模式按员工 ID 加进来。

	// 4) Default workflow. Nodes use `assignee_employee_ids`. 入口 + 人工审核
	//    节点的 assignee_employee_ids 留空，等管理员手动绑定；AI 节点绑对应
	//    数字员工。
	wfID := uuid.MustParse("33333333-3333-3333-3333-333333333301")
	desc := "产品/客服/运营提单 → AI 协作 → 三方会签 → 上线推送"
	m.workflows[wfID] = model.Workflow{
		ID: wfID, WorkspaceID: wsID, Name: "默认开发链路",
		Description: &desc, IsDefault: true, ActiveVersion: 1, CreatedAt: now,
	}
	wvID := uuid.MustParse("44444444-4444-4444-4444-444444444401")
	dag := `{
  "nodes": [
    {"key": "intake",  "title": "收单",         "produces": "raw",            "is_intake": true,
     "assignee_employee_ids": []},
    {"key": "triage",  "title": "AI 分析分类",  "produces": "classification",
     "assignee_employee_ids": ["22222222-2222-2222-2222-222222222201"]},
    {"key": "spec",    "title": "AI 整理 PRD",  "produces": "prd",
     "assignee_employee_ids": ["22222222-2222-2222-2222-222222222201"]},
    {"key": "review",  "title": "PRD 校对",     "produces": "prd",
     "assignee_employee_ids": []},
    {"key": "cases",   "title": "AI 生成用例",  "produces": "testcases",
     "assignee_employee_ids": ["22222222-2222-2222-2222-222222222202"]},
    {"key": "audit",   "title": "测试用例校对", "produces": "testcases",
     "assignee_employee_ids": []},
    {"key": "build",   "title": "AI 编码",      "produces": "build",
     "assignee_employee_ids": ["22222222-2222-2222-2222-222222222203"]},
    {"key": "signoff", "title": "三方会签",     "produces": "vote",
     "assignee_employee_ids": []},
    {"key": "deploy",  "title": "AI 上线",      "produces": "deploy",
     "assignee_employee_ids": ["22222222-2222-2222-2222-222222222204"]},
    {"key": "accept",  "title": "推送验收",     "produces": "notice",
     "assignee_employee_ids": []}
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
}`
	m.wfVersions[wvID] = model.WorkflowVersion{
		ID: wvID, WorkflowID: wfID, Version: 1,
		DAG: json.RawMessage(dag), CreatedAt: now,
	}

	// 5) 回填 workflow_employees：把 DAG 里所有 assignee_employee_ids 都登记成
	// 默认工作流的成员（保持和 SQL 迁移 0005 一致的行为）。
	var seeded struct {
		Nodes []struct {
			AssigneeEmployeeIDs []string `json:"assignee_employee_ids"`
		} `json:"nodes"`
	}
	_ = json.Unmarshal([]byte(dag), &seeded)
	for _, n := range seeded.Nodes {
		for _, eidStr := range n.AssigneeEmployeeIDs {
			eid, err := uuid.Parse(eidStr)
			if err != nil {
				continue
			}
			m.wfEmployees[wfID.String()+"|"+eid.String()] = now
		}
	}
	// admin 默认在默认工作流里
	m.wfEmployees[wfID.String()+"|"+adminEmpID.String()] = now
}

func (m *memQ) DefaultWorkspaceID() uuid.UUID {
	return uuid.MustParse("00000000-0000-0000-0000-000000000001")
}

// ============== users ==============

func (m *memQ) ListUsers(_ context.Context, wsID uuid.UUID) ([]model.User, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var out []model.User
	for _, u := range m.users {
		if u.WorkspaceID == wsID {
			out = append(out, u)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Role != out[j].Role { return out[i].Role < out[j].Role }
		return out[i].Name < out[j].Name
	})
	return out, nil
}

func (m *memQ) UserByRole(_ context.Context, wsID uuid.UUID, role string) (model.User, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, u := range m.users {
		if u.WorkspaceID == wsID && u.Role == role {
			return u, nil
		}
	}
	return model.User{}, ErrNotFound
}

// ============== employees ==============

func (m *memQ) ListEmployees(_ context.Context, wsID uuid.UUID) ([]model.Employee, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var out []model.Employee
	for _, e := range m.employees {
		if e.WorkspaceID == wsID {
			out = append(out, e)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.Before(out[j].CreatedAt) })
	return out, nil
}

func (m *memQ) EmployeeByRole(_ context.Context, wsID uuid.UUID, role string) (model.Employee, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var found []model.Employee
	for _, e := range m.employees {
		if e.WorkspaceID == wsID && e.Role == role {
			found = append(found, e)
		}
	}
	if len(found) == 0 {
		return model.Employee{}, ErrNotFound
	}
	sort.Slice(found, func(i, j int) bool { return found[i].CreatedAt.Before(found[j].CreatedAt) })
	return found[0], nil
}

func (m *memQ) GetEmployee(_ context.Context, id uuid.UUID) (model.Employee, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	e, ok := m.employees[id]
	if !ok {
		return model.Employee{}, ErrNotFound
	}
	return e, nil
}

func (m *memQ) CreateEmployee(_ context.Context, p CreateEmployeeParams) (model.Employee, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	tools := p.Tools
	if len(tools) == 0 {
		tools = json.RawMessage("[]")
	}
	model_ := p.Model
	if model_ == "" {
		model_ = "claude-opus-4-7"
	}
	e := model.Employee{
		ID: uuid.New(), WorkspaceID: p.WorkspaceID, Role: p.Role, Name: p.Name,
		Avatar: p.Avatar, SystemPrompt: p.SystemPrompt, Tools: tools, Model: model_,
		BoundUserID: p.BoundUserID, IMProvider: p.IMProvider,
		IMExternalID: p.IMExternalID, IMHandle: p.IMHandle, IsActive: p.IsActive,
		CreatedAt: time.Now().UTC(),
	}
	m.employees[e.ID] = e
	return e, nil
}

func (m *memQ) UpdateEmployee(_ context.Context, id uuid.UUID, p UpdateEmployeeParams) (model.Employee, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.employees[id]
	if !ok {
		return model.Employee{}, ErrNotFound
	}
	if p.Name != nil {
		e.Name = *p.Name
	}
	if p.Avatar != nil {
		e.Avatar = p.Avatar
	}
	if p.SystemPrompt != nil {
		e.SystemPrompt = *p.SystemPrompt
	}
	if len(p.Tools) > 0 {
		e.Tools = p.Tools
	}
	if p.Model != nil {
		e.Model = *p.Model
	}
	if p.BoundUserID != nil {
		e.BoundUserID = p.BoundUserID
	}
	if p.IMProvider != nil {
		e.IMProvider = p.IMProvider
	}
	if p.IMExternalID != nil {
		e.IMExternalID = p.IMExternalID
	}
	if p.IMHandle != nil {
		e.IMHandle = p.IMHandle
	}
	if p.IsActive != nil {
		e.IsActive = *p.IsActive
	}
	m.employees[id] = e
	return e, nil
}

func (m *memQ) EmployeeByUserID(_ context.Context, userID uuid.UUID) (model.Employee, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, e := range m.employees {
		if e.BoundUserID != nil && *e.BoundUserID == userID {
			return e, nil
		}
	}
	return model.Employee{}, ErrNotFound
}

func (m *memQ) CreateUser(_ context.Context, p CreateUserParams) (model.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, u := range m.users {
		if u.WorkspaceID != p.WorkspaceID {
			continue
		}
		if p.Email != "" && u.Email == p.Email {
			return model.User{}, errors.New("email already registered")
		}
		if p.Username != nil && u.Username != nil && *u.Username == *p.Username {
			return model.User{}, errors.New("username already taken")
		}
	}
	u := model.User{
		ID: uuid.New(), WorkspaceID: p.WorkspaceID,
		Name: p.Name, Email: p.Email,
		Username: p.Username, Password: p.Password,
		Role: p.Role,
		CreatedAt: time.Now().UTC(),
	}
	m.users[u.ID] = u
	return u, nil
}

func (m *memQ) UserByEmail(_ context.Context, wsID uuid.UUID, email string) (model.User, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, u := range m.users {
		if u.WorkspaceID == wsID && u.Email == email {
			return u, nil
		}
	}
	return model.User{}, ErrNotFound
}

func (m *memQ) UserByUsername(_ context.Context, wsID uuid.UUID, username string) (model.User, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, u := range m.users {
		if u.WorkspaceID == wsID && u.Username != nil && *u.Username == username {
			return u, nil
		}
	}
	return model.User{}, ErrNotFound
}

func (m *memQ) GetUser(_ context.Context, id uuid.UUID) (model.User, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	u, ok := m.users[id]
	if !ok {
		return model.User{}, ErrNotFound
	}
	return u, nil
}

func (m *memQ) UpdateUserRole(_ context.Context, id uuid.UUID, role string) (model.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	u, ok := m.users[id]
	if !ok {
		return model.User{}, ErrNotFound
	}
	u.Role = role
	m.users[id] = u
	return u, nil
}

// ============== workflows ==============

func (m *memQ) ListWorkflows(_ context.Context, wsID uuid.UUID) ([]model.Workflow, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var out []model.Workflow
	for _, w := range m.workflows {
		if w.WorkspaceID == wsID {
			out = append(out, w)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].IsDefault != out[j].IsDefault { return out[i].IsDefault }
		return out[i].CreatedAt.Before(out[j].CreatedAt)
	})
	return out, nil
}

func (m *memQ) DefaultWorkflow(_ context.Context, wsID uuid.UUID) (model.Workflow, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, w := range m.workflows {
		if w.WorkspaceID == wsID && w.IsDefault {
			return w, nil
		}
	}
	return model.Workflow{}, ErrNotFound
}

func (m *memQ) WorkflowActiveVersion(_ context.Context, workflowID uuid.UUID) (model.WorkflowVersion, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	w, ok := m.workflows[workflowID]
	if !ok {
		return model.WorkflowVersion{}, ErrNotFound
	}
	for _, v := range m.wfVersions {
		if v.WorkflowID == workflowID && v.Version == w.ActiveVersion {
			return v, nil
		}
	}
	return model.WorkflowVersion{}, ErrNotFound
}

func (m *memQ) WorkflowVersion(_ context.Context, id uuid.UUID) (model.WorkflowVersion, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	v, ok := m.wfVersions[id]
	if !ok {
		return model.WorkflowVersion{}, ErrNotFound
	}
	return v, nil
}

func (m *memQ) NewWorkflowVersion(_ context.Context, p UpsertWorkflowVersionParams) (model.WorkflowVersion, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	next := 0
	for _, v := range m.wfVersions {
		if v.WorkflowID == p.WorkflowID && v.Version > next {
			next = v.Version
		}
	}
	next++
	v := model.WorkflowVersion{
		ID: uuid.New(), WorkflowID: p.WorkflowID, Version: next,
		DAG: p.DAG, CreatedAt: time.Now().UTC(),
	}
	m.wfVersions[v.ID] = v
	if w, ok := m.workflows[p.WorkflowID]; ok {
		w.ActiveVersion = next
		m.workflows[p.WorkflowID] = w
	}
	return v, nil
}

// ============== workflow_employees ==============

func (m *memQ) ListWorkflowEmployees(_ context.Context, workflowID uuid.UUID) ([]uuid.UUID, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	prefix := workflowID.String() + "|"
	type pair struct {
		id uuid.UUID
		t  time.Time
	}
	var pairs []pair
	for k, t := range m.wfEmployees {
		if !strings.HasPrefix(k, prefix) {
			continue
		}
		eid, err := uuid.Parse(k[len(prefix):])
		if err != nil {
			continue
		}
		pairs = append(pairs, pair{eid, t})
	}
	sort.Slice(pairs, func(i, j int) bool { return pairs[i].t.Before(pairs[j].t) })
	out := []uuid.UUID{}
	for _, p := range pairs {
		out = append(out, p.id)
	}
	return out, nil
}

func (m *memQ) ListWorkflowsByEmployee(_ context.Context, employeeID uuid.UUID) ([]uuid.UUID, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	suffix := "|" + employeeID.String()
	type pair struct {
		id uuid.UUID
		t  time.Time
	}
	var pairs []pair
	for k, t := range m.wfEmployees {
		if !strings.HasSuffix(k, suffix) {
			continue
		}
		wid, err := uuid.Parse(k[:len(k)-len(suffix)])
		if err != nil {
			continue
		}
		pairs = append(pairs, pair{wid, t})
	}
	sort.Slice(pairs, func(i, j int) bool { return pairs[i].t.Before(pairs[j].t) })
	out := []uuid.UUID{}
	for _, p := range pairs {
		out = append(out, p.id)
	}
	return out, nil
}

func (m *memQ) AddWorkflowEmployee(_ context.Context, workflowID, employeeID uuid.UUID) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := workflowID.String() + "|" + employeeID.String()
	if _, ok := m.wfEmployees[key]; !ok {
		m.wfEmployees[key] = time.Now().UTC()
	}
	return nil
}

func (m *memQ) RemoveWorkflowEmployee(_ context.Context, workflowID, employeeID uuid.UUID) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.wfEmployees, workflowID.String()+"|"+employeeID.String())
	return nil
}

// ============== tasks ==============

func (m *memQ) CreateTask(_ context.Context, p CreateTaskParams) (model.Task, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	payload := p.Payload
	if len(payload) == 0 {
		payload = json.RawMessage("{}")
	}
	t := model.Task{
		ID: uuid.New(), WorkspaceID: p.WorkspaceID, WorkflowVersionID: p.WorkflowVersionID,
		Title: p.Title, Source: p.Source, Status: "open",
		Payload: payload, CreatedBy: p.CreatedBy, CreatedAt: time.Now().UTC(),
	}
	m.tasks[t.ID] = t
	return t, nil
}

func (m *memQ) ListTasks(_ context.Context, wsID uuid.UUID) ([]model.Task, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var out []model.Task
	for _, t := range m.tasks {
		if t.WorkspaceID == wsID {
			out = append(out, t)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	if len(out) > 100 {
		out = out[:100]
	}
	return out, nil
}

func (m *memQ) GetTask(_ context.Context, id uuid.UUID) (model.Task, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	t, ok := m.tasks[id]
	if !ok {
		return model.Task{}, ErrNotFound
	}
	return t, nil
}

// ============== node_runs ==============

func (m *memQ) CreateNodeRun(_ context.Context, p CreateNodeRunParams) (model.NodeRun, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	inputs := p.Inputs
	if len(inputs) == 0 {
		inputs = json.RawMessage("{}")
	}
	status := p.Status
	if status == "" {
		status = model.StatusPending
	}
	n := model.NodeRun{
		ID: uuid.New(), TaskID: p.TaskID, NodeKey: p.NodeKey,
		ParentRunID: p.ParentRunID, ExecutorType: p.ExecutorType,
		ExecutorEmployeeID: p.ExecutorEmployeeID, AssigneeUserID: p.AssigneeUserID,
		Status: status, Inputs: inputs, CreatedAt: time.Now().UTC(),
	}
	m.runs[n.ID] = n
	return n, nil
}

func (m *memQ) GetNodeRun(_ context.Context, id uuid.UUID) (model.NodeRun, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	n, ok := m.runs[id]
	if !ok {
		return model.NodeRun{}, ErrNotFound
	}
	return n, nil
}

func (m *memQ) ListNodeRunsByTask(_ context.Context, taskID uuid.UUID) ([]model.NodeRun, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var out []model.NodeRun
	for _, n := range m.runs {
		if n.TaskID == taskID {
			out = append(out, n)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.Before(out[j].CreatedAt) })
	return out, nil
}

func (m *memQ) LatestActiveRunForNode(_ context.Context, taskID uuid.UUID, nodeKey string) (model.NodeRun, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var cand []model.NodeRun
	for _, n := range m.runs {
		if n.TaskID == taskID && n.NodeKey == nodeKey && n.Status != model.StatusRolledBack {
			cand = append(cand, n)
		}
	}
	if len(cand) == 0 {
		return model.NodeRun{}, ErrNotFound
	}
	sort.Slice(cand, func(i, j int) bool { return cand[i].CreatedAt.After(cand[j].CreatedAt) })
	return cand[0], nil
}

func (m *memQ) UpdateNodeRunStatus(_ context.Context, id uuid.UUID, status model.NodeRunStatus, errStr *string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	n, ok := m.runs[id]
	if !ok {
		return ErrNotFound
	}
	n.Status = status
	if errStr != nil {
		n.Error = errStr
	}
	now := time.Now().UTC()
	switch status {
	case model.StatusRunning:
		if n.StartedAt == nil {
			n.StartedAt = &now
		}
	case model.StatusDone, model.StatusFailed, model.StatusRolledBack:
		n.FinishedAt = &now
	}
	m.runs[id] = n
	return nil
}

func (m *memQ) MarkRunsRolledBackFrom(_ context.Context, taskID uuid.UUID, nodeKeys []string) error {
	if len(nodeKeys) == 0 {
		return nil
	}
	keys := map[string]bool{}
	for _, k := range nodeKeys {
		keys[k] = true
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now().UTC()
	for id, n := range m.runs {
		if n.TaskID == taskID && keys[n.NodeKey] && n.Status != model.StatusRolledBack {
			n.Status = model.StatusRolledBack
			n.FinishedAt = &now
			m.runs[id] = n
		}
	}
	return nil
}

// ============== artifacts ==============

func (m *memQ) CreateArtifact(_ context.Context, p CreateArtifactParams) (model.Artifact, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	next := 0
	for _, a := range m.artifacts {
		if a.NodeRunID == p.NodeRunID && a.Kind == p.Kind && a.Version > next {
			next = a.Version
		}
	}
	next++
	payload := p.Payload
	if len(payload) == 0 {
		payload = json.RawMessage("{}")
	}
	a := model.Artifact{
		ID: uuid.New(), NodeRunID: p.NodeRunID, Kind: p.Kind,
		Version: next, Payload: payload, BlobURL: p.BlobURL,
		CreatedAt: time.Now().UTC(),
	}
	m.artifacts[a.ID] = a
	return a, nil
}

func (m *memQ) ListArtifactsByRun(_ context.Context, runID uuid.UUID) ([]model.Artifact, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var out []model.Artifact
	for _, a := range m.artifacts {
		if a.NodeRunID == runID {
			out = append(out, a)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.Before(out[j].CreatedAt) })
	return out, nil
}

func (m *memQ) LatestArtifact(_ context.Context, runID uuid.UUID, kind string) (model.Artifact, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var found []model.Artifact
	for _, a := range m.artifacts {
		if a.NodeRunID == runID && a.Kind == kind {
			found = append(found, a)
		}
	}
	if len(found) == 0 {
		return model.Artifact{}, ErrNotFound
	}
	sort.Slice(found, func(i, j int) bool { return found[i].Version > found[j].Version })
	return found[0], nil
}

// ============== reviews ==============

func (m *memQ) UpsertReview(_ context.Context, p UpsertReviewParams) (model.Review, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := p.NodeRunID.String() + "/" + p.ReviewerUserID.String()
	if id, ok := m.reviewByKey[key]; ok {
		r := m.reviews[id]
		r.Vote = p.Vote
		r.RollbackToNodeKey = p.RollbackToNodeKey
		r.Comment = p.Comment
		r.ReviewerRole = p.ReviewerRole
		m.reviews[id] = r
		return r, nil
	}
	r := model.Review{
		ID: uuid.New(), NodeRunID: p.NodeRunID,
		ReviewerUserID: p.ReviewerUserID, ReviewerRole: p.ReviewerRole,
		Vote: p.Vote, RollbackToNodeKey: p.RollbackToNodeKey,
		Comment: p.Comment, CreatedAt: time.Now().UTC(),
	}
	m.reviews[r.ID] = r
	m.reviewByKey[key] = r.ID
	return r, nil
}

func (m *memQ) ListReviews(_ context.Context, runID uuid.UUID) ([]model.Review, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var out []model.Review
	for _, r := range m.reviews {
		if r.NodeRunID == runID {
			out = append(out, r)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ReviewerRole < out[j].ReviewerRole })
	return out, nil
}

// ============== messages ==============

func (m *memQ) CreateMessage(_ context.Context, p CreateMessageParams) (model.Message, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	msg := model.Message{
		ID: uuid.New(), WorkspaceID: p.WorkspaceID,
		TaskID: p.TaskID, NodeRunID: p.NodeRunID,
		Kind: p.Kind, ToUserID: p.ToUserID, Body: p.Body,
		CreatedAt: time.Now().UTC(),
	}
	m.messages[msg.ID] = msg
	return msg, nil
}

func (m *memQ) ListMessages(_ context.Context, wsID uuid.UUID, userID *uuid.UUID, limit int) ([]model.Message, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if limit <= 0 {
		limit = 50
	}
	var out []model.Message
	for _, msg := range m.messages {
		if msg.WorkspaceID != wsID {
			continue
		}
		if userID != nil {
			if msg.ToUserID != nil && *msg.ToUserID != *userID {
				continue
			}
		}
		out = append(out, msg)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (m *memQ) MarkMessageRead(_ context.Context, id uuid.UUID) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	msg, ok := m.messages[id]
	if !ok || msg.ReadAt != nil {
		return nil
	}
	now := time.Now().UTC()
	msg.ReadAt = &now
	m.messages[id] = msg
	return nil
}

// ============== skills ==============

func (m *memQ) CreateSkill(_ context.Context, p CreateSkillParams) (model.Skill, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := model.Skill{
		ID: uuid.New(), WorkspaceID: p.WorkspaceID,
		EmployeeID: p.EmployeeID, Summary: p.Summary,
		SourceNodeRunID: p.SourceNodeRunID, CreatedAt: time.Now().UTC(),
	}
	m.skills[s.ID] = s
	return s, nil
}

func (m *memQ) ListSkillsByEmployee(_ context.Context, employeeID uuid.UUID) ([]model.Skill, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var out []model.Skill
	for _, s := range m.skills {
		if s.EmployeeID != nil && *s.EmployeeID == employeeID {
			out = append(out, s)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	if len(out) > 50 {
		out = out[:50]
	}
	return out, nil
}

func (m *memQ) SearchSkills(_ context.Context, wsID uuid.UUID, query string, limit int) ([]model.Skill, error) {
	if limit <= 0 {
		limit = 10
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	q := strings.ToLower(query)
	var out []model.Skill
	for _, s := range m.skills {
		if s.WorkspaceID != wsID {
			continue
		}
		if q != "" && !strings.Contains(strings.ToLower(s.Summary), q) {
			continue
		}
		out = append(out, s)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}
