export type NodeKind = "topic" | "keyword" | "subtask" | "paper" | "note";

export type EdgeKind =
  | "expands_to"
  | "prerequisite_for"
  | "from_openalex"
  | "has_keyword"
  | "has_section"
  | "user_linked";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  summary?: string;
  openAlexId?: string;
  doi?: string;
  year?: number;
  citedByCount?: number;
  url?: string;
  relevance?: number;
  isReview?: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
}

export interface MindGraph {
  version: 1;
  title: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  updatedAt: string;
}
