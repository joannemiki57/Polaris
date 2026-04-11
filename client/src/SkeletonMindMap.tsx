export function SkeletonMindMap() {
  const nodes = [
    // Topic (root)
    { x: 60, y: 220, w: 160, h: 44, delay: 0 },
    // Level 1 branches
    { x: 340, y: 60, w: 130, h: 36, delay: 0.3 },
    { x: 340, y: 140, w: 140, h: 36, delay: 0.45 },
    { x: 340, y: 220, w: 120, h: 36, delay: 0.6 },
    { x: 340, y: 300, w: 145, h: 36, delay: 0.75 },
    { x: 340, y: 380, w: 115, h: 36, delay: 0.9 },
    // Level 2 sub-branches
    { x: 590, y: 30, w: 110, h: 30, delay: 1.0 },
    { x: 590, y: 86, w: 100, h: 30, delay: 1.1 },
    { x: 590, y: 190, w: 120, h: 30, delay: 1.2 },
    { x: 590, y: 246, w: 105, h: 30, delay: 1.3 },
    { x: 590, y: 340, w: 115, h: 30, delay: 1.4 },
    { x: 590, y: 396, w: 95, h: 30, delay: 1.5 },
  ];

  const edges = [
    // Topic → Level 1
    { from: 0, to: 1, delay: 0.15 },
    { from: 0, to: 2, delay: 0.3 },
    { from: 0, to: 3, delay: 0.45 },
    { from: 0, to: 4, delay: 0.6 },
    { from: 0, to: 5, delay: 0.75 },
    // Level 1 → Level 2
    { from: 1, to: 6, delay: 0.85 },
    { from: 1, to: 7, delay: 0.95 },
    { from: 3, to: 8, delay: 1.05 },
    { from: 3, to: 9, delay: 1.15 },
    { from: 5, to: 10, delay: 1.25 },
    { from: 5, to: 11, delay: 1.35 },
  ];

  return (
    <div className="skel-wrap">
      <svg
        className="skel-svg"
        viewBox="0 0 760 460"
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
              style={{ animationDelay: `${e.delay}s` }}
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
            style={{ animationDelay: `${n.delay}s` }}
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
