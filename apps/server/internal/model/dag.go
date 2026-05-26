package model

import "encoding/json"

type DAGNodeType string

const (
	NodeTypeHuman  DAGNodeType = "human"
	NodeTypeAI     DAGNodeType = "ai"
	NodeTypeReview DAGNodeType = "review"
	NodeTypeAuto   DAGNodeType = "auto"
)

type DAGNode struct {
	Key      string `json:"key"`
	Title    string `json:"title"`
	Produces string `json:"produces"`

	// New model: a node binds 1+ employees via AssigneeEmployeeIDs.
	// [0] is the digital-employee TYPE that owns the node; [1..] are
	// real-person helpers. Helpers do NOT change the node's execution type —
	// the node still runs as AI ("auto"). They only get notified when the AI
	// needs human assistance. Pure-human nodes (no AI in [0]) still fall back
	// to "confirm" 会签. Intake nodes (IsIntake) are human-only: any one
	// assignee submits → advance.
	IsIntake            bool     `json:"is_intake,omitempty"`
	AssigneeEmployeeIDs []string `json:"assignee_employee_ids,omitempty"`

	// Legacy fields — kept for backwards compatibility while reading older
	// seed DAGs; new editor never writes these.
	Type       DAGNodeType `json:"type,omitempty"`
	Role       string      `json:"role,omitempty"`
	AutoSubmit bool        `json:"auto_submit,omitempty"`
}

type DAGEdge struct {
	From string `json:"from"`
	To   string `json:"to"`
}

type DAG struct {
	Nodes []DAGNode `json:"nodes"`
	Edges []DAGEdge `json:"edges"`
	Entry string    `json:"entry"`
}

func ParseDAG(raw json.RawMessage) (*DAG, error) {
	var d DAG
	if err := json.Unmarshal(raw, &d); err != nil {
		return nil, err
	}
	return &d, nil
}

func (d *DAG) Node(key string) (DAGNode, bool) {
	for _, n := range d.Nodes {
		if n.Key == key {
			return n, true
		}
	}
	return DAGNode{}, false
}

func (d *DAG) Downstream(key string) []string {
	var out []string
	for _, e := range d.Edges {
		if e.From == key {
			out = append(out, e.To)
		}
	}
	return out
}

func (d *DAG) Upstream(key string) []string {
	var out []string
	for _, e := range d.Edges {
		if e.To == key {
			out = append(out, e.From)
		}
	}
	return out
}
