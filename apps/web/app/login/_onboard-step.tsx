"use client";

import { useState } from "react";

import { api } from "../../lib/api";
import { useT } from "../../lib/i18n";
import { useUser } from "../../lib/user";
import type { User } from "../../lib/types";

type Kind = "admin" | "employee";

export function OnboardStep({ onDone }: { onDone: (u: User) => void }) {
  const { t } = useT();
  const { reload } = useUser();
  const [kind, setKind] = useState<Kind>("employee");
  const [imProvider, setImProvider] = useState("feishu");
  const [imId, setImId] = useState("");
  const [imHandle, setImHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const body =
        kind === "admin"
          ? { kind: "admin" as const }
          : {
              kind: "employee" as const,
              im_provider: imProvider || undefined,
              im_external_id: imId.trim() || undefined,
              im_handle: imHandle.trim() || undefined,
            };
      const res = await api.onboard(body);
      await reload();
      onDone(res.user);
    } catch (e) {
      setErr(String((e as Error).message ?? e));
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
    >
      <form
        onSubmit={submit}
        className="card w-full max-w-[520px] p-7"
        style={{ boxShadow: "var(--shadow-lg)" }}
      >
        <div className="text-[12px] mb-1" style={{ color: "var(--primary)" }}>
          {t("onboard.step")}
        </div>
        <h2 className="text-[20px] font-semibold">{t("onboard.subtitle")}</h2>

        <div className="mt-6">
          <div className="text-[13px] mb-2" style={{ color: "var(--text-2)" }}>
            {t("onboard.kind")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(["admin", "employee"] as Kind[]).map((k) => {
              const on = k === kind;
              return (
                <button
                  type="button"
                  key={k}
                  onClick={() => setKind(k)}
                  className="text-left p-4 rounded-md transition"
                  style={{
                    border: `1px solid ${on ? "var(--primary)" : "var(--border)"}`,
                    background: on ? "var(--primary-soft)" : "var(--surface)",
                  }}
                >
                  <div
                    className="text-[14px] font-medium"
                    style={{ color: on ? "var(--primary)" : "var(--text)" }}
                  >
                    {t(k === "admin" ? "onboard.kind_admin" : "onboard.kind_employee")}
                  </div>
                  <div
                    className="text-[12px] mt-1 leading-relaxed"
                    style={{ color: "var(--text-3)" }}
                  >
                    {t(
                      k === "admin"
                        ? "onboard.kind_admin_hint"
                        : "onboard.kind_employee_hint"
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {kind === "employee" && (
          <div className="mt-5">
            <div className="text-[13px]" style={{ color: "var(--text-2)" }}>
              {t("onboard.im_label")}
            </div>
            <div className="text-[12px] mb-3" style={{ color: "var(--text-3)" }}>
              {t("onboard.im_hint")}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="block">
                <div className="text-[12px] mb-1" style={{ color: "var(--text-2)" }}>
                  {t("onboard.im_provider")}
                </div>
                <select
                  value={imProvider}
                  onChange={(ev) => setImProvider(ev.target.value)}
                >
                  <option value="feishu">飞书 Feishu</option>
                  <option value="wechat">微信 WeChat</option>
                  <option value="wecom">企业微信</option>
                  <option value="slack">Slack</option>
                  <option value="email">Email</option>
                </select>
              </label>
              <label className="block col-span-2">
                <div className="text-[12px] mb-1" style={{ color: "var(--text-2)" }}>
                  {t("onboard.im_id")}
                </div>
                <input
                  value={imId}
                  onChange={(ev) => setImId(ev.target.value)}
                  placeholder={t("onboard.im_id_placeholder")}
                />
              </label>
              <label className="block col-span-3">
                <div className="text-[12px] mb-1" style={{ color: "var(--text-2)" }}>
                  {t("onboard.im_handle")}
                </div>
                <input
                  value={imHandle}
                  onChange={(ev) => setImHandle(ev.target.value)}
                  placeholder={t("onboard.im_handle_placeholder")}
                />
              </label>
            </div>
          </div>
        )}

        {err && (
          <div className="mt-3 text-[13px]" style={{ color: "var(--danger)" }}>
            {err}
          </div>
        )}

        <button type="submit" disabled={busy} className="btn btn-primary w-full mt-6">
          {busy ? "…" : t("onboard.submit")}
        </button>
      </form>
    </div>
  );
}
