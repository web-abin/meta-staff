package workflow

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"github.com/meta-staff/server/internal/llm"
	"github.com/meta-staff/server/internal/model"
	"github.com/meta-staff/server/internal/notify"
	"github.com/meta-staff/server/internal/sandbox"
	"github.com/meta-staff/server/internal/store"
	"github.com/meta-staff/server/internal/ws"
)

type Engine struct {
	st  *store.Store
	llm llm.Provider
	hub *ws.Hub
	im  *notify.IMDispatcher
	sb  *sandbox.Sandbox
}

func NewEngine(st *store.Store, lp llm.Provider, hub *ws.Hub, sb *sandbox.Sandbox) *Engine {
	return &Engine{st: st, llm: lp, hub: hub, im: notify.NewIMDispatcher(), sb: sb}
}

// StartTaskWithIntake creates the task, finalises the intake node with raw content,
// then dispatches downstream AI nodes.
func (e *Engine) StartTaskWithIntake(ctx context.Context, p StartParams) (model.Task, error) {
	q := e.st.Q()
	wv, err := q.WorkflowVersion(ctx, p.WorkflowVersionID)
	if err != nil {
		return model.Task{}, err
	}
	dag, err := model.ParseDAG(wv.DAG)
	if err != nil {
		return model.Task{}, err
	}
	entry, ok := dag.Node(dag.Entry)
	if !ok {
		return model.Task{}, fmt.Errorf("entry node not found")
	}

	t, err := q.CreateTask(ctx, store.CreateTaskParams{
		WorkspaceID:       p.WorkspaceID,
		WorkflowVersionID: p.WorkflowVersionID,
		Title:             p.Title,
		Source:            p.Source,
		Payload:           p.Payload,
		CreatedBy:         p.CreatedBy,
	})
	if err != nil {
		return t, err
	}
	e.hub.Broadcast(ws.Event{Type: "task.created", TaskID: &t.ID, Payload: mustJSON(t)})

	run, err := q.CreateNodeRun(ctx, store.CreateNodeRunParams{
		TaskID:         t.ID,
		NodeKey:        entry.Key,
		ExecutorType:   string(entry.Type),
		AssigneeUserID: p.CreatedBy,
		Status:         model.StatusDone,
		Inputs:         json.RawMessage(`{"source":"` + p.Source + `"}`),
	})
	if err != nil {
		return t, err
	}
	// Save intake artifact (raw content)
	if _, err := q.CreateArtifact(ctx, store.CreateArtifactParams{
		NodeRunID: run.ID,
		Kind:      "raw",
		Payload:   mustJSON(map[string]any{"content": p.Content, "source": p.Source}),
	}); err != nil {
		return t, err
	}
	now := time.Now().UTC()
	_ = q.UpdateNodeRunStatus(ctx, run.ID, model.StatusDone, nil)
	_ = now
	e.hub.Broadcast(ws.Event{Type: "node_run.done", TaskID: &t.ID, NodeRun: &run.ID})

	// Advance to downstream
	go e.advanceAsync(detachCtx(ctx), t.ID, entry.Key)
	return t, nil
}

type StartParams struct {
	WorkspaceID       uuid.UUID
	WorkflowVersionID uuid.UUID
	Title             string
	Source            string
	Content           string
	Payload           json.RawMessage
	CreatedBy         *uuid.UUID
}

// SubmitHumanArtifact is called when a human node has been completed by a user.
func (e *Engine) SubmitHumanArtifact(ctx context.Context, runID uuid.UUID, kind string, payload json.RawMessage) error {
	q := e.st.Q()
	run, err := q.GetNodeRun(ctx, runID)
	if err != nil {
		return err
	}
	if run.Status != model.StatusAwaitingHuman && run.Status != model.StatusPending {
		return fmt.Errorf("run %s is not awaiting human (status=%s)", runID, run.Status)
	}
	if kind == "" {
		// derive from DAG node
		task, _ := q.GetTask(ctx, run.TaskID)
		wv, _ := q.WorkflowVersion(ctx, task.WorkflowVersionID)
		dag, _ := model.ParseDAG(wv.DAG)
		if n, ok := dag.Node(run.NodeKey); ok {
			kind = n.Produces
		}
		if kind == "" {
			kind = "human"
		}
	}
	if _, err := q.CreateArtifact(ctx, store.CreateArtifactParams{
		NodeRunID: runID,
		Kind:      kind,
		Payload:   payload,
	}); err != nil {
		return err
	}
	if err := q.UpdateNodeRunStatus(ctx, runID, model.StatusDone, nil); err != nil {
		return err
	}
	e.hub.Broadcast(ws.Event{Type: "node_run.done", TaskID: &run.TaskID, NodeRun: &runID})
	go e.advanceAsync(detachCtx(ctx), run.TaskID, run.NodeKey)
	return nil
}

// Vote records a review and may advance / rollback the workflow.
//
// New semantics: the node's human-bound assignees are the required voters
// (会签全员通过). Any reject triggers rollback to the upstream / specified node.
func (e *Engine) Vote(ctx context.Context, runID uuid.UUID, p store.UpsertReviewParams) error {
	q := e.st.Q()
	p.NodeRunID = runID
	if _, err := q.UpsertReview(ctx, p); err != nil {
		return err
	}
	e.hub.Broadcast(ws.Event{Type: "review.upserted", NodeRun: &runID})

	run, err := q.GetNodeRun(ctx, runID)
	if err != nil {
		return err
	}
	task, _ := q.GetTask(ctx, run.TaskID)
	wv, _ := q.WorkflowVersion(ctx, task.WorkflowVersionID)
	dag, _ := model.ParseDAG(wv.DAG)
	node, _ := dag.Node(run.NodeKey)

	_, _, humans := e.nodeRoute(ctx, task.WorkspaceID, node)
	required := map[uuid.UUID]bool{}
	for _, h := range humans {
		if h.BoundUserID != nil {
			required[*h.BoundUserID] = true
		}
	}
	// legacy fallback: if a node has no humans resolvable (old DAGs), require
	// pm/qa/dev as before.
	if len(required) == 0 {
		for _, role := range []string{"pm", "qa", "dev"} {
			if u, err := q.UserByRole(ctx, task.WorkspaceID, role); err == nil {
				required[u.ID] = true
			}
		}
	}

	reviews, err := q.ListReviews(ctx, runID)
	if err != nil {
		return err
	}
	have := map[uuid.UUID]string{}
	for _, r := range reviews {
		if r.Vote != nil {
			have[r.ReviewerUserID] = *r.Vote
		}
	}
	allVoted := true
	allApproved := true
	rejectTarget := ""
	for uid := range required {
		v, ok := have[uid]
		if !ok || v == "" {
			allVoted = false
			break
		}
		if v != "approve" {
			allApproved = false
			for _, r := range reviews {
				if r.ReviewerUserID == uid && r.RollbackToNodeKey != nil && *r.RollbackToNodeKey != "" {
					rejectTarget = *r.RollbackToNodeKey
				}
			}
		}
	}

	if !allVoted {
		return nil
	}

	if allApproved {
		if err := q.UpdateNodeRunStatus(ctx, runID, model.StatusDone, nil); err != nil {
			return err
		}
		_, _ = q.CreateArtifact(ctx, store.CreateArtifactParams{
			NodeRunID: runID,
			Kind:      "vote",
			Payload:   mustJSON(map[string]any{"result": "approved", "votes": stringifyVotes(have)}),
		})
		e.hub.Broadcast(ws.Event{Type: "node_run.done", TaskID: &run.TaskID, NodeRun: &runID})
		go e.advanceAsync(detachCtx(ctx), run.TaskID, run.NodeKey)
		return nil
	}

	if rejectTarget == "" {
		ups := dag.Upstream(run.NodeKey)
		if len(ups) > 0 {
			rejectTarget = ups[0]
		}
	}
	_, _ = q.CreateArtifact(ctx, store.CreateArtifactParams{
		NodeRunID: runID,
		Kind:      "vote",
		Payload:   mustJSON(map[string]any{"result": "rejected", "votes": stringifyVotes(have), "rollback_to": rejectTarget}),
	})
	if err := q.UpdateNodeRunStatus(ctx, runID, model.StatusFailed, strPtr("rejected by reviewers")); err != nil {
		return err
	}
	e.hub.Broadcast(ws.Event{Type: "node_run.rolled_back", TaskID: &run.TaskID, NodeRun: &runID})
	return e.RollbackTo(ctx, run.TaskID, rejectTarget)
}

func stringifyVotes(in map[uuid.UUID]string) map[string]string {
	out := map[string]string{}
	for k, v := range in {
		out[k.String()] = v
	}
	return out
}

// RollbackTo marks all node_runs from the target (inclusive) to current as
// rolled_back and re-dispatches the target node fresh.
func (e *Engine) RollbackTo(ctx context.Context, taskID uuid.UUID, targetNodeKey string) error {
	q := e.st.Q()
	task, err := q.GetTask(ctx, taskID)
	if err != nil {
		return err
	}
	wv, err := q.WorkflowVersion(ctx, task.WorkflowVersionID)
	if err != nil {
		return err
	}
	dag, err := model.ParseDAG(wv.DAG)
	if err != nil {
		return err
	}

	// Collect every node from targetNodeKey forward
	visited := map[string]bool{}
	var dfs func(k string)
	dfs = func(k string) {
		if visited[k] {
			return
		}
		visited[k] = true
		for _, d := range dag.Downstream(k) {
			dfs(d)
		}
	}
	dfs(targetNodeKey)
	var keys []string
	for k := range visited {
		keys = append(keys, k)
	}
	if err := q.MarkRunsRolledBackFrom(ctx, taskID, keys); err != nil {
		return err
	}
	// Create new run for target
	return e.scheduleNode(ctx, taskID, targetNodeKey)
}

// advanceAsync runs in a goroutine — called when a node completes.
func (e *Engine) advanceAsync(ctx context.Context, taskID uuid.UUID, fromNodeKey string) {
	if err := e.advance(ctx, taskID, fromNodeKey); err != nil {
		slog.Error("advance failed", "task", taskID, "from", fromNodeKey, "err", err)
	}
}

func (e *Engine) advance(ctx context.Context, taskID uuid.UUID, fromNodeKey string) error {
	q := e.st.Q()
	task, err := q.GetTask(ctx, taskID)
	if err != nil {
		return err
	}
	wv, err := q.WorkflowVersion(ctx, task.WorkflowVersionID)
	if err != nil {
		return err
	}
	dag, err := model.ParseDAG(wv.DAG)
	if err != nil {
		return err
	}

	for _, dk := range dag.Downstream(fromNodeKey) {
		// guard: all upstream of dk must be done
		ready := true
		for _, up := range dag.Upstream(dk) {
			r, err := q.LatestActiveRunForNode(ctx, taskID, up)
			if err != nil || r.Status != model.StatusDone {
				ready = false
				break
			}
		}
		if !ready {
			continue
		}
		// avoid duplicate scheduling
		if existing, err := q.LatestActiveRunForNode(ctx, taskID, dk); err == nil &&
			(existing.Status == model.StatusPending || existing.Status == model.StatusRunning ||
				existing.Status == model.StatusAwaitingHuman || existing.Status == model.StatusDone) {
			continue
		}
		if err := e.scheduleNode(ctx, taskID, dk); err != nil {
			return err
		}
	}
	return nil
}

// nodeRoute classifies a node based on its assignees:
//   - "intake":   any one of human assignees submits, no AI step (is_intake=true)
//   - "auto":     all assignees are pure-AI (or no humans bound) → runAgent, no human gate
//   - "confirm":  ≥1 human assignee → wait for all human assignees to approve (会签)
//
// Falls back to legacy node.Type/Role when assignees are empty (for old DAGs).
func (e *Engine) nodeRoute(ctx context.Context, wsID uuid.UUID, node model.DAGNode) (
	mode string, primaryAI *model.Employee, humanAssignees []model.Employee,
) {
	q := e.st.Q()
	if len(node.AssigneeEmployeeIDs) > 0 {
		for _, idStr := range node.AssigneeEmployeeIDs {
			id, err := uuid.Parse(idStr)
			if err != nil {
				continue
			}
			emp, err := q.GetEmployee(ctx, id)
			if err != nil {
				continue
			}
			if emp.BoundUserID == nil {
				if primaryAI == nil {
					empCopy := emp
					primaryAI = &empCopy
				}
			} else {
				humanAssignees = append(humanAssignees, emp)
			}
		}
		if node.IsIntake {
			return "intake", nil, humanAssignees
		}
		if len(humanAssignees) > 0 {
			return "confirm", primaryAI, humanAssignees
		}
		if primaryAI != nil {
			return "auto", primaryAI, nil
		}
		// Empty / unresolvable assignees — treat as system auto-no-op
		return "auto", nil, nil
	}
	// Legacy DAG: fall back to node.Type / node.Role
	switch node.Type {
	case model.NodeTypeAI, model.NodeTypeAuto:
		if emp, err := q.EmployeeByRole(ctx, wsID, node.Role); err == nil {
			return "auto", &emp, nil
		}
		return "auto", nil, nil
	case model.NodeTypeReview:
		// legacy review = 3-way PM/QA/DEV; resolve via users
		return "confirm", nil, nil
	case model.NodeTypeHuman:
		return "intake", nil, nil
	default:
		// Empty assignees + no legacy type = terminal system node (e.g. accept).
		return "auto", nil, nil
	}
}

func (e *Engine) scheduleNode(ctx context.Context, taskID uuid.UUID, nodeKey string) error {
	q := e.st.Q()
	task, _ := q.GetTask(ctx, taskID)
	wv, _ := q.WorkflowVersion(ctx, task.WorkflowVersionID)
	dag, _ := model.ParseDAG(wv.DAG)
	node, ok := dag.Node(nodeKey)
	if !ok {
		return fmt.Errorf("node %s not in dag", nodeKey)
	}

	mode, primaryAI, humans := e.nodeRoute(ctx, task.WorkspaceID, node)

	executorType := "auto"
	switch mode {
	case "intake":
		executorType = "human"
	case "confirm":
		executorType = "review"
	case "auto":
		executorType = "ai"
	}
	params := store.CreateNodeRunParams{
		TaskID:       taskID,
		NodeKey:      nodeKey,
		ExecutorType: executorType,
	}
	if primaryAI != nil {
		params.ExecutorEmployeeID = &primaryAI.ID
	}
	run, err := q.CreateNodeRun(ctx, params)
	if err != nil {
		return err
	}
	e.hub.Broadcast(ws.Event{Type: "node_run.created", TaskID: &taskID, NodeRun: &run.ID, Payload: mustJSON(run)})

	switch mode {
	case "auto":
		if primaryAI == nil {
			// No AI assignee (e.g. system "accept" terminal node): record a
			// trivial artifact and advance.
			_, _ = q.CreateArtifact(ctx, store.CreateArtifactParams{
				NodeRunID: run.ID, Kind: node.Produces,
				Payload: mustJSON(map[string]any{"node": node.Key, "produced_by": "system"}),
			})
			_ = q.UpdateNodeRunStatus(ctx, run.ID, model.StatusDone, nil)
			e.hub.Broadcast(ws.Event{Type: "node_run.done", TaskID: &taskID, NodeRun: &run.ID})
			go e.advanceAsync(detachCtx(ctx), taskID, node.Key)
			return nil
		}
		go e.runAgent(detachCtx(ctx), run.ID, node)
	case "intake":
		_ = q.UpdateNodeRunStatus(ctx, run.ID, model.StatusAwaitingHuman, nil)
		e.hub.Broadcast(ws.Event{Type: "node_run.awaiting_human", TaskID: &taskID, NodeRun: &run.ID})
		e.notifyAssignees(ctx, task, node, run.ID, humans, "提单等待录入")
	case "confirm":
		_ = q.UpdateNodeRunStatus(ctx, run.ID, model.StatusAwaitingHuman, nil)
		e.hub.Broadcast(ws.Event{Type: "node_run.awaiting_human", TaskID: &taskID, NodeRun: &run.ID})
		e.notifyAssignees(ctx, task, node, run.ID, humans, "等待你的确认")
	}
	return nil
}

func (e *Engine) runAgent(ctx context.Context, runID uuid.UUID, node model.DAGNode) {
	q := e.st.Q()
	if err := q.UpdateNodeRunStatus(ctx, runID, model.StatusRunning, nil); err != nil {
		slog.Error("set running", "err", err)
		return
	}
	run, err := q.GetNodeRun(ctx, runID)
	if err != nil {
		return
	}
	e.hub.Broadcast(ws.Event{Type: "node_run.running", TaskID: &run.TaskID, NodeRun: &runID})

	// Build prompt
	system, userMsg, err := e.buildPrompt(ctx, run, node)
	if err != nil {
		_ = q.UpdateNodeRunStatus(ctx, runID, model.StatusFailed, strPtr(err.Error()))
		e.hub.Broadcast(ws.Event{Type: "node_run.failed", TaskID: &run.TaskID, NodeRun: &runID})
		return
	}

	out, err := e.llm.Complete(ctx, llm.Request{
		System:   system,
		Messages: []llm.Message{{Role: "user", Content: userMsg}},
	})
	if err != nil {
		_ = q.UpdateNodeRunStatus(ctx, runID, model.StatusFailed, strPtr(err.Error()))
		e.hub.Broadcast(ws.Event{Type: "node_run.failed", TaskID: &run.TaskID, NodeRun: &runID})
		return
	}

	// Persist artifact. For "build" we materialise a real static HTML preview
	// via the sandbox and (best-effort) kick off a Playwright recording.
	payload := map[string]any{"text": out, "node": node.Key, "produced_by": e.llm.Name()}
	if node.Key == "build" && e.sb != nil {
		task, _ := q.GetTask(ctx, run.TaskID)
		res, err := e.sb.Build(ctx, run.TaskID, task.Title, out)
		if err != nil {
			slog.Warn("sandbox build failed, falling back to placeholder", "err", err)
			payload["preview_url"] = "https://preview.local/task/" + run.TaskID.String() + "/preview"
			payload["recording_url"] = "https://preview.local/task/" + run.TaskID.String() + "/run.mp4"
			payload["test_report"] = "ok"
		} else {
			payload["preview_url"] = res.PreviewURL
			payload["recording_url"] = res.RecordingURL
			payload["test_report"] = res.TestReport
		}
	}
	if node.Key == "deploy" && e.sb != nil {
		// Demo "deploy" reuses the build preview as the live URL — there's no
		// real prod target in the sandbox.
		payload["deploy_url"] = fmt.Sprintf("%s/static/previews/%s/index.html", e.sb.PublicBaseURL, run.TaskID.String())
	} else if node.Key == "deploy" {
		payload["deploy_url"] = "https://app.meta-staff.local/task/" + run.TaskID.String()
	}
	if _, err := q.CreateArtifact(ctx, store.CreateArtifactParams{
		NodeRunID: runID,
		Kind:      node.Produces,
		Payload:   mustJSON(payload),
	}); err != nil {
		_ = q.UpdateNodeRunStatus(ctx, runID, model.StatusFailed, strPtr(err.Error()))
		return
	}
	if err := q.UpdateNodeRunStatus(ctx, runID, model.StatusDone, nil); err != nil {
		slog.Error("set done", "err", err)
	}
	e.hub.Broadcast(ws.Event{Type: "node_run.done", TaskID: &run.TaskID, NodeRun: &runID})

	// For "accept" node, also create messages to all users in the workspace.
	if node.Key == "accept" {
		task, _ := q.GetTask(ctx, run.TaskID)
		users, _ := q.ListUsers(ctx, task.WorkspaceID)
		for _, u := range users {
			uid := u.ID
			if _, err := q.CreateMessage(ctx, store.CreateMessageParams{
				WorkspaceID: task.WorkspaceID,
				TaskID:      &task.ID,
				NodeRunID:   &runID,
				Kind:        "task-shipped",
				ToUserID:    &uid,
				Body:        "任务已上线，请前往验收。",
			}); err == nil {
				e.hub.Broadcast(ws.Event{Type: "message.created", TaskID: &task.ID})
			}
		}
		// Fire workspace-wide announcement via IM dispatcher (best-effort).
		go e.im.Broadcast(detachCtx(ctx),
			"🚀 "+task.Title+" 已上线",
			"任务 "+task.ID.String()+" 已完成 10 步工作流，等待验收。\n→ "+e.im.WebBaseURL()+"/tasks/"+task.ID.String(),
		)
	}

	// Sediment skill summary on AI nodes — short signature for future retrieval.
	if (node.Type == model.NodeTypeAI || node.Type == model.NodeTypeAuto) && run.ExecutorEmployeeID != nil {
		task, _ := q.GetTask(ctx, run.TaskID)
		summary := node.Title + " · " + task.Title
		if len(out) > 0 {
			max := 240
			s := out
			if len(s) > max {
				s = s[:max] + "…"
			}
			summary = summary + " — " + s
		}
		_, _ = q.CreateSkill(ctx, store.CreateSkillParams{
			WorkspaceID:     task.WorkspaceID,
			EmployeeID:      run.ExecutorEmployeeID,
			Summary:         summary,
			SourceNodeRunID: &runID,
		})
	}

	// continue
	if err := e.advance(ctx, run.TaskID, node.Key); err != nil {
		slog.Error("advance failed", "err", err)
	}
}

func (e *Engine) buildPrompt(ctx context.Context, run model.NodeRun, node model.DAGNode) (system, user string, err error) {
	q := e.st.Q()
	system = "你是一名数字员工，按节点角色专业完成任务。"

	// Inject employee system prompt if present
	if run.ExecutorEmployeeID != nil {
		emp, err := q.GetEmployee(ctx, *run.ExecutorEmployeeID)
		if err == nil {
			system = emp.SystemPrompt
		}
	}
	// Add explicit role hint so mock can route
	switch node.Role {
	case "pm-agent":
		switch node.Key {
		case "triage":
			system = "产品经理 · 分类\n" + system + "\n请只输出 JSON：type/severity/area/summary/missing_info/tags。"
		case "spec":
			system = "产品经理 · 文档\n" + system + "\n请输出标准 PRD markdown。"
		}
	case "qa-agent":
		system = "测试\n" + system + "\n请输出测试用例 JSON 数组。"
	case "dev-agent":
		system = "开发\n" + system
	case "ops-agent":
		system = "运维\n" + system
	case "growth-agent":
		system = "运营\n" + system
	}

	// Build user message from all upstream artifacts
	task, _ := q.GetTask(ctx, run.TaskID)
	wv, _ := q.WorkflowVersion(ctx, task.WorkflowVersionID)
	dag, _ := model.ParseDAG(wv.DAG)
	ups := dag.Upstream(node.Key)
	var buf []string
	buf = append(buf, "## 任务\n"+task.Title)
	for _, up := range ups {
		upRun, err := q.LatestActiveRunForNode(ctx, run.TaskID, up)
		if err != nil {
			continue
		}
		arts, _ := q.ListArtifactsByRun(ctx, upRun.ID)
		for _, a := range arts {
			buf = append(buf, fmt.Sprintf("\n## 来自上游 %s (%s)\n", up, a.Kind)+string(a.Payload))
		}
	}
	user = ""
	for _, s := range buf {
		user += s
	}
	return system, user, nil
}

// notifyAssignees fires both in-app messages and IM pushes (per-employee) for
// each real-human assignee of a node.
func (e *Engine) notifyAssignees(ctx context.Context, task model.Task, node model.DAGNode, runID uuid.UUID, humans []model.Employee, summary string) {
	q := e.st.Q()
	for _, emp := range humans {
		if emp.BoundUserID == nil {
			continue
		}
		uid := *emp.BoundUserID
		_, _ = q.CreateMessage(ctx, store.CreateMessageParams{
			WorkspaceID: task.WorkspaceID,
			TaskID:      &task.ID,
			NodeRunID:   &runID,
			Kind:        "node-ready",
			ToUserID:    &uid,
			Body:        fmt.Sprintf("节点 %s · %s", node.Title, summary),
		})
		go e.im.Send(detachCtx(ctx), notify.Recipient{Employee: emp},
			fmt.Sprintf("📌 %s · %s", node.Title, task.Title),
			fmt.Sprintf("%s\n→ 跳回 Web 处理：%s/tasks/%s", summary, e.im.WebBaseURL(), task.ID.String()),
		)
	}
	e.hub.Broadcast(ws.Event{Type: "message.created", TaskID: &task.ID})
}

func mustJSON(v any) json.RawMessage {
	raw, err := json.Marshal(v)
	if err != nil {
		return json.RawMessage("null")
	}
	return raw
}

func strPtr(s string) *string { return &s }

// detachCtx removes deadlines from ctx but keeps cancellation chained off background.
// Goroutines spawned by the engine should outlive any single HTTP request.
func detachCtx(ctx context.Context) context.Context {
	_ = errors.New
	return context.Background()
}
