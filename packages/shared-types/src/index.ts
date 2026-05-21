// Phase 2 placeholder. Phase 3 will add: Workflow, NodeRun, Artifact, Employee, Review, Message.

export type NodeRunStatus =
  | "pending"
  | "running"
  | "awaiting_human"
  | "done"
  | "failed"
  | "rolled_back";

export type EmployeeRole = "pm" | "qa" | "dev" | "ops" | "cs" | string;

export interface HealthzResponse {
  ok: boolean;
  env: string;
  ts: string;
}
