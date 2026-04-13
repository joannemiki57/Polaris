import { useCallback } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import type { GraphNode } from "./graphTypes";

export type MindNodeData = {
  label: string;
  kind: GraphNode["kind"];
  summary?: string;
  meta: GraphNode;
  animDelay?: number;
  isMultiSelected?: boolean;
};

const NODE_ICONS: Record<string, string> = {
  topic: "/assets/node-topic-1.svg",
  keyword: "/assets/node-keyword-1.svg",
};

export function MindNode({ data, selected }: NodeProps<MindNodeData>) {
  const { kind, label, meta } = data;
  const isSelected = Boolean(selected || data.isMultiSelected);
  const paperUrl = kind === "paper"
    ? (meta.doi ? `https://doi.org/${meta.doi.replace(/^https?:\/\/doi\.org\//, "")}` : meta.url)
    : undefined;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!paperUrl) return;
      e.stopPropagation();
      window.open(paperUrl, "_blank", "noopener,noreferrer");
    },
    [paperUrl],
  );

  const icon = NODE_ICONS[kind];
  const isTopic = kind === "topic";
  const isPaper = kind === "paper";
  const isSubtask = kind === "subtask";

  return (
    <div
      className={`mn mn-shimmer ${isSelected ? "mn-selected" : ""} ${paperUrl ? "mn-clickable" : ""} mn-${kind}`}
      onDoubleClick={handleClick}
      style={{
        animation: "mn-fade-up 0.28s cubic-bezier(0.22,1,0.36,1) forwards",
      }}
    >
      <Handle type="target" position={Position.Top} className="mn-handle" id="t-top" />
      <Handle type="target" position={Position.Bottom} className="mn-handle" id="t-bottom" />
      <Handle type="target" position={Position.Left} className="mn-handle" id="t-left" />
      <Handle type="target" position={Position.Right} className="mn-handle" id="t-right" />

      {/* Icon / dot */}
      <div className="mn-glyph">
        {icon ? (
          <img
            className={`mn-icon ${isTopic ? "mn-icon-lg" : ""}`}
            src={icon}
            alt=""
          />
        ) : isPaper ? (
          <div className="mn-dot mn-dot-paper" />
        ) : isSubtask ? (
          <div className="mn-dot mn-dot-subtask" />
        ) : (
          <div className="mn-dot mn-dot-default" />
        )}
      </div>

      {/* Label */}
      <div className={`mn-label mn-label-${kind}`}>
        {label}
        {paperUrl && <span className="mn-link-icon"> ↗</span>}
      </div>

      {/* Badges */}
      {(meta.isReview || meta.relevance != null) && (
        <div className="mn-badges">
          {meta.isReview && <span className="mn-badge mn-badge-review">review</span>}
          {meta.relevance != null && (
            <span className="mn-badge mn-badge-relevance">{(meta.relevance * 100).toFixed(0)}%</span>
          )}
        </div>
      )}

      {/* Meta (year, citations) */}
      {(meta.year != null || meta.citedByCount != null) && (
        <div className="mn-meta">
          {meta.year ?? ""}
          {meta.citedByCount != null ? ` · ${meta.citedByCount.toLocaleString()} cites` : ""}
        </div>
      )}

      <Handle type="source" position={Position.Top} className="mn-handle" id="s-top" />
      <Handle type="source" position={Position.Bottom} className="mn-handle" id="s-bottom" />
      <Handle type="source" position={Position.Left} className="mn-handle" id="s-left" />
      <Handle type="source" position={Position.Right} className="mn-handle" id="s-right" />
    </div>
  );
}
