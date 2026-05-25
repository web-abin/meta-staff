"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { api } from "../../../lib/api";
import { useT } from "../../../lib/i18n";
import { isAdmin, useUser } from "../../../lib/user";
import { useEvents } from "../../../lib/ws";
import type { Employee, MyTaskItem } from "../../../lib/types";

const FIRST_SEEN_KEY = "meta-staff:projects:first_seen";

export default function ProjectsPage() {
  const { t } = useT();
  const { me, ready } = useUser();
  const router = useRouter();
  const [items, setItems] = useState<MyTaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [welcome, setWelcome] = useState(false);

  async function refresh() {
    try {
      setItems(await api.myTasks());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!ready) return;
    if (me && isAdmin(me)) {
      router.replace("/workflows");
      return;
    }
    if (me) {
      api
        .myEmployee()
        .then((e) => {
          setEmployee(e);
          if (e && typeof window !== "undefined") {
            const seen = window.localStorage.getItem(FIRST_SEEN_KEY);
            if (seen !== me.id) setWelcome(true);
          }
        })
        .catch(() => setEmployee(null));
    }
    void refresh();
  }, [ready, me, router]);

  useEvents(() => {
    void refresh();
  });

  function dismissWelcome() {
    if (me && typeof window !== "undefined") {
      window.localStorage.setItem(FIRST_SEEN_KEY, me.id);
    }
    setWelcome(false);
  }

  if (!ready || !me) return null;

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-[24px] font-semibold">{t("requests.title")}</h1>
        <div className="text-[12px]" style={{ color: "var(--text-3)" }}>
          {t("requests.count", { n: items.length })}
        </div>
      </div>

      {loading ? (
        <div className="mt-10 text-[14px]" style={{ color: "var(--text-3)" }}>
          {t("common.loading")}
        </div>
      ) : items.length === 0 ? (
        <div
          className="mt-10 text-[14px] p-10 rounded-md text-center"
          style={{ background: "var(--bg-soft)", color: "var(--text-3)" }}
        >
          {t("requests.empty")}
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {items.map((it) => (
            <li key={it.task.id}>
              <Link
                href={`/projects/${it.task.id}`}
                className="card block p-4 transition hover:border-[var(--border-strong)] relative"
              >
                {it.at_my_node && (
                  <span
                    className="absolute top-3 right-3 inline-block w-2.5 h-2.5 rounded-full"
                    style={{ background: "var(--danger)" }}
                    aria-label="待处理"
                  />
                )}
                <div className="flex items-start gap-3">
                  <span
                    className="inline-flex items-center justify-center w-10 h-10 rounded-md shrink-0"
                    style={{
                      background: it.at_my_node ? "#ffe5e5" : "var(--primary-soft)",
                      color: it.at_my_node ? "var(--danger)" : "var(--primary)",
                    }}
                  >
                    <FlowIcon />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-medium truncate">
                      {it.task.title}
                    </div>
                    <div
                      className="mt-1 text-[12px] flex items-center gap-2 flex-wrap"
                      style={{ color: "var(--text-3)" }}
                    >
                      <span className="font-mono">{statusText(t, it)}</span>
                      <span>·</span>
                      <span>
                        {t("requests.current_node")}: {it.current_node_key || "—"}
                      </span>
                      {it.bound_node_keys.length > 0 && (
                        <>
                          <span>·</span>
                          <span>
                            {t("requests.mine")}:{" "}
                            <span className="font-mono">
                              {it.bound_node_keys.join(", ")}
                            </span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {it.at_my_node && (
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-md shrink-0"
                      style={{ background: "#ffe5e5", color: "var(--danger)" }}
                    >
                      {t("requests.your_turn")}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {welcome && employee && (
        <WelcomeModal employeeId={employee.id} onClose={dismissWelcome} />
      )}
    </div>
  );
}

function statusText(
  t: (k: any, vars?: Record<string, string | number>) => string,
  it: MyTaskItem
): string {
  if (it.task.status && it.task.status !== "open") return it.task.status;
  if (it.at_my_node) return t("requests.your_turn");
  return t("requests.running");
}

function WelcomeModal({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
  const { t } = useT();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
    >
      <div
        className="card w-full max-w-[460px] p-7 text-center"
        style={{ boxShadow: "var(--shadow-lg)" }}
      >
        <div
          className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-4"
          style={{ background: "var(--primary-soft)", color: "var(--primary)" }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <div className="text-[18px] font-semibold">{t("emp_wb.welcome")}</div>
        <p className="mt-2 text-[14px]" style={{ color: "var(--text-2)" }}>
          {t("emp_wb.welcome_body")}
        </p>
        <div
          className="mt-4 mx-auto inline-block px-4 py-2 rounded-md font-mono text-[13px]"
          style={{ background: "var(--bg-soft)" }}
        >
          {employeeId}
        </div>
        <button type="button" onClick={onClose} className="btn btn-primary w-full mt-6">
          {t("emp_wb.welcome_close")}
        </button>
      </div>
    </div>
  );
}

function FlowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="15" y="3" width="6" height="6" rx="1" />
      <rect x="9" y="15" width="6" height="6" rx="1" />
      <path d="M6 9v3a3 3 0 0 0 3 3M18 9v3a3 3 0 0 1-3 3" />
    </svg>
  );
}
