-- workflow_employees: explicit "员工属于工作流" 绑定。和 DAG 节点的
-- assignee_employee_ids 解耦：先把员工加入工作流（左侧员工面板），再把其中
-- 的真人员工拖到具体节点（右侧节点详情的"真人助手"）。
--
-- 用途：
-- - 普通员工创建需求时，只能选自己所属工作流；
-- - 工作流内的所有员工（人类）都能在"需求列表"看到该工作流的全部任务；
-- - 节点真人助手选择器只列工作流成员（避免列出整个工作区员工）。
create table if not exists workflow_employees (
  workflow_id  uuid not null references workflows(id) on delete cascade,
  employee_id  uuid not null references employees(id) on delete cascade,
  added_at     timestamptz not null default now(),
  primary key (workflow_id, employee_id)
);
create index if not exists idx_wfemp_emp on workflow_employees(employee_id);

-- 回填：把默认工作流当前 DAG 里所有 assignee_employee_ids 提到的员工，
-- 都补成工作流成员（向后兼容旧数据）。
insert into workflow_employees(workflow_id, employee_id)
select distinct w.id, e.id
  from workflows w
  join workflow_versions wv on wv.workflow_id = w.id and wv.version = w.active_version
  cross join lateral jsonb_array_elements(wv.dag->'nodes') as node
  cross join lateral jsonb_array_elements_text(coalesce(node->'assignee_employee_ids','[]'::jsonb)) as eid
  join employees e on e.id::text = eid
on conflict do nothing;
