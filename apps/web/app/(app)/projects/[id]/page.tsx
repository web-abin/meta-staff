"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { api } from "../../../../lib/api";
import { useT } from "../../../../lib/i18n";
import { useUser } from "../../../../lib/user";
import { useEvents } from "../../../../lib/ws";
import type { Employee, MyTaskItem, TaskDetail } from "../../../../lib/types";
import { TaskHandler } from "./_task-handler";

export default function TaskDetailPage() {
  const { t } = useT();
  const params = useParams<{ id: string }>();
  const taskID = params.id;
  const { me, ready } = useUser();

  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [myInfo, setMyInfo] = useState<MyTaskItem | null>(null);
  const [myEmployee, setMyEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const [d, mine, emp] = await Promise.all([
        api.task(taskID),
        api.myTasks().catch(() => [] as MyTaskItem[]),
        api.myEmployee().catch(() => null as Employee | null),
      ]);
      setDetail(d);
      setMyInfo(mine.find((x) => x.task.id === taskID) ?? null);
      setMyEmployee(emp);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!ready) return;
    // admin 也允许进入：admin 可以被绑定到节点上，需要看任务进度。
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, me, taskID]);

  useEvents(() => {
    void refresh();
  });

  // 找到当前 awaiting_human 且分配给当前用户的 run（用来驱动 TaskHandler）。
  const myAwaitingRun = useMemo(() => {
    if (!detail || !myEmployee || !myInfo) return null;
    for (const nr of detail.node_runs) {
      if (nr.run.status !== "awaiting_human") continue;
      if (myInfo.bound_node_keys.includes(nr.run.node_key)) {
        return nr.run;
      }
    }
    return null;
  }, [detail, myEmployee, myInfo]);

  if (!ready || !me) return null;

  if (loading) {
    return (
      <div className="p-10 text-[14px]" style={{ color: "var(--text-3)" }}>
        {t("common.loading")}
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="mx-auto max-w-[1100px] px-8 py-8">
        <Link href="/projects" className="text-[13px]" style={{ color: "var(--text-3)" }}>
          {t("requests.back")}
        </Link>
        <div
          className="mt-8 p-10 rounded-md text-center text-[14px]"
          style={{ background: "var(--bg-soft)", color: "var(--text-3)" }}
        >
          {t("common.empty")}
        </div>
      </div>
    );
  }

  const wfName = ""; // workflow_version 不带名字，简化只展示 task 标题。
  const atMyNode = myAwaitingRun !== null;

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-8">
      <Link href="/projects" className="text-[13px]" style={{ color: "var(--text-3)" }}>
        {t("requests.back")}
      </Link>

      <h1 className="mt-4 text-[22px] font-semibold flex items-center gap-3">
        <span>{detail.task.title}</span>
        {atMyNode && (
          <span
            className="text-[12px] px-2 py-0.5 rounded-md"
            style={{ background: "#ffe5e5", color: "var(--danger)" }}
          >
            {t("requests.your_turn")}
          </span>
        )}
      </h1>

      {/* 进度条 */}
      <ProgressTimeline detail={detail} myNodeKeys={myInfo?.bound_node_keys ?? []} />

      {atMyNode && myAwaitingRun && (
        <div className="mt-6">
          <TaskHandler
            workflowName={wfName}
            assignment={{ task: detail.task, node_run: myAwaitingRun }}
            detail={detail}
            onChanged={refresh}
          />
        </div>
      )}

      {!atMyNode && (
        <div
          className="mt-6 p-4 rounded-md text-[13px]"
          style={{ background: "var(--bg-soft)", color: "var(--text-3)" }}
        >
          {t("requests.readonly_hint")}
        </div>
      )}
    </div>
  );
}

function ProgressTimeline({
  detail,
  myNodeKeys,
}: {
  detail: TaskDetail;
  myNodeKeys: string[];
}) {
  const { t } = useT();
  const dag = detail.workflow_version.dag;
  const mySet = new Set(myNodeKeys);
  // 按 dag.nodes 顺序展示状态（同一个 node 多个 run 取最新非 rolled_back）
  const latestRunByNode = new Map<string, (typeof detail.node_runs)[number]["run"]>();
  for (const nr of detail.node_runs) {
    if (nr.run.status === "rolled_back") continue;
    const prev = latestRunByNode.get(nr.run.node_key);
    if (!prev || new Date(prev.created_at) < new Date(nr.run.created_at)) {
      latestRunByNode.set(nr.run.node_key, nr.run);
    }
  }
  return (
    <div className="mt-6 card p-4">
      <div className="text-[13px] font-medium mb-3">{t("requests.progress")}</div>
      <ul className="space-y-1.5">
        {dag.nodes.map((n) => {
          const run = latestRunByNode.get(n.key);
          const isMine = mySet.has(n.key);
          const status = run?.status ?? "pending";
          const color =
            status === "done"
              ? "var(--success)"
              : status === "running"
              ? "var(--primary)"
              : status === "awaiting_human"
              ? "var(--warning)"
              : status === "failed"
              ? "var(--danger)"
              : "var(--text-3)";
          return (
            <li
              key={n.key}
              className="flex items-center gap-3 text-[13px] p-2 rounded-md"
              style={{ background: isMine ? "var(--primary-soft)" : "transparent" }}
            >
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ background: color }}
              />
              <span className="font-medium">{n.title}</span>
              <span className="font-mono text-[11px]" style={{ color: "var(--text-3)" }}>
                {n.key}
              </span>
              <span className="text-[11px] ml-auto" style={{ color }}>
                {t(("status." + status) as any) || status}
              </span>
              {isMine && (
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#fff4e5", color: "var(--warning)" }}>
                  {t("requests.mine")}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
