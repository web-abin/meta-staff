package model

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type Workspace struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

type User struct {
	ID          uuid.UUID `json:"id"`
	WorkspaceID uuid.UUID `json:"workspace_id"`
	Name        string    `json:"name"`
	Email       string    `json:"email"`
	Username    *string   `json:"username,omitempty"`
	Password    string    `json:"-"`
	Role        string    `json:"role"`
	CreatedAt   time.Time `json:"created_at"`
}

type Employee struct {
	ID           uuid.UUID       `json:"id"`
	WorkspaceID  uuid.UUID       `json:"workspace_id"`
	Role         string          `json:"role"`
	Name         string          `json:"name"`
	Avatar       *string         `json:"avatar,omitempty"`
	SystemPrompt string          `json:"system_prompt"`
	Tools        json.RawMessage `json:"tools"`
	Model        string          `json:"model"`

	// Real-human binding. If BoundUserID is set, this employee is the AI
	// persona for a real human; nodes assigned to them need IM confirmation.
	// If null, the employee runs purely as AI (no confirmation step).
	BoundUserID  *uuid.UUID `json:"bound_user_id,omitempty"`
	IMProvider   *string    `json:"im_provider,omitempty"`
	IMExternalID *string    `json:"im_external_id,omitempty"`
	IMHandle     *string    `json:"im_handle,omitempty"`
	IsActive     bool       `json:"is_active"`

	CreatedAt time.Time `json:"created_at"`
}

type Workflow struct {
	ID            uuid.UUID `json:"id"`
	WorkspaceID   uuid.UUID `json:"workspace_id"`
	Name          string    `json:"name"`
	Description   *string   `json:"description,omitempty"`
	IsDefault     bool      `json:"is_default"`
	ActiveVersion int       `json:"active_version"`
	CreatedAt     time.Time `json:"created_at"`
}

type WorkflowVersion struct {
	ID         uuid.UUID       `json:"id"`
	WorkflowID uuid.UUID       `json:"workflow_id"`
	Version    int             `json:"version"`
	DAG        json.RawMessage `json:"dag"`
	CreatedAt  time.Time       `json:"created_at"`
}

type Task struct {
	ID                uuid.UUID       `json:"id"`
	WorkspaceID       uuid.UUID       `json:"workspace_id"`
	WorkflowVersionID uuid.UUID       `json:"workflow_version_id"`
	Title             string          `json:"title"`
	Source            string          `json:"source"`
	Status            string          `json:"status"`
	Payload           json.RawMessage `json:"payload"`
	CreatedBy         *uuid.UUID      `json:"created_by,omitempty"`
	CreatedAt         time.Time       `json:"created_at"`
}

type NodeRunStatus string

const (
	StatusPending       NodeRunStatus = "pending"
	StatusRunning       NodeRunStatus = "running"
	StatusAwaitingHuman NodeRunStatus = "awaiting_human"
	StatusDone          NodeRunStatus = "done"
	StatusFailed        NodeRunStatus = "failed"
	StatusRolledBack    NodeRunStatus = "rolled_back"
)

type NodeRun struct {
	ID                 uuid.UUID       `json:"id"`
	TaskID             uuid.UUID       `json:"task_id"`
	NodeKey            string          `json:"node_key"`
	ParentRunID        *uuid.UUID      `json:"parent_run_id,omitempty"`
	ExecutorType       string          `json:"executor_type"`
	ExecutorEmployeeID *uuid.UUID      `json:"executor_employee_id,omitempty"`
	AssigneeUserID     *uuid.UUID      `json:"assignee_user_id,omitempty"`
	Status             NodeRunStatus   `json:"status"`
	Inputs             json.RawMessage `json:"inputs"`
	Error              *string         `json:"error,omitempty"`
	StartedAt          *time.Time      `json:"started_at,omitempty"`
	FinishedAt         *time.Time      `json:"finished_at,omitempty"`
	CreatedAt          time.Time       `json:"created_at"`
}

type Artifact struct {
	ID        uuid.UUID       `json:"id"`
	NodeRunID uuid.UUID       `json:"node_run_id"`
	Kind      string          `json:"kind"`
	Version   int             `json:"version"`
	Payload   json.RawMessage `json:"payload"`
	BlobURL   *string         `json:"blob_url,omitempty"`
	CreatedAt time.Time       `json:"created_at"`
}

type Review struct {
	ID                uuid.UUID `json:"id"`
	NodeRunID         uuid.UUID `json:"node_run_id"`
	ReviewerUserID    uuid.UUID `json:"reviewer_user_id"`
	ReviewerRole      string    `json:"reviewer_role"`
	Vote              *string   `json:"vote,omitempty"`
	RollbackToNodeKey *string   `json:"rollback_to_node_key,omitempty"`
	Comment           *string   `json:"comment,omitempty"`
	CreatedAt         time.Time `json:"created_at"`
}

type Skill struct {
	ID              uuid.UUID  `json:"id"`
	WorkspaceID     uuid.UUID  `json:"workspace_id"`
	EmployeeID      *uuid.UUID `json:"employee_id,omitempty"`
	Summary         string     `json:"summary"`
	SourceNodeRunID *uuid.UUID `json:"source_node_run_id,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
}

type Message struct {
	ID          uuid.UUID  `json:"id"`
	WorkspaceID uuid.UUID  `json:"workspace_id"`
	TaskID      *uuid.UUID `json:"task_id,omitempty"`
	NodeRunID   *uuid.UUID `json:"node_run_id,omitempty"`
	Kind        string     `json:"kind"`
	ToUserID    *uuid.UUID `json:"to_user_id,omitempty"`
	Body        string     `json:"body"`
	ReadAt      *time.Time `json:"read_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}
