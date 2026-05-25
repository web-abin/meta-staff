"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "../../../lib/api";
import { useT } from "../../../lib/i18n";
import type { Workflow } from "../../../lib/types";

interface Attachment {
  name: string;
  url: string;
  kind: string;
  mime?: string;
  size?: number;
}

const SOURCES = [
  { value: "product", labelKey: "new_task.source_product" },
  { value: "bug", labelKey: "new_task.source_bug" },
  { value: "user", labelKey: "new_task.source_user" },
  { value: "ops", labelKey: "new_task.source_ops" },
] as const;

// 两步：先选工作流 → 再录入需求。
export function CreateTaskModal({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null);
  const [workflowID, setWorkflowID] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [source, setSource] = useState<string>("product");
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .myWorkflows()
      .then((list) => {
        setWorkflows(list);
        if (list.length === 1) setWorkflowID(list[0].id);
      })
      .catch(() => setWorkflows([]));
  }, []);

  const picked = workflowID ? workflows?.find((w) => w.id === workflowID) ?? null : null;

  async function pickAndUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErr(null);
    setUploading(true);
    try {
      const results: Attachment[] = [];
      for (const f of Array.from(files)) {
        const r = await api.uploadFile(f);
        results.push({ name: r.name, url: r.url, kind: r.kind, mime: r.mime, size: r.size });
      }
      setAttachments((prev) => [...prev, ...results]);
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!picked) {
      setErr(t("new_task.workflow_required"));
      return;
    }
    if (!title.trim() || !content.trim()) {
      setErr(t("new_task.required"));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const task = await api.createTask({
        workflow_id: picked.id,
        title: title.trim(),
        source,
        content: content.trim(),
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      onClose();
      router.push(`/projects?task=${task.id}`);
    } catch (e) {
      setErr(String((e as Error).message ?? e));
      setBusy(false);
    }
  }

  // 第一步：选工作流
  if (workflowID === null) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center px-4"
        style={{ background: "rgba(0,0,0,0.45)" }}
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="card w-full max-w-[520px] p-6 max-h-[90vh] overflow-auto"
          style={{ boxShadow: "var(--shadow-lg)" }}
        >
          <h3 className="text-[18px] font-semibold">{t("new_task.pick_workflow")}</h3>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-3)" }}>
            {t("new_task.pick_workflow_hint")}
          </p>

          {workflows === null ? (
            <div className="mt-5 text-[13px]" style={{ color: "var(--text-3)" }}>
              {t("common.loading")}
            </div>
          ) : workflows.length === 0 ? (
            <div
              className="mt-5 p-4 rounded-md text-[13px]"
              style={{ background: "var(--bg-soft)", color: "var(--text-3)" }}
            >
              {t("new_task.no_workflows")}
            </div>
          ) : (
            <ul className="mt-5 space-y-2">
              {workflows.map((wf) => (
                <li key={wf.id}>
                  <button
                    type="button"
                    onClick={() => setWorkflowID(wf.id)}
                    className="card w-full p-3 text-left transition hover:border-[var(--border-strong)]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-[14px] font-medium">{wf.name}</div>
                      {wf.is_default && <span className="tag">{t("wf.list.default_tag")}</span>}
                    </div>
                    {wf.description && (
                      <div className="mt-1 text-[12px]" style={{ color: "var(--text-3)" }}>
                        {wf.description}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 flex items-center justify-end">
            <button type="button" onClick={onClose} className="btn">
              {t("common.cancel")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 第二步：录入需求
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="card w-full max-w-[640px] p-6 max-h-[90vh] overflow-auto"
        style={{ boxShadow: "var(--shadow-lg)" }}
      >
        <h3 className="text-[18px] font-semibold">{t("new_task.title")}</h3>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-3)" }}>
          {t("new_task.subtitle")}
        </p>

        <div
          className="mt-5 p-3 rounded-md flex items-center justify-between"
          style={{ background: "var(--bg-soft)" }}
        >
          <div>
            <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
              {t("new_task.workflow")}
            </div>
            <div className="text-[14px] font-medium mt-0.5">{picked?.name}</div>
          </div>
          <button
            type="button"
            onClick={() => setWorkflowID(null)}
            className="btn btn-ghost btn-sm"
            style={{ color: "var(--text-3)" }}
          >
            {t("new_task.change_workflow")}
          </button>
        </div>

        <div className="mt-4">
          <label className="block">
            <div className="text-[12px] mb-1.5" style={{ color: "var(--text-2)" }}>
              {t("new_task.task_title")}
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("new_task.task_title_placeholder")}
              autoFocus
              maxLength={120}
            />
          </label>
        </div>

        <div className="mt-4">
          <label className="block">
            <div className="text-[12px] mb-1.5" style={{ color: "var(--text-2)" }}>
              {t("new_task.source")}
            </div>
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {t(s.labelKey)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4">
          <label className="block">
            <div className="text-[12px] mb-1.5" style={{ color: "var(--text-2)" }}>
              {t("new_task.content")}
            </div>
            <textarea
              rows={8}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("new_task.content_placeholder")}
            />
          </label>
        </div>

        <div className="mt-4">
          <div className="text-[12px] mb-1.5" style={{ color: "var(--text-2)" }}>
            {t("new_task.attachments")}
          </div>
          <div className="text-[11px] mb-2" style={{ color: "var(--text-3)" }}>
            {t("new_task.attachments_hint")}
          </div>
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="file"
              multiple
              onChange={(e) => pickAndUpload(e.target.files)}
              disabled={uploading}
              className="hidden"
            />
            <span className="btn btn-sm">
              {uploading ? t("new_task.uploading") : t("new_task.attach_btn")}
            </span>
          </label>
          {attachments.length > 0 && (
            <ul className="mt-2 space-y-1">
              {attachments.map((a, i) => (
                <li
                  key={a.url + i}
                  className="flex items-center gap-2 text-[13px] p-2 rounded-md"
                  style={{ background: "var(--bg-soft)" }}
                >
                  <span style={{ color: "var(--text-3)" }}>
                    {a.kind === "image" ? "🖼" : a.kind === "video" ? "▶" : "📄"}
                  </span>
                  <a href={a.url} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>
                    {a.name}
                  </a>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                    className="ml-auto btn btn-ghost btn-sm"
                    style={{ color: "var(--text-3)" }}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {err && (
          <div className="mt-3 text-[13px]" style={{ color: "var(--danger)" }}>
            {err}
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="btn">
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={busy || uploading} className="btn btn-primary">
            {busy ? t("new_task.submitting") : t("new_task.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
