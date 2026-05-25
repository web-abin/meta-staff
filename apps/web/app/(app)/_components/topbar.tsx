"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { api } from "../../../lib/api";
import { useT } from "../../../lib/i18n";
import { isAdmin, useUser } from "../../../lib/user";
import type { Employee } from "../../../lib/types";
import { HeaderSettings } from "../../_components/header-settings";
import { CreateTaskModal } from "./create-task-modal";
import { ProfileModal } from "./profile-modal";

export function Topbar() {
  const { t } = useT();
  const { me, logout } = useUser();
  const admin = isAdmin(me);

  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!me || admin) return;
    api
      .myEmployee()
      .then((e) => setEmployee(e))
      .catch(() => setEmployee(null));
  }, [me, admin]);

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(ev: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(ev.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  if (!me) return null;

  const initials = (me.name || "U").slice(0, 1).toUpperCase();
  const empId = employee?.id;

  return (
    <header
      className="sticky top-0 z-30 h-14 flex items-center px-6"
      style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}
    >
      <Link href="/" className="flex items-center gap-2 mr-8">
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-md text-white text-[13px] font-semibold"
          style={{ background: "var(--primary)" }}
        >
          M
        </span>
        <span className="font-medium text-[15px]">meta-staff</span>
      </Link>

      <nav className="flex items-center gap-1">
        {admin ? (
          <>
            <NavItem href="/workflows">{t("wb.title")}</NavItem>
            <NavItem href="/debug">{t("header.debug")}</NavItem>
          </>
        ) : (
          <NavItem href="/projects">{t("header.projects")}</NavItem>
        )}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        {!admin && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="btn btn-primary btn-sm"
            title={t("new_task.subtitle")}
          >
            {t("header.new_task")}
          </button>
        )}
        {!admin && empId && (
          <div
            className="flex items-center gap-2 px-3 py-1 rounded-md text-[12px]"
            style={{ background: "var(--bg-soft)" }}
          >
            <span style={{ color: "var(--text-3)" }}>{t("header.emp_id")}</span>
            <span className="font-mono text-[12px]" style={{ color: "var(--text)" }}>
              {empId}
            </span>
          </div>
        )}
        <HeaderSettings />
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-[var(--bg-hover)]"
          >
            <span
              className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[12px] font-medium"
              style={{ background: "var(--primary-soft)", color: "var(--primary)" }}
            >
              {initials}
            </span>
            <span className="text-[13px]" style={{ color: "var(--text)" }}>
              {me.name}
            </span>
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-1 w-44 py-1 rounded-md"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <MenuItem
                onClick={() => {
                  setMenuOpen(false);
                  setProfileOpen(true);
                }}
              >
                {t("header.profile")}
              </MenuItem>
              <div className="divider my-1" />
              <MenuItem
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                  if (typeof window !== "undefined") window.location.href = "/";
                }}
                danger
              >
                {t("common.logout")}
              </MenuItem>
            </div>
          )}
        </div>
      </div>

      {profileOpen && (
        <ProfileModal
          employee={employee}
          onClose={() => setProfileOpen(false)}
          onSaved={(e) => {
            setEmployee(e);
            setProfileOpen(false);
          }}
        />
      )}

      {createOpen && <CreateTaskModal onClose={() => setCreateOpen(false)} />}
    </header>
  );
}

function NavItem({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-md text-[14px] transition"
      style={{ color: "var(--text)" }}
    >
      {children}
    </Link>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-[var(--bg-hover)]"
      style={{ color: danger ? "var(--danger)" : "var(--text)" }}
    >
      {children}
    </button>
  );
}
