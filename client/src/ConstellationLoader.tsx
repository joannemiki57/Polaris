import { useEffect, useState } from "react";

/**
 * A constellation-style loading animation that expands outward
 * from a central star node, connecting children and grandchildren
 * with shimmering golden lines. Designed for the ~15s graph load.
 */

interface Star {
  id: string;
  x: number;
  y: number;
  size: number;
  tier: number; // 0 = center, 1 = children, 2 = grandchildren
  parentId?: string;
}

function buildConstellation(): { stars: Star[]; edges: [string, string][] } {
  const cx = 50,
    cy = 50;
  const stars: Star[] = [];
  const edges: [string, string][] = [];

  // Center star
  stars.push({ id: "c", x: cx, y: cy, size: 2.2, tier: 0 });

  // Tier-1: 5 children arranged in a ring
  const t1Count = 5;
  const t1Radius = 22;
  for (let i = 0; i < t1Count; i++) {
    const angle = (Math.PI * 2 * i) / t1Count - Math.PI / 2;
    const id = `t1-${i}`;
    stars.push({
      id,
      x: cx + Math.cos(angle) * t1Radius + (Math.random() - 0.5) * 4,
      y: cy + Math.sin(angle) * t1Radius + (Math.random() - 0.5) * 4,
      size: 1.2,
      tier: 1,
      parentId: "c",
    });
    edges.push(["c", id]);
  }

  // Tier-2: 2 grandchildren per tier-1 node
  let t2Idx = 0;
  for (let i = 0; i < t1Count; i++) {
    const parent = stars.find((s) => s.id === `t1-${i}`)!;
    for (let j = 0; j < 2; j++) {
      const angle =
        Math.atan2(parent.y - cy, parent.x - cx) +
        (j === 0 ? -0.45 : 0.45);
      const dist = 12 + Math.random() * 4;
      const id = `t2-${t2Idx}`;
      stars.push({
        id,
        x: parent.x + Math.cos(angle) * dist,
        y: parent.y + Math.sin(angle) * dist,
        size: 0.7,
        tier: 2,
        parentId: parent.id,
      });
      edges.push([parent.id, id]);
      t2Idx++;
    }
  }

  return { stars, edges };
}

// Build once so layout is stable across renders
const { stars: STARS, edges: EDGES } = buildConstellation();

export function ConstellationLoader({
  status,
  visible,
}: {
  status?: string;
  visible: boolean;
}) {
  const [phase, setPhase] = useState(0);
  // phase 0: center star fades in (0s)
  // phase 1: tier-1 edges draw + stars fade in (~2s)
  // phase 2: tier-2 edges draw + stars fade in (~6s)
  // phase 3: gentle idle shimmer (~10s) — everything visible, just ambient glow

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 2000);
    const t2 = setTimeout(() => setPhase(2), 6000);
    const t3 = setTimeout(() => setPhase(3), 10000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  return (
    <div className={`cl-container ${!visible ? "cl-container-exit" : ""}`}>
      <svg
        className="cl-svg"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Radial gradient fills — glow stays inside the circle */}
          <radialGradient id="cl-grad-t0">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="35%" stopColor="#ffe9a0" stopOpacity="0.95" />
            <stop offset="70%" stopColor="#ffd369" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#d4a84a" stopOpacity="0.7" />
          </radialGradient>
          <radialGradient id="cl-grad-t1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="40%" stopColor="#ffd369" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#c9993a" stopOpacity="0.6" />
          </radialGradient>
          <radialGradient id="cl-grad-t2">
            <stop offset="0%" stopColor="#ffe9a0" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#b8882e" stopOpacity="0.4" />
          </radialGradient>
        </defs>

        {/* Edges */}
        {EDGES.map(([fromId, toId], i) => {
          const from = STARS.find((s) => s.id === fromId)!;
          const to = STARS.find((s) => s.id === toId)!;
          const tier = to.tier;
          const edgeVisible =
            (tier === 1 && phase >= 1) || (tier === 2 && phase >= 2);

          return (
            <line
              key={`e-${i}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              className={`cl-edge ${edgeVisible ? "cl-edge-visible" : ""}`}
              style={{ animationDelay: `${i * 200}ms` }}
            />
          );
        })}

        {/* Stars */}
        {STARS.map((star, i) => {
          const starVisible =
            (star.tier === 0 && phase >= 0) ||
            (star.tier === 1 && phase >= 1) ||
            (star.tier === 2 && phase >= 2);

          return (
            <g key={star.id}>
              {/* Shimmer ring for center */}
              {star.tier === 0 && (
                <circle
                  cx={star.x}
                  cy={star.y}
                  r={star.size * 2.5}
                  className="cl-center-ring"
                />
              )}
              {/* Star point */}
              <circle
                cx={star.x}
                cy={star.y}
                r={star.size}
                className={`cl-star cl-star-t${star.tier} ${starVisible ? "cl-star-visible" : ""}`}
                fill={`url(#cl-grad-t${star.tier})`}
                style={{
                  animationDelay: `${star.tier === 0 ? 0 : star.tier === 1 ? 1000 + i * 300 : 4000 + i * 200}ms`,
                }}
              />
              {/* Twinkle */}
              {starVisible && (
                <circle
                  cx={star.x}
                  cy={star.y}
                  r={star.size * 0.4}
                  className="cl-twinkle"
                  style={{
                    animationDelay: `${i * 400 + 1000}ms`,
                    animationDuration: `${2.5 + (i % 3) * 0.8}s`,
                  }}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Status text */}
      <div className="cl-status">
        {status && <p className="cl-status-text">{status}</p>}
        <div className="cl-dots">
          <span className="cl-dot" />
          <span className="cl-dot" />
          <span className="cl-dot" />
        </div>
      </div>
    </div>
  );
}
