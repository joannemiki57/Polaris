import type { Edge, Node } from "reactflow";
import type { GraphEdge, MindGraph } from "./graphTypes";

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

export function mindGraphToFlow(g: MindGraph): { nodes: Node[]; edges: Edge[] } {
  const positions = forceDirectedLayout(g);

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

  const edges: Edge[] = g.edges.map((e: GraphEdge) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: "straight",
    style: {
      stroke: edgeColor[e.kind] ?? "rgba(156, 163, 175, 0.15)",
      strokeWidth: e.kind === "expands_to" ? 1.2 : 0.8,
    },
    labelStyle: { fill: "transparent", fontSize: 0 },
  }));

  return { nodes, edges };
}
