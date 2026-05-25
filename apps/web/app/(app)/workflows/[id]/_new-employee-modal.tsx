"use client";

import { useEffect, useState } from "react";

import { api } from "../../../../lib/api";
import { useT, type MsgKey } from "../../../../lib/i18n";
import type { Employee, User } from "../../../../lib/types";

interface EmployeeType {
  key: string;
  role: string;
  defaultName: string;
  avatar: string;
  labelKey: MsgKey;
  defaultPrompt: string;
}

const TYPES: EmployeeType[] = [
  {
    key: "pm",
    role: "pm-agent",
    defaultName: "产品经理",
    avatar: "产",
    labelKey: "emp_type.pm",
    defaultPrompt: "你是产品经理。\n- 输入：原始需求 / 用户反馈\n- 输出：结构化 PRD 文档\n- 风格：清晰、可执行",
  },
  {
    key: "design",
    role: "design-agent",
    defaultName: "设计师",
    avatar: "设",
    labelKey: "emp_type.design",
    defaultPrompt: "你是设计师。\n- 输入：PRD\n- 输出：设计稿 / 交互说明\n- 风格：简洁、贴合品牌",
  },
  {
    key: "dev",
    role: "dev-agent",
    defaultName: "开发",
    avatar: "开",
    labelKey: "emp_type.dev",
    defaultPrompt: "你是开发工程师。\n- 输入：PRD + 设计稿\n- 输出：代码 / 预览链接\n- 风格：可维护、可测试",
  },
  {
    key: "qa",
    role: "qa-agent",
    defaultName: "测试",
    avatar: "测",
    labelKey: "emp_type.qa",
    defaultPrompt: "你是测试工程师。\n- 输入：PRD + 代码\n- 输出：用例 + 测试报告\n- 风格：覆盖关键路径与边界",
  },
  {
    key: "ops",
    role: "ops-agent",
    defaultName: "运维",
    avatar: "运",
    labelKey: "emp_type.ops",
    defaultPrompt: "你是运维工程师。\n- 输入：构建产物\n- 输出：部署结果 / 监控\n- 风格：稳定、可回滚",
  },
  {
    key: "growth",
    role: "growth-agent",
    defaultName: "运营",
    avatar: "营",
    labelKey: "emp_type.growth",
    defaultPrompt: "你是运营。\n- 输入：上线产品\n- 输出：推广策略、活动机制\n- 风格：聚焦关键指标",
  },
  {
    key: "support",
    role: "support-agent",
    defaultName: "客服",
    avatar: "客",
    labelKey: "emp_type.support",
    defaultPrompt: "你是客服。\n- 输入：用户问题\n- 输出：回复 / 工单升级\n- 风格：友好、准确",
  },
  {
    key: "data",
    role: "data-agent",
    defaultName: "数据分析师",
    avatar: "数",
    labelKey: "emp_type.data",
    defaultPrompt: "你是数据分析师。\n- 输入：日志、埋点数据\n- 输出：报表与洞察\n- 风格：用数据说话",
  },
];

export function NewEmployeeModal({
  workflowID,
  onClose,
  onCreated,
}: {
  workflowID: string;
  existing: Employee[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useT();
  const [kind, setKind] = useState<"digital" | "human">("digital");

  // digital state
  const [type, setType] = useState<EmployeeType>(TYPES[0]);
  const defaultName = type.defaultName;
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState(TYPES[0].defaultPrompt);

  // human state
  const [userID, setUserID] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [humanName, setHumanName] = useState("");
  const [humanAvatar, setHumanAvatar] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (kind !== "human" || users.length > 0) return;
    setUsersLoading(true);
    api
      .users()
      .then((list) => setUsers(list))
      .catch(() => undefined)
      .finally(() => setUsersLoading(false));
  }, [kind, users.length]);

  function pickType(et: EmployeeType) {
    setType(et);
    setPrompt(et.defaultPrompt);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      let createdID: string;
      if (kind === "human") {
        if (!userID.trim()) {
          setErr(t("new_emp.user_required"));
          setBusy(false);
          return;
        }
        const emp = await api.createEmployee({
          kind: "human",
          user_id: userID.trim(),
          name: humanName.trim() || undefined,
          avatar: humanAvatar.trim() || undefined,
        });
        createdID = emp.id;
      } else {
        const finalName = name.trim() || defaultName;
        const emp = await api.createEmployee({
          kind: "digital",
          role: type.role,
          name: finalName,
          avatar: type.avatar,
          system_prompt: prompt,
          tools: [],
        });
        createdID = emp.id;
      }
      // 绑定到当前工作流
      try {
        await api.addWorkflowEmployee(workflowID, createdID);
      } catch {
        // 失败也不阻断创建本身——后续可以手动加。
      }
      onCreated();
    } catch (e) {
      setErr(String((e as Error).message ?? e));
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="card w-full max-w-[640px] max-h-[90vh] flex flex-col"
        style={{ boxShadow: "var(--shadow-lg)" }}
      >
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h3 className="text-[16px] font-semibold">{t("new_emp.title")}</h3>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            aria-label="close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* 数字 / 真人 切换 */}
          <div>
            <div className="text-[13px] mb-2" style={{ color: "var(--text-2)" }}>
              {t("new_emp.kind")}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["digital", "human"] as const).map((k) => {
                const on = k === kind;
                return (
                  <button
                    type="button"
                    key={k}
                    onClick={() => setKind(k)}
                    className="px-3 py-2.5 rounded-md text-[13px] transition"
                    style={{
                      border: `1px solid ${on ? "var(--primary)" : "var(--border)"}`,
                      background: on ? "var(--primary-soft)" : "var(--surface)",
                      color: on ? "var(--primary)" : "var(--text)",
                      fontWeight: on ? 500 : 400,
                    }}
                  >
                    {k === "digital" ? t("new_emp.kind_digital") : t("new_emp.kind_human")}
                  </button>
                );
              })}
            </div>
          </div>

          {kind === "digital" && (
            <>
              <div>
                <div className="text-[13px] mb-2" style={{ color: "var(--text-2)" }}>
                  {t("new_emp.type")}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {TYPES.map((et) => {
                    const on = et.key === type.key;
                    return (
                      <button
                        type="button"
                        key={et.key}
                        onClick={() => pickType(et)}
                        className="px-3 py-2.5 rounded-md text-[13px] transition"
                        style={{
                          border: `1px solid ${on ? "var(--primary)" : "var(--border)"}`,
                          background: on ? "var(--primary-soft)" : "var(--surface)",
                          color: on ? "var(--primary)" : "var(--text)",
                          fontWeight: on ? 500 : 400,
                        }}
                      >
                        {t(et.labelKey)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="block">
                <div className="text-[13px] mb-1.5" style={{ color: "var(--text-2)" }}>
                  {t("new_emp.name")}
                </div>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("new_emp.name_placeholder", { next: defaultName })}
                />
              </label>

              <label className="block">
                <div className="text-[13px] mb-1.5" style={{ color: "var(--text-2)" }}>
                  {t("new_emp.prompt")}
                </div>
                <textarea
                  rows={7}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={t("new_emp.prompt_placeholder")}
                />
              </label>
            </>
          )}

          {kind === "human" && (
            <>
              <div>
                <div className="text-[13px] mb-1.5" style={{ color: "var(--text-2)" }}>
                  {t("new_emp.user_id")}
                </div>
                <input
                  value={userID}
                  onChange={(e) => setUserID(e.target.value)}
                  placeholder={t("new_emp.user_id_placeholder")}
                />
                <div className="text-[11px] mt-1" style={{ color: "var(--text-3)" }}>
                  {t("new_emp.user_id_hint")}
                </div>
              </div>

              {usersLoading ? (
                <div className="text-[12px]" style={{ color: "var(--text-3)" }}>
                  {t("common.loading")}
                </div>
              ) : users.length > 0 ? (
                <div>
                  <div className="text-[12px] mb-1.5" style={{ color: "var(--text-3)" }}>
                    {t("new_emp.user_pick_existing")}
                  </div>
                  <div className="grid grid-cols-2 gap-1 max-h-[180px] overflow-y-auto">
                    {users.map((u) => {
                      const on = u.id === userID;
                      return (
                        <button
                          type="button"
                          key={u.id}
                          onClick={() => {
                            setUserID(u.id);
                            if (!humanName) setHumanName(u.name);
                          }}
                          className="px-2 py-1.5 rounded text-left text-[12px]"
                          style={{
                            border: `1px solid ${on ? "var(--primary)" : "var(--border)"}`,
                            background: on ? "var(--primary-soft)" : "var(--surface)",
                          }}
                        >
                          <div className="truncate font-medium">{u.name}</div>
                          <div
                            className="truncate text-[11px] font-mono"
                            style={{ color: "var(--text-3)" }}
                          >
                            {u.username || u.email}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <label className="block">
                <div className="text-[13px] mb-1.5" style={{ color: "var(--text-2)" }}>
                  {t("new_emp.display_name")}
                </div>
                <input
                  value={humanName}
                  onChange={(e) => setHumanName(e.target.value)}
                  placeholder={t("new_emp.display_name_placeholder")}
                />
              </label>

              <label className="block">
                <div className="text-[13px] mb-1.5" style={{ color: "var(--text-2)" }}>
                  {t("new_emp.avatar")}
                </div>
                <input
                  value={humanAvatar}
                  onChange={(e) => setHumanAvatar(e.target.value)}
                  placeholder="人"
                  maxLength={2}
                />
              </label>
            </>
          )}

          {err && (
            <div className="text-[13px]" style={{ color: "var(--danger)" }}>
              {err}
            </div>
          )}
        </div>

        <div
          className="px-6 py-3 flex items-center justify-end gap-2"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <button type="button" onClick={onClose} className="btn">
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={busy} className="btn btn-primary">
            {busy ? "…" : t("common.create")}
          </button>
        </div>
      </form>
    </div>
  );
}
