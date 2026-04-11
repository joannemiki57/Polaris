import { Handle, Position, type NodeProps } from "reactflow";
import type { GraphNode } from "./graphTypes";

export type MindNodeData = {
  label: string;
  kind: GraphNode["kind"];
  summary?: string;
  meta: GraphNode;
};

export function MindNode({ data, selected }: NodeProps<MindNodeData>) {
  return (
    <div className={`mind-node${selected ? " selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className="mind-kind">{data.kind}</div>
      <div className="mind-label">{data.label}</div>
      {data.summary ? <div className="mind-sum">{data.summary}</div> : null}
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
