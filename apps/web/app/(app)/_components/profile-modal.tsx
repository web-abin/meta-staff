"use client";

import { useState } from "react";

import { api } from "../../../lib/api";
import { useT } from "../../../lib/i18n";
import type { Employee } from "../../../lib/types";

export function ProfileModal({
  employee,
  onClose,
  onSaved,
}: {
  employee: Employee | null;
  onClose: () => void;
  onSaved: (e: Employee) => void;
}) {
  const { t } = useT();
  const [imProvider, setImProvider] = useState(employee?.im_provider ?? "feishu");
  const [imId, setImId] = useState(employee?.im_external_id ?? "");
  const [imHandle, setImHandle] = useState(employee?.im_handle ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!employee) return;
    setBusy(true);
    setErr(null);
    try {
      const updated = await api.updateEmployee(employee.id, {
        im_provider: imProvider,
        im_external_id: imId.trim(),
        im_handle: imHandle.trim(),
      });
      onSaved(updated);
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
        className="card w-full max-w-[480px] p-6"
        style={{ boxShadow: "var(--shadow-lg)" }}
      >
        <h3 className="text-[18px] font-semibold">{t("profile.title")}</h3>

        {employee ? (
          <>
            <div className="mt-4 p-3 rounded-md" style={{ background: "var(--bg-soft)" }}>
              <div className="text-[12px]" style={{ color: "var(--text-3)" }}>
                {t("header.emp_id")}
              </div>
              <div className="font-mono text-[13px] mt-1">{employee.id}</div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              <label className="block">
                <div className="text-[12px] mb-1" style={{ color: "var(--text-2)" }}>
                  {t("profile.im_provider")}
                </div>
                <select value={imProvider} onChange={(e) => setImProvider(e.target.value)}>
                  <option value="feishu">飞书 Feishu</option>
                  <option value="wechat">微信 WeChat</option>
                  <option value="wecom">企业微信</option>
                  <option value="slack">Slack</option>
                  <option value="email">Email</option>
                </select>
              </label>
              <label className="block col-span-2">
                <div className="text-[12px] mb-1" style={{ color: "var(--text-2)" }}>
                  {t("profile.im_id")}
                </div>
                <input value={imId} onChange={(e) => setImId(e.target.value)} />
              </label>
              <label className="block col-span-3">
                <div className="text-[12px] mb-1" style={{ color: "var(--text-2)" }}>
                  {t("profile.im_handle")}
                </div>
                <input value={imHandle} onChange={(e) => setImHandle(e.target.value)} />
              </label>
            </div>

            {err && (
              <div className="mt-3 text-[13px]" style={{ color: "var(--danger)" }}>
                {err}
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-2">
              <button type="button" onClick={onClose} className="btn">
                {t("common.cancel")}
              </button>
              <button type="submit" disabled={busy} className="btn btn-primary">
                {busy ? "…" : t("common.save")}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-4 text-[13px]" style={{ color: "var(--text-2)" }}>
              管理员账号无需绑定 IM。
            </p>
            <div className="mt-6 flex items-center justify-end">
              <button type="button" onClick={onClose} className="btn">
                {t("common.cancel")}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
