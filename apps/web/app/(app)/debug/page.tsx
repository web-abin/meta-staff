"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "../../../lib/api";
import { useT } from "../../../lib/i18n";
import { isAdmin, useUser } from "../../../lib/user";

const DEFAULT_PROMPT =
  "用单页 HTML 写一个贪吃蛇游戏，键盘方向键控制，吃到食物加分，撞墙或撞自己游戏结束。所有 CSS / JS 都内联在 <style> 和 <script> 里，不能引用任何外部资源。只输出一个完整 <html>…</html>，不要别的话。";

export default function DebugPage() {
  const { t } = useT();
  const { me, ready } = useUser();
  const router = useRouter();

  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [system, setSystem] = useState(
    "你是一个资深前端工程师，输出干净自包含的 HTML。"
  );
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0); // seconds, while polling
  const [result, setResult] = useState<{
    provider: string;
    took_ms: number;
    text?: string;
    error?: string;
  } | null>(null);

  const [filename, setFilename] = useState("snake.html");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ url: string; path: string } | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!me) {
      router.replace("/login");
      return;
    }
    if (!isAdmin(me)) router.replace("/projects");
  }, [ready, me, router]);

  const extracted = useMemo(() => extractHTML(result?.text), [result?.text]);

  async function send() {
    if (busy) return;
    setBusy(true);
    setResult(null);
    setSaved(null);
    setSaveErr(null);
    setElapsed(0);
    const startedAt = Date.now();
    const tickTimer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    try {
      const { job_id } = await api.debugLLMChatStart({
        prompt,
        system: system.trim() || undefined,
      });
      // 轮询：每 2s 一次，最多 10 分钟（与后端硬上限一致）
      const deadline = Date.now() + 10 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        const j = await api.debugLLMChatJob(job_id);
        if (j.status === "done") {
          setResult({
            provider: j.provider ?? "?",
            took_ms: j.took_ms ?? 0,
            text: j.text,
          });
          return;
        }
        if (j.status === "error") {
          setResult({
            provider: j.provider ?? "?",
            took_ms: j.took_ms ?? 0,
            error: j.error,
          });
          return;
        }
      }
      setResult({ provider: "?", took_ms: 0, error: "timeout waiting for job" });
    } catch (e) {
      setResult({ provider: "?", took_ms: 0, error: String((e as Error).message ?? e) });
    } finally {
      clearInterval(tickTimer);
      setBusy(false);
    }
  }

  async function save() {
    if (!extracted) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const r = await api.debugSaveHTML({
        name: filename.trim() || "debug.html",
        html: extracted,
      });
      setSaved({ url: r.url, path: r.path });
    } catch (e) {
      setSaveErr(String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  if (!ready || !me || !isAdmin(me)) return null;

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-8">
      <h1 className="text-[22px] font-semibold">{t("debug.title")}</h1>
      <p className="mt-1 text-[13px]" style={{ color: "var(--text-3)" }}>
        {t("debug.subtitle")}
      </p>

      <div className="mt-6 card p-5">
        <label className="block">
          <div className="text-[12px] mb-1.5" style={{ color: "var(--text-2)" }}>
            {t("debug.system_label")}
          </div>
          <input
            value={system}
            onChange={(e) => setSystem(e.target.value)}
            placeholder={t("debug.system_placeholder")}
          />
        </label>

        <label className="block mt-4">
          <div className="text-[12px] mb-1.5" style={{ color: "var(--text-2)" }}>
            {t("debug.prompt_label")}
          </div>
          <textarea
            rows={6}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t("debug.prompt_placeholder")}
          />
        </label>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={send}
            disabled={busy || !prompt.trim()}
            className="btn btn-primary"
          >
            {busy ? `${t("debug.sending")} (${elapsed}s)` : t("debug.send")}
          </button>
          {result && (
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setSaved(null);
                setSaveErr(null);
              }}
              className="btn"
            >
              {t("debug.cleared")}
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 card p-5">
        <div className="flex items-center justify-between">
          <div className="text-[14px] font-medium">{t("debug.output")}</div>
          {result && (
            <div className="text-[12px]" style={{ color: "var(--text-3)" }}>
              {t("debug.provider")}: <span className="font-mono">{result.provider}</span>
              <span className="mx-2">·</span>
              {t("debug.took")}: <span className="font-mono">{result.took_ms} ms</span>
            </div>
          )}
        </div>

        {!result && (
          <div
            className="mt-4 p-4 rounded-md text-[13px]"
            style={{ background: "var(--bg-soft)", color: "var(--text-3)" }}
          >
            {t("debug.no_output")}
          </div>
        )}

        {result?.error && (
          <pre
            className="mt-4 p-3 rounded-md text-[12px] font-mono whitespace-pre-wrap"
            style={{ background: "#fdeded", color: "var(--danger)" }}
          >
            {result.error}
          </pre>
        )}

        {result?.text && (
          <pre
            className="mt-4 p-3 rounded-md text-[12px] font-mono whitespace-pre-wrap max-h-[420px] overflow-auto"
            style={{ background: "var(--bg-soft)" }}
          >
            {result.text}
          </pre>
        )}

        {extracted && (
          <div
            className="mt-4 p-4 rounded-md"
            style={{ background: "var(--primary-soft)" }}
          >
            <div className="text-[13px] font-medium">{t("debug.save_html")}</div>
            <div className="mt-3 flex items-center gap-2">
              <input
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder={t("debug.filename_placeholder")}
                className="flex-1"
              />
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="btn btn-primary"
              >
                {saving ? t("debug.saving") : t("debug.save")}
              </button>
            </div>
            <div className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
              {t("debug.filename")}
            </div>
            {saveErr && (
              <div className="mt-2 text-[12px]" style={{ color: "var(--danger)" }}>
                {saveErr}
              </div>
            )}
            {saved && (
              <div className="mt-3 text-[13px]">
                {t("debug.saved_at")}
                <span className="font-mono text-[12px]" style={{ color: "var(--text-3)" }}>
                  {saved.path}
                </span>
                <a
                  href={saved.url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-3 btn btn-sm"
                  style={{ color: "var(--primary)" }}
                >
                  {t("debug.open_preview")} →
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// extractHTML pulls a full <html>...</html> block out of LLM output. Falls back
// to the entire text if it looks like it might be raw HTML, or the inside of a
// ```html ... ``` fenced block.
function extractHTML(text?: string): string | null {
  if (!text) return null;
  // 1) Fenced ```html ... ```
  const fence = /```(?:html)?\s*([\s\S]*?)```/i.exec(text);
  if (fence && fence[1].toLowerCase().includes("<html")) {
    return fence[1].trim();
  }
  // 2) Bare <html> ... </html>
  const m = /<html[\s\S]*?<\/html>/i.exec(text);
  if (m) return m[0];
  // 3) Looks like it starts with <!doctype or <html
  const trimmed = text.trim();
  if (/^(<!doctype|<html)/i.test(trimmed)) return trimmed;
  return null;
}
