"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { api } from "../../../../lib/api";
import { useT } from "../../../../lib/i18n";
import { isAdmin, useUser } from "../../../../lib/user";
import type { DAG, DAGNode, DAGNodeInstance, Employee, Workflow, WorkflowVersion } from "../../../../lib/types";

import { EmployeeRoster } from "./_employee-roster";
import { WorkflowCanvas } from "./_workflow-canvas";
import { NodeDetail } from "./_node-detail";

export default function WorkflowEditorPage() {
  const { t } = useT();
  const params = useParams<{ id: string }>();
  const wfID = params.id;
  const router = useRouter();
  const { me, ready } = useUser();
  const admin = isAdmin(me);

  const [wf, setWf] = useState<Workflow | null>(null);
  const [, setVersion] = useState<WorkflowVersion | null>(null);
  const [draft, setDraft] = useState<DAG | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [workflowEmployeeIDs, setWorkflowEmployeeIDs] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const positionsRef = useRef(new Map<string, { x: number; y: number }>());

  useEffect(() => {
    if (!ready) return;
    if (me && !admin) {
      router.replace("/projects");
      return;
    }
    (async () => {
      const [wfs, emps] = await Promise.all([api.workflows(), api.employees()]);
      const target = wfs.find((w) => w.id === wfID) ?? wfs.find((w) => w.is_default) ?? wfs[0];
      if (!target) return;
      setWf(target);
      setEmployees(emps);
      const [v, wfEmps] = await Promise.all([
        api.workflowVersion(target.id),
        api.workflowEmployees(target.id).catch(() => [] as Employee[]),
      ]);
      setVersion(v);
      setDraft(v.dag);
      setWorkflowEmployeeIDs(new Set(wfEmps.map((e) => e.id)));
    })();
  }, [ready, me, admin, wfID, router]);

  const reloadEmployees = useCallback(async () => {
    if (!wf) {
      setEmployees(await api.employees());
      return;
    }
    const [all, wfEmps] = await Promise.all([
      api.employees(),
      api.workflowEmployees(wf.id).catch(() => [] as Employee[]),
    ]);
    setEmployees(all);
    setWorkflowEmployeeIDs(new Set(wfEmps.map((e) => e.id)));
  }, [wf]);

  const empByID = useMemo(() => {
    const m = new Map<string, Employee>();
    employees.forEach((e) => m.set(e.id, e));
    return m;
  }, [employees]);

  const selected = useMemo(
    () => (draft && selectedKey ? draft.nodes.find((n) => n.key === selectedKey) ?? null : null),
    [draft, selectedKey]
  );

  const patchSelected = useCallback(
    (patch: Partial<DAGNode>) => {
      if (!draft || !selectedKey) return;
      setDraft({
        ...draft,
        nodes: draft.nodes.map((n) => (n.key === selectedKey ? { ...n, ...patch } : n)),
      });
    },
    [draft, selectedKey]
  );

  // Patches affect ONLY the instance snapshot on this node — never the type.
  // Auto-initializes instance from type for legacy nodes on first edit.
  const patchSelectedInstance = useCallback(
    (patch: Partial<DAGNodeInstance>) => {
      if (!draft || !selectedKey) return;
      setDraft({
        ...draft,
        nodes: draft.nodes.map((n) => {
          if (n.key !== selectedKey) return n;
          const typeEmpId = n.assignee_employee_ids?.[0] ?? "";
          const typeEmp = typeEmpId ? empByID.get(typeEmpId) : undefined;
          const base: DAGNodeInstance = n.instance ?? {
            type_id: typeEmpId,
            name: typeEmp?.name ?? n.title ?? "",
            avatar: typeEmp?.avatar ?? undefined,
          };
          return { ...n, instance: { ...base, ...patch } };
        }),
      });
    },
    [draft, selectedKey, empByID]
  );

  const removeSelected = useCallback(() => {
    if (!draft || !selectedKey) return;
    const nodes = draft.nodes.filter((n) => n.key !== selectedKey);
    const edges = draft.edges.filter((e) => e.from !== selectedKey && e.to !== selectedKey);
    positionsRef.current.delete(selectedKey);
    setDraft({
      ...draft,
      nodes,
      edges,
      entry: nodes[0]?.key ?? "",
    });
    setSelectedKey(null);
  }, [draft, selectedKey]);

  const addHelper = useCallback(
    (empId: string) => {
      if (!selected) return;
      const list = selected.assignee_employee_ids ?? [];
      if (list.includes(empId)) return;
      patchSelected({ assignee_employee_ids: [...list, empId] });
      // 同步把这个员工登记成工作流成员（含"自己"——admin 在新建工作流时不一定
      // 在 workflow_employees 里）。失败静默：DAG 已就绪。
      if (wf && !workflowEmployeeIDs.has(empId)) {
        api
          .addWorkflowEmployee(wf.id, empId)
          .then(() => {
            setWorkflowEmployeeIDs((prev) => {
              const next = new Set(prev);
              next.add(empId);
              return next;
            });
          })
          .catch(() => {});
      }
    },
    [selected, patchSelected, wf, workflowEmployeeIDs]
  );

  const removeHelper = useCallback(
    (empId: string) => {
      if (!selected) return;
      const list = (selected.assignee_employee_ids ?? []).filter((id) => id !== empId);
      patchSelected({ assignee_employee_ids: list });
    },
    [selected, patchSelected]
  );

  const onDropOnNode = useCallback(
    (nodeKey: string, empId: string) => {
      if (!draft) return;
      setDraft({
        ...draft,
        nodes: draft.nodes.map((n) => {
          if (n.key !== nodeKey) return n;
          const list = n.assignee_employee_ids ?? [];
          if (list.includes(empId)) return n;
          // A drop on an existing node always appends — primary stays;
          // additional employees become helpers (typically real-person for HITL).
          return { ...n, assignee_employee_ids: [...list, empId] };
        }),
      });
    },
    [draft]
  );

  const onDropOnPane = useCallback(
    (empId: string, pos: { x: number; y: number }) => {
      if (!draft) return;
      const emp = empByID.get(empId);
      if (!emp) return;
      const key = `node-${Date.now().toString(36)}`;
      positionsRef.current.set(key, pos);
      // SNAPSHOT the type into an independent instance. Future edits to either
      // the type or this instance do not affect the other.
      const node: DAGNode = {
        key,
        title: emp.name,
        produces: "artifact",
        assignee_employee_ids: [empId],
        instance: {
          type_id: empId,
          name: emp.name,
          avatar: emp.avatar ?? undefined,
        },
      };
      setDraft({
        ...draft,
        nodes: [...draft.nodes, node],
        entry: draft.entry || key,
      });
      setSelectedKey(key);
    },
    [draft, empByID]
  );

  async function save() {
    if (!draft || !wf) return;
    setSaving(true);
    try {
      const v = await api.saveWorkflowVersion(wf.id, draft);
      setVersion(v);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (!ready || !me) return null;
  if (!draft || !wf) {
    return (
      <div className="p-10 text-[14px]" style={{ color: "var(--text-3)" }}>
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-[260px_1fr_300px]"
      style={{ height: "calc(100vh - 56px)" }}
    >
      <aside
        className="overflow-hidden p-4"
        style={{ borderRight: "1px solid var(--border)", background: "var(--surface-2)" }}
      >
        <EmployeeRoster
          workflowID={wf.id}
          employees={employees.filter(
            (e) => e.is_active && workflowEmployeeIDs.has(e.id)
          )}
          onCreated={reloadEmployees}
        />
      </aside>

      <section className="flex flex-col min-w-0">
        <div
          className="h-12 px-5 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/workflows"
              className="btn btn-ghost btn-sm"
              style={{ color: "var(--text-3)" }}
            >
              ← {t("wf.detail.back")}
            </Link>
            <span style={{ color: "var(--text-3)" }}>·</span>
            <span className="text-[14px] font-medium truncate">{wf.name}</span>
            <span
              className="text-[12px] px-1.5 py-0.5 rounded"
              style={{ background: "var(--bg-soft)", color: "var(--text-3)" }}
            >
              v{wf.active_version}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {savedAt && (
              <span className="text-[12px]" style={{ color: "var(--success)" }}>
                ✓ {t("wf.detail.saved")}
              </span>
            )}
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="btn btn-primary btn-sm"
            >
              {saving ? t("wf.detail.saving") : t("wf.detail.save")}
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          <WorkflowCanvas
            draft={draft}
            empByID={empByID}
            selectedKey={selectedKey}
            positions={positionsRef}
            onSelect={setSelectedKey}
            onChange={(next) => setDraft(next)}
            onDropOnNode={onDropOnNode}
            onDropOnPane={onDropOnPane}
          />
        </div>
      </section>

      <aside
        className="overflow-hidden"
        style={{ borderLeft: "1px solid var(--border)", background: "var(--surface-2)" }}
      >
        <NodeDetail
          node={selected}
          empByID={empByID}
          allEmployees={employees}
          workflowMemberIDs={workflowEmployeeIDs}
          currentUserID={me?.id}
          onPatch={patchSelected}
          onPatchInstance={patchSelectedInstance}
          onRemove={removeSelected}
          onAddHelper={addHelper}
          onRemoveHelper={removeHelper}
        />
      </aside>
    </div>
  );
}
