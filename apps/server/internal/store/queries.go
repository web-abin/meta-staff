package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/meta-staff/server/internal/model"
)

var ErrNotFound = errors.New("not found")

// Q is the storage interface. Implementations: pgQ (Postgres) and memQ (in-memory demo mode).
type Q interface {
	DefaultWorkspaceID() uuid.UUID

	ListUsers(ctx context.Context, wsID uuid.UUID) ([]model.User, error)
	UserByRole(ctx context.Context, wsID uuid.UUID, role string) (model.User, error)
	UserByUsername(ctx context.Context, wsID uuid.UUID, username string) (model.User, error)
	GetUser(ctx context.Context, id uuid.UUID) (model.User, error)
	UpdateUserRole(ctx context.Context, id uuid.UUID, role string) (model.User, error)

	ListEmployees(ctx context.Context, wsID uuid.UUID) ([]model.Employee, error)
	EmployeeByRole(ctx context.Context, wsID uuid.UUID, role string) (model.Employee, error)
	EmployeeByUserID(ctx context.Context, userID uuid.UUID) (model.Employee, error)
	GetEmployee(ctx context.Context, id uuid.UUID) (model.Employee, error)
	CreateEmployee(ctx context.Context, p CreateEmployeeParams) (model.Employee, error)
	UpdateEmployee(ctx context.Context, id uuid.UUID, p UpdateEmployeeParams) (model.Employee, error)
	CreateUser(ctx context.Context, p CreateUserParams) (model.User, error)
	UserByEmail(ctx context.Context, wsID uuid.UUID, email string) (model.User, error)

	ListWorkflows(ctx context.Context, wsID uuid.UUID) ([]model.Workflow, error)
	DefaultWorkflow(ctx context.Context, wsID uuid.UUID) (model.Workflow, error)
	WorkflowActiveVersion(ctx context.Context, workflowID uuid.UUID) (model.WorkflowVersion, error)
	WorkflowVersion(ctx context.Context, id uuid.UUID) (model.WorkflowVersion, error)
	NewWorkflowVersion(ctx context.Context, p UpsertWorkflowVersionParams) (model.WorkflowVersion, error)

	CreateTask(ctx context.Context, p CreateTaskParams) (model.Task, error)
	ListTasks(ctx context.Context, wsID uuid.UUID) ([]model.Task, error)
	GetTask(ctx context.Context, id uuid.UUID) (model.Task, error)

	CreateNodeRun(ctx context.Context, p CreateNodeRunParams) (model.NodeRun, error)
	GetNodeRun(ctx context.Context, id uuid.UUID) (model.NodeRun, error)
	ListNodeRunsByTask(ctx context.Context, taskID uuid.UUID) ([]model.NodeRun, error)
	LatestActiveRunForNode(ctx context.Context, taskID uuid.UUID, nodeKey string) (model.NodeRun, error)
	UpdateNodeRunStatus(ctx context.Context, id uuid.UUID, status model.NodeRunStatus, errStr *string) error
	MarkRunsRolledBackFrom(ctx context.Context, taskID uuid.UUID, nodeKeys []string) error

	CreateArtifact(ctx context.Context, p CreateArtifactParams) (model.Artifact, error)
	ListArtifactsByRun(ctx context.Context, runID uuid.UUID) ([]model.Artifact, error)
	LatestArtifact(ctx context.Context, runID uuid.UUID, kind string) (model.Artifact, error)

	UpsertReview(ctx context.Context, p UpsertReviewParams) (model.Review, error)
	ListReviews(ctx context.Context, runID uuid.UUID) ([]model.Review, error)

	CreateMessage(ctx context.Context, p CreateMessageParams) (model.Message, error)
	ListMessages(ctx context.Context, wsID uuid.UUID, userID *uuid.UUID, limit int) ([]model.Message, error)
	MarkMessageRead(ctx context.Context, id uuid.UUID) error

	CreateSkill(ctx context.Context, p CreateSkillParams) (model.Skill, error)
	ListSkillsByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.Skill, error)
	SearchSkills(ctx context.Context, wsID uuid.UUID, query string, limit int) ([]model.Skill, error)
}

type pgQ struct {
	db *pgxpool.Pool
}

func (s *Store) Q() Q {
	if s.mem != nil {
		return s.mem
	}
	return &pgQ{db: s.Pool}
}

// ============== workspaces / users ==============

func (q *pgQ) DefaultWorkspaceID() uuid.UUID {
	return uuid.MustParse("00000000-0000-0000-0000-000000000001")
}

func (q *pgQ) ListUsers(ctx context.Context, wsID uuid.UUID) ([]model.User, error) {
	rows, err := q.db.Query(ctx, `select id, workspace_id, name, email, username, password, role, created_at from users where workspace_id=$1 order by role, name`, wsID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.User
	for rows.Next() {
		var u model.User
		if err := rows.Scan(&u.ID, &u.WorkspaceID, &u.Name, &u.Email, &u.Username, &u.Password, &u.Role, &u.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (q *pgQ) UserByRole(ctx context.Context, wsID uuid.UUID, role string) (model.User, error) {
	var u model.User
	err := q.db.QueryRow(ctx,
		`select id, workspace_id, name, email, username, password, role, created_at from users where workspace_id=$1 and role=$2 limit 1`,
		wsID, role).Scan(&u.ID, &u.WorkspaceID, &u.Name, &u.Email, &u.Username, &u.Password, &u.Role, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return u, ErrNotFound
	}
	return u, err
}

// ============== employees ==============

func (q *pgQ) ListEmployees(ctx context.Context, wsID uuid.UUID) ([]model.Employee, error) {
	rows, err := q.db.Query(ctx,
		`select id, workspace_id, role, name, avatar, system_prompt, tools, model,
		        bound_user_id, im_provider, im_external_id, im_handle, is_active, created_at
		   from employees where workspace_id=$1 order by created_at`, wsID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.Employee
	for rows.Next() {
		var e model.Employee
		if err := rows.Scan(&e.ID, &e.WorkspaceID, &e.Role, &e.Name, &e.Avatar, &e.SystemPrompt, &e.Tools, &e.Model, &e.BoundUserID, &e.IMProvider, &e.IMExternalID, &e.IMHandle, &e.IsActive, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (q *pgQ) EmployeeByRole(ctx context.Context, wsID uuid.UUID, role string) (model.Employee, error) {
	var e model.Employee
	err := q.db.QueryRow(ctx,
		`select id, workspace_id, role, name, avatar, system_prompt, tools, model,
		        bound_user_id, im_provider, im_external_id, im_handle, is_active, created_at
		   from employees where workspace_id=$1 and role=$2 order by created_at limit 1`,
		wsID, role).Scan(&e.ID, &e.WorkspaceID, &e.Role, &e.Name, &e.Avatar, &e.SystemPrompt, &e.Tools, &e.Model, &e.BoundUserID, &e.IMProvider, &e.IMExternalID, &e.IMHandle, &e.IsActive, &e.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return e, ErrNotFound
	}
	return e, err
}

func (q *pgQ) EmployeeByUserID(ctx context.Context, userID uuid.UUID) (model.Employee, error) {
	var e model.Employee
	err := q.db.QueryRow(ctx,
		`select id, workspace_id, role, name, avatar, system_prompt, tools, model,
		        bound_user_id, im_provider, im_external_id, im_handle, is_active, created_at
		   from employees where bound_user_id=$1 order by created_at limit 1`,
		userID).Scan(&e.ID, &e.WorkspaceID, &e.Role, &e.Name, &e.Avatar, &e.SystemPrompt, &e.Tools, &e.Model, &e.BoundUserID, &e.IMProvider, &e.IMExternalID, &e.IMHandle, &e.IsActive, &e.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return e, ErrNotFound
	}
	return e, err
}

func (q *pgQ) GetEmployee(ctx context.Context, id uuid.UUID) (model.Employee, error) {
	var e model.Employee
	err := q.db.QueryRow(ctx,
		`select id, workspace_id, role, name, avatar, system_prompt, tools, model,
		        bound_user_id, im_provider, im_external_id, im_handle, is_active, created_at
		   from employees where id=$1`, id).
		Scan(&e.ID, &e.WorkspaceID, &e.Role, &e.Name, &e.Avatar, &e.SystemPrompt, &e.Tools, &e.Model, &e.BoundUserID, &e.IMProvider, &e.IMExternalID, &e.IMHandle, &e.IsActive, &e.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return e, ErrNotFound
	}
	return e, err
}

type CreateEmployeeParams struct {
	WorkspaceID  uuid.UUID
	Role         string
	Name         string
	Avatar       *string
	SystemPrompt string
	Tools        json.RawMessage
	Model        string
	BoundUserID  *uuid.UUID
	IMProvider   *string
	IMExternalID *string
	IMHandle     *string
	IsActive     bool
}

func (q *pgQ) CreateEmployee(ctx context.Context, p CreateEmployeeParams) (model.Employee, error) {
	if len(p.Tools) == 0 {
		p.Tools = json.RawMessage("[]")
	}
	if p.Model == "" {
		p.Model = "claude-opus-4-7"
	}
	var e model.Employee
	err := q.db.QueryRow(ctx,
		`insert into employees(workspace_id, role, name, avatar, system_prompt, tools, model,
		                        bound_user_id, im_provider, im_external_id, im_handle, is_active)
		 values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		 returning id, workspace_id, role, name, avatar, system_prompt, tools, model,
		           bound_user_id, im_provider, im_external_id, im_handle, is_active, created_at`,
		p.WorkspaceID, p.Role, p.Name, p.Avatar, p.SystemPrompt, p.Tools, p.Model,
		p.BoundUserID, p.IMProvider, p.IMExternalID, p.IMHandle, p.IsActive,
	).Scan(&e.ID, &e.WorkspaceID, &e.Role, &e.Name, &e.Avatar, &e.SystemPrompt, &e.Tools, &e.Model, &e.BoundUserID, &e.IMProvider, &e.IMExternalID, &e.IMHandle, &e.IsActive, &e.CreatedAt)
	return e, err
}

type UpdateEmployeeParams struct {
	Name         *string
	Avatar       *string
	SystemPrompt *string
	Tools        json.RawMessage
	Model        *string
	BoundUserID  *uuid.UUID
	IMProvider   *string
	IMExternalID *string
	IMHandle     *string
	IsActive     *bool
}

func (q *pgQ) UpdateEmployee(ctx context.Context, id uuid.UUID, p UpdateEmployeeParams) (model.Employee, error) {
	var e model.Employee
	err := q.db.QueryRow(ctx,
		`update employees set
		   name           = coalesce($2, name),
		   avatar         = coalesce($3, avatar),
		   system_prompt  = coalesce($4, system_prompt),
		   tools          = coalesce($5, tools),
		   model          = coalesce($6, model),
		   bound_user_id  = coalesce($7, bound_user_id),
		   im_provider    = coalesce($8, im_provider),
		   im_external_id = coalesce($9, im_external_id),
		   im_handle      = coalesce($10, im_handle),
		   is_active      = coalesce($11, is_active)
		 where id=$1
		 returning id, workspace_id, role, name, avatar, system_prompt, tools, model,
		           bound_user_id, im_provider, im_external_id, im_handle, is_active, created_at`,
		id, p.Name, p.Avatar, p.SystemPrompt, p.Tools, p.Model,
		p.BoundUserID, p.IMProvider, p.IMExternalID, p.IMHandle, p.IsActive,
	).Scan(&e.ID, &e.WorkspaceID, &e.Role, &e.Name, &e.Avatar, &e.SystemPrompt, &e.Tools, &e.Model, &e.BoundUserID, &e.IMProvider, &e.IMExternalID, &e.IMHandle, &e.IsActive, &e.CreatedAt)
	return e, err
}

type CreateUserParams struct {
	WorkspaceID uuid.UUID
	Name        string
	Email       string
	Username    *string
	Password    string
	Role        string
}

func (q *pgQ) CreateUser(ctx context.Context, p CreateUserParams) (model.User, error) {
	var u model.User
	err := q.db.QueryRow(ctx,
		`insert into users(workspace_id, name, email, username, password, role)
		 values($1,$2,$3,$4,$5,$6)
		 returning id, workspace_id, name, email, username, password, role, created_at`,
		p.WorkspaceID, p.Name, p.Email, p.Username, p.Password, p.Role,
	).Scan(&u.ID, &u.WorkspaceID, &u.Name, &u.Email, &u.Username, &u.Password, &u.Role, &u.CreatedAt)
	return u, err
}

func (q *pgQ) UserByEmail(ctx context.Context, wsID uuid.UUID, email string) (model.User, error) {
	var u model.User
	err := q.db.QueryRow(ctx,
		`select id, workspace_id, name, email, username, password, role, created_at from users where workspace_id=$1 and email=$2 limit 1`,
		wsID, email).Scan(&u.ID, &u.WorkspaceID, &u.Name, &u.Email, &u.Username, &u.Password, &u.Role, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return u, ErrNotFound
	}
	return u, err
}

func (q *pgQ) UserByUsername(ctx context.Context, wsID uuid.UUID, username string) (model.User, error) {
	var u model.User
	err := q.db.QueryRow(ctx,
		`select id, workspace_id, name, email, username, password, role, created_at from users where workspace_id=$1 and username=$2 limit 1`,
		wsID, username).Scan(&u.ID, &u.WorkspaceID, &u.Name, &u.Email, &u.Username, &u.Password, &u.Role, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return u, ErrNotFound
	}
	return u, err
}

func (q *pgQ) GetUser(ctx context.Context, id uuid.UUID) (model.User, error) {
	var u model.User
	err := q.db.QueryRow(ctx,
		`select id, workspace_id, name, email, username, password, role, created_at from users where id=$1`,
		id).Scan(&u.ID, &u.WorkspaceID, &u.Name, &u.Email, &u.Username, &u.Password, &u.Role, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return u, ErrNotFound
	}
	return u, err
}

func (q *pgQ) UpdateUserRole(ctx context.Context, id uuid.UUID, role string) (model.User, error) {
	var u model.User
	err := q.db.QueryRow(ctx,
		`update users set role=$2 where id=$1
		 returning id, workspace_id, name, email, username, password, role, created_at`,
		id, role).Scan(&u.ID, &u.WorkspaceID, &u.Name, &u.Email, &u.Username, &u.Password, &u.Role, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return u, ErrNotFound
	}
	return u, err
}

// ============== workflows ==============

func (q *pgQ) ListWorkflows(ctx context.Context, wsID uuid.UUID) ([]model.Workflow, error) {
	rows, err := q.db.Query(ctx,
		`select id, workspace_id, name, description, is_default, active_version, created_at
		   from workflows where workspace_id=$1 order by is_default desc, created_at`, wsID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.Workflow
	for rows.Next() {
		var w model.Workflow
		if err := rows.Scan(&w.ID, &w.WorkspaceID, &w.Name, &w.Description, &w.IsDefault, &w.ActiveVersion, &w.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

func (q *pgQ) DefaultWorkflow(ctx context.Context, wsID uuid.UUID) (model.Workflow, error) {
	var w model.Workflow
	err := q.db.QueryRow(ctx,
		`select id, workspace_id, name, description, is_default, active_version, created_at
		   from workflows where workspace_id=$1 and is_default=true limit 1`, wsID,
	).Scan(&w.ID, &w.WorkspaceID, &w.Name, &w.Description, &w.IsDefault, &w.ActiveVersion, &w.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return w, ErrNotFound
	}
	return w, err
}

func (q *pgQ) WorkflowActiveVersion(ctx context.Context, workflowID uuid.UUID) (model.WorkflowVersion, error) {
	var v model.WorkflowVersion
	err := q.db.QueryRow(ctx,
		`select wv.id, wv.workflow_id, wv.version, wv.dag, wv.created_at
		   from workflow_versions wv
		   join workflows w on w.id = wv.workflow_id and w.active_version = wv.version
		  where wv.workflow_id=$1`, workflowID,
	).Scan(&v.ID, &v.WorkflowID, &v.Version, &v.DAG, &v.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return v, ErrNotFound
	}
	return v, err
}

func (q *pgQ) WorkflowVersion(ctx context.Context, id uuid.UUID) (model.WorkflowVersion, error) {
	var v model.WorkflowVersion
	err := q.db.QueryRow(ctx,
		`select id, workflow_id, version, dag, created_at from workflow_versions where id=$1`, id,
	).Scan(&v.ID, &v.WorkflowID, &v.Version, &v.DAG, &v.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return v, ErrNotFound
	}
	return v, err
}

type UpsertWorkflowVersionParams struct {
	WorkflowID uuid.UUID
	DAG        json.RawMessage
}

func (q *pgQ) NewWorkflowVersion(ctx context.Context, p UpsertWorkflowVersionParams) (model.WorkflowVersion, error) {
	var nextVer int
	if err := q.db.QueryRow(ctx, `select coalesce(max(version),0)+1 from workflow_versions where workflow_id=$1`, p.WorkflowID).Scan(&nextVer); err != nil {
		return model.WorkflowVersion{}, err
	}
	var v model.WorkflowVersion
	if err := q.db.QueryRow(ctx,
		`insert into workflow_versions(workflow_id, version, dag) values($1,$2,$3)
		 returning id, workflow_id, version, dag, created_at`, p.WorkflowID, nextVer, p.DAG,
	).Scan(&v.ID, &v.WorkflowID, &v.Version, &v.DAG, &v.CreatedAt); err != nil {
		return v, err
	}
	if _, err := q.db.Exec(ctx, `update workflows set active_version=$1 where id=$2`, nextVer, p.WorkflowID); err != nil {
		return v, err
	}
	return v, nil
}

// ============== tasks ==============

type CreateTaskParams struct {
	WorkspaceID       uuid.UUID
	WorkflowVersionID uuid.UUID
	Title             string
	Source            string
	Payload           json.RawMessage
	CreatedBy         *uuid.UUID
}

func (q *pgQ) CreateTask(ctx context.Context, p CreateTaskParams) (model.Task, error) {
	if len(p.Payload) == 0 {
		p.Payload = json.RawMessage("{}")
	}
	var t model.Task
	err := q.db.QueryRow(ctx,
		`insert into tasks(workspace_id, workflow_version_id, title, source, payload, created_by)
		 values($1,$2,$3,$4,$5,$6)
		 returning id, workspace_id, workflow_version_id, title, source, status, payload, created_by, created_at`,
		p.WorkspaceID, p.WorkflowVersionID, p.Title, p.Source, p.Payload, p.CreatedBy,
	).Scan(&t.ID, &t.WorkspaceID, &t.WorkflowVersionID, &t.Title, &t.Source, &t.Status, &t.Payload, &t.CreatedBy, &t.CreatedAt)
	return t, err
}

func (q *pgQ) ListTasks(ctx context.Context, wsID uuid.UUID) ([]model.Task, error) {
	rows, err := q.db.Query(ctx,
		`select id, workspace_id, workflow_version_id, title, source, status, payload, created_by, created_at
		   from tasks where workspace_id=$1 order by created_at desc limit 100`, wsID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.Task
	for rows.Next() {
		var t model.Task
		if err := rows.Scan(&t.ID, &t.WorkspaceID, &t.WorkflowVersionID, &t.Title, &t.Source, &t.Status, &t.Payload, &t.CreatedBy, &t.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (q *pgQ) GetTask(ctx context.Context, id uuid.UUID) (model.Task, error) {
	var t model.Task
	err := q.db.QueryRow(ctx,
		`select id, workspace_id, workflow_version_id, title, source, status, payload, created_by, created_at
		   from tasks where id=$1`, id,
	).Scan(&t.ID, &t.WorkspaceID, &t.WorkflowVersionID, &t.Title, &t.Source, &t.Status, &t.Payload, &t.CreatedBy, &t.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return t, ErrNotFound
	}
	return t, err
}

// ============== node runs ==============

type CreateNodeRunParams struct {
	TaskID             uuid.UUID
	NodeKey            string
	ParentRunID        *uuid.UUID
	ExecutorType       string
	ExecutorEmployeeID *uuid.UUID
	AssigneeUserID     *uuid.UUID
	Inputs             json.RawMessage
	Status             model.NodeRunStatus
}

func (q *pgQ) CreateNodeRun(ctx context.Context, p CreateNodeRunParams) (model.NodeRun, error) {
	if len(p.Inputs) == 0 {
		p.Inputs = json.RawMessage("{}")
	}
	if p.Status == "" {
		p.Status = model.StatusPending
	}
	var n model.NodeRun
	err := q.db.QueryRow(ctx,
		`insert into node_runs(task_id, node_key, parent_run_id, executor_type, executor_employee_id, assignee_user_id, status, inputs)
		 values($1,$2,$3,$4,$5,$6,$7,$8)
		 returning id, task_id, node_key, parent_run_id, executor_type, executor_employee_id, assignee_user_id, status, inputs, error, started_at, finished_at, created_at`,
		p.TaskID, p.NodeKey, p.ParentRunID, p.ExecutorType, p.ExecutorEmployeeID, p.AssigneeUserID, p.Status, p.Inputs,
	).Scan(&n.ID, &n.TaskID, &n.NodeKey, &n.ParentRunID, &n.ExecutorType, &n.ExecutorEmployeeID, &n.AssigneeUserID, &n.Status, &n.Inputs, &n.Error, &n.StartedAt, &n.FinishedAt, &n.CreatedAt)
	return n, err
}

func (q *pgQ) GetNodeRun(ctx context.Context, id uuid.UUID) (model.NodeRun, error) {
	var n model.NodeRun
	err := q.db.QueryRow(ctx,
		`select id, task_id, node_key, parent_run_id, executor_type, executor_employee_id, assignee_user_id, status, inputs, error, started_at, finished_at, created_at
		   from node_runs where id=$1`, id,
	).Scan(&n.ID, &n.TaskID, &n.NodeKey, &n.ParentRunID, &n.ExecutorType, &n.ExecutorEmployeeID, &n.AssigneeUserID, &n.Status, &n.Inputs, &n.Error, &n.StartedAt, &n.FinishedAt, &n.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return n, ErrNotFound
	}
	return n, err
}

func (q *pgQ) ListNodeRunsByTask(ctx context.Context, taskID uuid.UUID) ([]model.NodeRun, error) {
	rows, err := q.db.Query(ctx,
		`select id, task_id, node_key, parent_run_id, executor_type, executor_employee_id, assignee_user_id, status, inputs, error, started_at, finished_at, created_at
		   from node_runs where task_id=$1 order by created_at`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.NodeRun
	for rows.Next() {
		var n model.NodeRun
		if err := rows.Scan(&n.ID, &n.TaskID, &n.NodeKey, &n.ParentRunID, &n.ExecutorType, &n.ExecutorEmployeeID, &n.AssigneeUserID, &n.Status, &n.Inputs, &n.Error, &n.StartedAt, &n.FinishedAt, &n.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

// LatestActiveRunForNode returns the most recent non-rolled-back run for a given node.
func (q *pgQ) LatestActiveRunForNode(ctx context.Context, taskID uuid.UUID, nodeKey string) (model.NodeRun, error) {
	var n model.NodeRun
	err := q.db.QueryRow(ctx,
		`select id, task_id, node_key, parent_run_id, executor_type, executor_employee_id, assignee_user_id, status, inputs, error, started_at, finished_at, created_at
		   from node_runs where task_id=$1 and node_key=$2 and status<>'rolled_back'
		   order by created_at desc limit 1`, taskID, nodeKey,
	).Scan(&n.ID, &n.TaskID, &n.NodeKey, &n.ParentRunID, &n.ExecutorType, &n.ExecutorEmployeeID, &n.AssigneeUserID, &n.Status, &n.Inputs, &n.Error, &n.StartedAt, &n.FinishedAt, &n.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return n, ErrNotFound
	}
	return n, err
}

func (q *pgQ) UpdateNodeRunStatus(ctx context.Context, id uuid.UUID, status model.NodeRunStatus, errStr *string) error {
	var startedAt, finishedAt *time.Time
	now := time.Now().UTC()
	switch status {
	case model.StatusRunning:
		startedAt = &now
	case model.StatusDone, model.StatusFailed, model.StatusRolledBack:
		finishedAt = &now
	}
	_, err := q.db.Exec(ctx,
		`update node_runs
		   set status=$1,
		       error=coalesce($2,error),
		       started_at=coalesce($3, started_at),
		       finished_at=coalesce($4, finished_at)
		 where id=$5`,
		status, errStr, startedAt, finishedAt, id,
	)
	return err
}

func (q *pgQ) MarkRunsRolledBackFrom(ctx context.Context, taskID uuid.UUID, nodeKeys []string) error {
	if len(nodeKeys) == 0 {
		return nil
	}
	_, err := q.db.Exec(ctx,
		`update node_runs set status='rolled_back', finished_at=now()
		  where task_id=$1 and node_key = any($2) and status<>'rolled_back'`,
		taskID, nodeKeys,
	)
	return err
}

// ============== artifacts ==============

type CreateArtifactParams struct {
	NodeRunID uuid.UUID
	Kind      string
	Payload   json.RawMessage
	BlobURL   *string
}

func (q *pgQ) CreateArtifact(ctx context.Context, p CreateArtifactParams) (model.Artifact, error) {
	if len(p.Payload) == 0 {
		p.Payload = json.RawMessage("{}")
	}
	var nextVer int
	if err := q.db.QueryRow(ctx, `select coalesce(max(version),0)+1 from artifacts where node_run_id=$1 and kind=$2`, p.NodeRunID, p.Kind).Scan(&nextVer); err != nil {
		return model.Artifact{}, err
	}
	var a model.Artifact
	err := q.db.QueryRow(ctx,
		`insert into artifacts(node_run_id, kind, version, payload, blob_url)
		 values($1,$2,$3,$4,$5)
		 returning id, node_run_id, kind, version, payload, blob_url, created_at`,
		p.NodeRunID, p.Kind, nextVer, p.Payload, p.BlobURL,
	).Scan(&a.ID, &a.NodeRunID, &a.Kind, &a.Version, &a.Payload, &a.BlobURL, &a.CreatedAt)
	return a, err
}

func (q *pgQ) ListArtifactsByRun(ctx context.Context, runID uuid.UUID) ([]model.Artifact, error) {
	rows, err := q.db.Query(ctx,
		`select id, node_run_id, kind, version, payload, blob_url, created_at
		   from artifacts where node_run_id=$1 order by created_at`, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.Artifact
	for rows.Next() {
		var a model.Artifact
		if err := rows.Scan(&a.ID, &a.NodeRunID, &a.Kind, &a.Version, &a.Payload, &a.BlobURL, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (q *pgQ) LatestArtifact(ctx context.Context, runID uuid.UUID, kind string) (model.Artifact, error) {
	var a model.Artifact
	err := q.db.QueryRow(ctx,
		`select id, node_run_id, kind, version, payload, blob_url, created_at
		   from artifacts where node_run_id=$1 and kind=$2 order by version desc limit 1`, runID, kind,
	).Scan(&a.ID, &a.NodeRunID, &a.Kind, &a.Version, &a.Payload, &a.BlobURL, &a.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return a, ErrNotFound
	}
	return a, err
}

// ============== reviews ==============

type UpsertReviewParams struct {
	NodeRunID         uuid.UUID
	ReviewerUserID    uuid.UUID
	ReviewerRole      string
	Vote              *string
	RollbackToNodeKey *string
	Comment           *string
}

func (q *pgQ) UpsertReview(ctx context.Context, p UpsertReviewParams) (model.Review, error) {
	var r model.Review
	err := q.db.QueryRow(ctx,
		`insert into reviews(node_run_id, reviewer_user_id, reviewer_role, vote, rollback_to_node_key, comment)
		 values($1,$2,$3,$4,$5,$6)
		 on conflict (node_run_id, reviewer_user_id) do update
		   set vote=excluded.vote,
		       rollback_to_node_key=excluded.rollback_to_node_key,
		       comment=excluded.comment,
		       reviewer_role=excluded.reviewer_role
		 returning id, node_run_id, reviewer_user_id, reviewer_role, vote, rollback_to_node_key, comment, created_at`,
		p.NodeRunID, p.ReviewerUserID, p.ReviewerRole, p.Vote, p.RollbackToNodeKey, p.Comment,
	).Scan(&r.ID, &r.NodeRunID, &r.ReviewerUserID, &r.ReviewerRole, &r.Vote, &r.RollbackToNodeKey, &r.Comment, &r.CreatedAt)
	return r, err
}

func (q *pgQ) ListReviews(ctx context.Context, runID uuid.UUID) ([]model.Review, error) {
	rows, err := q.db.Query(ctx,
		`select id, node_run_id, reviewer_user_id, reviewer_role, vote, rollback_to_node_key, comment, created_at
		   from reviews where node_run_id=$1 order by reviewer_role`, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.Review
	for rows.Next() {
		var r model.Review
		if err := rows.Scan(&r.ID, &r.NodeRunID, &r.ReviewerUserID, &r.ReviewerRole, &r.Vote, &r.RollbackToNodeKey, &r.Comment, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ============== messages ==============

type CreateMessageParams struct {
	WorkspaceID uuid.UUID
	TaskID      *uuid.UUID
	NodeRunID   *uuid.UUID
	Kind        string
	ToUserID    *uuid.UUID
	Body        string
}

func (q *pgQ) CreateMessage(ctx context.Context, p CreateMessageParams) (model.Message, error) {
	var m model.Message
	err := q.db.QueryRow(ctx,
		`insert into messages(workspace_id, task_id, node_run_id, kind, to_user_id, body)
		 values($1,$2,$3,$4,$5,$6)
		 returning id, workspace_id, task_id, node_run_id, kind, to_user_id, body, read_at, created_at`,
		p.WorkspaceID, p.TaskID, p.NodeRunID, p.Kind, p.ToUserID, p.Body,
	).Scan(&m.ID, &m.WorkspaceID, &m.TaskID, &m.NodeRunID, &m.Kind, &m.ToUserID, &m.Body, &m.ReadAt, &m.CreatedAt)
	return m, err
}

func (q *pgQ) ListMessages(ctx context.Context, wsID uuid.UUID, userID *uuid.UUID, limit int) ([]model.Message, error) {
	if limit <= 0 {
		limit = 50
	}
	var rows pgx.Rows
	var err error
	if userID == nil {
		rows, err = q.db.Query(ctx,
			`select id, workspace_id, task_id, node_run_id, kind, to_user_id, body, read_at, created_at
			   from messages where workspace_id=$1 order by created_at desc limit $2`, wsID, limit)
	} else {
		rows, err = q.db.Query(ctx,
			`select id, workspace_id, task_id, node_run_id, kind, to_user_id, body, read_at, created_at
			   from messages where workspace_id=$1 and (to_user_id is null or to_user_id=$2)
			   order by created_at desc limit $3`, wsID, *userID, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.Message
	for rows.Next() {
		var m model.Message
		if err := rows.Scan(&m.ID, &m.WorkspaceID, &m.TaskID, &m.NodeRunID, &m.Kind, &m.ToUserID, &m.Body, &m.ReadAt, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (q *pgQ) MarkMessageRead(ctx context.Context, id uuid.UUID) error {
	_, err := q.db.Exec(ctx, `update messages set read_at=now() where id=$1 and read_at is null`, id)
	return err
}

// ============== skills ==============

type CreateSkillParams struct {
	WorkspaceID     uuid.UUID
	EmployeeID      *uuid.UUID
	Summary         string
	SourceNodeRunID *uuid.UUID
}

func (q *pgQ) CreateSkill(ctx context.Context, p CreateSkillParams) (model.Skill, error) {
	var s model.Skill
	err := q.db.QueryRow(ctx,
		`insert into skill_records(workspace_id, employee_id, summary, source_node_run_id)
		 values($1,$2,$3,$4)
		 returning id, workspace_id, employee_id, summary, source_node_run_id, created_at`,
		p.WorkspaceID, p.EmployeeID, p.Summary, p.SourceNodeRunID,
	).Scan(&s.ID, &s.WorkspaceID, &s.EmployeeID, &s.Summary, &s.SourceNodeRunID, &s.CreatedAt)
	return s, err
}

func (q *pgQ) ListSkillsByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.Skill, error) {
	rows, err := q.db.Query(ctx,
		`select id, workspace_id, employee_id, summary, source_node_run_id, created_at
		   from skill_records where employee_id=$1 order by created_at desc limit 50`, employeeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.Skill
	for rows.Next() {
		var s model.Skill
		if err := rows.Scan(&s.ID, &s.WorkspaceID, &s.EmployeeID, &s.Summary, &s.SourceNodeRunID, &s.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (q *pgQ) SearchSkills(ctx context.Context, wsID uuid.UUID, query string, limit int) ([]model.Skill, error) {
	if limit <= 0 {
		limit = 10
	}
	// keyword search via ILIKE; pgvector cosine could be wired in once embeddings are populated.
	rows, err := q.db.Query(ctx,
		`select id, workspace_id, employee_id, summary, source_node_run_id, created_at
		   from skill_records
		  where workspace_id=$1 and summary ilike '%' || $2 || '%'
		  order by created_at desc limit $3`,
		wsID, query, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.Skill
	for rows.Next() {
		var s model.Skill
		if err := rows.Scan(&s.ID, &s.WorkspaceID, &s.EmployeeID, &s.Summary, &s.SourceNodeRunID, &s.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

