# Animation System Reference

A complete inventory of every animation in the current MindGraph UI, organized by lifecycle phase. Use this as a spec when porting to the new star-based design.

---

## 1. Loading Phase — Skeleton Mind Map

**When:** User clicks "Generate mind map" and the API is working (10-20s).
**Component:** `SkeletonMindMap.tsx`
**Container:** `.skel-wrap` (full-bleed dark canvas, `#020617`)

### 1a. Shimmer Gradients (SVG `<linearGradient>`)

Two animated SVG gradients power the glowing/shimmering look:

| Gradient ID | Purpose | Colors | Duration |
|---|---|---|---|
| `skel-shimmer` | Node fill | `#1e293b` → `#334155` → `#1e293b` | **2s** loop |
| `skel-shimmer-line` | Edge stroke | `#1e293b` (0.3 opacity) → `#475569` (0.8) → `#1e293b` (0.3) | **2.5s** loop |

Both use `<animateTransform type="translate">` to slide the highlight band left-to-right indefinitely.

### 1b. Skeleton Node Reveal

**Class:** `.skel-node`
**Keyframes:** `skel-fade-in` + `skel-pulse`

```
skel-fade-in (0.5s, ease, forwards):
  from → opacity: 0, translateX(-8px)
  to   → opacity: 1, translateX(0)

skel-pulse (2.4s, ease-in-out, infinite):
  0%, 100% → opacity: 0.55
  50%      → opacity: 1
```

Each node has a staggered `animation-delay` (in seconds):

| Node | Delay | Role |
|---|---|---|
| Root topic | 0s | Central question |
| Level-1 branches (×5) | 0.3, 0.45, 0.6, 0.75, 0.9 | Main keywords |
| Level-2 sub-branches (×6) | 1.0, 1.1, 1.2, 1.3, 1.4, 1.5 | Sub-keywords |

Root node also gets `.skel-root` (purple stroke `#7c3aed`, thicker `stroke-width: 2`).

### 1c. Skeleton Edge Reveal

**Class:** `.skel-edge`
**Keyframes:** `skel-fade-in` (same as above) + `skel-dash-flow`

```
skel-dash-flow (1.6s, linear, infinite):
  to → stroke-dashoffset: -24
```

Edges are Bezier curves (`C` command) drawn between node centers. They have dashed strokes (`8 4`) that flow continuously, and fade in with the same stagger pattern as their target node.

### 1d. Loading Label

**Class:** `.skel-label`
**Content:** Spinner icon + "Building your mind map..."
**Animation:** Reuses `skel-pulse` at 2s cycle so the label breathes.
**Spinner:** `.skel-spinner` — 18px circle, purple top-border (`#8b5cf6`), spins via `da-spin` at 0.8s/rotation.

---

## 2. Transition Phase — Staggered Node Reveal

**When:** API response arrives, graph data replaces the skeleton.
**Orchestration:** `App.tsx` sets `staggerReveal=true` → `layout.ts` computes per-node delays → `MindNode.tsx` applies CSS animation with those delays.

### 2a. Delay Calculation (layout.ts)

`mindGraphToFlow(graph, layout, stagger=true)`:

1. `buildLevels()` does a BFS from root(s) and groups nodes by tree depth.
2. Nodes are assigned sequential delays: `nodeIndex × 120ms`.
3. Level 0 (root) → 0ms, then level-1 nodes one by one, then level-2, etc.
4. For a ~15-node graph, total reveal ≈ 1.8s.

### 2b. Node Enter Animation (CSS)

**Class:** `.mind-node-reveal`
**Keyframes:** `mind-node-enter`

```
mind-node-enter (0.45s, ease, forwards):
  from → opacity: 0, scale(0.85), translateY(8px)
  to   → opacity: 1, scale(1),    translateY(0)
```

Each `MindNode` receives an inline `animation-delay` matching its computed delay from layout.ts. Nodes start invisible and scale/slide up into place one by one.

### 2c. Edge Fade-In (JS timers in App.tsx)

Edges start with `opacity: 0` and `transition: opacity 0.4s ease` in their style.

App.tsx groups edges by their `revealDelay` (= max of source/target node delays) and schedules batched `setTimeout` calls. Each batch sets `opacity: 1` at `delay + 200ms` (so edges appear slightly after both connected nodes are visible).

After the last batch fires, `staggerReveal` resets to `false` (at `maxDelay + 600ms`), removing all stagger-related data from future renders.

---

## 3. Idle Phase — Node Interaction Animations

**When:** Graph is visible and user interacts.

### 3a. Base Node Transitions

**Class:** `.mind-node`
**CSS:** `transition: opacity 0.3s ease, box-shadow 0.3s ease`

All nodes smoothly transition opacity and glow effects whenever selection state changes.

### 3b. Selected Node Pulse

**Class:** `.mind-node.selected`
**Keyframes:** `node-selected-pulse`

```
node-selected-pulse (2.5s, ease-in-out, infinite):
  0%, 100% → box-shadow: 0 0 0 2px #38bdf8, 0 0 16px 3px rgba(56,189,248, 0.25)
  50%      → box-shadow: 0 0 0 2px #38bdf8, 0 0 24px 6px rgba(56,189,248, 0.45)
```

A light-blue ring that gently pulses, drawing attention to the active node.

### 3c. Connected Node Glow

**Class:** `.mind-node.connected`
**Keyframes:** `node-connected-glow`

```
node-connected-glow (2s, ease-in-out, infinite, alternate):
  from → box-shadow: 0 0 8px 2px rgba(129,140,248, 0.25)
  to   → box-shadow: 0 0 20px 6px rgba(129,140,248, 0.55)
```

Nodes directly connected to the selected node get a softer indigo glow that breathes in/out.

### 3d. Dimmed Nodes

**Class:** `.mind-node.dimmed`
**CSS:** `opacity: 0.3`

All nodes that are neither selected nor connected fade to 30% opacity (smooth via the base 0.3s transition).

### 3e. Edge Transitions

**CSS on `.react-flow__edge path`:**
```
transition: stroke 0.3s ease, stroke-width 0.3s ease, opacity 0.3s ease
```

**Connected edges (`.edge-connected path`):**
```
filter: drop-shadow(0 0 4px rgba(129,140,248, 0.6))
stroke: #818cf8, strokeWidth: 2.5
```

Edges smoothly change color, width, and gain a purple glow when they connect to a selected node. Unrelated edges fade to 25% opacity.

### 3f. Paper Node Hover

**Class:** `.mind-node.clickable:hover`
- `.mind-label` → color `#38bdf8`, underline
- `.mind-link-hint` → color `#38bdf8`
- Transition on `.mind-link-hint`: `color 0.15s`

Paper nodes show a blue underline + arrow on hover to indicate they're clickable (double-click opens DOI/OpenAlex URL).

---

## 4. Deep Answer Page Animations

**When:** User clicks "Deep Answer" on a selected node.
**Component:** `DeepAnswerPage.tsx`

### 4a. Loading Spinner

**Class:** `.da-spinner`
**CSS:** 32px circle, `border-top-color: #8b5cf6`
**Keyframes:** `da-spin`

```
da-spin (0.8s, linear, infinite):
  to → rotate(360deg)
```

Shown while searching for research papers.

### 4b. Chat Typing Indicator

**Class:** `.da-typing` containing three `.da-dot` elements
**Keyframes:** `da-bounce`

```
da-bounce (1.2s, ease-in-out, infinite):
  0%, 80%, 100% → opacity: 0.3, scale(0.8)
  40%           → opacity: 1,   scale(1)
```

Stagger between dots: 0s, 0.15s, 0.3s — creates a wave effect while AI is generating a response.

---

## 5. UI Micro-Transitions

Small transitions that aren't keyframe animations but contribute to the polished feel:

| Element | Property | Duration | Trigger |
|---|---|---|---|
| `.layout-btn` | `all` | 0.15s ease | Hover / active toggle |
| `.da-pin-btn` | `all` | 0.15s ease | Hover to pin paper |
| `.da-input:focus` | `border-color` | (browser default) | Focus on chat input |

---

## Color Palette Summary

All animations use colors from a consistent dark-mode palette:

| Token | Hex | Used In |
|---|---|---|
| Canvas background | `#020617` | Root background, skeleton wrap |
| Panel background | `#0f172a` | Header, deep panel, chat bubbles |
| Skeleton dark | `#1e293b` | Shimmer gradient endpoints |
| Skeleton highlight | `#334155` | Shimmer gradient midpoint |
| Selected ring | `#38bdf8` | Selected node pulse (sky blue) |
| Connected glow | `#818cf8` | Connected node/edge glow (indigo) |
| Primary accent | `#6366f1` | Buttons, typing dots, UI accents |
| Spinner / skeleton root | `#8b5cf6` / `#7c3aed` | Purple spectrum |
| Keyword edge | `#0d9488` | Teal for `has_keyword` edges |
| Default edge | `#475569` | Slate for `expands_to` edges |

---

## Architecture Notes for Star Redesign

When porting these animations to a star-based canvas:

- **Skeleton shimmer** → Could become twinkling placeholder stars with the same gradient technique, but applied to radial gradients or small circles instead of rectangles.
- **Staggered reveal** → Stars "lighting up" one by one from the center outward. The 120ms-per-node sequential delay maps naturally to a constellation forming.
- **Selected pulse** → A star brightening with a halo pulse (same box-shadow concept but with `border-radius: 50%` and radial glow).
- **Connected glow** → Neighboring stars dimly illuminating, like light traveling along constellation lines.
- **Dimming** → Distant/unrelated stars fading to near-invisible, like light pollution clearing.
- **Edge flow** → `stroke-dasharray` + `stroke-dashoffset` animation already looks like energy flowing along lines — would read as light traveling between stars.
- **Typing dots** → Could become three small pulsing stars in a row.
