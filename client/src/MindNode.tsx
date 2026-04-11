import { useCallback } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import type { GraphNode } from "./graphTypes";

export type MindNodeData = {
  label: string;
  kind: GraphNode["kind"];
  summary?: string;
  meta: GraphNode;
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

  return (
    <div
      className={`mind-node${selected ? " selected" : ""}${paperUrl ? " clickable" : ""}`}
      onDoubleClick={handleClick}
    >
      <Handle type="target" position={Position.Left} />
      <div className="mind-kind">
        {data.meta.isReview ? "review" : data.kind}
        {data.meta.isReview && <span className="mind-review-badge">literature review</span>}
        {paperUrl && <span className="mind-link-hint">↗</span>}
        {data.meta.relevance != null && (
          <span className="mind-relevance">{(data.meta.relevance * 100).toFixed(0)}%</span>
        )}
      </div>
      <div className="mind-label">{data.label}</div>
      {data.meta.year != null ? (
        <div className="mind-meta">
          {data.meta.year}
          {data.meta.citedByCount != null ? ` · ${data.meta.citedByCount} cites` : ""}
        </div>
      ) : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
