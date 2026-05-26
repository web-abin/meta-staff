"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useT } from "../../../../lib/i18n";
import type { DAGNode, DAGNodeInstance, Employee } from "../../../../lib/types";

interface Props {
  node: DAGNode | null;
  empByID: Map<string, Employee>;
  allEmployees: Employee[];
  // 只显示属于当前工作流的人类员工作为候选真人助手。空集合时回退到 allEmployees。
  workflowMemberIDs?: Set<string>;
  // 当前登录用户的 user.id —— 用来保证"自己"始终出现在候选列表里，
  // 即使还没被加入到 workflow_employees。
  currentUserID?: string;
  onPatch: (patch: Partial<DAGNode>) => void;
  onPatchInstance: (patch: Partial<DAGNodeInstance>) => void;
  onRemove: () => void;
  onAddHelper: (empId: string) => void;
  onRemoveHelper: (empId: string) => void;
}

export function NodeDetail({
  node,
  empByID,
  allEmployees,
  workflowMemberIDs,
  currentUserID,
  onPatchInstance,
  onRemove,
  onAddHelper,
  onRemoveHelper,
}: Props) {
  const { t } = useT();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    function onClick(ev: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(ev.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [pickerOpen]);

  if (!node) {
    return (
      <div className="p-5">
        <div className="text-[14px] font-medium mb-1">{t("node.detail.title")}</div>
        <div className="text-[13px]" style={{ color: "var(--text-3)" }}>
          {t("node.detail.empty")}
        </div>
      </div>
    );
  }

  const assignees = (node.assignee_employee_ids ?? [])
    .map((id) => empByID.get(id))
    .filter(Boolean) as Employee[];
  const typeEmp = assignees[0] ?? null;
  const helpers = assignees.slice(1);
  const helperIds = new Set(helpers.map((e) => e.id));

  // Candidate helpers = real-person employees, 属于当前工作流，且未在节点上。
  // "自己" 始终出现在候选列表里，即使还没被加入 workflow_employees ——
  // 添加时会顺手把自己加进工作流成员。
  const candidates = allEmployees.filter((e) => {
    if (!e.bound_user_id || !e.is_active) return false;
    if (e.id === typeEmp?.id) return false;
    if (helperIds.has(e.id)) return false;
    const isSelf = !!currentUserID && e.bound_user_id === currentUserID;
    if (isSelf) return true;
    return (
      !workflowMemberIDs ||
      workflowMemberIDs.size === 0 ||
      workflowMemberIDs.has(e.id)
    );
  });
  // Sort "self" to the top for visibility.
  candidates.sort((a, b) => {
    const aSelf = !!currentUserID && a.bound_user_id === currentUserID ? 0 : 1;
    const bSelf = !!currentUserID && b.bound_user_id === currentUserID ? 0 : 1;
    return aSelf - bSelf;
  });

  // Effective instance values (fall back to type for legacy nodes that have
  // no instance object yet — edits then create one).
  const instanceName = node.instance?.name ?? typeEmp?.name ?? "";
  const instanceNote = node.instance?.note ?? "";

  return (
    <div className="p-5 flex flex-col h-full overflow-y-auto">
      <div className="text-[14px] font-medium">{t("node.detail.title")}</div>

      {/* TYPE — read-only */}
      <div className="mt-5">
        <div className="text-[12px] mb-1.5" style={{ color: "var(--text-2)" }}>
          {t("node.detail.primary")}
        </div>
        {typeEmp ? (
          <Link
            href={`/employees/${typeEmp.id}`}
            className="card p-2.5 flex items-center gap-2.5 transition hover:border-[var(--border-strong)]"
          >
            <span
              className="inline-flex items-center justify-center w-8 h-8 rounded-md text-[13px] font-medium"
              style={{ background: "var(--primary-soft)", color: "var(--primary)" }}
            >
              {typeEmp.avatar || typeEmp.name.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium truncate">{typeEmp.name}</div>
              <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
                {typeEmp.role}
              </div>
            </div>
            <span className="text-[11px]" style={{ color: "var(--text-3)" }}>→</span>
          </Link>
        ) : (
          <div
            className="text-[12px] p-3 rounded-md text-center"
            style={{ background: "var(--bg-soft)", color: "var(--text-3)" }}
          >
            {t("node.detail.primary_empty")}
          </div>
        )}
        <div className="text-[11px] mt-1.5" style={{ color: "var(--text-3)" }}>
          {t("node.detail.primary_hint")}
        </div>
      </div>

      {/* INSTANCE — editable */}
      <div className="mt-5">
        <div className="text-[12px]" style={{ color: "var(--text-2)" }}>
          {t("node.detail.instance_section")}
        </div>
        <div className="text-[11px] mt-0.5 mb-2" style={{ color: "var(--text-3)" }}>
          {t("node.detail.instance_hint")}
        </div>

        <label className="block">
          <div className="text-[12px] mb-1" style={{ color: "var(--text-2)" }}>
            {t("node.detail.instance_name")}
          </div>
          <input
            value={instanceName}
            onChange={(e) =>
              onPatchInstance({
                name: e.target.value,
              })
            }
            placeholder={typeEmp?.name ?? ""}
          />
          <div className="text-[11px] mt-1" style={{ color: "var(--text-3)" }}>
            {t("node.detail.instance_name_hint")}
          </div>
        </label>

        <label className="block mt-4">
          <div className="text-[12px] mb-1" style={{ color: "var(--text-2)" }}>
            {t("node.detail.instance_note")}
          </div>
          <textarea
            rows={5}
            value={instanceNote}
            onChange={(e) => onPatchInstance({ note: e.target.value })}
            placeholder={t("node.detail.instance_note_placeholder")}
          />
          <div className="text-[11px] mt-1" style={{ color: "var(--text-3)" }}>
            {t("node.detail.instance_note_hint")}
          </div>
        </label>
      </div>

      {/* HELPERS */}
      <div className="mt-5">
        <div className="text-[12px] mb-1" style={{ color: "var(--text-2)" }}>
          {t("node.detail.helpers")}
        </div>
        <div className="text-[11px] mb-2 leading-relaxed" style={{ color: "var(--text-3)" }}>
          {t("node.detail.helpers_hint")}
        </div>
        {helpers.length === 0 && (
          <div
            className="text-[12px] p-3 rounded-md mb-2"
            style={{ background: "var(--bg-soft)", color: "var(--text-3)" }}
          >
            {t("node.detail.no_helper")}
          </div>
        )}
        {helpers.length > 0 && (
          <ul className="space-y-2 mb-2">
            {helpers.map((e) => (
              <li key={e.id} className="card p-2.5 flex items-center gap-2.5">
                <span
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[12px] font-medium"
                  style={{ background: "#fff4e5", color: "var(--warning)" }}
                >
                  {e.avatar || e.name.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] truncate">{e.name}</div>
                  <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
                    {e.role} · 真人
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveHelper(e.id)}
                  className="btn btn-ghost btn-sm"
                  aria-label="remove"
                  style={{ color: "var(--text-3)" }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            disabled={candidates.length === 0}
            className="btn btn-sm w-full"
          >
            {t("node.detail.add_helper")}
          </button>
          {pickerOpen && candidates.length > 0 && (
            <div
              className="absolute left-0 right-0 mt-1 max-h-[240px] overflow-y-auto rounded-md py-1 z-10"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-lg)",
              }}
            >
              {candidates.map((e) => {
                const isSelf = !!currentUserID && e.bound_user_id === currentUserID;
                return (
                  <button
                    type="button"
                    key={e.id}
                    onClick={() => {
                      onAddHelper(e.id);
                      // 不关闭面板 —— 允许连续添加多个。候选列表会自动剔除已加的。
                    }}
                    className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-[var(--bg-hover)]"
                  >
                    <span
                      className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[12px] font-medium"
                      style={{ background: "#fff4e5", color: "var(--warning)" }}
                    >
                      {e.avatar || e.name.slice(0, 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] truncate">
                        {e.name}
                        {isSelf && (
                          <span
                            className="ml-1.5 text-[10px] px-1 py-0.5 rounded"
                            style={{ background: "var(--primary-soft)", color: "var(--primary)" }}
                          >
                            我
                          </span>
                        )}
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
                        {e.role}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-auto pt-5">
        <button type="button" onClick={onRemove} className="btn btn-danger w-full">
          {t("node.detail.delete")}
        </button>
      </div>
    </div>
  );
}
