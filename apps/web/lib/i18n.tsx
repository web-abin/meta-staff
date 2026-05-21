"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Locale = "zh" | "en";

export const LOCALE_KEY = "meta-staff:locale";

type Entry = { zh: string; en: string };

const M = {
  // Common
  "common.lang": { zh: "语言", en: "Language" },
  "common.theme": { zh: "主题", en: "Theme" },
  "common.theme.light": { zh: "浅色", en: "Light" },
  "common.theme.dark": { zh: "深色", en: "Dark" },
  "common.quick_start": { zh: "快速开始", en: "Quick start" },
  "common.logout": { zh: "退出登录", en: "Log out" },
  "common.save": { zh: "保存", en: "Save" },
  "common.cancel": { zh: "取消", en: "Cancel" },
  "common.confirm": { zh: "确认", en: "Confirm" },
  "common.submit": { zh: "提交", en: "Submit" },
  "common.delete": { zh: "删除", en: "Delete" },
  "common.edit": { zh: "编辑", en: "Edit" },
  "common.create": { zh: "新建", en: "Create" },
  "common.loading": { zh: "加载中…", en: "Loading…" },
  "common.empty": { zh: "暂无数据", en: "No data" },
  "common.back": { zh: "返回", en: "Back" },

  // Home
  "home.brand": { zh: "meta-staff", en: "meta-staff" },
  "home.hero.title": { zh: "数字员工，编成可执行的工作流", en: "Digital employees, composed into runnable workflows" },
  "home.hero.subtitle": {
    zh: "把团队里的角色拆成数字员工，把流程拆成节点。AI 处理可自动化的环节，人类只在关键节点把关。",
    en: "Decompose team roles into digital employees, and processes into nodes. AI runs what can be automated; humans gate the critical steps.",
  },
  "home.hero.cta": { zh: "快速开始", en: "Get started" },
  "home.hero.cta_workbench": { zh: "进入工作台", en: "Enter workbench" },

  "home.idea.label": { zh: "核心理念", en: "Idea" },
  "home.idea.title": { zh: "为什么是「数字员工 + 工作流」", en: "Why digital employees plus workflows" },
  "home.idea.body": {
    zh: "传统自动化要么完全靠规则（不够聪明），要么完全靠 AI（不够可控）。我们让 AI 担当一个个具体的「数字员工」，每个员工有自己的角色与能力；再把他们串成你需要的流程。关键节点保留人工干预，让 AI 高效，让团队可控。",
    en: "Traditional automation is either rule-based (not smart enough) or fully AI (not controllable enough). Here, AI plays specific 'digital employees' — each with a role and skill set — chained into the workflow you need. Humans gate critical nodes so AI moves fast while the team stays in control.",
  },

  "home.how.label": { zh: "怎么工作", en: "How it works" },
  "home.how.title": { zh: "三步把流程跑起来", en: "Three steps to run a flow" },
  "home.how.s1.title": { zh: "01 · 创建数字员工", en: "01 · Create digital employees" },
  "home.how.s1.body": {
    zh: "在员工面板里新建：选择员工类型（产品、开发、测试、运营、运维…），填入姓名与补充能力，员工就准备好了。",
    en: "Open the employee panel: pick a type (PM, Dev, QA, Growth, Ops…), give them a name and extra skills — and the employee is ready.",
  },
  "home.how.s2.title": { zh: "02 · 编排工作流", en: "02 · Compose the workflow" },
  "home.how.s2.body": {
    zh: "在工作流画布上拖出节点，把员工拽到节点上。支持多分支：审核通过走 A 路径，被打回走 B 路径。",
    en: "Drag nodes onto the canvas and drop employees on each. Branches are first-class — approvals go down path A, rejections take path B.",
  },
  "home.how.s3.title": { zh: "03 · AI 跑节点，人类把关", en: "03 · AI runs, humans gate" },
  "home.how.s3.body": {
    zh: "运行起来后，纯 AI 节点自动推进；遇到「需要人工干预」的节点，系统会把任务推到绑定员工的 IM（飞书/微信）上，由 TA 决策放行或打回。",
    en: "Once live, AI nodes run themselves; when a human-gated node fires, the task is pushed to that employee's IM (Feishu / WeChat) and they decide whether to pass or reject.",
  },

  "home.nodes.label": { zh: "节点类型", en: "Node types" },
  "home.nodes.title": { zh: "只有两种节点", en: "Just two kinds of nodes" },
  "home.nodes.ai.title": { zh: "AI 执行节点", en: "AI nodes" },
  "home.nodes.ai.body": {
    zh: "由数字员工自动完成。前置节点的产物（文档、图片、代码、数据）会作为输入，员工按自己的提示词与能力产出结果。",
    en: "Auto-run by a digital employee. Upstream artifacts (docs, images, code, data) become the inputs; the employee produces an output guided by its system prompt and tools.",
  },
  "home.nodes.human.title": { zh: "人为干预节点", en: "Human-in-the-loop" },
  "home.nodes.human.body": {
    zh: "绑定到一个真人员工。运行到此节点时，会立刻把上游产物打包推送到 TA 的 IM，TA 可以选「通过」放行，也可以选「打回」并指定回到哪个上游节点。",
    en: "Bound to a real person. When triggered, upstream artifacts are pushed to their IM; they can pass it on, or reject and pick which upstream node to roll back to.",
  },

  "home.roles.label": { zh: "员工角色", en: "Roles" },
  "home.roles.title": { zh: "互联网产研全链路角色", en: "Full product / engineering coverage" },
  "home.roles.body": {
    zh: "系统内置常见员工类型：产品经理、设计师、开发、测试、运维、运营、客服…你也可以基于这些类型继续定制，给员工补充独家能力。",
    en: "Built-in roles span PM, Design, Dev, QA, Ops, Growth, Support… each can be customized with extra skills on top of the base type.",
  },

  "home.cta.title": { zh: "现在就把第一个工作流跑起来", en: "Spin up your first workflow now" },
  "home.cta.body": {
    zh: "默认带一个开箱即用的工作流，登录后即可在工作台进入。",
    en: "Sign in and open the workbench — a default workflow is ready to run.",
  },

  "home.footer.copy": { zh: "© meta-staff", en: "© meta-staff" },

  // Auth
  "auth.login": { zh: "登录", en: "Log in" },
  "auth.register": { zh: "注册", en: "Sign up" },
  "auth.username": { zh: "用户名", en: "Username" },
  "auth.username_placeholder": { zh: "请输入用户名", en: "your username" },
  "auth.password": { zh: "密码", en: "Password" },
  "auth.password_placeholder": { zh: "请输入密码", en: "your password" },
  "auth.login_submit": { zh: "登录", en: "Log in" },
  "auth.register_submit": { zh: "注册", en: "Sign up" },
  "auth.no_account": { zh: "还没有账号？立即注册", en: "No account? Sign up" },
  "auth.have_account": { zh: "已有账号？立即登录", en: "Have an account? Log in" },
  "auth.register_hint": { zh: "用户名 + 密码即可注册，下一步完善信息", en: "Just username + password — fill in details next" },

  // Onboard step 2
  "onboard.step": { zh: "完善信息", en: "Complete profile" },
  "onboard.subtitle": { zh: "选择员工类型并绑定 IM 账号", en: "Pick a role and bind your IM" },
  "onboard.kind": { zh: "员工类型", en: "Role" },
  "onboard.kind_admin": { zh: "管理员", en: "Admin" },
  "onboard.kind_admin_hint": { zh: "管理工作流和数字员工，对系统有完整权限", en: "Manage workflows & employees, full system access" },
  "onboard.kind_employee": { zh: "普通员工", en: "Regular employee" },
  "onboard.kind_employee_hint": { zh: "处理被分派的任务，IM 通知到达后到工作台操作", en: "Handle assigned tasks; act on IM notifications" },
  "onboard.im_label": { zh: "IM 账号", en: "IM accounts" },
  "onboard.im_hint": { zh: "工作流到达你负责的节点时，会把任务推送到这里", en: "Tasks are pushed here when a workflow reaches your node" },
  "onboard.im_provider": { zh: "渠道", en: "Channel" },
  "onboard.im_id": { zh: "账号 ID", en: "Account ID" },
  "onboard.im_id_placeholder": { zh: "例如 ou_xxxxxx 或微信号", en: "e.g. ou_xxxxxx or WeChat ID" },
  "onboard.im_handle": { zh: "昵称", en: "Handle" },
  "onboard.im_handle_placeholder": { zh: "你在 IM 里的显示名", en: "Your IM display name" },
  "onboard.submit": { zh: "提交完成注册", en: "Finish" },

  // Header (workbench)
  "header.workflows": { zh: "工作流", en: "Workflows" },
  "header.projects": { zh: "项目", en: "Projects" },
  "header.profile": { zh: "个人信息", en: "Profile" },
  "header.emp_id": { zh: "员工 ID", en: "Employee ID" },

  // Profile editor
  "profile.title": { zh: "编辑个人信息", en: "Edit profile" },
  "profile.im_provider": { zh: "IM 渠道", en: "IM provider" },
  "profile.im_id": { zh: "IM 账号 ID", en: "IM account ID" },
  "profile.im_handle": { zh: "IM 昵称", en: "IM handle" },

  // Workbench dashboard
  "wb.title": { zh: "工作台", en: "Workbench" },
  "wb.wf_section": { zh: "工作流", en: "Workflows" },
  "wb.wf_section_sub": { zh: "数字员工实例编排，按节点执行", en: "Compose employee instances into runnable nodes" },
  "wb.emp_section": { zh: "数字员工类型", en: "Employee types" },
  "wb.emp_section_sub": { zh: "管理可复用的员工模板：提示词、工具、技能。修改后所有引用此类型的实例同步生效", en: "Reusable templates: prompts, tools, skills. Changes propagate to every instance" },
  "wb.emp_open": { zh: "进入详情", en: "Configure" },
  "wb.emp_inactive": { zh: "未激活", en: "Inactive" },

  // Workflows (admin)
  "wf.list.title": { zh: "工作流", en: "Workflows" },
  "wf.list.subtitle": { zh: "选择工作流进入编辑面板", en: "Open a workflow to edit it" },
  "wf.list.default_tag": { zh: "默认", en: "Default" },
  "wf.list.version": { zh: "v", en: "v" },
  "wf.detail.back": { zh: "返回工作流列表", en: "Back to workflows" },
  "wf.detail.save": { zh: "保存新版本", en: "Save version" },
  "wf.detail.saving": { zh: "保存中…", en: "Saving…" },
  "wf.detail.saved": { zh: "已保存", en: "Saved" },
  "wf.detail.add_node": { zh: "添加节点", en: "Add node" },

  // Employee roster (admin sidebar)
  "roster.title": { zh: "数字员工类型", en: "Employee types" },
  "roster.create": { zh: "新建员工", en: "New employee" },
  "roster.empty": { zh: "暂无员工，点上方按钮创建", en: "No employees yet" },
  "roster.drag_hint": { zh: "拖到画布生成实例", en: "Drag to canvas to create an instance" },
  "roster.edit": { zh: "编辑", en: "Edit" },

  // Edit employee modal
  "edit_emp.title": { zh: "编辑员工类型", en: "Edit employee type" },
  "edit_emp.open_detail": { zh: "打开详情页（管理技能 / 工具 / 统计）", en: "Open full detail (skills / tools / stats)" },
  "edit_emp.active": { zh: "激活", en: "Active" },
  "edit_emp.inactive_hint": { zh: "未激活的员工不会出现在画布选择器中", en: "Inactive employees are hidden from the canvas" },
  "edit_emp.delete": { zh: "停用员工", en: "Deactivate" },

  // Employee detail page
  "emp_detail.back": { zh: "返回工作台", en: "Back to workbench" },
  "emp_detail.basics": { zh: "基础信息", en: "Basics" },
  "emp_detail.name": { zh: "名称", en: "Name" },
  "emp_detail.role": { zh: "角色标识", en: "Role" },
  "emp_detail.role_hint": { zh: "员工类别，对应内置岗位语义（pm-agent / qa-agent 等）", en: "Role identifier (pm-agent / qa-agent etc.)" },
  "emp_detail.model": { zh: "模型", en: "Model" },
  "emp_detail.active": { zh: "状态", en: "Status" },
  "emp_detail.prompt": { zh: "系统提示词", en: "System prompt" },
  "emp_detail.prompt_hint": { zh: "定义这个员工的工作方式、输入输出、风格", en: "Defines this employee's working style and IO contract" },
  "emp_detail.tools": { zh: "工具与 MCP", en: "Tools & MCP" },
  "emp_detail.tools_hint": { zh: "员工可调用的工具或挂载的 MCP 服务名", en: "Tools the employee can call, or MCP service names" },
  "emp_detail.tools_placeholder": { zh: "工具名，如 search-skill 或 mcp:filesystem", en: "Tool name, e.g. search-skill or mcp:filesystem" },
  "emp_detail.tools_add": { zh: "添加工具", en: "Add" },
  "emp_detail.tools_empty": { zh: "暂无工具", en: "No tools yet" },
  "emp_detail.skills": { zh: "技能沉淀", en: "Accumulated skills" },
  "emp_detail.skills_hint": { zh: "AI 节点完成后会自动沉淀经验；也可以手动添加", en: "Auto-collected after AI runs; you can also add manually" },
  "emp_detail.skills_placeholder": { zh: "一句话总结：场景 + 处理思路 / 决策", en: "One-liner: situation + decision / approach" },
  "emp_detail.skills_add": { zh: "新增技能", en: "Add" },
  "emp_detail.skills_empty": { zh: "暂无沉淀", en: "No skills yet" },
  "emp_detail.stats": { zh: "胜率统计", en: "Win-rate" },
  "emp_detail.stats_runs": { zh: "执行节点", en: "Runs" },
  "emp_detail.stats_done": { zh: "完成", en: "Done" },
  "emp_detail.stats_back": { zh: "失败/打回", en: "Failed/back" },
  "emp_detail.stats_rate": { zh: "胜率", en: "Win-rate" },
  "emp_detail.save": { zh: "保存修改", en: "Save changes" },
  "emp_detail.saved": { zh: "已保存", en: "Saved" },
  "emp_detail.saving": { zh: "保存中…", en: "Saving…" },

  // New employee modal
  "new_emp.title": { zh: "新建数字员工", en: "New digital employee" },
  "new_emp.type": { zh: "员工类型", en: "Type" },
  "new_emp.name": { zh: "类型名称", en: "Type name" },
  "new_emp.name_placeholder": { zh: "默认与类型同名（{next}），可自定义", en: "Defaults to {next}, customizable" },
  "new_emp.prompt": { zh: "补充能力 / 系统提示词", en: "Extra skills / system prompt" },
  "new_emp.prompt_placeholder": { zh: "描述这个员工的工作风格、专长、注意事项…", en: "Describe their style, strengths, things to watch out for…" },

  // Workflow node detail (employee-as-node)
  "node.detail.primary": { zh: "员工类型", en: "Employee type" },
  "node.detail.primary_empty": { zh: "未绑定 — 从左侧拖一个员工过来", en: "Unbound — drag an employee here" },
  "node.detail.primary_hint": { zh: "类型在主工作台管理；此处仅编辑实例", en: "Type is managed on the workbench; edit only this instance here" },
  "node.detail.helpers": { zh: "真人助手", en: "Human assistants" },
  "node.detail.helpers_hint": { zh: "需要人为干预时绑定真人员工，工作流到达此节点会推送到他们 IM", en: "Bind real-person employees for human-in-the-loop; IM is notified when reached" },
  "node.detail.add_helper": { zh: "+ 添加真人助手", en: "+ Add helper" },
  "node.detail.no_helper": { zh: "未绑定真人 · 纯 AI 节点", en: "No human helper · pure AI node" },
  "node.detail.instance_section": { zh: "实例设置", en: "Instance settings" },
  "node.detail.instance_hint": { zh: "下面的设置只影响这个节点，不会改类型", en: "Settings below affect only this node, not the type" },
  "node.detail.instance_name": { zh: "实例名称", en: "Instance name" },
  "node.detail.instance_name_hint": { zh: "默认与类型同名，可改成更贴合此节点的称呼", en: "Defaults to the type name; customize to fit this node" },
  "node.detail.instance_note": { zh: "补充信息 / 节点专属指令", en: "Note / node-specific instructions" },
  "node.detail.instance_note_hint": { zh: "会作为补充提示词附加到类型提示词后面", en: "Appended after the type's system prompt at runtime" },
  "node.detail.instance_note_placeholder": { zh: "例如：本节点产出文档需要关注用户引导环节…", en: "e.g. focus on onboarding details for this step" },
  "wf.canvas.empty": { zh: "拖一个数字员工到这里，开始搭建工作流", en: "Drag a digital employee here to start" },

  // Employee types (built-in)
  "emp_type.pm": { zh: "产品经理", en: "Product manager" },
  "emp_type.design": { zh: "设计师", en: "Designer" },
  "emp_type.dev": { zh: "开发工程师", en: "Developer" },
  "emp_type.qa": { zh: "测试工程师", en: "QA" },
  "emp_type.ops": { zh: "运维工程师", en: "Ops" },
  "emp_type.growth": { zh: "运营", en: "Growth" },
  "emp_type.support": { zh: "客服", en: "Support" },
  "emp_type.data": { zh: "数据分析师", en: "Data analyst" },

  // Node detail (right panel in workflow editor)
  "node.detail.title": { zh: "节点配置", en: "Node settings" },
  "node.detail.empty": { zh: "点击中间的节点查看详情", en: "Click a node to edit" },
  "node.detail.name": { zh: "节点名称", en: "Node name" },
  "node.detail.mode": { zh: "执行方式", en: "Mode" },
  "node.detail.mode_ai": { zh: "AI 自动执行", en: "AI auto" },
  "node.detail.mode_human": { zh: "需要人为干预", en: "Human-in-the-loop" },
  "node.detail.assignee": { zh: "指派员工", en: "Assigned employee" },
  "node.detail.assignee_unset": { zh: "未指派，从左侧拖一个员工过来", en: "Drag an employee from the left to assign" },
  "node.detail.delete": { zh: "删除节点", en: "Delete node" },

  // Employee workbench
  "emp_wb.welcome": { zh: "欢迎加入 meta-staff", en: "Welcome to meta-staff" },
  "emp_wb.welcome_body": {
    zh: "这是你的员工 ID，老板将用它把你绑定到工作流节点上：",
    en: "This is your employee ID — your admin uses it to bind you to workflow nodes:",
  },
  "emp_wb.welcome_close": { zh: "进入工作台", en: "Enter workbench" },
  "emp_wb.projects": { zh: "我的项目", en: "My projects" },
  "emp_wb.projects_empty": { zh: "暂无项目 — 管理员还没把你绑定到任何工作流", en: "No projects — admin hasn't bound you yet" },
  "emp_wb.has_task": { zh: "有任务", en: "Active" },
  "emp_wb.no_task": { zh: "暂无任务", en: "No task" },
  "emp_wb.task_count": { zh: "{n} 个待办", en: "{n} pending" },
  "emp_wb.bound_nodes": { zh: "你绑定的节点", en: "Bound nodes" },

  // Task processing
  "task.no_active": { zh: "暂时没有任务", en: "No task yet" },
  "task.no_active_hint": { zh: "工作流还没运行到你负责的节点，留意 IM 通知", en: "The workflow hasn't reached your node — watch your IM" },
  "task.current_label": { zh: "当前任务", en: "Current task" },
  "task.artifacts": { zh: "上游产物", en: "Upstream artifacts" },
  "task.artifacts.docs": { zh: "文档", en: "Documents" },
  "task.artifacts.images": { zh: "图片", en: "Images" },
  "task.artifacts.videos": { zh: "视频", en: "Videos" },
  "task.artifacts.empty": { zh: "暂无产物", en: "No artifacts yet" },
  "task.review.title": { zh: "处理结果", en: "Decision" },
  "task.review.approve": { zh: "通过", en: "Approve" },
  "task.review.reject": { zh: "需要修改", en: "Needs revision" },
  "task.review.rollback_to": { zh: "打回到", en: "Roll back to" },
  "task.review.select_node": { zh: "选择上游节点", en: "Select an upstream node" },
  "task.review.comment": { zh: "修改说明", en: "Notes" },
  "task.review.comment_placeholder": { zh: "说明需要修改什么…", en: "Describe what needs to change…" },
  "task.review.attach": { zh: "附件（图片 / 视频 / 文档）", en: "Attachments (image / video / doc)" },
  "task.review.submit": { zh: "提交", en: "Submit" },
  "task.review.submitting": { zh: "提交中…", en: "Submitting…" },

  // Status
  "status.pending": { zh: "待办", en: "Pending" },
  "status.running": { zh: "运行中", en: "Running" },
  "status.awaiting_human": { zh: "等待人工", en: "Waiting for human" },
  "status.done": { zh: "已完成", en: "Done" },
  "status.failed": { zh: "失败", en: "Failed" },
  "status.rolled_back": { zh: "已打回", en: "Rolled back" },

  // Health
  "health.checking": { zh: "检测服务…", en: "checking…" },
  "health.offline": { zh: "离线", en: "Offline" },
  "health.online": { zh: "在线", en: "Online" },
} satisfies Record<string, Entry>;

export type MsgKey = keyof typeof M;

interface Ctx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MsgKey, vars?: Record<string, string | number>) => string;
}

const I18nCtx = createContext<Ctx>({
  locale: "zh",
  setLocale: () => {},
  t: (key) => String(key),
});

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return "zh";
  const v = window.localStorage.getItem(LOCALE_KEY);
  return v === "en" ? "en" : "zh";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("zh");

  useEffect(() => {
    const stored = readStoredLocale();
    if (stored !== locale) setLocaleState(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LOCALE_KEY, l);
      document.documentElement.setAttribute("lang", l === "zh" ? "zh-CN" : "en");
    }
  }, []);

  const t = useCallback<Ctx["t"]>(
    (key, vars) => {
      const entry = M[key];
      let s = entry ? entry[locale] : String(key);
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return s;
    },
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useT() {
  return useContext(I18nCtx);
}
