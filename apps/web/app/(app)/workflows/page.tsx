"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { api } from "../../../lib/api";
import { useT } from "../../../lib/i18n";
import { isAdmin, useUser } from "../../../lib/user";
import { useEvents } from "../../../lib/ws";
import type { Employee, MyTaskItem, Workflow } from "../../../lib/types";

export default function WorkbenchPage() {
  const { t } = useT();
  const { me, ready } = useUser();
  const router = useRouter();
  const admin = isAdmin(me);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tasks, setTasks] = useState<MyTaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    if (me && !admin) {
      router.replace("/projects");
      return;
    }
    (async () => {
      try {
        const [wfs, emps, ts] = await Promise.all([
          api.workflows(),
          api.employees(),
          api.myTasks(),
        ]);
        setWorkflows(wfs);
        setEmployees(emps);
        setTasks(ts);
      } finally {
        setLoading(false);
      }
    })();
  }, [ready, me, admin, router]);

  useEvents(() => {
    api.myTasks().then(setTasks).catch(() => {});
  });

  if (!ready || !me) return null;

  return (
    <div className="mx-auto max-w-[1200px] px-8 py-10 space-y-12">
      <h1 className="text-[24px] font-semibold">{t("wb.title")}</h1>

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="text-[18px] font-semibold">{t("wb.wf_section")}</h2>
            <p className="text-[13px] mt-0.5" style={{ color: "var(--text-3)" }}>
              {t("wb.wf_section_sub")}
            </p>
          </div>
        </div>
        {loading ? (
          <div className="text-[14px]" style={{ color: "var(--text-3)" }}>
            {t("common.loading")}
          </div>
        ) : workflows.length === 0 ? (
          <div className="text-[14px]" style={{ color: "var(--text-3)" }}>
            {t("common.empty")}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workflows.map((wf) => (
              <Link
                key={wf.id}
                href={`/workflows/${wf.id}`}
                className="card p-5 transition hover:shadow-md"
                style={{ boxShadow: "var(--shadow-sm)" }}
              >
                <div className="flex items-center justify-between">
                  <div
                    className="inline-flex items-center justify-center w-10 h-10 rounded-md"
                    style={{ background: "var(--primary-soft)", color: "var(--primary)" }}
                  >
                    <FlowIcon />
                  </div>
                  {wf.is_default && (
                    <span className="tag tag-primary">{t("wf.list.default_tag")}</span>
                  )}
                </div>
                <div className="mt-4 text-[16px] font-medium">{wf.name}</div>
                {wf.description && (
                  <p
                    className="mt-1 text-[13px] line-clamp-2"
                    style={{ color: "var(--text-3)" }}
                  >
                    {wf.description}
                  </p>
                )}
                <div
                  className="mt-3 text-[12px]"
                  style={{ color: "var(--text-3)" }}
                >
                  {t("wf.list.version")}
                  {wf.active_version}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="text-[18px] font-semibold">{t("wb.emp_section")}</h2>
            <p className="text-[13px] mt-0.5" style={{ color: "var(--text-3)" }}>
              {t("wb.emp_section_sub")}
            </p>
          </div>
        </div>
        {loading ? (
          <div className="text-[14px]" style={{ color: "var(--text-3)" }}>
            {t("common.loading")}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {employees
              .filter((e) => !e.bound_user_id)
              .map((e) => (
                <Link
                  key={e.id}
                  href={`/employees/${e.id}`}
                  className="card p-5 transition hover:shadow-md"
                  style={{ boxShadow: "var(--shadow-sm)" }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="inline-flex items-center justify-center w-10 h-10 rounded-md text-[14px] font-medium"
                      style={{ background: "var(--primary-soft)", color: "var(--primary)" }}
                    >
                      {e.avatar || e.name.slice(0, 1)}
                    </span>
                    {!e.is_active && (
                      <span className="tag">{t("wb.emp_inactive")}</span>
                    )}
                  </div>
                  <div className="mt-4 text-[16px] font-medium">{e.name}</div>
                  <div className="mt-1 text-[12px]" style={{ color: "var(--text-3)" }}>
                    {e.role}
                  </div>
                  <p
                    className="mt-3 text-[12px] line-clamp-2"
                    style={{ color: "var(--text-3)" }}
                  >
                    {e.system_prompt.split("\n")[0] || "—"}
                  </p>
                </Link>
              ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="text-[18px] font-semibold">{t("wb.tasks_section")}</h2>
            <p className="text-[13px] mt-0.5" style={{ color: "var(--text-3)" }}>
              {t("wb.tasks_section_sub")}
            </p>
          </div>
          <div className="text-[12px]" style={{ color: "var(--text-3)" }}>
            {t("requests.count", { n: tasks.length })}
          </div>
        </div>
        {loading ? (
          <div className="text-[14px]" style={{ color: "var(--text-3)" }}>
            {t("common.loading")}
          </div>
        ) : tasks.length === 0 ? (
          <div
            className="text-[13px] p-6 rounded-md text-center"
            style={{ background: "var(--bg-soft)", color: "var(--text-3)" }}
          >
            {t("wb.tasks_empty")}
          </div>
        ) : (
          <ul className="space-y-3">
            {tasks.map((it) => (
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
                      <div className="text-[15px] font-medium truncate">{it.task.title}</div>
                      <div
                        className="mt-1 text-[12px] flex items-center gap-2 flex-wrap"
                        style={{ color: "var(--text-3)" }}
                      >
                        <span>
                          {t("requests.current_node")}: {it.current_node_key || "—"}
                        </span>
                        {it.bound_node_keys.length > 0 && (
                          <>
                            <span>·</span>
                            <span>
                              {t("requests.mine")}:{" "}
                              <span className="font-mono">{it.bound_node_keys.join(", ")}</span>
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
      </section>
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
