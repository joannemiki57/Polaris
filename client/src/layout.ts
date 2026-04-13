import type { Edge, Node } from "reactflow";
import type { GraphEdge, MindGraph } from "./graphTypes";

export type LayoutMode = "tree" | "radial";
export type EdgeLineMode = "diagonal" | "parallel";

type TreeMeta = {
  children: Map<string, string[]>;
  depth: Map<string, number>;
  parent: Map<string, string>;
  roots: string[];
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

interface Vec { x: number; y: number }

function buildTreeMeta(g: MindGraph): TreeMeta {
  const labels = new Map(g.nodes.map((n) => [n.id, n.label]));
  const children = new Map<string, string[]>();
  for (const n of g.nodes) children.set(n.id, []);

  for (const e of g.edges) {
    const row = children.get(e.source);
    if (!row) continue;
    if (!row.includes(e.target)) row.push(e.target);
  }
  for (const row of children.values()) {
    row.sort((a, b) => (labels.get(a) ?? a).localeCompare(labels.get(b) ?? b));
  }

  const seedRoots = findRoots(g);
  const depth = new Map<string, number>();
  const parent = new Map<string, string>();
  const q = [...seedRoots];
  for (const r of seedRoots) depth.set(r, 0);

  while (q.length) {
    const u = q.shift()!;
    const nextDepth = (depth.get(u) ?? 0) + 1;
    for (const v of children.get(u) ?? []) {
      if (!depth.has(v)) {
        depth.set(v, nextDepth);
        parent.set(v, u);
        q.push(v);
      }
    }
  }

  const extraRoots = g.nodes
    .map((n) => n.id)
    .filter((id) => !depth.has(id))
    .sort((a, b) => (labels.get(a) ?? a).localeCompare(labels.get(b) ?? b));
  for (const id of extraRoots) depth.set(id, 0);

  return {
    children,
    depth,
    parent,
    roots: [...seedRoots, ...extraRoots],
  };
}

function forceDirectedLayout(g: MindGraph): Map<string, Vec> {
  const roots = new Set(findRoots(g));
  const positions = new Map<string, Vec>();
  const velocities = new Map<string, Vec>();

  // seed initial positions in a rough radial spread
  const adj = new Map<string, string[]>();
  for (const e of g.edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }

  const rootId = [...roots][0] ?? g.nodes[0]?.id;
  if (!rootId) return positions;

  const visited = new Set<string>();
  const bfsQ: { id: string; depth: number; angle: number; spread: number }[] = [];

  positions.set(rootId, { x: 0, y: 0 });
  visited.add(rootId);

  const rootChildren = (adj.get(rootId) ?? []).filter((c) => !visited.has(c));
  const baseSlice = (2 * Math.PI) / (rootChildren.length || 1);
  rootChildren.forEach((c, i) => {
    bfsQ.push({ id: c, depth: 1, angle: i * baseSlice - Math.PI + baseSlice * 0.5, spread: baseSlice });
  });

  while (bfsQ.length > 0) {
    const { id, depth, angle, spread } = bfsQ.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const r = 160 + depth * 140 + (Math.random() - 0.5) * 40;
    positions.set(id, {
      x: Math.cos(angle) * r + (Math.random() - 0.5) * 30,
      y: Math.sin(angle) * r + (Math.random() - 0.5) * 30,
    });

    const children = (adj.get(id) ?? []).filter((c) => !visited.has(c));
    const childSpread = spread / (children.length || 1);
    children.forEach((c, i) => {
      const childAngle = angle - spread / 2 + childSpread * (i + 0.5);
      bfsQ.push({ id: c, depth: depth + 1, angle: childAngle, spread: childSpread });
    });
  }

  for (const n of g.nodes) {
    if (!positions.has(n.id)) {
      const a = Math.random() * Math.PI * 2;
      positions.set(n.id, { x: Math.cos(a) * 300, y: Math.sin(a) * 300 });
    }
    velocities.set(n.id, { x: 0, y: 0 });
  }

  // build edge set for quick lookup
  const edgeSet = new Set<string>();
  for (const e of g.edges) {
    edgeSet.add(`${e.source}|${e.target}`);
    edgeSet.add(`${e.target}|${e.source}`);
  }

  const ITERATIONS = 120;
  const REPULSION = 18000;
  const ATTRACTION = 0.008;
  const IDEAL_LEN = 180;
  const DAMPING = 0.85;
  const CENTER_PULL = 0.002;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // repulsion between all pairs
    const nodeArr = g.nodes;
    for (let i = 0; i < nodeArr.length; i++) {
      for (let j = i + 1; j < nodeArr.length; j++) {
        const a = positions.get(nodeArr[i]!.id)!;
        const b = positions.get(nodeArr[j]!.id)!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = REPULSION / (dist * dist);
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        const va = velocities.get(nodeArr[i]!.id)!;
        const vb = velocities.get(nodeArr[j]!.id)!;
        va.x -= dx; va.y -= dy;
        vb.x += dx; vb.y += dy;
      }
    }

    // attraction along edges
    for (const e of g.edges) {
      const a = positions.get(e.source);
      const b = positions.get(e.target);
      if (!a || !b) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - IDEAL_LEN) * ATTRACTION;
      dx = (dx / dist) * force;
      dy = (dy / dist) * force;
      const va = velocities.get(e.source)!;
      const vb = velocities.get(e.target)!;
      va.x += dx; va.y += dy;
      vb.x -= dx; vb.y -= dy;
    }

    // gentle pull toward center
    for (const n of g.nodes) {
      const p = positions.get(n.id)!;
      const v = velocities.get(n.id)!;
      v.x -= p.x * CENTER_PULL;
      v.y -= p.y * CENTER_PULL;
    }

    // apply velocities
    for (const n of g.nodes) {
      const p = positions.get(n.id)!;
      const v = velocities.get(n.id)!;
      // root nodes are pinned at center
      if (roots.has(n.id)) {
        v.x = 0; v.y = 0;
        continue;
      }
      v.x *= DAMPING;
      v.y *= DAMPING;
      p.x += v.x;
      p.y += v.y;
    }
  }

  return positions;
}

function treeLayout(g: MindGraph, meta: TreeMeta): Map<string, Vec> {
  const { children, depth, parent, roots } = meta;

  const y = new Map<string, number>();
  const yGap = 110;
  let cursor = 0;
  const place = (id: string): number => {
    const kids = (children.get(id) ?? []).filter((c) => parent.get(c) === id);
    if (kids.length === 0) {
      const leafY = cursor * yGap;
      cursor += 1;
      y.set(id, leafY);
      return leafY;
    }
    const vals = kids.map((k) => place(k));
    const sortedVals = [...vals].sort((a, b) => a - b);
    const mid = Math.floor(sortedVals.length / 2);
    const centerY = sortedVals.length % 2 === 1
      ? sortedVals[mid]!
      : ((sortedVals[mid - 1]! + sortedVals[mid]!) / 2);
    y.set(id, centerY);
    return centerY;
  };

  for (const r of roots) {
    place(r);
    cursor += 0.6;
  }

  const allY = [...y.values()];
  const center = allY.length > 0
    ? (Math.min(...allY) + Math.max(...allY)) / 2
    : 0;

  const xGap = 320;
  const positions = new Map<string, Vec>();
  for (const n of g.nodes) {
    positions.set(n.id, {
      x: (depth.get(n.id) ?? 0) * xGap,
      y: (y.get(n.id) ?? 0) - center,
    });
  }

  return positions;
}

export function mindGraphToFlow(
  g: MindGraph,
  layoutMode: LayoutMode = "radial",
  edgeLineMode: EdgeLineMode = "diagonal",
): { nodes: Node[]; edges: Edge[] } {
  const treeMeta = layoutMode === "tree" ? buildTreeMeta(g) : null;
  const positions = layoutMode === "tree" && treeMeta
    ? treeLayout(g, treeMeta)
    : forceDirectedLayout(g);

  const nodes: Node[] = g.nodes.map((n, idx) => {
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
        animDelay: idx,
      },
      style: {
        border: "none",
        borderRadius: 0,
        padding: 0,
        maxWidth: n.kind === "topic" ? 240 : n.kind === "paper" ? 180 : 200,
        fontSize: 13,
        background: "transparent",
        color: "#eee",
        boxShadow: "none",
      },
    };
  });

  const edgeColor: Record<string, string> = {
    expands_to: "rgba(255, 211, 105, 0.18)",
    prerequisite_for: "rgba(156, 163, 175, 0.18)",
    from_openalex: "rgba(107, 114, 128, 0.15)",
    has_keyword: "rgba(255, 211, 105, 0.15)",
    has_section: "rgba(107, 114, 128, 0.12)",
    user_linked: "rgba(156, 163, 175, 0.18)",
  };

  const renderedEdges = layoutMode === "tree" && edgeLineMode === "parallel" && treeMeta
    ? g.edges.filter((e) => treeMeta.parent.get(e.target) === e.source)
    : g.edges;

  const edges: Edge[] = renderedEdges.map((e: GraphEdge) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: edgeLineMode === "parallel" ? "parallelStraight" : "straight",
    ...(layoutMode === "tree" && edgeLineMode === "parallel"
      ? {
          sourceHandle: "s-right",
          targetHandle: "t-left",
        }
      : {}),
    style: {
      stroke: edgeLineMode === "parallel"
        ? "#5b522f"
        : (edgeColor[e.kind] ?? "rgba(156, 163, 175, 0.15)"),
      strokeWidth: edgeLineMode === "parallel"
        ? 1
        : (e.kind === "expands_to" ? 1.2 : 0.8),
    },
    labelStyle: { fill: "transparent", fontSize: 0 },
  }));

  return { nodes, edges };
}
