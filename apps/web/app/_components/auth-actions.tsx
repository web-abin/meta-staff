"use client";

import Link from "next/link";

import { useT } from "../../lib/i18n";
import { isAdmin, useUser } from "../../lib/user";

function workbenchHref(role: string): string {
  if (role === "admin" || role === "pending") return "/workflows";
  return "/projects";
}

export function AuthActions() {
  const { t } = useT();
  const { me, ready } = useUser();

  if (!ready) {
    return <span className="text-[12px] muted">…</span>;
  }
  if (!me) {
    return (
      <Link href="/login" className="btn btn-primary btn-sm">
        {t("home.hero.cta")}
      </Link>
    );
  }
  return (
    <Link href={workbenchHref(me.role)} className="btn btn-primary btn-sm">
      {t("home.hero.cta_workbench")}
    </Link>
  );
}

export { workbenchHref };
