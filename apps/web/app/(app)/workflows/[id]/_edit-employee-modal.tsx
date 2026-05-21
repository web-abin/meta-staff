"use client";

import Link from "next/link";
import { useState } from "react";

import { api } from "../../../../lib/api";
import { useT } from "../../../../lib/i18n";
import type { Employee } from "../../../../lib/types";

export function EditEmployeeModal({
  employee,
  onClose,
  onSaved,
}: {
  employee: Employee;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState(employee.name);
  const [prompt, setPrompt] = useState(employee.system_prompt);
  const [active, setActive] = useState(employee.is_active);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.updateEmployee(employee.id, {
        name: name.trim() || employee.name,
        system_prompt: prompt,
        is_active: active,
      });
      onSaved();
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
        className="card w-full max-w-[600px] max-h-[90vh] flex flex-col"
        style={{ boxShadow: "var(--shadow-lg)" }}
      >
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h3 className="text-[16px] font-semibold">{t("edit_emp.title")}</h3>
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
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center justify-center w-12 h-12 rounded-md text-[15px] font-medium"
              style={{
                background: employee.bound_user_id ? "#fff4e5" : "var(--primary-soft)",
                color: employee.bound_user_id ? "var(--warning)" : "var(--primary)",
              }}
            >
              {employee.avatar || employee.name.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium">{employee.name}</div>
              <div className="text-[12px]" style={{ color: "var(--text-3)" }}>
                {employee.role} · {employee.bound_user_id ? "真人" : "AI"}
              </div>
            </div>
          </div>

          <label className="block">
            <div className="text-[13px] mb-1.5" style={{ color: "var(--text-2)" }}>
              {t("new_emp.name")}
            </div>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label className="block">
            <div className="text-[13px] mb-1.5" style={{ color: "var(--text-2)" }}>
              {t("new_emp.prompt")}
            </div>
            <textarea
              rows={8}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>

          <label
            className="flex items-start gap-3 p-3 rounded-md cursor-pointer"
            style={{ background: "var(--bg-soft)" }}
          >
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="mt-1 w-auto"
              style={{ width: "auto" }}
            />
            <div>
              <div className="text-[13px] font-medium">{t("edit_emp.active")}</div>
              <div className="text-[12px] mt-0.5" style={{ color: "var(--text-3)" }}>
                {t("edit_emp.inactive_hint")}
              </div>
            </div>
          </label>

          <Link
            href={`/employees/${employee.id}`}
            onClick={onClose}
            className="block text-[13px]"
            style={{ color: "var(--primary)" }}
          >
            → {t("edit_emp.open_detail")}
          </Link>

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
            {busy ? "…" : t("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
