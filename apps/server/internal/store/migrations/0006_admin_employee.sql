-- admin 也是一个 Employee（bound_user_id = admin user id），这样 admin 能
-- 出现在工作流员工列表里 / 被绑到节点上。
-- 同时把这个 admin employee 加入默认工作流的成员。

insert into employees (id, workspace_id, role, name, avatar, system_prompt, tools, model,
                       bound_user_id, is_active)
values (
  '22222222-2222-2222-2222-2222222222ad',
  '00000000-0000-0000-0000-000000000001',
  'admin', '管理员', '管',
  '你是管理员/老板 · 拥有完整权限，可在任何节点把关。',
  '["search-skill"]'::jsonb,
  'claude-opus-4-7',
  '11111111-1111-1111-1111-1111111111aa',
  true
)
on conflict (id) do nothing;

insert into workflow_employees (workflow_id, employee_id)
values ('33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-2222222222ad')
on conflict do nothing;
