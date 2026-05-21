"use client";

import { useMemo, useState } from "react";

import { api } from "../../../../lib/api";
import { useT } from "../../../../lib/i18n";
import type {
  AssignmentItem,
  Artifact,
  DAG,
  DAGNode,
  TaskDetail,
} from "../../../../lib/types";

interface Attachment {
  name: string;
  url: string;
  kind: "image" | "video" | "doc";
  mime?: string;
}

type Decision = "approve" | "reject";

interface UpstreamGroups {
  doc: { node: string; nodeTitle: string; name: string; url?: string; text?: string }[];
  image: { node: string; nodeTitle: string; name: string; url: string }[];
  video: { node: string; nodeTitle: string; name: string; url: string }[];
}

export function TaskHandler({
  workflowName,
  assignment,
  detail,
  onChanged,
}: {
  workflowName: string;
  assignment: AssignmentItem;
  detail: TaskDetail | undefined;
  onChanged: () => void;
}) {
  const { t } = useT();
  const [decision, setDecision] = useState<Decision>("approve");
  const [rollbackTo, setRollbackTo] = useState("");
  const [comment, setComment] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dag = detail?.workflow_version.dag;
  const currentNode = useMemo<DAGNode | null>(() => {
    if (!dag) return null;
    return dag.nodes.find((n) => n.key === assignment.node_run.node_key) ?? null;
  }, [dag, assignment.node_run.node_key]);

  const upstreamNodes = useMemo(() => {
    if (!dag) return [] as DAGNode[];
    return upstreamOf(dag, assignment.node_run.node_key);
  }, [dag, assignment.node_run.node_key]);

  const groups = useMemo<UpstreamGroups>(() => {
    const groups: UpstreamGroups = { doc: [], image: [], video: [] };
    if (!detail || !dag) return groups;
    for (const n of upstreamNodes) {
      const r = detail.node_runs.find((x) => x.run.node_key === n.key);
      if (!r) continue;
      const latest = r.artifacts[r.artifacts.length - 1];
      if (!latest) continue;
      for (const att of classifyArtifact(latest)) {
        if (att.kind === "image") {
          groups.image.push({ node: n.key, nodeTitle: n.title, name: att.name, url: att.url });
        } else if (att.kind === "video") {
          groups.video.push({ node: n.key, nodeTitle: n.title, name: att.name, url: att.url });
        } else {
          groups.doc.push({ node: n.key, nodeTitle: n.title, name: att.name, url: att.url });
        }
      }
      const text = artifactToText(latest.payload);
      if (text && text !== "{}") {
        groups.doc.push({
          node: n.key,
          nodeTitle: n.title,
          name: `${n.title} · ${latest.kind}`,
          text,
        });
      }
    }
    return groups;
  }, [detail, dag, upstreamNodes]);

  async function pickAndUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErr(null);
    setUploading(true);
    try {
      const results: Attachment[] = [];
      for (const f of Array.from(files)) {
        const r = await api.uploadFile(f);
        results.push({ name: r.name, url: r.url, kind: r.kind, mime: r.mime });
      }
      setAttachments((prev) => [...prev, ...results]);
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      if (decision === "approve") {
        await api.submitNodeRun(assignment.node_run.id, currentNode?.produces ?? "artifact", {
          text: comment,
          attachments,
        });
      } else {
        if (!rollbackTo) {
          throw new Error("请先选择要打回的节点");
        }
        await api.rollbackTask(assignment.task.id, rollbackTo);
      }
      setComment("");
      setAttachments([]);
      setRollbackTo("");
      onChanged();
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  const totalArtifacts = groups.doc.length + groups.image.length + groups.video.length;

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="text-[12px]" style={{ color: "var(--text-3)" }}>
          {t("task.current_label")}
        </div>
        <h2 className="mt-1 text-[17px] font-semibold">
          {workflowName}
          <span style={{ color: "var(--text-3)" }}> · </span>
          {currentNode?.title ?? assignment.node_run.node_key}
        </h2>
        <div className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
          {assignment.task.title}
        </div>
      </div>

      <div className="p-5">
        <div className="text-[13px] font-medium mb-3">
          {t("task.artifacts")} · {totalArtifacts}
        </div>
        {totalArtifacts === 0 ? (
          <div
            className="text-[13px] p-4 rounded-md"
            style={{ background: "var(--bg-soft)", color: "var(--text-3)" }}
          >
            {t("task.artifacts.empty")}
          </div>
        ) : (
          <div className="space-y-4">
            <ArtifactGroup label={t("task.artifacts.docs")} items={groups.doc} kind="doc" />
            <ArtifactGroup label={t("task.artifacts.images")} items={groups.image} kind="image" />
            <ArtifactGroup label={t("task.artifacts.videos")} items={groups.video} kind="video" />
          </div>
        )}
      </div>

      <div className="p-5" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="text-[13px] font-medium mb-3">{t("task.review.title")}</div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDecision("approve")}
            className="px-4 py-2 rounded-md text-[13px]"
            style={{
              border: `1px solid ${decision === "approve" ? "var(--success)" : "var(--border)"}`,
              background: decision === "approve" ? "#e8f5e9" : "var(--surface)",
              color: decision === "approve" ? "var(--success)" : "var(--text)",
              fontWeight: decision === "approve" ? 500 : 400,
            }}
          >
            ✓ {t("task.review.approve")}
          </button>
          <button
            type="button"
            onClick={() => setDecision("reject")}
            className="px-4 py-2 rounded-md text-[13px]"
            style={{
              border: `1px solid ${decision === "reject" ? "var(--danger)" : "var(--border)"}`,
              background: decision === "reject" ? "#fdeded" : "var(--surface)",
              color: decision === "reject" ? "var(--danger)" : "var(--text)",
              fontWeight: decision === "reject" ? 500 : 400,
            }}
          >
            ↶ {t("task.review.reject")}
          </button>
        </div>

        {decision === "reject" && (
          <div className="mt-4">
            <div className="text-[12px] mb-1.5" style={{ color: "var(--text-2)" }}>
              {t("task.review.rollback_to")}
            </div>
            <select value={rollbackTo} onChange={(e) => setRollbackTo(e.target.value)}>
              <option value="">{t("task.review.select_node")}</option>
              {upstreamNodes.map((n) => (
                <option key={n.key} value={n.key}>
                  {n.title} ({n.key})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-4">
          <div className="text-[12px] mb-1.5" style={{ color: "var(--text-2)" }}>
            {t("task.review.comment")}
          </div>
          <textarea
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t("task.review.comment_placeholder")}
          />
        </div>

        <div className="mt-4">
          <div className="text-[12px] mb-1.5" style={{ color: "var(--text-2)" }}>
            {t("task.review.attach")}
          </div>
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="file"
              multiple
              onChange={(e) => pickAndUpload(e.target.files)}
              disabled={uploading}
              className="hidden"
            />
            <span className="btn btn-sm">{uploading ? "…" : "+ 上传"}</span>
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
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--primary)" }}
                  >
                    {a.name}
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      setAttachments((prev) => prev.filter((_, j) => j !== i))
                    }
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

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={busy || (decision === "reject" && !rollbackTo)}
            className="btn btn-primary"
          >
            {busy ? t("task.review.submitting") : t("task.review.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ArtifactGroup({
  label,
  items,
  kind,
}: {
  label: string;
  items: { node: string; nodeTitle: string; name: string; url?: string; text?: string }[];
  kind: "doc" | "image" | "video";
}) {
  const [openText, setOpenText] = useState<number | null>(null);
  if (items.length === 0) return null;
  return (
    <div>
      <div className="text-[12px] mb-2" style={{ color: "var(--text-3)" }}>
        {label} · {items.length}
      </div>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li
            key={it.node + i}
            className="p-3 rounded-md"
            style={{ background: "var(--bg-soft)" }}
          >
            <div className="flex items-baseline gap-2 text-[13px]">
              <span style={{ color: "var(--text-3)" }}>[{it.nodeTitle}]</span>
              {it.url ? (
                <a
                  href={it.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--primary)" }}
                >
                  {it.name}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpenText(openText === i ? null : i)}
                  style={{ color: "var(--primary)" }}
                >
                  {it.name} {openText === i ? "▲" : "▼"}
                </button>
              )}
            </div>
            {kind === "image" && it.url && (
              <img
                src={it.url}
                alt={it.name}
                className="mt-2 max-h-[200px] rounded"
                style={{ border: "1px solid var(--border)" }}
              />
            )}
            {kind === "video" && it.url && (
              <video
                src={it.url}
                controls
                className="mt-2 max-h-[260px] rounded"
                style={{ border: "1px solid var(--border)" }}
              />
            )}
            {!it.url && openText === i && it.text && (
              <pre
                className="mt-2 text-[12px] font-mono whitespace-pre-wrap break-words p-2 rounded max-h-[240px] overflow-auto"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                {it.text}
              </pre>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function upstreamOf(dag: DAG, key: string): DAGNode[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (k: string) => {
    if (seen.has(k)) return;
    seen.add(k);
    order.push(k);
    for (const e of dag.edges) if (e.from === k) visit(e.to);
  };
  if (dag.entry) visit(dag.entry);
  const idx = order.indexOf(key);
  const before = idx >= 0 ? order.slice(0, idx) : [];
  return before
    .map((k) => dag.nodes.find((n) => n.key === k))
    .filter((n): n is DAGNode => !!n);
}

function artifactToText(p?: Record<string, unknown>): string {
  if (!p) return "";
  if (typeof p.text === "string") return p.text;
  if (typeof p.content === "string") return p.content;
  return JSON.stringify(p, null, 2);
}

function payloadAttachments(p?: Record<string, unknown>): Attachment[] {
  if (!p) return [];
  const a = p.attachments;
  if (!Array.isArray(a)) return [];
  return a.filter(
    (x): x is Attachment =>
      !!x && typeof x === "object" && typeof (x as Attachment).url === "string"
  );
}

function classifyArtifact(a: Artifact): Attachment[] {
  const list = payloadAttachments(a.payload);
  if (a.blob_url) {
    const url = a.blob_url;
    const lower = url.toLowerCase();
    const kind: Attachment["kind"] = /\.(png|jpg|jpeg|gif|webp|svg)$/.test(lower)
      ? "image"
      : /\.(mp4|mov|webm|m4v)$/.test(lower)
      ? "video"
      : "doc";
    list.push({ name: url.split("/").pop() ?? url, url, kind });
  }
  return list;
}
