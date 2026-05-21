"use client";

import { useState } from "react";

import { useT } from "../../../../lib/i18n";
import type { Employee } from "../../../../lib/types";
import { NewEmployeeModal } from "./_new-employee-modal";
import { EditEmployeeModal } from "./_edit-employee-modal";

export const EMP_DRAG_TYPE = "application/x-meta-staff-employee";

export function EmployeeRoster({
  employees,
  onCreated,
}: {
  employees: Employee[];
  onCreated: () => void;
}) {
  const { t } = useT();
  const [openNew, setOpenNew] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[14px] font-medium">{t("roster.title")}</div>
          <div className="text-[12px] mt-0.5" style={{ color: "var(--text-3)" }}>
            {t("roster.drag_hint")}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpenNew(true)}
          className="btn btn-primary btn-sm"
        >
          + {t("roster.create")}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto -mx-1 px-1">
        {employees.length === 0 ? (
          <div className="text-[13px] py-8 text-center" style={{ color: "var(--text-3)" }}>
            {t("roster.empty")}
          </div>
        ) : (
          <ul className="space-y-2">
            {employees.map((e) => {
              const human = !!e.bound_user_id;
              return (
                <li
                  key={e.id}
                  draggable
                  onDragStart={(ev) => {
                    ev.dataTransfer.effectAllowed = "copy";
                    ev.dataTransfer.setData(EMP_DRAG_TYPE, e.id);
                    ev.dataTransfer.setData("text/plain", e.id);
                  }}
                  className="card p-3 cursor-grab active:cursor-grabbing select-none transition hover:border-[var(--border-strong)] group"
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className="inline-flex items-center justify-center w-8 h-8 rounded-md text-[13px] font-medium shrink-0"
                      style={{
                        background: human ? "#fff4e5" : "var(--primary-soft)",
                        color: human ? "var(--warning)" : "var(--primary)",
                      }}
                    >
                      {e.avatar || e.name.slice(0, 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium truncate">{e.name}</div>
                      <div className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-3)" }}>
                        {e.role} · {human ? "真人" : "AI"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setEditing(e);
                      }}
                      onDragStart={(ev) => ev.stopPropagation()}
                      className="opacity-0 group-hover:opacity-100 transition btn btn-ghost btn-sm shrink-0"
                      style={{ color: "var(--text-3)", padding: "2px 6px" }}
                      title={t("roster.edit")}
                      aria-label={t("roster.edit")}
                    >
                      <PencilIcon />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {openNew && (
        <NewEmployeeModal
          existing={employees}
          onClose={() => setOpenNew(false)}
          onCreated={() => {
            setOpenNew(false);
            onCreated();
          }}
        />
      )}
      {editing && (
        <EditEmployeeModal
          employee={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onCreated();
          }}
        />
      )}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}
