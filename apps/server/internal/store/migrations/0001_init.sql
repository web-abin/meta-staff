create extension if not exists "pgcrypto";
create extension if not exists vector;

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  unique(workspace_id, email)
);

create table employees (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  role text not null,
  name text not null,
  avatar text,
  system_prompt text not null,
  tools jsonb not null default '[]'::jsonb,
  model text not null default 'claude-opus-4-7',
  created_at timestamptz not null default now()
);
create index idx_employees_ws on employees(workspace_id);

create table workflows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  description text,
  is_default boolean not null default false,
  active_version integer not null default 1,
  created_at timestamptz not null default now()
);
create index idx_workflows_ws on workflows(workspace_id);

create table workflow_versions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  version integer not null,
  dag jsonb not null,
  created_at timestamptz not null default now(),
  unique(workflow_id, version)
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  workflow_version_id uuid not null references workflow_versions(id),
  title text not null,
  source text not null,
  status text not null default 'open',
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index idx_tasks_ws on tasks(workspace_id, created_at desc);

create table node_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  node_key text not null,
  parent_run_id uuid references node_runs(id),
  executor_type text not null,
  executor_employee_id uuid references employees(id),
  assignee_user_id uuid references users(id),
  status text not null default 'pending',
  inputs jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_noderuns_task on node_runs(task_id, created_at);
create index idx_noderuns_status on node_runs(status);

create table artifacts (
  id uuid primary key default gen_random_uuid(),
  node_run_id uuid not null references node_runs(id) on delete cascade,
  kind text not null,
  version integer not null default 1,
  payload jsonb not null default '{}'::jsonb,
  blob_url text,
  created_at timestamptz not null default now()
);
create index idx_artifacts_run on artifacts(node_run_id, created_at);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  node_run_id uuid not null references node_runs(id) on delete cascade,
  reviewer_user_id uuid not null references users(id),
  reviewer_role text not null,
  vote text,
  rollback_to_node_key text,
  comment text,
  created_at timestamptz not null default now(),
  unique(node_run_id, reviewer_user_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  node_run_id uuid references node_runs(id) on delete cascade,
  kind text not null,
  to_user_id uuid references users(id),
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_messages_user_unread on messages(to_user_id, read_at, created_at desc);

create table skill_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  employee_id uuid references employees(id) on delete set null,
  summary text not null,
  source_node_run_id uuid references node_runs(id) on delete set null,
  embedding vector(1024),
  created_at timestamptz not null default now()
);
