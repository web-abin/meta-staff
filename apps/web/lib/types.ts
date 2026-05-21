export type NodeRunStatus =
  | "pending"
  | "running"
  | "awaiting_human"
  | "done"
  | "failed"
  | "rolled_back";

export interface User {
  id: string;
  workspace_id: string;
  name: string;
  email: string;
  username?: string | null;
  role: string;
  created_at: string;
}

export interface Employee {
  id: string;
  workspace_id: string;
  role: string;
  name: string;
  avatar?: string | null;
  system_prompt: string;
  tools: unknown;
  model: string;
  bound_user_id?: string | null;
  im_provider?: string | null;
  im_external_id?: string | null;
  im_handle?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Workflow {
  id: string;
  workspace_id: string;
  name: string;
  description?: string | null;
  is_default: boolean;
  active_version: number;
  created_at: string;
}

export interface DAGNodeInstance {
  // Snapshot of the digital-employee TYPE at the moment of drag-onto-canvas.
  // Mutating the instance here does NOT modify the underlying type record.
  type_id: string;
  name: string;
  avatar?: string;
  note?: string;
}

export interface DAGNode {
  key: string;
  title: string;
  produces: string;
  is_intake?: boolean;
  // [0] = TYPE id; [1..] = real-person helper IDs (employees with bound_user_id).
  assignee_employee_ids?: string[];
  // Instance-specific overrides (name / note / avatar). Optional; legacy nodes
  // without `instance` fall back to reading from the referenced type record.
  instance?: DAGNodeInstance;
  // Legacy fields (read-only; new editor doesn't write these)
  type?: "human" | "ai" | "review" | "auto";
  role?: string;
  auto_submit?: boolean;
}
export interface DAGEdge { from: string; to: string }
export interface DAG {
  nodes: DAGNode[];
  edges: DAGEdge[];
  entry: string;
}

export interface WorkflowVersion {
  id: string;
  workflow_id: string;
  version: number;
  dag: DAG;
  created_at: string;
}

export interface Task {
  id: string;
  workspace_id: string;
  workflow_version_id: string;
  title: string;
  source: string;
  status: string;
  payload: unknown;
  created_by?: string | null;
  created_at: string;
}

export interface NodeRun {
  id: string;
  task_id: string;
  node_key: string;
  parent_run_id?: string | null;
  executor_type: string;
  executor_employee_id?: string | null;
  assignee_user_id?: string | null;
  status: NodeRunStatus;
  inputs: unknown;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
}

export interface Artifact {
  id: string;
  node_run_id: string;
  kind: string;
  version: number;
  payload: Record<string, unknown>;
  blob_url?: string | null;
  created_at: string;
}

export interface Review {
  id: string;
  node_run_id: string;
  reviewer_user_id: string;
  reviewer_role: string;
  vote?: string | null;
  rollback_to_node_key?: string | null;
  comment?: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  workspace_id: string;
  task_id?: string | null;
  node_run_id?: string | null;
  kind: string;
  to_user_id?: string | null;
  body: string;
  read_at?: string | null;
  created_at: string;
}

export interface TaskDetail {
  task: Task;
  workflow_version: WorkflowVersion;
  node_runs: { run: NodeRun; artifacts: Artifact[]; reviews: Review[] }[];
}

export interface Skill {
  id: string;
  workspace_id: string;
  employee_id?: string | null;
  summary: string;
  source_node_run_id?: string | null;
  created_at: string;
}

export interface EmployeeStats {
  total_runs: number;
  completed: number;
  failed_back: number;
  win_rate: number;
  recent: {
    task_id: string;
    title: string;
    node_key: string;
    status: NodeRunStatus;
    created_at: string;
  }[];
}

export interface Preview {
  task: Task;
  build?: Record<string, unknown>;
  deploy?: Record<string, unknown>;
}

export interface AssignmentItem {
  task: Task;
  node_run: NodeRun;
}

export interface RegisterPayload {
  username: string;
  password: string;
}

export interface OnboardPayload {
  kind: "admin" | "employee";
  im_provider?: string;
  im_external_id?: string;
  im_handle?: string;
}

export interface ProjectItem {
  workflow: Workflow;
  has_active_task: boolean;
  active_tasks: number;
  bound_node_keys: string[];
}
