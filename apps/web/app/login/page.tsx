"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { api } from "../../lib/api";
import { useT } from "../../lib/i18n";
import { isAdmin, useUser } from "../../lib/user";
import { OnboardStep } from "./_onboard-step";
import { HeaderSettings } from "../_components/header-settings";
import type { User } from "../../lib/types";

function LoginInner() {
  const { t } = useT();
  const router = useRouter();
  const sp = useSearchParams();
  const { setMe } = useUser();
  const [username, setUsername] = useState(sp.get("u") ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState<User | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const user = await api.login({ username: username.trim(), password });
      setMe(user);
      if (user.role === "pending") {
        setPending(user);
      } else {
        router.push(isAdmin(user) ? "/workflows" : "/projects");
      }
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  function onOnboarded(user: User) {
    setPending(null);
    router.push(isAdmin(user) ? "/workflows" : "/projects");
  }

  return (
    <main className="min-h-screen flex flex-col" style={{ background: "var(--bg-soft)" }}>
      <header
        className="h-14 flex items-center justify-between px-8"
        style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}
      >
        <Link href="/" className="flex items-center gap-2">
          <span
            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-white text-[13px] font-semibold"
            style={{ background: "var(--primary)" }}
          >
            M
          </span>
          <span className="font-medium text-[15px]">meta-staff</span>
        </Link>
        <HeaderSettings />
      </header>

      <div className="flex-1 flex items-center justify-center px-6">
        <form onSubmit={submit} className="card w-full max-w-[400px] p-8">
          <h1 className="text-[22px] font-semibold">{t("auth.login")}</h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-3)" }}>
            meta-staff · 工作台登录
          </p>

          <div className="mt-6 space-y-4">
            <label className="block">
              <div className="text-[13px] mb-1.5" style={{ color: "var(--text-2)" }}>
                {t("auth.username")}
              </div>
              <input
                type="text"
                required
                autoFocus
                value={username}
                onChange={(ev) => setUsername(ev.target.value)}
                placeholder={t("auth.username_placeholder")}
              />
            </label>

            <label className="block">
              <div className="text-[13px] mb-1.5" style={{ color: "var(--text-2)" }}>
                {t("auth.password")}
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                placeholder={t("auth.password_placeholder")}
              />
            </label>
          </div>

          {err && (
            <div className="mt-3 text-[13px]" style={{ color: "var(--danger)" }}>
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !username.trim() || !password}
            className="btn btn-primary w-full mt-6"
          >
            {busy ? "…" : t("auth.login_submit")}
          </button>

          <div className="mt-4 text-center text-[13px]">
            <Link href="/register" style={{ color: "var(--primary)" }}>
              {t("auth.no_account")}
            </Link>
          </div>
        </form>
      </div>

      {pending && <OnboardStep onDone={onOnboarded} />}
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
