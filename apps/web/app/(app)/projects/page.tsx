"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { api } from "../../../lib/api";
import { useT } from "../../../lib/i18n";
import { isAdmin, useUser } from "../../../lib/user";
import { useEvents } from "../../../lib/ws";
import type { Employee, ProjectItem } from "../../../lib/types";

const FIRST_SEEN_KEY = "meta-staff:projects:first_seen";

export default function ProjectsPage() {
  const { t } = useT();
  const { me, ready } = useUser();
  const router = useRouter();
  const [items, setItems] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [welcome, setWelcome] = useState(false);

  async function refresh() {
    try {
      setItems(await api.myProjects());
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
    <div className="mx-auto max-w-[1200px] px-8 py-10">
      <div>
        <h1 className="text-[24px] font-semibold">{t("emp_wb.projects")}</h1>
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
          {t("emp_wb.projects_empty")}
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((it) => (
            <Link
              key={it.workflow.id}
              href={`/projects/${it.workflow.id}`}
              className="card p-5 transition hover:shadow-md relative"
              style={{ boxShadow: "var(--shadow-sm)" }}
            >
              <div className="flex items-center justify-between">
                <div
                  className="inline-flex items-center justify-center w-10 h-10 rounded-md"
                  style={{ background: "var(--primary-soft)", color: "var(--primary)" }}
                >
                  <FlowIcon />
                </div>
                {it.has_active_task ? (
                  <span className="badge">{it.active_tasks}</span>
                ) : (
                  <span className="tag">{t("emp_wb.no_task")}</span>
                )}
              </div>
              <div className="mt-4 text-[16px] font-medium">{it.workflow.name}</div>
              <div
                className="mt-1 text-[12px]"
                style={{ color: "var(--text-3)" }}
              >
                {t("emp_wb.bound_nodes")} · {it.bound_node_keys.length}
              </div>
              {it.has_active_task && (
                <div className="mt-3 text-[12px]" style={{ color: "var(--primary)" }}>
                  {t("emp_wb.task_count", { n: it.active_tasks })}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {welcome && employee && (
        <WelcomeModal employeeId={employee.id} onClose={dismissWelcome} />
      )}
    </div>
  );
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
