"use client";

import { useT, type Locale } from "../../lib/i18n";
import { useTheme, type Theme } from "../../lib/theme";

export function HeaderSettings() {
  const { locale, setLocale } = useT();
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-2">
      <Segmented
        options={[
          { value: "zh", label: "中" },
          { value: "en", label: "EN" },
        ]}
        active={locale}
        onPick={(v) => setLocale(v as Locale)}
      />
      <Segmented
        options={[
          { value: "light", label: "☀" },
          { value: "dark", label: "☾" },
        ]}
        active={theme}
        onPick={(v) => setTheme(v as Theme)}
      />
    </div>
  );
}

function Segmented({
  options,
  active,
  onPick,
}: {
  options: { value: string; label: string }[];
  active: string;
  onPick: (v: string) => void;
}) {
  return (
    <div
      className="inline-flex items-center p-[2px] rounded-md"
      style={{ background: "var(--bg-soft)" }}
    >
      {options.map((o) => {
        const on = o.value === active;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onPick(o.value)}
            className="px-2.5 py-[3px] text-[12px] rounded transition"
            style={{
              background: on ? "var(--surface)" : "transparent",
              color: on ? "var(--text)" : "var(--text-3)",
              boxShadow: on ? "var(--shadow-sm)" : "none",
              fontWeight: on ? 500 : 400,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
