import { useCallback } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import type { GraphNode } from "./graphTypes";

export type MindNodeData = {
  label: string;
  kind: GraphNode["kind"];
  summary?: string;
  meta: GraphNode;
  connected?: boolean;
  dimmed?: boolean;
  revealDelay?: number;
  stagger?: boolean;
  onExpand?: (id: string) => void;
  onDeep?: (id: string) => void;
  busy?: boolean;
};

export function MindNode({ id, data, selected }: NodeProps<MindNodeData>) {
  const paperUrl = data.kind === "paper"
    ? (data.meta.doi ? `https://doi.org/${data.meta.doi.replace(/^https?:\/\/doi\.org\//, "")}` : data.meta.url)
    : undefined;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!paperUrl) return;
      e.stopPropagation();
      window.open(paperUrl, "_blank", "noopener,noreferrer");
    },
    [paperUrl],
  );

  const handleExpand = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      data.onExpand?.(id);
    },
    [data, id],
  );

  const handleDeep = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      data.onDeep?.(id);
    },
    [data, id],
  );

  const revealStyle = data.stagger
    ? { animationDelay: `${data.revealDelay ?? 0}ms` }
    : undefined;

  return (
    <div
      className={`mind-node${selected ? " selected" : ""}${data.connected ? " connected" : ""}${data.dimmed ? " dimmed" : ""}${paperUrl ? " clickable" : ""}${data.stagger ? " mind-node-reveal" : ""}`}
      onDoubleClick={handleClick}
      style={revealStyle}
    >
      <Handle type="target" id="t-left" position={Position.Left} />
      <Handle type="target" id="t-top" position={Position.Top} />
      <Handle type="target" id="t-right" position={Position.Right} />
      <Handle type="target" id="t-bottom" position={Position.Bottom} />

      {selected && !data.busy && (
        <div className="node-toolbar">
          <button
            type="button"
            className="node-toolbar-btn"
            onClick={handleExpand}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 1l1.8 4.2L14 7l-4.2 1.8L8 13l-1.8-4.2L2 7l4.2-1.8z" fill="#facc15" stroke="#facc15" strokeWidth="0.5"/>
              <path d="M12.5 1.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" fill="#fde68a" stroke="none"/>
            </svg>
            Expand
          </button>
          <div className="node-toolbar-divider" />
          <button
            type="button"
            className="node-toolbar-btn"
            onClick={handleDeep}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="6.5" cy="6.5" r="4" stroke="#94a3b8" strokeWidth="1.5"/>
              <line x1="9.5" y1="9.5" x2="14" y2="14" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Deep
          </button>
        </div>
      )}

      {data.kind === "paper" && (
        <div className="mind-kind">
          paper
          {paperUrl && <span className="mind-link-hint">↗</span>}
        </div>
      )}
      {data.kind === "topic" && (
        <div className="mind-kind">topic</div>
      )}
      <div className="mind-label">{data.label}</div>
      {data.meta.year != null ? (
        <div className="mind-meta">
          {data.meta.year}
          {data.meta.citedByCount != null ? ` · ${data.meta.citedByCount} cites` : ""}
        </div>
      ) : null}

      <Handle type="source" id="s-left" position={Position.Left} />
      <Handle type="source" id="s-top" position={Position.Top} />
      <Handle type="source" id="s-right" position={Position.Right} />
      <Handle type="source" id="s-bottom" position={Position.Bottom} />
    </div>
  );
}
