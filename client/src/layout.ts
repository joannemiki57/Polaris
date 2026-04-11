import type { Edge, Node } from "reactflow";
import type { GraphEdge, MindGraph } from "./graphTypes";

const kindColor: Record<string, string> = {
  topic: "#7c3aed",
  keyword: "#0d9488",
  subtask: "#ea580c",
  paper: "#2563eb",
  note: "#64748b",
};

function findRoots(g: MindGraph): string[] {
  const targets = new Set(g.edges.map((e) => e.target));
  const topics = g.nodes.filter((n) => n.kind === "topic").map((n) => n.id);
  const roots = topics.filter((id) => !targets.has(id));
  if (roots.length) return roots;
  if (topics[0]) return [topics[0]];
  if (g.nodes[0]) return [g.nodes[0].id];
  return [];
}

export function mindGraphToFlow(g: MindGraph): { nodes: Node[]; edges: Edge[] } {
  const adj = new Map<string, string[]>();
  for (const e of g.edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }
  const roots = findRoots(g);
  const level = new Map<string, number>();
  const q = [...roots];
  for (const r of roots) level.set(r, 0);
  while (q.length) {
    const u = q.shift()!;
    const L = level.get(u) ?? 0;
    for (const v of adj.get(u) ?? []) {
      const next = L + 1;
      if (!level.has(v) || (level.get(v) ?? 0) > next) {
        level.set(v, next);
        q.push(v);
      }
    }
  }
  for (const n of g.nodes) {
    if (!level.has(n.id)) level.set(n.id, 1);
  }
  const byLevel = new Map<number, string[]>();
  for (const n of g.nodes) {
    const lv = level.get(n.id) ?? 0;
    if (!byLevel.has(lv)) byLevel.set(lv, []);
    byLevel.get(lv)!.push(n.id);
  }
  const positions = new Map<string, { x: number; y: number }>();
  const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);
  const xGap = 300;
  const yGap = 100;
  for (const lv of sortedLevels) {
    const row = byLevel.get(lv)!;
    row.forEach((id, i) => {
      positions.set(id, {
        x: lv * xGap,
        y: i * yGap - (row.length * yGap) / 2,
      });
    });
  }

  const nodes: Node[] = g.nodes.map((n) => {
    const pos = positions.get(n.id) ?? { x: 0, y: 0 };
    return {
      id: n.id,
      position: pos,
      type: "mind",
      data: {
        label: n.label,
        kind: n.kind,
        summary: n.summary,
        meta: n,
      },
      style: {
        borderColor: kindColor[n.kind] ?? "#334155",
        borderWidth: 2,
        borderRadius: 10,
        padding: 8,
        maxWidth: 220,
        fontSize: 13,
        background: "#0f172a",
        color: "#f1f5f9",
      },
    };
  });

  const edges: Edge[] = g.edges.map((e: GraphEdge) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.kind.replace(/_/g, " "),
    animated: e.kind === "expands_to",
    style: { stroke: "#94a3b8", strokeWidth: 1.2 },
    labelStyle: { fill: "#94a3b8", fontSize: 10 },
  }));

  return { nodes, edges };
}
