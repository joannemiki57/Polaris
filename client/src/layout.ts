import type { Edge, Node } from "reactflow";
import type { GraphEdge, MindGraph } from "./graphTypes";

export type LayoutMode = "tree" | "radial";

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

function buildLevels(g: MindGraph) {
  const adj = new Map<string, string[]>();
  for (const e of g.edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }
  const roots = findRoots(g);
  const level = new Map<string, number>();
  const parent = new Map<string, string>();
  const q = [...roots];
  for (const r of roots) level.set(r, 0);
  while (q.length) {
    const u = q.shift()!;
    const L = level.get(u) ?? 0;
    for (const v of adj.get(u) ?? []) {
      const next = L + 1;
      if (!level.has(v) || (level.get(v) ?? 0) > next) {
        level.set(v, next);
        parent.set(v, u);
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
  return { roots, level, byLevel, adj, parent };
}

function treePositions(g: MindGraph): Map<string, { x: number; y: number }> {
  const { byLevel } = buildLevels(g);
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
  return positions;
}

function forceDirectedPositions(g: MindGraph): Map<string, { x: number; y: number }> {
  const n = g.nodes.length;
  if (n === 0) return new Map();

  const idIndex = new Map<string, number>();
  g.nodes.forEach((node, i) => idIndex.set(node.id, i));

  const links: [number, number][] = [];
  for (const e of g.edges) {
    const si = idIndex.get(e.source);
    const ti = idIndex.get(e.target);
    if (si != null && ti != null) links.push([si, ti]);
  }

  const initRadius = Math.max(150, n * 30);
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n;
    px[i] = Math.cos(angle) * initRadius;
    py[i] = Math.sin(angle) * initRadius;
  }

  const roots = findRoots(g);
  const rootIdx = roots.length > 0 ? (idIndex.get(roots[0]!) ?? 0) : 0;
  px[rootIdx] = 0;
  py[rootIdx] = 0;

  const ITERATIONS = 300;
  const REPULSION = 12000;
  const SPRING_K = 0.012;
  const IDEAL_LEN = 200;
  const CENTER_PULL = 0.008;
  const DAMPING = 0.9;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const temp = 0.3 + 0.7 * (1 - iter / ITERATIONS);

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = px[j] - px[i];
        let dy = py[j] - py[i];
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          dx = (Math.random() - 0.5) * 10;
          dy = (Math.random() - 0.5) * 10;
          d2 = dx * dx + dy * dy;
        }
        const dist = Math.sqrt(d2);
        const f = (REPULSION * temp) / d2;
        const fx = (dx / dist) * f;
        const fy = (dy / dist) * f;
        vx[i] -= fx; vy[i] -= fy;
        vx[j] += fx; vy[j] += fy;
      }
    }

    for (const [si, ti] of links) {
      const dx = px[ti] - px[si];
      const dy = py[ti] - py[si];
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = SPRING_K * (dist - IDEAL_LEN) * temp;
      const fx = (dx / dist) * f;
      const fy = (dy / dist) * f;
      vx[si] += fx; vy[si] += fy;
      vx[ti] -= fx; vy[ti] -= fy;
    }

    for (let i = 0; i < n; i++) {
      vx[i] -= px[i] * CENTER_PULL * temp;
      vy[i] -= py[i] * CENTER_PULL * temp;
    }

    for (let i = 0; i < n; i++) {
      if (i === rootIdx) { vx[i] = 0; vy[i] = 0; continue; }
      vx[i] *= DAMPING;
      vy[i] *= DAMPING;
      px[i] += vx[i];
      py[i] += vy[i];
    }
  }

  const positions = new Map<string, { x: number; y: number }>();
  g.nodes.forEach((node, i) => {
    positions.set(node.id, { x: Math.round(px[i]), y: Math.round(py[i]) });
  });
  return positions;
}

type Pos = { x: number; y: number };

function pickHandles(src: Pos, tgt: Pos): { sourceHandle: string; targetHandle: string } {
  const dx = tgt.x - src.x;
  const dy = tgt.y - src.y;
  const angle = Math.atan2(dy, dx);

  // Determine which side of the source the target is on
  // Right: -45° to 45°, Bottom: 45° to 135°, Left: 135° to -135°, Top: -135° to -45°
  let sourceSide: string;
  let targetSide: string;

  if (angle >= -Math.PI / 4 && angle < Math.PI / 4) {
    sourceSide = "right"; targetSide = "left";
  } else if (angle >= Math.PI / 4 && angle < (3 * Math.PI) / 4) {
    sourceSide = "bottom"; targetSide = "top";
  } else if (angle >= -(3 * Math.PI) / 4 && angle < -Math.PI / 4) {
    sourceSide = "top"; targetSide = "bottom";
  } else {
    sourceSide = "left"; targetSide = "right";
  }

  return {
    sourceHandle: `s-${sourceSide}`,
    targetHandle: `t-${targetSide}`,
  };
}

export function mindGraphToFlow(
  g: MindGraph,
  layout: LayoutMode = "tree",
  stagger = false,
): { nodes: Node[]; edges: Edge[] } {
  const positions = layout === "radial" ? forceDirectedPositions(g) : treePositions(g);

  const revealDelays = new Map<string, number>();
  if (stagger) {
    const { byLevel } = buildLevels(g);
    const DELAY_PER_NODE = 120;
    let seq = 0;
    const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);
    for (const lv of sortedLevels) {
      for (const id of byLevel.get(lv)!) {
        revealDelays.set(id, seq * DELAY_PER_NODE);
        seq++;
      }
    }
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
        revealDelay: revealDelays.get(n.id) ?? 0,
        stagger,
      },
      style: {
        borderColor: n.isReview ? "#d97706" : (kindColor[n.kind] ?? "#334155"),
        borderWidth: n.isReview ? 3 : 2,
        borderRadius: 10,
        padding: 8,
        maxWidth: 220,
        fontSize: 13,
        background: n.isReview ? "#1c1917" : "#0f172a",
        color: "#f1f5f9",
      },
    };
  });

  const edges: Edge[] = g.edges.map((e: GraphEdge) => {
    const edgeDelay = stagger
      ? Math.max(revealDelays.get(e.source) ?? 0, revealDelays.get(e.target) ?? 0)
      : 0;
    const base: Edge = {
      id: e.id,
      source: e.source,
      target: e.target,
      animated: layout === "tree" && (e.kind === "expands_to" || e.kind === "has_keyword"),
      style: {
        stroke: e.kind === "has_keyword" ? "#0d9488" : "#475569",
        strokeWidth: layout === "radial" ? 1 : (e.kind === "has_keyword" ? 1.6 : 1.2),
        ...(stagger ? { opacity: 0, transition: "opacity 0.4s ease" } : {}),
      },
      data: { revealDelay: edgeDelay, stagger },
    };

    if (layout === "tree") {
      base.sourceHandle = "s-right";
      base.targetHandle = "t-left";
      base.label = e.kind.replace(/_/g, " ");
      base.labelStyle = {
        fill: e.kind === "has_keyword" ? "#0d9488" : "#94a3b8",
        fontSize: 10,
      };
    } else {
      const sp = positions.get(e.source);
      const tp = positions.get(e.target);
      if (sp && tp) {
        const { sourceHandle, targetHandle } = pickHandles(sp, tp);
        base.sourceHandle = sourceHandle;
        base.targetHandle = targetHandle;
      } else {
        base.sourceHandle = "s-right";
        base.targetHandle = "t-left";
      }
    }

    return base;
  });

  return { nodes, edges };
}
