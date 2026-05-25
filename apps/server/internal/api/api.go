package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/google/uuid"

	"github.com/meta-staff/server/internal/config"
	"github.com/meta-staff/server/internal/llm"
	"github.com/meta-staff/server/internal/model"
	"github.com/meta-staff/server/internal/sandbox"
	"github.com/meta-staff/server/internal/store"
	"github.com/meta-staff/server/internal/workflow"
	"github.com/meta-staff/server/internal/ws"
)

type Deps struct {
	Cfg     config.Config
	Store   *store.Store
	Engine  *workflow.Engine
	Hub     *ws.Hub
	Sandbox *sandbox.Sandbox
	LLM     llm.Provider
}

func Router(d Deps) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	// 默认 60s 超时对快速 REST 路由够用，但 hermes agent loop 单次可能
	// 几十秒到几分钟，所以下方 /api/debug/* 路由跳过这个 middleware，
	// 走 LLM provider 自己的 http client timeout（hermes provider = 600s）。
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", "http://localhost:3001"},
		AllowedMethods:   []string{"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-User-Id"},
		AllowCredentials: true,
	}))

	r.Get("/ws", d.Hub.ServeHTTP)

	// Static files: sandbox previews + Playwright recordings.
	if d.Sandbox != nil {
		fs := http.FileServer(http.Dir(d.Sandbox.RuntimeDir))
		r.Handle("/static/*", http.StripPrefix("/static/", fs))
	}
	// Hermes workspace mount: 浏览器可访问 hermes 在容器内 /workspace 写的文件。
	// e.g. hermes 写 /workspace/snake-game/index.html → 宿主机 $HERMES_WORKSPACE_DIR/snake-game/index.html
	// → 浏览器 GET /static/workspace/snake-game/index.html
	if d.Cfg.HermesWorkspaceDir != "" {
		wsFS := http.FileServer(http.Dir(d.Cfg.HermesWorkspaceDir))
		r.Handle("/static/workspace/*", http.StripPrefix("/static/workspace/", wsFS))
	}

	r.Route("/api", func(api chi.Router) {
		api.Get("/healthz", d.healthz)

		api.Get("/me", d.getMe)
		api.Get("/users", d.listUsers)
		api.Post("/auth/register", d.register)
		api.Post("/auth/login", d.login)
		api.Post("/me/onboard", d.onboard)
		api.Get("/me/employee", d.myEmployee)
		api.Get("/me/assignments", d.myAssignments)
		api.Get("/me/projects", d.myProjects)
		api.Get("/me/tasks", d.myTasks)

		api.Get("/employees", d.listEmployees)
		api.Post("/employees", d.createEmployee)
		api.Get("/employees/{id}", d.getEmployee)
		api.Patch("/employees/{id}", d.updateEmployee)
		api.Get("/employees/{id}/stats", d.employeeStats)
		api.Get("/employees/{id}/skills", d.listEmployeeSkills)
		api.Post("/employees/{id}/skills", d.createEmployeeSkill)

		api.Get("/workflows", d.listWorkflows)
		api.Get("/workflows/{id}", d.getWorkflow)
		api.Get("/workflows/{id}/version", d.getWorkflowActiveVersion)
		api.Post("/workflows/{id}/versions", d.newWorkflowVersion)
		api.Get("/workflows/{id}/employees", d.listWorkflowEmployees)
		api.Post("/workflows/{id}/employees", d.addWorkflowEmployee)
		api.Delete("/workflows/{id}/employees/{empId}", d.removeWorkflowEmployee)
		api.Get("/me/workflows", d.myWorkflows)

		api.Get("/tasks", d.listTasks)
		api.Post("/tasks", d.createTask)
		api.Get("/tasks/{id}", d.getTask)

		api.Post("/node-runs/{id}/submit", d.submitNodeRun)
		api.Post("/node-runs/{id}/review", d.voteReview)
		api.Post("/tasks/{id}/rollback", d.rollbackTask)

		api.Get("/messages", d.listMessages)
		api.Post("/messages/{id}/read", d.markRead)

		api.Get("/preview/{taskID}", d.preview)
		api.Post("/uploads", d.upload)

		// Admin-only debug: 直连 LLM (走 hermes) + 落盘 HTML 到 sandbox。
		// llm-chat 走异步 job 模式：POST 立刻返回 job_id，前端轮询 GET 取结果，
		// 避免 Next dev proxy / 任何中间层 ~30s 超时切连接。
		api.Post("/debug/llm-chat", d.debugLLMChat)
		api.Get("/debug/llm-chat/{id}", d.debugLLMChatJob)
		api.Post("/debug/save-html", d.debugSaveHTML)
		api.Get("/debug/workspace", d.debugWorkspace)
	})
	return r
}

// adminOnly 从 X-User-Id 查 user，role!=admin 返回 403。
func (d Deps) adminOnly(r *http.Request) error {
	uid := currentUserID(r)
	if uid == nil {
		return errors.New("X-User-Id required")
	}
	q := d.Store.Q()
	users, err := q.ListUsers(r.Context(), q.DefaultWorkspaceID())
	if err != nil {
		return err
	}
	for _, u := range users {
		if u.ID == *uid {
			if u.Role != "admin" {
				return errors.New("admin only")
			}
			return nil
		}
	}
	return errors.New("user not found")
}

// ---------- helpers ----------

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeErr(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]any{"error": err.Error()})
}

func uuidParam(r *http.Request, k string) (uuid.UUID, error) {
	v := chi.URLParam(r, k)
	return uuid.Parse(v)
}

func currentUserID(r *http.Request) *uuid.UUID {
	v := r.Header.Get("X-User-Id")
	if v == "" {
		return nil
	}
	id, err := uuid.Parse(v)
	if err != nil {
		return nil
	}
	return &id
}

// ---------- handlers ----------

func (d Deps) healthz(w http.ResponseWriter, r *http.Request) {
	dbOK := false
	mode := "memory"
	if d.Store != nil {
		mode = d.Store.Mode()
		if d.Store.Pool != nil {
			dbOK = d.Store.Pool.Ping(r.Context()) == nil
		} else {
			dbOK = true // memory is always "ok"
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok": true, "env": d.Cfg.Env, "ts": time.Now().UTC().Format(time.RFC3339),
		"db": dbOK, "mode": mode, "llm": d.Cfg.Env,
	})
}

func (d Deps) getMe(w http.ResponseWriter, r *http.Request) {
	// MVP: header X-User-Id selects identity; if missing, return the admin.
	q := d.Store.Q()
	if uid := currentUserID(r); uid != nil {
		users, err := q.ListUsers(r.Context(), q.DefaultWorkspaceID())
		if err != nil {
			writeErr(w, 500, err)
			return
		}
		for _, u := range users {
			if u.ID == *uid {
				writeJSON(w, 200, u)
				return
			}
		}
	}
	u, err := q.UserByRole(r.Context(), q.DefaultWorkspaceID(), "admin")
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 200, u)
}

type registerBody struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// register is MVP "假注册"：仅录入用户名 + 密码，创建一个 role='pending' 的 User。
// 用户随后登录，在 onboard 弹窗里选择员工类型与 IM。
func (d Deps) register(w http.ResponseWriter, r *http.Request) {
	var b registerBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		writeErr(w, 400, err)
		return
	}
	username := strings.TrimSpace(b.Username)
	password := b.Password
	if username == "" || password == "" {
		writeErr(w, 400, errors.New("username/password required"))
		return
	}
	q := d.Store.Q()
	wsID := q.DefaultWorkspaceID()
	if _, err := q.UserByUsername(r.Context(), wsID, username); err == nil {
		writeErr(w, 409, errors.New("username already taken"))
		return
	}
	u, err := q.CreateUser(r.Context(), store.CreateUserParams{
		WorkspaceID: wsID,
		Name:        username,
		Email:       username + "@meta-staff.local",
		Username:    &username,
		Password:    password,
		Role:        "pending",
	})
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 201, map[string]any{"user": u})
}

type loginBody struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// login 通过用户名 + 密码查找 User。返回的 User 包含 role —— 若 role='pending'，
// 前端应弹出 onboard 模态完成角色 + IM 录入。
func (d Deps) login(w http.ResponseWriter, r *http.Request) {
	var b loginBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		writeErr(w, 400, err)
		return
	}
	username := strings.TrimSpace(b.Username)
	if username == "" || b.Password == "" {
		writeErr(w, 400, errors.New("username/password required"))
		return
	}
	q := d.Store.Q()
	u, err := q.UserByUsername(r.Context(), q.DefaultWorkspaceID(), username)
	if err != nil {
		writeErr(w, 404, errors.New("not registered"))
		return
	}
	if u.Password != b.Password {
		writeErr(w, 401, errors.New("invalid password"))
		return
	}
	writeJSON(w, 200, u)
}

type onboardBody struct {
	Kind         string `json:"kind"` // 'admin' | 'employee'
	IMProvider   string `json:"im_provider,omitempty"`
	IMExternalID string `json:"im_external_id,omitempty"`
	IMHandle     string `json:"im_handle,omitempty"`
}

// onboard 完成注册第二步：选员工类型；若为普通员工，绑定 IM 并创建对应 Employee 记录。
func (d Deps) onboard(w http.ResponseWriter, r *http.Request) {
	uid := currentUserID(r)
	if uid == nil {
		writeErr(w, 401, errors.New("X-User-Id required"))
		return
	}
	var b onboardBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		writeErr(w, 400, err)
		return
	}
	if b.Kind != "admin" && b.Kind != "employee" {
		writeErr(w, 400, errors.New("kind must be admin|employee"))
		return
	}
	q := d.Store.Q()
	wsID := q.DefaultWorkspaceID()
	role := "admin"
	if b.Kind == "employee" {
		role = "member"
	}
	u, err := q.UpdateUserRole(r.Context(), *uid, role)
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	resp := map[string]any{"user": u}
	if b.Kind == "employee" {
		userID := u.ID
		prompt := "你代表真实员工 · 在工作流节点上提供人工确认。"
		toolsRaw, _ := json.Marshal([]string{"search-skill"})
		avatar := "u"
		var prov, ext, handle *string
		if b.IMProvider != "" {
			prov = &b.IMProvider
		}
		if b.IMExternalID != "" {
			ext = &b.IMExternalID
		}
		if b.IMHandle != "" {
			handle = &b.IMHandle
		}
		emp, err := q.CreateEmployee(r.Context(), store.CreateEmployeeParams{
			WorkspaceID:  wsID,
			Role:         "member",
			Name:         u.Name,
			Avatar:       &avatar,
			SystemPrompt: prompt,
			Tools:        toolsRaw,
			Model:        "claude-opus-4-7",
			BoundUserID:  &userID,
			IMProvider:   prov,
			IMExternalID: ext,
			IMHandle:     handle,
			IsActive:     true,
		})
		if err == nil {
			resp["employee"] = emp
		}
	}
	writeJSON(w, 200, resp)
}

// myEmployee 返回当前登录用户绑定的 Employee 记录（个人信息抽屉使用）。
func (d Deps) myEmployee(w http.ResponseWriter, r *http.Request) {
	uid := currentUserID(r)
	if uid == nil {
		writeErr(w, 401, errors.New("X-User-Id required"))
		return
	}
	emp, err := d.Store.Q().EmployeeByUserID(r.Context(), *uid)
	if err != nil {
		writeJSON(w, 200, nil)
		return
	}
	writeJSON(w, 200, emp)
}

// myProjects 返回当前员工被绑定的工作流（按当前默认工作流的 DAG 看 assignee_employee_ids）。
// 每个项目带 has_active_task：是否有 awaiting_human 节点正等他处理（用于列表角标）。
func (d Deps) myProjects(w http.ResponseWriter, r *http.Request) {
	uid := currentUserID(r)
	if uid == nil {
		writeErr(w, 401, errors.New("X-User-Id required"))
		return
	}
	q := d.Store.Q()
	emp, err := q.EmployeeByUserID(r.Context(), *uid)
	if err != nil {
		writeJSON(w, 200, map[string]any{"projects": []any{}})
		return
	}
	wsID := q.DefaultWorkspaceID()
	wfs, _ := q.ListWorkflows(r.Context(), wsID)

	type projectDTO struct {
		Workflow      model.Workflow `json:"workflow"`
		HasActiveTask bool           `json:"has_active_task"`
		ActiveTasks   int            `json:"active_tasks"`
		BoundNodeKeys []string       `json:"bound_node_keys"`
	}
	out := []projectDTO{}
	empIDStr := emp.ID.String()
	for _, wf := range wfs {
		wv, err := q.WorkflowActiveVersion(r.Context(), wf.ID)
		if err != nil {
			continue
		}
		dag, err := model.ParseDAG(wv.DAG)
		if err != nil {
			continue
		}
		bound := []string{}
		for _, n := range dag.Nodes {
			for _, id := range n.AssigneeEmployeeIDs {
				if id == empIDStr {
					bound = append(bound, n.Key)
					break
				}
			}
		}
		if len(bound) == 0 {
			continue
		}
		active := 0
		tasks, _ := q.ListTasks(r.Context(), wsID)
		for _, t := range tasks {
			if t.WorkflowVersionID != wv.ID {
				continue
			}
			runs, _ := q.ListNodeRunsByTask(r.Context(), t.ID)
			for _, run := range runs {
				if run.Status != model.StatusAwaitingHuman {
					continue
				}
				for _, k := range bound {
					if run.NodeKey == k {
						active++
						break
					}
				}
			}
		}
		out = append(out, projectDTO{
			Workflow:      wf,
			HasActiveTask: active > 0,
			ActiveTasks:   active,
			BoundNodeKeys: bound,
		})
	}
	writeJSON(w, 200, map[string]any{"projects": out})
}

// myTasks returns 全部当前用户能"看到"的需求 —— 用户作为成员加入的工作流里
// 的所有任务。每条任务额外标记：
//   - bound_node_keys: 用户被分配到的节点（在该任务的 DAG 上）
//   - at_my_node: 是否有任意一个绑定节点当前处于 awaiting_human（红点）
//   - current_node_key: 当前最新非完成节点（用于"运行到哪一步"展示）
// admin 看到全部工作流的全部任务。
func (d Deps) myTasks(w http.ResponseWriter, r *http.Request) {
	uid := currentUserID(r)
	if uid == nil {
		writeErr(w, 401, errors.New("X-User-Id required"))
		return
	}
	q := d.Store.Q()
	wsID := q.DefaultWorkspaceID()

	users, _ := q.ListUsers(r.Context(), wsID)
	var role string
	for _, u := range users {
		if u.ID == *uid {
			role = u.Role
			break
		}
	}

	// 收集"我属于的工作流"和"我作为员工的 ID"
	var empID string
	myWorkflowIDs := map[string]bool{}
	if role == "admin" {
		wfs, _ := q.ListWorkflows(r.Context(), wsID)
		for _, wf := range wfs {
			myWorkflowIDs[wf.ID.String()] = true
		}
	} else {
		emp, err := q.EmployeeByUserID(r.Context(), *uid)
		if err != nil {
			writeJSON(w, 200, map[string]any{"tasks": []any{}})
			return
		}
		empID = emp.ID.String()
		ids, _ := q.ListWorkflowsByEmployee(r.Context(), emp.ID)
		for _, id := range ids {
			myWorkflowIDs[id.String()] = true
		}
	}

	// workflow_version_id → workflow_id 的缓存（避免每个任务多查一次）
	vvCache := map[string]uuid.UUID{}

	type item struct {
		Task           model.Task `json:"task"`
		WorkflowID     string     `json:"workflow_id"`
		BoundNodeKeys  []string   `json:"bound_node_keys"`
		AtMyNode       bool       `json:"at_my_node"`
		CurrentNodeKey string     `json:"current_node_key"`
	}
	out := []item{}
	tasks, _ := q.ListTasks(r.Context(), wsID)
	for _, t := range tasks {
		wfIDStr, ok := vvCache[t.WorkflowVersionID.String()]
		if !ok {
			wv, err := q.WorkflowVersion(r.Context(), t.WorkflowVersionID)
			if err != nil {
				continue
			}
			wfIDStr = wv.WorkflowID
			vvCache[t.WorkflowVersionID.String()] = wfIDStr
		}
		if !myWorkflowIDs[wfIDStr.String()] {
			continue
		}
		wv, err := q.WorkflowVersion(r.Context(), t.WorkflowVersionID)
		if err != nil {
			continue
		}
		dag, _ := model.ParseDAG(wv.DAG)
		bound := []string{}
		if empID != "" {
			for _, n := range dag.Nodes {
				for _, id := range n.AssigneeEmployeeIDs {
					if id == empID {
						bound = append(bound, n.Key)
						break
					}
				}
			}
		}
		runs, _ := q.ListNodeRunsByTask(r.Context(), t.ID)
		atMine := false
		currentNode := ""
		for _, run := range runs {
			if run.Status == model.StatusDone || run.Status == model.StatusRolledBack {
				continue
			}
			currentNode = run.NodeKey
			if run.Status == model.StatusAwaitingHuman {
				for _, k := range bound {
					if run.NodeKey == k {
						atMine = true
						break
					}
				}
			}
		}
		out = append(out, item{
			Task:           t,
			WorkflowID:     wfIDStr.String(),
			BoundNodeKeys:  bound,
			AtMyNode:       atMine,
			CurrentNodeKey: currentNode,
		})
	}
	writeJSON(w, 200, map[string]any{"tasks": out})
}

// myAssignments returns tasks where the current user has at least one
// awaiting node — i.e. their "todo list" upon login.
func (d Deps) myAssignments(w http.ResponseWriter, r *http.Request) {
	uid := currentUserID(r)
	if uid == nil {
		writeErr(w, 401, errors.New("X-User-Id required"))
		return
	}
	q := d.Store.Q()
	emp, err := q.EmployeeByUserID(r.Context(), *uid)
	if err != nil {
		writeJSON(w, 200, map[string]any{"tasks": []any{}})
		return
	}
	tasks, _ := q.ListTasks(r.Context(), q.DefaultWorkspaceID())
	type item struct {
		Task    model.Task    `json:"task"`
		NodeRun model.NodeRun `json:"node_run"`
	}
	out := []item{}
	for _, t := range tasks {
		wv, err := q.WorkflowVersion(r.Context(), t.WorkflowVersionID)
		if err != nil {
			continue
		}
		dag, _ := model.ParseDAG(wv.DAG)
		runs, _ := q.ListNodeRunsByTask(r.Context(), t.ID)
		for _, run := range runs {
			if run.Status != model.StatusAwaitingHuman {
				continue
			}
			node, ok := dag.Node(run.NodeKey)
			if !ok {
				continue
			}
			for _, idStr := range node.AssigneeEmployeeIDs {
				if idStr == emp.ID.String() {
					out = append(out, item{Task: t, NodeRun: run})
					break
				}
			}
		}
	}
	writeJSON(w, 200, map[string]any{"tasks": out})
}

type updateEmployeeBody struct {
	Name         *string  `json:"name,omitempty"`
	Avatar       *string  `json:"avatar,omitempty"`
	SystemPrompt *string  `json:"system_prompt,omitempty"`
	Tools        []string `json:"tools,omitempty"`
	Model        *string  `json:"model,omitempty"`
	IMProvider   *string  `json:"im_provider,omitempty"`
	IMExternalID *string  `json:"im_external_id,omitempty"`
	IMHandle     *string  `json:"im_handle,omitempty"`
	IsActive     *bool    `json:"is_active,omitempty"`
}

func (d Deps) updateEmployee(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "id")
	if err != nil {
		writeErr(w, 400, err)
		return
	}
	var b updateEmployeeBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		writeErr(w, 400, err)
		return
	}
	p := store.UpdateEmployeeParams{
		Name: b.Name, Avatar: b.Avatar, SystemPrompt: b.SystemPrompt,
		Model: b.Model, IMProvider: b.IMProvider,
		IMExternalID: b.IMExternalID, IMHandle: b.IMHandle, IsActive: b.IsActive,
	}
	if b.Tools != nil {
		raw, _ := json.Marshal(b.Tools)
		p.Tools = raw
	}
	emp, err := d.Store.Q().UpdateEmployee(r.Context(), id, p)
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 200, emp)
}

func (d Deps) listUsers(w http.ResponseWriter, r *http.Request) {
	q := d.Store.Q()
	users, err := q.ListUsers(r.Context(), q.DefaultWorkspaceID())
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 200, users)
}

func (d Deps) listEmployees(w http.ResponseWriter, r *http.Request) {
	q := d.Store.Q()
	emps, err := q.ListEmployees(r.Context(), q.DefaultWorkspaceID())
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 200, emps)
}

type createEmployeeBody struct {
	// Kind = "digital" (默认，AI 员工) 或 "human" (人类员工，绑定一个已存在 user_id)
	Kind         string   `json:"kind,omitempty"`
	Role         string   `json:"role"`
	Name         string   `json:"name"`
	Avatar       *string  `json:"avatar"`
	SystemPrompt string   `json:"system_prompt"`
	Tools        []string `json:"tools"`
	Model        string   `json:"model"`
	// human 模式必填：要绑定的 user_id
	UserID       string   `json:"user_id,omitempty"`
	IMProvider   string   `json:"im_provider,omitempty"`
	IMExternalID string   `json:"im_external_id,omitempty"`
	IMHandle     string   `json:"im_handle,omitempty"`
}

// createEmployee 创建员工。kind=digital(默认) 为纯 AI 员工；kind=human 为
// 人类员工，必须提供已存在 user_id，绑定到该 user。
func (d Deps) createEmployee(w http.ResponseWriter, r *http.Request) {
	var b createEmployeeBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		writeErr(w, 400, err)
		return
	}
	kind := strings.TrimSpace(b.Kind)
	if kind == "" {
		kind = "digital"
	}
	if kind != "digital" && kind != "human" {
		writeErr(w, 400, errors.New("kind must be digital|human"))
		return
	}
	q := d.Store.Q()
	wsID := q.DefaultWorkspaceID()

	if kind == "human" {
		uid, err := uuid.Parse(b.UserID)
		if err != nil {
			writeErr(w, 400, errors.New("human employee requires valid user_id"))
			return
		}
		u, err := q.GetUser(r.Context(), uid)
		if err != nil {
			writeErr(w, 400, errors.New("user not found"))
			return
		}
		if _, err := q.EmployeeByUserID(r.Context(), uid); err == nil {
			writeErr(w, 409, errors.New("user already bound to an employee"))
			return
		}
		name := strings.TrimSpace(b.Name)
		if name == "" {
			name = u.Name
		}
		role := strings.TrimSpace(b.Role)
		if role == "" {
			role = "member"
		}
		prompt := strings.TrimSpace(b.SystemPrompt)
		if prompt == "" {
			prompt = "你代表真实员工 · 在工作流节点上提供人工确认与决策。"
		}
		toolsRaw, _ := json.Marshal([]string{"search-skill"})
		var prov, ext, handle *string
		if b.IMProvider != "" {
			prov = &b.IMProvider
		}
		if b.IMExternalID != "" {
			ext = &b.IMExternalID
		}
		if b.IMHandle != "" {
			handle = &b.IMHandle
		}
		e, err := q.CreateEmployee(r.Context(), store.CreateEmployeeParams{
			WorkspaceID:  wsID,
			Role:         role,
			Name:         name,
			Avatar:       b.Avatar,
			SystemPrompt: prompt,
			Tools:        toolsRaw,
			Model:        "claude-opus-4-7",
			BoundUserID:  &uid,
			IMProvider:   prov,
			IMExternalID: ext,
			IMHandle:     handle,
			IsActive:     true,
		})
		if err != nil {
			writeErr(w, 500, err)
			return
		}
		writeJSON(w, 201, e)
		return
	}

	// digital
	if b.Role == "" || b.Name == "" || b.SystemPrompt == "" {
		writeErr(w, 400, errors.New("role/name/system_prompt required"))
		return
	}
	tools, _ := json.Marshal(b.Tools)
	e, err := q.CreateEmployee(r.Context(), store.CreateEmployeeParams{
		WorkspaceID:  wsID,
		Role:         b.Role,
		Name:         b.Name,
		Avatar:       b.Avatar,
		SystemPrompt: b.SystemPrompt,
		Tools:        tools,
		Model:        b.Model,
		IsActive:     true,
	})
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 201, e)
}

// listWorkflowEmployees 返回某个工作流绑定的全部员工（完整 Employee 对象）。
func (d Deps) listWorkflowEmployees(w http.ResponseWriter, r *http.Request) {
	wfID, err := uuidParam(r, "id")
	if err != nil {
		writeErr(w, 400, err)
		return
	}
	q := d.Store.Q()
	ids, err := q.ListWorkflowEmployees(r.Context(), wfID)
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	out := []model.Employee{}
	for _, id := range ids {
		e, err := q.GetEmployee(r.Context(), id)
		if err == nil {
			out = append(out, e)
		}
	}
	writeJSON(w, 200, out)
}

type wfEmployeeBody struct {
	EmployeeID string `json:"employee_id"`
}

// addWorkflowEmployee 把员工加入工作流。仅 admin 可调用。
func (d Deps) addWorkflowEmployee(w http.ResponseWriter, r *http.Request) {
	if err := d.adminOnly(r); err != nil {
		writeErr(w, 403, err)
		return
	}
	wfID, err := uuidParam(r, "id")
	if err != nil {
		writeErr(w, 400, err)
		return
	}
	var b wfEmployeeBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		writeErr(w, 400, err)
		return
	}
	empID, err := uuid.Parse(b.EmployeeID)
	if err != nil {
		writeErr(w, 400, errors.New("invalid employee_id"))
		return
	}
	if err := d.Store.Q().AddWorkflowEmployee(r.Context(), wfID, empID); err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 201, map[string]any{"ok": true})
}

// removeWorkflowEmployee 把员工移出工作流。仅 admin 可调用。
func (d Deps) removeWorkflowEmployee(w http.ResponseWriter, r *http.Request) {
	if err := d.adminOnly(r); err != nil {
		writeErr(w, 403, err)
		return
	}
	wfID, err := uuidParam(r, "id")
	if err != nil {
		writeErr(w, 400, err)
		return
	}
	empID, err := uuid.Parse(chi.URLParam(r, "empId"))
	if err != nil {
		writeErr(w, 400, errors.New("invalid empId"))
		return
	}
	if err := d.Store.Q().RemoveWorkflowEmployee(r.Context(), wfID, empID); err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// myWorkflows 返回当前登录用户所属（其 Employee 已加入）的工作流列表。
// 用于"创建需求"前的工作流选择。admin 不受限制 — 返回全部工作流。
func (d Deps) myWorkflows(w http.ResponseWriter, r *http.Request) {
	uid := currentUserID(r)
	if uid == nil {
		writeErr(w, 401, errors.New("X-User-Id required"))
		return
	}
	q := d.Store.Q()
	users, _ := q.ListUsers(r.Context(), q.DefaultWorkspaceID())
	var role string
	for _, u := range users {
		if u.ID == *uid {
			role = u.Role
			break
		}
	}
	if role == "admin" {
		wfs, err := q.ListWorkflows(r.Context(), q.DefaultWorkspaceID())
		if err != nil {
			writeErr(w, 500, err)
			return
		}
		writeJSON(w, 200, wfs)
		return
	}
	emp, err := q.EmployeeByUserID(r.Context(), *uid)
	if err != nil {
		writeJSON(w, 200, []model.Workflow{})
		return
	}
	ids, _ := q.ListWorkflowsByEmployee(r.Context(), emp.ID)
	out := []model.Workflow{}
	for _, id := range ids {
		// reuse listWorkflows + filter; cheap given small N
		wfs, _ := q.ListWorkflows(r.Context(), q.DefaultWorkspaceID())
		for _, wf := range wfs {
			if wf.ID == id {
				out = append(out, wf)
				break
			}
		}
	}
	writeJSON(w, 200, out)
}

func (d Deps) listWorkflows(w http.ResponseWriter, r *http.Request) {
	q := d.Store.Q()
	wfs, err := q.ListWorkflows(r.Context(), q.DefaultWorkspaceID())
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 200, wfs)
}

func (d Deps) getWorkflow(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "id")
	if err != nil {
		writeErr(w, 400, err)
		return
	}
	q := d.Store.Q()
	wfs, err := q.ListWorkflows(r.Context(), q.DefaultWorkspaceID())
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	for _, wf := range wfs {
		if wf.ID == id {
			writeJSON(w, 200, wf)
			return
		}
	}
	writeErr(w, 404, errors.New("workflow not found"))
}

func (d Deps) getWorkflowActiveVersion(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "id")
	if err != nil {
		writeErr(w, 400, err)
		return
	}
	v, err := d.Store.Q().WorkflowActiveVersion(r.Context(), id)
	if err != nil {
		writeErr(w, 404, err)
		return
	}
	writeJSON(w, 200, v)
}

type newVersionBody struct {
	DAG json.RawMessage `json:"dag"`
}

func (d Deps) newWorkflowVersion(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "id")
	if err != nil {
		writeErr(w, 400, err)
		return
	}
	var b newVersionBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		writeErr(w, 400, err)
		return
	}
	v, err := d.Store.Q().NewWorkflowVersion(r.Context(), store.UpsertWorkflowVersionParams{
		WorkflowID: id, DAG: b.DAG,
	})
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 201, v)
}

func (d Deps) listTasks(w http.ResponseWriter, r *http.Request) {
	q := d.Store.Q()
	t, err := q.ListTasks(r.Context(), q.DefaultWorkspaceID())
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 200, t)
}

type createTaskBody struct {
	WorkflowID  *string          `json:"workflow_id,omitempty"`
	Title       string           `json:"title"`
	Source      string           `json:"source"`
	Content     string           `json:"content"`
	Attachments []map[string]any `json:"attachments,omitempty"`
	UserID      *string          `json:"user_id"`
}

func (d Deps) createTask(w http.ResponseWriter, r *http.Request) {
	var b createTaskBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		writeErr(w, 400, err)
		return
	}
	if b.Title == "" || b.Content == "" {
		writeErr(w, 400, errors.New("title and content required"))
		return
	}
	if b.Source == "" {
		b.Source = "product"
	}
	q := d.Store.Q()
	var wf model.Workflow
	if b.WorkflowID != nil && *b.WorkflowID != "" {
		wid, err := uuid.Parse(*b.WorkflowID)
		if err != nil {
			writeErr(w, 400, errors.New("invalid workflow_id"))
			return
		}
		wfs, err := q.ListWorkflows(r.Context(), q.DefaultWorkspaceID())
		if err != nil {
			writeErr(w, 500, err)
			return
		}
		var found bool
		for _, x := range wfs {
			if x.ID == wid {
				wf = x
				found = true
				break
			}
		}
		if !found {
			writeErr(w, 404, errors.New("workflow not found"))
			return
		}
	} else {
		var err error
		wf, err = q.DefaultWorkflow(r.Context(), q.DefaultWorkspaceID())
		if err != nil {
			writeErr(w, 500, err)
			return
		}
	}
	wv, err := q.WorkflowActiveVersion(r.Context(), wf.ID)
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	var uid *uuid.UUID
	if b.UserID != nil && *b.UserID != "" {
		if parsed, err := uuid.Parse(*b.UserID); err == nil {
			uid = &parsed
		}
	}
	if uid == nil {
		uid = currentUserID(r)
	}
	t, err := d.Engine.StartTaskWithIntake(r.Context(), workflow.StartParams{
		WorkspaceID:       q.DefaultWorkspaceID(),
		WorkflowVersionID: wv.ID,
		Title:             b.Title,
		Source:            b.Source,
		Content:           b.Content,
		Attachments:       b.Attachments,
		CreatedBy:         uid,
	})
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 201, t)
}

func (d Deps) getTask(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "id")
	if err != nil {
		writeErr(w, 400, err)
		return
	}
	q := d.Store.Q()
	t, err := q.GetTask(r.Context(), id)
	if err != nil {
		writeErr(w, 404, err)
		return
	}
	runs, _ := q.ListNodeRunsByTask(r.Context(), id)
	wv, _ := q.WorkflowVersion(r.Context(), t.WorkflowVersionID)
	type nodeRunDTO struct {
		Run       any   `json:"run"`
		Artifacts any   `json:"artifacts"`
		Reviews   any   `json:"reviews"`
	}
	out := map[string]any{
		"task":             t,
		"workflow_version": wv,
		"node_runs":        []nodeRunDTO{},
	}
	dtos := []nodeRunDTO{}
	for _, n := range runs {
		arts, _ := q.ListArtifactsByRun(r.Context(), n.ID)
		revs, _ := q.ListReviews(r.Context(), n.ID)
		if arts == nil {
			arts = []model.Artifact{}
		}
		if revs == nil {
			revs = []model.Review{}
		}
		dtos = append(dtos, nodeRunDTO{Run: n, Artifacts: arts, Reviews: revs})
	}
	out["node_runs"] = dtos
	writeJSON(w, 200, out)
}

type submitNodeBody struct {
	Kind    string          `json:"kind"`
	Payload json.RawMessage `json:"payload"`
}

func (d Deps) submitNodeRun(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "id")
	if err != nil {
		writeErr(w, 400, err)
		return
	}
	var b submitNodeBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		writeErr(w, 400, err)
		return
	}
	if len(b.Payload) == 0 {
		b.Payload = json.RawMessage("{}")
	}
	if err := d.Engine.SubmitHumanArtifact(r.Context(), id, b.Kind, b.Payload); err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 202, map[string]any{"ok": true})
}

type voteBody struct {
	ReviewerUserID    string  `json:"reviewer_user_id"`
	ReviewerRole      string  `json:"reviewer_role"`
	Vote              string  `json:"vote"`
	RollbackToNodeKey *string `json:"rollback_to_node_key"`
	Comment           *string `json:"comment"`
}

func (d Deps) voteReview(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "id")
	if err != nil {
		writeErr(w, 400, err)
		return
	}
	var b voteBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		writeErr(w, 400, err)
		return
	}
	uid, err := uuid.Parse(b.ReviewerUserID)
	if err != nil {
		writeErr(w, 400, errors.New("invalid reviewer_user_id"))
		return
	}
	if b.Vote != "approve" && b.Vote != "reject" {
		writeErr(w, 400, errors.New("vote must be approve|reject"))
		return
	}
	if err := d.Engine.Vote(r.Context(), id, store.UpsertReviewParams{
		ReviewerUserID:    uid,
		ReviewerRole:      b.ReviewerRole,
		Vote:              &b.Vote,
		RollbackToNodeKey: b.RollbackToNodeKey,
		Comment:           b.Comment,
	}); err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 202, map[string]any{"ok": true})
}

type rollbackBody struct {
	ToNodeKey string `json:"to_node_key"`
}

func (d Deps) rollbackTask(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "id")
	if err != nil {
		writeErr(w, 400, err)
		return
	}
	var b rollbackBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		writeErr(w, 400, err)
		return
	}
	if b.ToNodeKey == "" {
		writeErr(w, 400, errors.New("to_node_key required"))
		return
	}
	if err := d.Engine.RollbackTo(r.Context(), id, b.ToNodeKey); err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 202, map[string]any{"ok": true})
}

func (d Deps) listMessages(w http.ResponseWriter, r *http.Request) {
	q := d.Store.Q()
	uid := currentUserID(r)
	ms, err := q.ListMessages(r.Context(), q.DefaultWorkspaceID(), uid, 50)
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 200, ms)
}

func (d Deps) markRead(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "id")
	if err != nil {
		writeErr(w, 400, err)
		return
	}
	if err := d.Store.Q().MarkMessageRead(r.Context(), id); err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (d Deps) getEmployee(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "id")
	if err != nil {
		writeErr(w, 400, err)
		return
	}
	e, err := d.Store.Q().GetEmployee(r.Context(), id)
	if err != nil {
		writeErr(w, 404, err)
		return
	}
	writeJSON(w, 200, e)
}

func (d Deps) employeeStats(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "id")
	if err != nil {
		writeErr(w, 400, err)
		return
	}
	q := d.Store.Q()
	tasks, _ := q.ListTasks(r.Context(), q.DefaultWorkspaceID())
	var total, won, lost int
	type recent struct {
		TaskID    uuid.UUID `json:"task_id"`
		Title     string    `json:"title"`
		NodeKey   string    `json:"node_key"`
		Status    string    `json:"status"`
		CreatedAt string    `json:"created_at"`
	}
	recents := []recent{}
	for _, t := range tasks {
		runs, _ := q.ListNodeRunsByTask(r.Context(), t.ID)
		for _, n := range runs {
			if n.ExecutorEmployeeID == nil || *n.ExecutorEmployeeID != id {
				continue
			}
			total++
			switch n.Status {
			case model.StatusDone:
				won++
			case model.StatusFailed, model.StatusRolledBack:
				lost++
			}
			if len(recents) < 20 {
				recents = append(recents, recent{
					TaskID:    t.ID, Title: t.Title,
					NodeKey:   n.NodeKey, Status: string(n.Status),
					CreatedAt: n.CreatedAt.Format(time.RFC3339),
				})
			}
		}
	}
	winRate := 0.0
	if total > 0 {
		winRate = float64(won) / float64(total)
	}
	writeJSON(w, 200, map[string]any{
		"total_runs":  total,
		"completed":   won,
		"failed_back": lost,
		"win_rate":    winRate,
		"recent":      recents,
	})
}

func (d Deps) listEmployeeSkills(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "id")
	if err != nil {
		writeErr(w, 400, err)
		return
	}
	skills, err := d.Store.Q().ListSkillsByEmployee(r.Context(), id)
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 200, skills)
}

type createSkillBody struct {
	Summary string `json:"summary"`
}

func (d Deps) createEmployeeSkill(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "id")
	if err != nil {
		writeErr(w, 400, err)
		return
	}
	var b createSkillBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		writeErr(w, 400, err)
		return
	}
	if b.Summary == "" {
		writeErr(w, 400, errors.New("summary required"))
		return
	}
	q := d.Store.Q()
	s, err := q.CreateSkill(r.Context(), store.CreateSkillParams{
		WorkspaceID: q.DefaultWorkspaceID(),
		EmployeeID:  &id,
		Summary:     b.Summary,
	})
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 201, s)
}

// preview returns the aggregated build/deploy artifact for a task so the web
// can render a single "shipped preview" page. The recording_url + preview_url
// are surfaced; integration points for real Playwright/Docker live here.
func (d Deps) preview(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "taskID"))
	if err != nil {
		writeErr(w, 400, err)
		return
	}
	q := d.Store.Q()
	t, err := q.GetTask(r.Context(), id)
	if err != nil {
		writeErr(w, 404, err)
		return
	}
	runs, _ := q.ListNodeRunsByTask(r.Context(), id)
	out := map[string]any{"task": t}
	for _, n := range runs {
		if n.NodeKey != "build" && n.NodeKey != "deploy" {
			continue
		}
		arts, _ := q.ListArtifactsByRun(r.Context(), n.ID)
		if len(arts) == 0 {
			continue
		}
		latest := arts[len(arts)-1]
		var payload map[string]any
		_ = json.Unmarshal(latest.Payload, &payload)
		out[n.NodeKey] = payload
	}
	writeJSON(w, 200, out)
}

// upload 接收 multipart/form-data 中的 file 字段，落到 sandbox runtime/uploads，
// 返回 {url, name, size, mime, kind}。kind 由 Content-Type / 扩展名映射成 image/video/doc。
func (d Deps) upload(w http.ResponseWriter, r *http.Request) {
	if d.Sandbox == nil {
		writeErr(w, 500, errors.New("sandbox runtime dir not configured"))
		return
	}
	if err := r.ParseMultipartForm(64 << 20); err != nil { // 64 MiB
		writeErr(w, 400, err)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeErr(w, 400, errors.New("missing 'file' field"))
		return
	}
	defer file.Close()

	dir := filepath.Join(d.Sandbox.RuntimeDir, "uploads")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		writeErr(w, 500, err)
		return
	}
	ext := filepath.Ext(header.Filename)
	id := uuid.New().String()
	dest := filepath.Join(dir, id+ext)
	out, err := os.Create(dest)
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	defer out.Close()
	if _, err := io.Copy(out, file); err != nil {
		writeErr(w, 500, err)
		return
	}

	mime := header.Header.Get("Content-Type")
	kind := classifyMIME(mime, ext)
	writeJSON(w, 201, map[string]any{
		"url":  "/static/uploads/" + id + ext,
		"name": header.Filename,
		"size": header.Size,
		"mime": mime,
		"kind": kind,
	})
}

func classifyMIME(mime, ext string) string {
	m := strings.ToLower(mime)
	e := strings.ToLower(ext)
	if strings.HasPrefix(m, "image/") {
		return "image"
	}
	if strings.HasPrefix(m, "video/") {
		return "video"
	}
	switch e {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg":
		return "image"
	case ".mp4", ".mov", ".webm", ".m4v":
		return "video"
	}
	return "doc"
}

// ---- Admin debug: 直连 hermes + 落盘 HTML ----

type debugChatBody struct {
	Prompt string `json:"prompt"`
	System string `json:"system,omitempty"`
}

// debugJob 后台运行的 LLM 调用结果。
type debugJob struct {
	ID        string    `json:"id"`
	Status    string    `json:"status"` // running | done | error
	Provider  string    `json:"provider,omitempty"`
	Text      string    `json:"text,omitempty"`
	Error     string    `json:"error,omitempty"`
	StartedAt time.Time `json:"started_at"`
	TookMS    int64     `json:"took_ms,omitempty"`
}

var (
	debugJobsMu sync.Mutex
	debugJobs   = map[string]*debugJob{}
)

// debugLLMChat 启一个后台 goroutine 调 LLM (Default()=hermes)，立刻返回 job_id。
// hermes agent loop 经常 30s+，超过 Next dev proxy 默认超时，因此走异步。
func (d Deps) debugLLMChat(w http.ResponseWriter, r *http.Request) {
	if err := d.adminOnly(r); err != nil {
		writeErr(w, 403, err)
		return
	}
	var b debugChatBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		writeErr(w, 400, err)
		return
	}
	if strings.TrimSpace(b.Prompt) == "" {
		writeErr(w, 400, errors.New("prompt required"))
		return
	}
	if d.LLM == nil {
		writeErr(w, 500, errors.New("llm provider not configured"))
		return
	}
	id := uuid.New().String()
	job := &debugJob{ID: id, Status: "running", Provider: d.LLM.Name(), StartedAt: time.Now()}
	debugJobsMu.Lock()
	debugJobs[id] = job
	debugJobsMu.Unlock()

	system := b.System
	prompt := b.Prompt
	provider := d.LLM
	go func() {
		// 不绑 r.Context()，请求早就返回了。用 background + 10 分钟硬上限。
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()
		out, err := provider.Complete(ctx, llm.Request{
			System:   system,
			Messages: []llm.Message{{Role: "user", Content: prompt}},
		})
		debugJobsMu.Lock()
		defer debugJobsMu.Unlock()
		job.TookMS = time.Since(job.StartedAt).Milliseconds()
		if err != nil {
			job.Status = "error"
			job.Error = err.Error()
			return
		}
		job.Status = "done"
		job.Text = out
	}()

	writeJSON(w, 202, map[string]any{"job_id": id, "status": "running"})
}

// debugWorkspace 递归列出 HermesWorkspaceDir 下所有文件，按 mtime 倒序，最多 200 个。
// 用于调试台展示"hermes 在 /workspace 下到底写了什么"。
func (d Deps) debugWorkspace(w http.ResponseWriter, r *http.Request) {
	if err := d.adminOnly(r); err != nil {
		writeErr(w, 403, err)
		return
	}
	root := d.Cfg.HermesWorkspaceDir
	if root == "" {
		writeJSON(w, 200, map[string]any{"enabled": false, "files": []any{}})
		return
	}
	type entry struct {
		Path string `json:"path"` // relative to root
		URL  string `json:"url"`
		Size int64  `json:"size"`
		Mod  string `json:"modified"`
	}
	// 注意：必须 []entry{} 初始化，不能 var []entry（nil），否则序列化成 JSON null
	// 前端会在 (null).length 上崩。
	out := []entry{}
	filepath.Walk(root, func(p string, info os.FileInfo, err error) error {
		if err != nil || info == nil || info.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel(root, p)
		rel = filepath.ToSlash(rel)
		out = append(out, entry{
			Path: rel,
			URL:  "/static/workspace/" + rel,
			Size: info.Size(),
			Mod:  info.ModTime().UTC().Format(time.RFC3339),
		})
		return nil
	})
	// mtime desc
	sort.Slice(out, func(i, j int) bool { return out[i].Mod > out[j].Mod })
	if len(out) > 200 {
		out = out[:200]
	}
	writeJSON(w, 200, map[string]any{"enabled": true, "root": root, "files": out})
}

// debugLLMChatJob 查询 job 状态/结果。前端每隔 2s 轮询一次直到 status != running。
func (d Deps) debugLLMChatJob(w http.ResponseWriter, r *http.Request) {
	if err := d.adminOnly(r); err != nil {
		writeErr(w, 403, err)
		return
	}
	id := chi.URLParam(r, "id")
	debugJobsMu.Lock()
	job, ok := debugJobs[id]
	debugJobsMu.Unlock()
	if !ok {
		writeErr(w, 404, errors.New("job not found"))
		return
	}
	writeJSON(w, 200, job)
}

type debugSaveBody struct {
	Name string `json:"name"` // e.g. "snake.html"; basename only, slashes rejected
	HTML string `json:"html"`
}

// debugSaveHTML 把任意 HTML 落到 sandbox.RuntimeDir/uploads/<name>，通过已有
// /static/* 静态托管暴露成可浏览 URL。基本卫生：name 不能含 / 或 ..。
func (d Deps) debugSaveHTML(w http.ResponseWriter, r *http.Request) {
	if err := d.adminOnly(r); err != nil {
		writeErr(w, 403, err)
		return
	}
	if d.Sandbox == nil {
		writeErr(w, 500, errors.New("sandbox not configured"))
		return
	}
	var b debugSaveBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		writeErr(w, 400, err)
		return
	}
	name := strings.TrimSpace(b.Name)
	if name == "" {
		name = "debug.html"
	}
	if strings.ContainsAny(name, "/\\") || strings.Contains(name, "..") {
		writeErr(w, 400, errors.New("name must be a plain filename, no slashes"))
		return
	}
	if !strings.HasSuffix(strings.ToLower(name), ".html") {
		name += ".html"
	}
	if strings.TrimSpace(b.HTML) == "" {
		writeErr(w, 400, errors.New("html required"))
		return
	}
	dir := filepath.Join(d.Sandbox.RuntimeDir, "uploads")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		writeErr(w, 500, err)
		return
	}
	full := filepath.Join(dir, name)
	if err := os.WriteFile(full, []byte(b.HTML), 0o644); err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 201, map[string]any{
		"url":  "/static/uploads/" + name,
		"path": full,
		"name": name,
		"size": len(b.HTML),
	})
}
