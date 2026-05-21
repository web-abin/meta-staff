"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useT } from "../../lib/i18n";
import { useUser } from "../../lib/user";
import { Topbar } from "./_components/topbar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  const { me, ready } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (ready && !me) {
      router.replace("/login");
    }
  }, [ready, me, router]);

  if (!ready || !me) {
    return (
      <div
        className="min-h-screen flex items-center justify-center text-[14px]"
        style={{ color: "var(--text-3)" }}
      >
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <Topbar />
      <main className="flex-1">{children}</main>
    </div>
  );
}
