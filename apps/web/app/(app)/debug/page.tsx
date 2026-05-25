"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "../../../lib/api";
import { useT } from "../../../lib/i18n";
import { isAdmin, useUser } from "../../../lib/user";

const DEFAULT_PROMPT = `在 /workspace/snake-game/ 下用纯前端实现一个贪吃蛇游戏。

要求：
1. 用你的文件系统/shell 工具真正创建文件，不要只在回复里贴代码。先 mkdir -p /workspace/snake-game，然后在该目录写 index.html、style.css、app.js 三个文件。
2. 键盘方向键控制蛇，吃到食物加分，撞墙或撞自身游戏结束，分数显示在画面上。
3. 完成后总结：项目根路径 + 写入的文件列表 + 用户访问 index.html 的相对 URL。`;

export default function DebugPage() {
  const { t } = useT();
  const { me, ready } = useUser();
  const router = useRouter();

  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [system, setSystem] = useState(
    "你是一个资深前端工程师。你的工作目录是 /workspace（可读可写）。需要创建文件时，必须用 filesystem / shell 工具实际写入文件，不要只在对话里贴代码片段。所有路径都基于 /workspace。"
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

  const [workspace, setWorkspace] = useState<{
    enabled: boolean;
    root?: string;
    files: { path: string; url: string; size: number; modified: string }[];
  } | null>(null);
  const [wsLoading, setWsLoading] = useState(false);

  async function refreshWorkspace() {
    setWsLoading(true);
    try {
      const r = await api.debugWorkspace();
      setWorkspace(r);
    } catch (e) {
      setWorkspace({ enabled: false, files: [] });
    } finally {
      setWsLoading(false);
    }
  }

  useEffect(() => {
    if (!ready) return;
    if (!me) {
      router.replace("/login");
      return;
    }
    if (!isAdmin(me)) {
      router.replace("/projects");
      return;
    }
    void refreshWorkspace();
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
      void refreshWorkspace();
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

      <div className="mt-6 card p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[14px] font-medium">{t("debug.workspace")}</div>
            <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-3)" }}>
              {t("debug.workspace_hint")}
              {workspace?.root && (
                <span className="ml-2 font-mono">{workspace.root}</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={refreshWorkspace}
            disabled={wsLoading}
            className="btn btn-sm"
          >
            {wsLoading ? "…" : t("debug.workspace_refresh")}
          </button>
        </div>

        {workspace && !workspace.enabled && (
          <div
            className="mt-3 p-3 rounded-md text-[12px]"
            style={{ background: "#fdeded", color: "var(--danger)" }}
          >
            {t("debug.workspace_disabled")}
          </div>
        )}

        {workspace?.enabled && (workspace.files?.length ?? 0) === 0 && (
          <div
            className="mt-3 p-3 rounded-md text-[12px]"
            style={{ background: "var(--bg-soft)", color: "var(--text-3)" }}
          >
            {t("debug.workspace_empty")}
          </div>
        )}

        {workspace?.enabled && (workspace.files?.length ?? 0) > 0 && (
          <ul className="mt-3 space-y-1.5">
            {workspace.files!.map((f) => (
              <li
                key={f.path}
                className="flex items-center gap-2 text-[13px] p-2 rounded-md"
                style={{ background: "var(--bg-soft)" }}
              >
                <span style={{ color: "var(--text-3)" }}>📄</span>
                <span className="font-mono text-[12px] flex-1 truncate">{f.path}</span>
                <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
                  {f.size}B
                </span>
                <span
                  className="text-[11px] font-mono"
                  style={{ color: "var(--text-3)" }}
                  title={f.modified}
                >
                  {f.modified.slice(11, 19)}
                </span>
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-sm"
                  style={{ color: "var(--primary)" }}
                >
                  ↗
                </a>
              </li>
            ))}
          </ul>
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
