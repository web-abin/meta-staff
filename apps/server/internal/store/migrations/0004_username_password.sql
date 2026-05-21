-- 用户名 + 密码登录（MVP 假注册：明文密码，仅用于演示）。
-- 角色 'pending' 表示注册了但还没走完 onboarding（选员工类型 + IM）。

alter table users
  add column if not exists username text,
  add column if not exists password text not null default '';

create unique index if not exists users_ws_username_unique
  on users(workspace_id, username) where username is not null;

-- 给已有 seed 用户填默认 username/password，以便能直接登录演示。
-- username 取邮箱 @ 之前部分；密码统一 '1234'。
update users
   set username = split_part(email, '@', 1),
       password = '1234'
 where username is null;
