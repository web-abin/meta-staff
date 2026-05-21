"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { api } from "../../../../lib/api";
import { useT } from "../../../../lib/i18n";
import { isAdmin, useUser } from "../../../../lib/user";
import { useEvents } from "../../../../lib/ws";
import type {
  AssignmentItem,
  ProjectItem,
  TaskDetail,
} from "../../../../lib/types";
import { TaskHandler } from "./_task-handler";

export default function ProjectDetailPage() {
  const { t } = useT();
  const params = useParams<{ id: string }>();
  const wfID = params.id;
  const { me, ready } = useUser();
  const router = useRouter();

  const [project, setProject] = useState<ProjectItem | null>(null);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [details, setDetails] = useState<Record<string, TaskDetail>>({});
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const [projects, items] = await Promise.all([
        api.myProjects(),
        api.myAssignments(),
      ]);
      const p = projects.find((x) => x.workflow.id === wfID) ?? null;
      setProject(p);
      setAssignments(items);
      const mine = p ? items.filter((a) => p.bound_node_keys.includes(a.node_run.node_key)) : [];
      const seen = new Set<string>();
      const map: Record<string, TaskDetail> = {};
      await Promise.all(
        mine.map(async (a) => {
          if (seen.has(a.task.id)) return;
          seen.add(a.task.id);
          try {
            const d = await api.task(a.task.id);
            if (d.task.workflow_version_id) map[a.task.id] = d;
          } catch {
            /* ignore */
          }
        })
      );
      setDetails(map);
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
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, me, wfID, router]);

  useEvents(() => {
    void refresh();
  });

  const myTasks = useMemo(() => {
    if (!project) return [];
    return assignments.filter((a) =>
      project.bound_node_keys.includes(a.node_run.node_key)
    );
  }, [project, assignments]);

  if (!ready || !me) return null;

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-8">
      <Link
        href="/projects"
        className="text-[13px] inline-flex items-center gap-1 mb-4"
        style={{ color: "var(--text-3)" }}
      >
        ← {t("emp_wb.projects")}
      </Link>

      <h1 className="text-[22px] font-semibold">{project?.workflow.name ?? "—"}</h1>

      {loading ? (
        <div className="mt-10 text-[14px]" style={{ color: "var(--text-3)" }}>
          {t("common.loading")}
        </div>
      ) : myTasks.length === 0 ? (
        <div
          className="mt-10 p-10 rounded-md text-center"
          style={{ background: "var(--bg-soft)" }}
        >
          <div className="text-[15px] font-medium mb-2">{t("task.no_active")}</div>
          <div className="text-[13px]" style={{ color: "var(--text-3)" }}>
            {t("task.no_active_hint")}
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {myTasks.map((a) => {
            const detail = details[a.task.id];
            return (
              <TaskHandler
                key={a.node_run.id}
                workflowName={project?.workflow.name ?? ""}
                assignment={a}
                detail={detail}
                onChanged={refresh}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
