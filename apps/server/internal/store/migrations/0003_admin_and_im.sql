-- Admin role + per-employee IM binding + activation flag.
-- Backwards compatible: existing employees become pure-AI (no bound user, inactive).

alter table employees
  add column if not exists bound_user_id   uuid references users(id) on delete set null,
  add column if not exists im_provider     text,
  add column if not exists im_external_id  text,
  add column if not exists im_handle       text,
  add column if not exists is_active       boolean not null default true;

-- Activate seed employees so admin can immediately bind them in the editor.
update employees set is_active = true where is_active is null;

-- One admin user per workspace; idempotent insert by email.
insert into users(id, workspace_id, name, email, role)
values (
  '11111111-1111-1111-1111-1111111111aa',
  '00000000-0000-0000-0000-000000000001',
  '管理员',
  'admin@meta-staff.local',
  'admin'
)
on conflict (workspace_id, email) do nothing;
