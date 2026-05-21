"use client";

import Link from "next/link";

import { useT } from "../lib/i18n";
import { useUser } from "../lib/user";
import { AuthActions, workbenchHref } from "./_components/auth-actions";
import { HeaderSettings } from "./_components/header-settings";

export default function HomePage() {
  const { t } = useT();
  const { me } = useUser();
  const ctaHref = me ? workbenchHref(me.role) : "/login";

  return (
    <main className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-30 backdrop-blur"
        style={{
          borderBottom: "1px solid var(--border)",
          background: "color-mix(in srgb, var(--bg) 88%, transparent)",
        }}
      >
        <div className="mx-auto max-w-[1200px] px-8 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Logo />
            <span className="font-medium text-[15px]">meta-staff</span>
          </Link>
          <div className="flex items-center gap-3">
            <HeaderSettings />
            <AuthActions />
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-[1200px] px-8 pt-24 pb-20 text-center">
        <div
          className="inline-flex items-center px-3 py-1 rounded-full text-[12px] mb-6"
          style={{
            background: "var(--primary-soft)",
            color: "var(--primary)",
          }}
        >
          AI 数字员工 · 工作流编排
        </div>
        <h1 className="text-[44px] md:text-[56px] font-semibold leading-tight tracking-tight">
          {t("home.hero.title")}
        </h1>
        <p
          className="mt-6 text-[16px] md:text-[17px] leading-relaxed max-w-[720px] mx-auto"
          style={{ color: "var(--text-2)" }}
        >
          {t("home.hero.subtitle")}
        </p>
        <div className="mt-10 flex items-center justify-center gap-3">
          <Link href={ctaHref} className="btn btn-primary btn-lg">
            {me ? t("home.hero.cta_workbench") : t("home.hero.cta")}
          </Link>
        </div>
      </section>

      {/* Idea */}
      <section className="mx-auto max-w-[1200px] px-8 py-20">
        <div className="grid md:grid-cols-12 gap-10 items-start">
          <div className="md:col-span-4">
            <div
              className="text-[12px] tracking-wider uppercase mb-2"
              style={{ color: "var(--primary)" }}
            >
              {t("home.idea.label")}
            </div>
            <h2 className="text-[28px] md:text-[32px] font-semibold leading-snug">
              {t("home.idea.title")}
            </h2>
          </div>
          <div className="md:col-span-8">
            <p
              className="text-[16px] leading-[1.85]"
              style={{ color: "var(--text-2)" }}
            >
              {t("home.idea.body")}
            </p>
          </div>
        </div>
      </section>

      {/* How — 3 steps */}
      <section
        className="py-20"
        style={{ background: "var(--bg-soft)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="mx-auto max-w-[1200px] px-8">
          <div className="text-center mb-14">
            <div
              className="text-[12px] tracking-wider uppercase mb-2"
              style={{ color: "var(--primary)" }}
            >
              {t("home.how.label")}
            </div>
            <h2 className="text-[28px] md:text-[32px] font-semibold">
              {t("home.how.title")}
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {(
              [
                { titleKey: "home.how.s1.title", bodyKey: "home.how.s1.body" },
                { titleKey: "home.how.s2.title", bodyKey: "home.how.s2.body" },
                { titleKey: "home.how.s3.title", bodyKey: "home.how.s3.body" },
              ] as const
            ).map((step) => (
              <div key={step.titleKey} className="card p-7">
                <div className="text-[16px] font-medium mb-3">{t(step.titleKey)}</div>
                <p
                  className="text-[14px] leading-[1.8]"
                  style={{ color: "var(--text-2)" }}
                >
                  {t(step.bodyKey)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Node types */}
      <section className="mx-auto max-w-[1200px] px-8 py-20">
        <div className="text-center mb-14">
          <div
            className="text-[12px] tracking-wider uppercase mb-2"
            style={{ color: "var(--primary)" }}
          >
            {t("home.nodes.label")}
          </div>
          <h2 className="text-[28px] md:text-[32px] font-semibold">
            {t("home.nodes.title")}
          </h2>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          <NodeCard
            icon={<AiIcon />}
            title={t("home.nodes.ai.title")}
            body={t("home.nodes.ai.body")}
            tone="primary"
          />
          <NodeCard
            icon={<HumanIcon />}
            title={t("home.nodes.human.title")}
            body={t("home.nodes.human.body")}
            tone="warning"
          />
        </div>
      </section>

      {/* Roles */}
      <section
        className="py-20"
        style={{ background: "var(--bg-soft)", borderTop: "1px solid var(--border)" }}
      >
        <div className="mx-auto max-w-[1200px] px-8 grid md:grid-cols-12 gap-10 items-start">
          <div className="md:col-span-5">
            <div
              className="text-[12px] tracking-wider uppercase mb-2"
              style={{ color: "var(--primary)" }}
            >
              {t("home.roles.label")}
            </div>
            <h2 className="text-[28px] md:text-[32px] font-semibold leading-snug">
              {t("home.roles.title")}
            </h2>
            <p
              className="mt-4 text-[15px] leading-[1.85]"
              style={{ color: "var(--text-2)" }}
            >
              {t("home.roles.body")}
            </p>
          </div>
          <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(
              [
                "emp_type.pm",
                "emp_type.design",
                "emp_type.dev",
                "emp_type.qa",
                "emp_type.ops",
                "emp_type.growth",
                "emp_type.support",
                "emp_type.data",
              ] as const
            ).map((k) => (
              <div
                key={k}
                className="px-4 py-3 rounded-md text-[14px]"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                {t(k)}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-[1200px] px-8 py-24 text-center">
        <h2 className="text-[28px] md:text-[36px] font-semibold leading-tight">
          {t("home.cta.title")}
        </h2>
        <p
          className="mt-4 text-[15px]"
          style={{ color: "var(--text-2)" }}
        >
          {t("home.cta.body")}
        </p>
        <div className="mt-8">
          <Link href={ctaHref} className="btn btn-primary btn-lg">
            {me ? t("home.hero.cta_workbench") : t("home.hero.cta")}
          </Link>
        </div>
      </section>

      <footer style={{ borderTop: "1px solid var(--border)" }}>
        <div
          className="mx-auto max-w-[1200px] px-8 h-14 flex items-center justify-between text-[12px]"
          style={{ color: "var(--text-3)" }}
        >
          <span>{t("home.footer.copy")}</span>
          <span>meta-staff</span>
        </div>
      </footer>
    </main>
  );
}

function Logo() {
  return (
    <span
      className="inline-flex items-center justify-center w-7 h-7 rounded-md text-white text-[13px] font-semibold"
      style={{ background: "var(--primary)" }}
    >
      M
    </span>
  );
}

function NodeCard({
  icon,
  title,
  body,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  tone: "primary" | "warning";
}) {
  const accent = tone === "primary" ? "var(--primary)" : "var(--warning)";
  const accentSoft = tone === "primary" ? "var(--primary-soft)" : "#fff4e5";
  return (
    <div className="card p-7">
      <div
        className="inline-flex items-center justify-center w-10 h-10 rounded-md mb-4"
        style={{ background: accentSoft, color: accent }}
      >
        {icon}
      </div>
      <div className="text-[18px] font-medium mb-2">{title}</div>
      <p
        className="text-[14px] leading-[1.85]"
        style={{ color: "var(--text-2)" }}
      >
        {body}
      </p>
    </div>
  );
}

function AiIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" />
    </svg>
  );
}
function HumanIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 21c0-3.866 3.134-7 7-7s7 3.134 7 7" />
    </svg>
  );
}
