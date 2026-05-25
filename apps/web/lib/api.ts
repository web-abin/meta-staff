import type {
  AssignmentItem,
  DAG,
  Employee,
  EmployeeStats,
  Message,
  OnboardPayload,
  Preview,
  ProjectItem,
  RegisterPayload,
  Skill,
  Task,
  TaskDetail,
  User,
  Workflow,
  WorkflowVersion,
} from "./types";

const BASE = "/api";

function userIdHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const uid = window.localStorage.getItem("meta-staff:user_id");
  return uid ? { "X-User-Id": uid } : {};
}

async function request<T>(
  path: string,
  init?: RequestInit & { json?: unknown }
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...userIdHeader(),
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  const res = await fetch(BASE + path, {
    ...init,
    headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText} — ${body}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

// Go marshals a nil slice as JSON null; normalize to [] for list endpoints.
async function listRequest<T>(path: string): Promise<T[]> {
  const v = await request<T[] | null>(path);
  return v ?? [];
}

export const api = {
  me: () => request<User>("/me"),
  users: () => listRequest<User>("/users"),
  myAssignments: () =>
    request<{ tasks: AssignmentItem[] }>("/me/assignments").then((r) => r.tasks ?? []),
  register: (body: RegisterPayload) =>
    request<{ user: User }>("/auth/register", { method: "POST", json: body }),
  login: (body: { username: string; password: string }) =>
    request<User>("/auth/login", { method: "POST", json: body }),
  onboard: (body: OnboardPayload) =>
    request<{ user: User; employee?: Employee }>("/me/onboard", { method: "POST", json: body }),
  myEmployee: () => request<Employee | null>("/me/employee"),
  myProjects: () =>
    request<{ projects: ProjectItem[] }>("/me/projects").then((r) => r.projects ?? []),
  uploadFile: async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const uid = typeof window !== "undefined" ? window.localStorage.getItem("meta-staff:user_id") : null;
    const res = await fetch("/api/uploads", {
      method: "POST",
      body: fd,
      headers: uid ? { "X-User-Id": uid } : {},
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return (await res.json()) as {
      url: string;
      name: string;
      size: number;
      mime: string;
      kind: "image" | "video" | "doc";
    };
  },
  updateEmployee: (
    id: string,
    body: Partial<{
      name: string;
      avatar: string;
      system_prompt: string;
      tools: string[];
      model: string;
      im_provider: string;
      im_external_id: string;
      im_handle: string;
      is_active: boolean;
    }>
  ) => request<Employee>(`/employees/${id}`, { method: "PATCH", json: body }),

  employees: () => listRequest<Employee>("/employees"),
  employee: (id: string) => request<Employee>(`/employees/${id}`),
  employeeStats: (id: string) => request<EmployeeStats>(`/employees/${id}/stats`),
  employeeSkills: (id: string) => listRequest<Skill>(`/employees/${id}/skills`),
  createEmployeeSkill: (id: string, summary: string) =>
    request<Skill>(`/employees/${id}/skills`, { method: "POST", json: { summary } }),
  createEmployee: (body: {
    role: string;
    name: string;
    avatar?: string | null;
    system_prompt: string;
    tools?: string[];
    model?: string;
  }) => request<Employee>("/employees", { method: "POST", json: body }),

  workflows: () => listRequest<Workflow>("/workflows"),
  workflowVersion: (id: string) =>
    request<WorkflowVersion>(`/workflows/${id}/version`),
  saveWorkflowVersion: (id: string, dag: DAG) =>
    request<WorkflowVersion>(`/workflows/${id}/versions`, {
      method: "POST",
      json: { dag },
    }),
  preview: (taskID: string) => request<Preview>(`/preview/${taskID}`),

  tasks: () => listRequest<Task>("/tasks"),
  task: (id: string) => request<TaskDetail>(`/tasks/${id}`),
  createTask: (body: {
    title: string;
    source: string;
    content: string;
    attachments?: { name: string; url: string; mime?: string; kind: string; size?: number }[];
  }) => request<Task>("/tasks", { method: "POST", json: body }),

  submitNodeRun: (runID: string, kind: string, payload: unknown) =>
    request<{ ok: true }>(`/node-runs/${runID}/submit`, {
      method: "POST",
      json: { kind, payload },
    }),
  voteReview: (
    runID: string,
    body: {
      reviewer_user_id: string;
      reviewer_role: string;
      vote: "approve" | "reject";
      rollback_to_node_key?: string;
      comment?: string;
    }
  ) =>
    request<{ ok: true }>(`/node-runs/${runID}/review`, {
      method: "POST",
      json: body,
    }),
  rollbackTask: (taskID: string, toNodeKey: string) =>
    request<{ ok: true }>(`/tasks/${taskID}/rollback`, {
      method: "POST",
      json: { to_node_key: toNodeKey },
    }),

  messages: () => listRequest<Message>("/messages"),
  markRead: (id: string) =>
    request<{ ok: true }>(`/messages/${id}/read`, { method: "POST" }),

  // Admin-only debug: 直连 hermes + 落盘 HTML
  // chat 走异步 job 模式：POST 立刻拿 job_id，前端轮询 GET 取结果。
  debugLLMChatStart: (body: { prompt: string; system?: string }) =>
    request<{ job_id: string; status: "running" }>("/debug/llm-chat", {
      method: "POST",
      json: body,
    }),
  debugLLMChatJob: (jobID: string) =>
    request<{
      id: string;
      status: "running" | "done" | "error";
      provider?: string;
      text?: string;
      error?: string;
      took_ms?: number;
    }>(`/debug/llm-chat/${jobID}`),
  debugSaveHTML: (body: { name: string; html: string }) =>
    request<{ url: string; path: string; name: string; size: number }>(
      "/debug/save-html",
      { method: "POST", json: body }
    ),
};

export function setActiveUserId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem("meta-staff:user_id", id);
  else window.localStorage.removeItem("meta-staff:user_id");
}

export function activeUserId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("meta-staff:user_id");
}
