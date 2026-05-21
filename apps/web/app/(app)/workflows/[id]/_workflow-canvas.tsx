"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  reconnectEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type OnConnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { useT } from "../../../../lib/i18n";
import type { DAG, DAGEdge, DAGNode, Employee } from "../../../../lib/types";
import { EMP_DRAG_TYPE } from "./_employee-roster";

interface WfNodeData {
  displayName: string;
  displayAvatar: string;
  typeRole: string;
  helpers: Employee[];
  hasHuman: boolean;
  hasNote: boolean;
  selected: boolean;
  onSelect: () => void;
  [key: string]: unknown;
}

interface Props {
  draft: DAG;
  empByID: Map<string, Employee>;
  selectedKey: string | null;
  positions: React.MutableRefObject<Map<string, { x: number; y: number }>>;
  onSelect: (key: string | null) => void;
  onChange: (next: DAG) => void;
  onDropOnNode: (nodeKey: string, empId: string) => void;
  onDropOnPane: (empId: string, pos: { x: number; y: number }) => void;
}

const NODE_W = 220;
const NODE_H = 96;

function autoLayout(nodes: DAGNode[], edges: DAGEdge[]): Map<string, { x: number; y: number }> {
  const level = new Map<string, number>();
  const indeg = new Map<string, number>();
  for (const n of nodes) indeg.set(n.key, 0);
  for (const e of edges) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);

  const queue: string[] = [];
  for (const [k, d] of indeg) if (d === 0) queue.push(k);
  if (queue.length === 0 && nodes.length > 0) queue.push(nodes[0].key);
  for (const k of queue) level.set(k, 0);

  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const a = adj.get(e.from) ?? [];
    a.push(e.to);
    adj.set(e.from, a);
  }

  while (queue.length) {
    const k = queue.shift()!;
    const lv = level.get(k) ?? 0;
    const downs = adj.get(k) ?? [];
    for (const d of downs) {
      const cur = level.get(d);
      const next = lv + 1;
      if (cur == null || next > cur) {
        level.set(d, next);
        queue.push(d);
      }
    }
  }

  const byLevel = new Map<number, string[]>();
  for (const n of nodes) {
    const lv = level.get(n.key) ?? 0;
    const list = byLevel.get(lv) ?? [];
    list.push(n.key);
    byLevel.set(lv, list);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const X_GAP = 80;
  const Y_GAP = 60;
  const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);
  sortedLevels.forEach((lv) => {
    const list = byLevel.get(lv)!;
    list.forEach((k, idx) => {
      positions.set(k, {
        x: 40 + lv * (NODE_W + X_GAP),
        y: 40 + idx * (NODE_H + Y_GAP),
      });
    });
  });

  return positions;
}

function WfNode({ data }: NodeProps) {
  const d = data as WfNodeData;
  const accent = d.hasHuman ? "var(--warning)" : "var(--primary)";
  const accentSoft = d.hasHuman ? "#fff4e5" : "var(--primary-soft)";
  const hasType = d.typeRole !== "";

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        d.onSelect();
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(EMP_DRAG_TYPE)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(EMP_DRAG_TYPE);
        if (id) {
          e.preventDefault();
          e.stopPropagation();
          const ev = new CustomEvent("wf-canvas-drop-emp-node", {
            detail: { empId: id, nodeKey: (data as { _key: string })._key },
          });
          window.dispatchEvent(ev);
        }
      }}
      className="rounded-md cursor-pointer transition"
      style={{
        width: NODE_W,
        background: "var(--surface)",
        border: `1px solid ${d.selected ? "var(--primary)" : "var(--border)"}`,
        boxShadow: d.selected ? "0 0 0 2px var(--primary-soft)" : "var(--shadow-sm)",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: "var(--border-strong)" }} />
      <div className="p-3">
        <div className="flex items-center gap-2">
          {hasType ? (
            <span
              className="inline-flex items-center justify-center w-8 h-8 rounded-md text-[13px] font-medium shrink-0"
              style={{ background: accentSoft, color: accent }}
            >
              {d.displayAvatar}
            </span>
          ) : (
            <span
              className="inline-flex items-center justify-center w-8 h-8 rounded-md text-[13px]"
              style={{ background: "var(--bg-soft)", color: "var(--text-3)" }}
            >
              ?
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium truncate">{d.displayName}</div>
            <div className="text-[11px] truncate" style={{ color: "var(--text-3)" }}>
              {hasType ? d.typeRole : "未绑定员工"}
            </div>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <span
            className="inline-flex items-center px-1.5 py-[1px] rounded text-[11px]"
            style={{ background: accentSoft, color: accent }}
          >
            {d.hasHuman ? "人为干预" : "AI"}
          </span>
          {d.helpers.length > 0 && (
            <span
              className="text-[11px] px-1.5 py-[1px] rounded"
              style={{ background: "#fff4e5", color: "var(--warning)" }}
            >
              助手 ×{d.helpers.length}
            </span>
          )}
          {d.hasNote && (
            <span
              className="text-[11px] px-1.5 py-[1px] rounded"
              style={{ background: "var(--bg-soft)", color: "var(--text-3)" }}
              title="包含实例补充信息"
            >
              备注
            </span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: "var(--border-strong)" }} />
    </div>
  );
}

const nodeTypes = { wf: WfNode };

function CanvasInner({
  draft,
  empByID,
  selectedKey,
  positions,
  onSelect,
  onChange,
  onDropOnNode,
  onDropOnPane,
}: Props) {
  const { t } = useT();
  const { screenToFlowPosition } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const initial = useMemo(() => {
    const auto = autoLayout(draft.nodes, draft.edges);
    for (const [k, p] of auto) {
      if (!positions.current.has(k)) positions.current.set(k, p);
    }
    const nodes: Node[] = draft.nodes.map((n) => {
      const pos = positions.current.get(n.key) ?? auto.get(n.key) ?? { x: 0, y: 0 };
      const assignees = (n.assignee_employee_ids ?? [])
        .map((id) => empByID.get(id))
        .filter(Boolean) as Employee[];
      const typeEmp = assignees[0] ?? null;
      const helpers = assignees.slice(1);
      const hasHuman = helpers.some((e) => !!e.bound_user_id);
      // Prefer instance fields (independent of the type) for display.
      const displayName =
        n.instance?.name?.trim() ||
        n.title?.trim() ||
        typeEmp?.name ||
        "未命名";
      const displayAvatar =
        n.instance?.avatar ||
        typeEmp?.avatar ||
        typeEmp?.name?.slice(0, 1) ||
        "?";
      return {
        id: n.key,
        type: "wf",
        position: pos,
        data: {
          _key: n.key,
          displayName,
          displayAvatar,
          typeRole: typeEmp?.role ?? "",
          helpers,
          hasHuman,
          hasNote: !!n.instance?.note?.trim(),
          selected: n.key === selectedKey,
          onSelect: () => onSelect(n.key),
        } as WfNodeData,
      };
    });
    const edges: Edge[] = draft.edges.map((e, i) => ({
      id: `${e.from}->${e.to}-${i}`,
      source: e.from,
      target: e.to,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, color: "var(--border-strong)" },
      style: { stroke: "var(--border-strong)", strokeWidth: 1.5 },
    }));
    return { nodes, edges };
  }, [draft, empByID, selectedKey, positions, onSelect]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  useEffect(() => {
    setNodes(initial.nodes);
    setEdges(initial.edges);
  }, [initial, setNodes, setEdges]);

  const onConnect: OnConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        const next = addEdge(
          {
            ...params,
            type: "smoothstep",
            markerEnd: { type: MarkerType.ArrowClosed, color: "var(--border-strong)" },
            style: { stroke: "var(--border-strong)", strokeWidth: 1.5 },
          },
          eds
        );
        const dagEdges: DAGEdge[] = next
          .filter((e) => e.source && e.target)
          .map((e) => ({ from: e.source!, to: e.target! }));
        onChange({ ...draft, edges: dagEdges, entry: draft.entry || draft.nodes[0]?.key });
        return next;
      });
    },
    [draft, onChange, setEdges]
  );

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      setEdges((eds) => {
        const next = reconnectEdge(oldEdge, newConnection, eds);
        const dagEdges: DAGEdge[] = next
          .filter((e) => e.source && e.target)
          .map((e) => ({ from: e.source!, to: e.target! }));
        onChange({ ...draft, edges: dagEdges });
        return next;
      });
    },
    [draft, onChange, setEdges]
  );

  const onEdgesDelete = useCallback(
    (removed: Edge[]) => {
      const removedIds = new Set(removed.map((e) => e.id));
      setEdges((eds) => {
        const next = eds.filter((e) => !removedIds.has(e.id));
        const dagEdges: DAGEdge[] = next
          .filter((e) => e.source && e.target)
          .map((e) => ({ from: e.source!, to: e.target! }));
        onChange({ ...draft, edges: dagEdges });
        return next;
      });
    },
    [draft, onChange, setEdges]
  );

  const onNodeDragStop = useCallback(
    (_: unknown, n: Node) => {
      positions.current.set(n.id, n.position);
    },
    [positions]
  );

  // Node drop (employee onto existing node)
  useEffect(() => {
    function onDrop(ev: Event) {
      const { empId, nodeKey } = (ev as CustomEvent).detail as {
        empId: string;
        nodeKey: string;
      };
      onDropOnNode(nodeKey, empId);
    }
    window.addEventListener("wf-canvas-drop-emp-node", onDrop);
    return () => window.removeEventListener("wf-canvas-drop-emp-node", onDrop);
  }, [onDropOnNode]);

  // Pane drop (employee onto empty canvas)
  const onPaneDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(EMP_DRAG_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const onPaneDrop = useCallback(
    (e: React.DragEvent) => {
      const empId = e.dataTransfer.getData(EMP_DRAG_TYPE);
      if (!empId) return;
      e.preventDefault();
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      onDropOnPane(empId, { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 });
    },
    [onDropOnPane, screenToFlowPosition]
  );

  return (
    <div
      ref={wrapperRef}
      onDragOver={onPaneDragOver}
      onDrop={onPaneDrop}
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onEdgesDelete={onEdgesDelete}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={() => onSelect(null)}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: "smoothstep" }}
        minZoom={0.3}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
        <Controls showInteractive={false} />
      </ReactFlow>
      {draft.nodes.length === 0 && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          style={{ color: "var(--text-3)" }}
        >
          <div className="text-[14px]">{t("wf.canvas.empty")}</div>
        </div>
      )}
    </div>
  );
}

export function WorkflowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

export function positionForNewNode(): { x: number; y: number } {
  return { x: 0, y: 0 };
}
