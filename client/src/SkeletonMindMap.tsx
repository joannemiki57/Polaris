export function SkeletonMindMap() {
  // Layer timings — each layer appears as a group
  const L0 = 0.3;   // root
  const L1 = 1.8;   // branches
  const L2 = 3.6;   // sub-branches
  const L3 = 5.4;   // leaf nodes
  const E_LEAD = 0.7; // edges appear this much before their target layer

  const nodes = [
    // Layer 0 — root
    { x: 30,  y: 220, w: 140, h: 42, delay: L0 },

    // Layer 1 — main branches (5)
    { x: 260, y: 40,  w: 125, h: 34, delay: L1 },
    { x: 260, y: 120, w: 135, h: 34, delay: L1 + 0.08 },
    { x: 260, y: 200, w: 115, h: 34, delay: L1 + 0.15 },
    { x: 260, y: 280, w: 140, h: 34, delay: L1 + 0.22 },
    { x: 260, y: 360, w: 120, h: 34, delay: L1 + 0.28 },

    // Layer 2 — sub-branches (6)
    { x: 480, y: 20,  w: 110, h: 28, delay: L2 },
    { x: 480, y: 72,  w: 100, h: 28, delay: L2 + 0.06 },
    { x: 480, y: 140, w: 115, h: 28, delay: L2 + 0.12 },
    { x: 480, y: 192, w: 105, h: 28, delay: L2 + 0.18 },
    { x: 480, y: 280, w: 120, h: 28, delay: L2 + 0.24 },
    { x: 480, y: 332, w: 95,  h: 28, delay: L2 + 0.30 },

    // Layer 3 — leaf nodes (6)
    { x: 670, y: 10,  w: 90,  h: 24, delay: L3 },
    { x: 670, y: 58,  w: 80,  h: 24, delay: L3 + 0.06 },
    { x: 670, y: 130, w: 95,  h: 24, delay: L3 + 0.12 },
    { x: 670, y: 178, w: 85,  h: 24, delay: L3 + 0.18 },
    { x: 670, y: 270, w: 90,  h: 24, delay: L3 + 0.24 },
    { x: 670, y: 318, w: 75,  h: 24, delay: L3 + 0.30 },
  ];

  const edges = [
    // Root → Layer 1
    { from: 0, to: 1,  delay: L1 - E_LEAD },
    { from: 0, to: 2,  delay: L1 - E_LEAD + 0.06 },
    { from: 0, to: 3,  delay: L1 - E_LEAD + 0.12 },
    { from: 0, to: 4,  delay: L1 - E_LEAD + 0.18 },
    { from: 0, to: 5,  delay: L1 - E_LEAD + 0.24 },

    // Layer 1 → Layer 2
    { from: 1, to: 6,  delay: L2 - E_LEAD },
    { from: 1, to: 7,  delay: L2 - E_LEAD + 0.06 },
    { from: 3, to: 8,  delay: L2 - E_LEAD + 0.12 },
    { from: 3, to: 9,  delay: L2 - E_LEAD + 0.18 },
    { from: 5, to: 10, delay: L2 - E_LEAD + 0.24 },
    { from: 5, to: 11, delay: L2 - E_LEAD + 0.30 },

    // Layer 2 → Layer 3
    { from: 6,  to: 12, delay: L3 - E_LEAD },
    { from: 7,  to: 13, delay: L3 - E_LEAD + 0.06 },
    { from: 8,  to: 14, delay: L3 - E_LEAD + 0.12 },
    { from: 9,  to: 15, delay: L3 - E_LEAD + 0.18 },
    { from: 10, to: 16, delay: L3 - E_LEAD + 0.24 },
    { from: 11, to: 17, delay: L3 - E_LEAD + 0.30 },
  ];

  return (
    <div className="skel-wrap">
      <svg
        className="skel-svg"
        viewBox="0 0 800 400"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="skel-shimmer" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="40%" stopColor="#334155" />
            <stop offset="60%" stopColor="#334155" />
            <stop offset="100%" stopColor="#1e293b" />
            <animateTransform
              attributeName="gradientTransform"
              type="translate"
              from="-1 0"
              to="1 0"
              dur="2s"
              repeatCount="indefinite"
            />
          </linearGradient>

          <linearGradient
            id="skel-shimmer-line"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
          >
            <stop offset="0%" stopColor="#1e293b" stopOpacity="0.3" />
            <stop offset="50%" stopColor="#475569" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#1e293b" stopOpacity="0.3" />
            <animateTransform
              attributeName="gradientTransform"
              type="translate"
              from="-1 0"
              to="1 0"
              dur="2.5s"
              repeatCount="indefinite"
            />
          </linearGradient>
        </defs>

        {edges.map((e, i) => {
          const src = nodes[e.from]!;
          const tgt = nodes[e.to]!;
          const x1 = src.x + src.w;
          const y1 = src.y + src.h / 2;
          const x2 = tgt.x;
          const y2 = tgt.y + tgt.h / 2;
          const cx1 = x1 + (x2 - x1) * 0.5;
          const cx2 = x2 - (x2 - x1) * 0.5;

          return (
            <path
              key={`e${i}`}
              d={`M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2}`}
              className="skel-edge"
              style={{ animationDelay: `${e.delay}s, ${e.delay}s` }}
            />
          );
        })}

        {nodes.map((n, i) => (
          <rect
            key={`n${i}`}
            x={n.x}
            y={n.y}
            width={n.w}
            height={n.h}
            rx={10}
            ry={10}
            className={`skel-node${i === 0 ? " skel-root" : ""}`}
            style={{ animationDelay: `${n.delay}s, ${n.delay + 0.6}s` }}
          />
        ))}
      </svg>

      <div className="skel-label">
        <div className="skel-spinner" />
        <span>Building your mind map…</span>
      </div>
    </div>
  );
}
