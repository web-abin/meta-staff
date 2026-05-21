"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { api } from "../../../../lib/api";
import { useT } from "../../../../lib/i18n";
import { isAdmin, useUser } from "../../../../lib/user";
import type { Employee, EmployeeStats, Skill } from "../../../../lib/types";

export default function EmployeeDetailPage() {
  const { t } = useT();
  const params = useParams<{ id: string }>();
  const empID = params.id;
  const router = useRouter();
  const { me, ready } = useUser();
  const admin = isAdmin(me);

  const [emp, setEmp] = useState<Employee | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [stats, setStats] = useState<EmployeeStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Editable fields
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [active, setActive] = useState(true);
  const [tools, setTools] = useState<string[]>([]);
  const [newTool, setNewTool] = useState("");
  const [newSkill, setNewSkill] = useState("");

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (me && !admin) {
      router.replace("/projects");
      return;
    }
    if (!empID) return;
    (async () => {
      try {
        const [e, sk, st] = await Promise.all([
          api.employee(empID),
          api.employeeSkills(empID),
          api.employeeStats(empID).catch(() => null),
        ]);
        setEmp(e);
        setName(e.name);
        setModel(e.model);
        setPrompt(e.system_prompt);
        setActive(e.is_active);
        setTools(toolsToList(e.tools));
        setSkills(sk);
        setStats(st);
      } catch (e) {
        setErr(String((e as Error).message ?? e));
      } finally {
        setLoading(false);
      }
    })();
  }, [ready, me, admin, empID, router]);

  const dirty = useMemo(() => {
    if (!emp) return false;
    return (
      name !== emp.name ||
      model !== emp.model ||
      prompt !== emp.system_prompt ||
      active !== emp.is_active ||
      !sameTools(tools, toolsToList(emp.tools))
    );
  }, [emp, name, model, prompt, active, tools]);

  async function save() {
    if (!emp || !dirty) return;
    setSaving(true);
    setErr(null);
    try {
      const updated = await api.updateEmployee(emp.id, {
        name: name.trim() || emp.name,
        model,
        system_prompt: prompt,
        is_active: active,
        tools,
      });
      setEmp(updated);
      setName(updated.name);
      setModel(updated.model);
      setPrompt(updated.system_prompt);
      setActive(updated.is_active);
      setTools(toolsToList(updated.tools));
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  function addTool() {
    const v = newTool.trim();
    if (!v) return;
    if (tools.includes(v)) {
      setNewTool("");
      return;
    }
    setTools([...tools, v]);
    setNewTool("");
  }

  function removeTool(v: string) {
    setTools(tools.filter((x) => x !== v));
  }

  async function addSkill() {
    if (!emp) return;
    const v = newSkill.trim();
    if (!v) return;
    try {
      const created = await api.createEmployeeSkill(emp.id, v);
      setSkills((prev) => [created, ...prev]);
      setNewSkill("");
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    }
  }

  if (!ready || !me) return null;
  if (loading) {
    return (
      <div className="mx-auto max-w-[1200px] px-8 py-10 text-[14px]" style={{ color: "var(--text-3)" }}>
        {t("common.loading")}
      </div>
    );
  }
  if (!emp) {
    return (
      <div className="mx-auto max-w-[1200px] px-8 py-10">
        <Link href="/workflows" className="text-[13px]" style={{ color: "var(--text-3)" }}>
          ← {t("emp_detail.back")}
        </Link>
        <div className="mt-6 text-[14px]" style={{ color: "var(--danger)" }}>
          {err || "找不到该员工"}
        </div>
      </div>
    );
  }

  const human = !!emp.bound_user_id;

  return (
    <div className="mx-auto max-w-[1200px] px-8 py-8">
      <Link href="/workflows" className="text-[13px] inline-flex items-center gap-1" style={{ color: "var(--text-3)" }}>
        ← {t("emp_detail.back")}
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="inline-flex items-center justify-center w-12 h-12 rounded-md text-[16px] font-medium shrink-0"
            style={{
              background: human ? "#fff4e5" : "var(--primary-soft)",
              color: human ? "var(--warning)" : "var(--primary)",
            }}
          >
            {emp.avatar || emp.name.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold truncate">{emp.name}</h1>
            <div className="text-[13px] mt-0.5" style={{ color: "var(--text-3)" }}>
              {emp.role} · {human ? "真人" : "AI"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {savedAt && (
            <span className="text-[12px]" style={{ color: "var(--success)" }}>
              ✓ {t("emp_detail.saved")}
            </span>
          )}
          <button type="button" disabled={!dirty || saving} onClick={save} className="btn btn-primary">
            {saving ? t("emp_detail.saving") : t("emp_detail.save")}
          </button>
        </div>
      </div>

      {err && (
        <div className="mt-3 text-[13px]" style={{ color: "var(--danger)" }}>
          {err}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* LEFT — basics + prompt */}
        <div className="lg:col-span-2 space-y-5">
          <section className="card p-5">
            <h3 className="text-[14px] font-medium mb-4">{t("emp_detail.basics")}</h3>
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <div className="text-[12px] mb-1.5" style={{ color: "var(--text-2)" }}>
                  {t("emp_detail.name")}
                </div>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="block">
                <div className="text-[12px] mb-1.5" style={{ color: "var(--text-2)" }}>
                  {t("emp_detail.model")}
                </div>
                <input value={model} onChange={(e) => setModel(e.target.value)} />
              </label>
              <label className="block col-span-2">
                <div className="text-[12px] mb-1.5" style={{ color: "var(--text-2)" }}>
                  {t("emp_detail.role")}
                </div>
                <input value={emp.role} disabled />
                <div className="text-[11px] mt-1" style={{ color: "var(--text-3)" }}>
                  {t("emp_detail.role_hint")}
                </div>
              </label>
              <label
                className="col-span-2 flex items-center gap-3 p-3 rounded-md cursor-pointer"
                style={{ background: "var(--bg-soft)" }}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  style={{ width: "auto" }}
                />
                <div>
                  <div className="text-[13px] font-medium">{t("edit_emp.active")}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
                    {t("edit_emp.inactive_hint")}
                  </div>
                </div>
              </label>
            </div>
          </section>

          <section className="card p-5">
            <h3 className="text-[14px] font-medium">{t("emp_detail.prompt")}</h3>
            <p className="text-[12px] mt-1 mb-3" style={{ color: "var(--text-3)" }}>
              {t("emp_detail.prompt_hint")}
            </p>
            <textarea
              rows={12}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </section>
        </div>

        {/* RIGHT — tools + skills + stats */}
        <div className="space-y-5">
          <section className="card p-5">
            <h3 className="text-[14px] font-medium">{t("emp_detail.tools")}</h3>
            <p className="text-[12px] mt-1 mb-3" style={{ color: "var(--text-3)" }}>
              {t("emp_detail.tools_hint")}
            </p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {tools.length === 0 && (
                <span className="text-[12px]" style={{ color: "var(--text-3)" }}>
                  {t("emp_detail.tools_empty")}
                </span>
              )}
              {tools.map((tt) => (
                <span
                  key={tt}
                  className="inline-flex items-center gap-1 px-2 py-[2px] rounded text-[12px]"
                  style={{ background: "var(--bg-soft)", color: "var(--text)" }}
                >
                  {tt}
                  <button
                    type="button"
                    onClick={() => removeTool(tt)}
                    className="opacity-60 hover:opacity-100"
                    aria-label="remove"
                    style={{ color: "var(--text-3)" }}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newTool}
                onChange={(e) => setNewTool(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTool();
                  }
                }}
                placeholder={t("emp_detail.tools_placeholder")}
                className="flex-1"
              />
              <button type="button" onClick={addTool} className="btn btn-sm">
                {t("emp_detail.tools_add")}
              </button>
            </div>
          </section>

          <section className="card p-5">
            <h3 className="text-[14px] font-medium">{t("emp_detail.skills")}</h3>
            <p className="text-[12px] mt-1 mb-3" style={{ color: "var(--text-3)" }}>
              {t("emp_detail.skills_hint")}
            </p>
            <div className="flex gap-2 mb-3">
              <input
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addSkill();
                  }
                }}
                placeholder={t("emp_detail.skills_placeholder")}
                className="flex-1"
              />
              <button type="button" onClick={() => void addSkill()} className="btn btn-sm">
                {t("emp_detail.skills_add")}
              </button>
            </div>
            {skills.length === 0 ? (
              <div className="text-[12px]" style={{ color: "var(--text-3)" }}>
                {t("emp_detail.skills_empty")}
              </div>
            ) : (
              <ul className="space-y-2 max-h-[280px] overflow-y-auto">
                {skills.map((s) => (
                  <li
                    key={s.id}
                    className="p-2.5 rounded-md text-[13px] leading-relaxed"
                    style={{ background: "var(--bg-soft)" }}
                  >
                    {s.summary}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {stats && (
            <section className="card p-5">
              <h3 className="text-[14px] font-medium mb-4">{t("emp_detail.stats")}</h3>
              <div className="grid grid-cols-2 gap-3">
                <StatTile label={t("emp_detail.stats_runs")} value={stats.total_runs} />
                <StatTile label={t("emp_detail.stats_done")} value={stats.completed} />
                <StatTile label={t("emp_detail.stats_back")} value={stats.failed_back} />
                <StatTile
                  label={t("emp_detail.stats_rate")}
                  value={`${Math.round(stats.win_rate * 100)}%`}
                  tone="primary"
                />
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "primary";
}) {
  return (
    <div
      className="p-3 rounded-md"
      style={{ background: "var(--bg-soft)" }}
    >
      <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
        {label}
      </div>
      <div
        className="text-[20px] font-semibold mt-1"
        style={{ color: tone === "primary" ? "var(--primary)" : "var(--text)" }}
      >
        {value}
      </div>
    </div>
  );
}

function toolsToList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return [];
}

function sameTools(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
