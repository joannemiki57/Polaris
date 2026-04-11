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
};

export function MindNode({ data, selected }: NodeProps<MindNodeData>) {
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
