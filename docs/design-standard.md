# Polaris design standard

Reference extracted from the client so new pages match **Home**, **Graph**, and **Deep Answer** without hunting through CSS and TSX.

## Source files (canonical)

| File | Role |
|------|------|
| [`client/src/styles.css`](../client/src/styles.css) | Global `:root`, app shell, sidebar, mind nodes (`.mn-*`), Deep Answer page (`.da-*`), primary actions (`.da-btn-primary`). |
| [`client/src/figma/figma-styles.css`](../client/src/figma/figma-styles.css) | Figma-aligned shell: home hero, command bars, navbar, deep panel, optional node layout helpers (`.fg-*`). |
| [`client/src/main.tsx`](../client/src/main.tsx) | Imports `styles.css` only. |
| [`client/src/App.tsx`](../client/src/App.tsx) | Imports `figma-styles.css`; wires routing between views; React Flow `Background` / `MiniMap` colors. |
| [`client/src/layout.ts`](../client/src/layout.ts) | React Flow **node** inline styles and **edge** stroke colors by `kind`. |

**Font:** `Inter` with `system-ui, -apple-system, Segoe UI, Roboto, sans-serif` fallbacks (`:root` in `styles.css`). Load Inter in your host page if it is not already global (Vite `index.html` may omit a `<link>`; verify in production).

---

## Application surfaces (all pages)

Routing is **state-driven** in `App.tsx` (no React Router). `boot` is `loading` → `splash` → `workspace` (splash is skipped when restoring a session that already has a graph).

| # | Surface | When shown | Root element / entry component | Primary CSS namespaces |
|---|---------|--------------|--------------------------------|-------------------------|
| 1 | **Splash** | `boot === "splash"` | [`HomePage.tsx`](../client/src/figma/HomePage.tsx) → `.fg-home` | `.fg-*` (orbit, hero copy, progress); auto-continues to workspace after 2s |
| 2 | **Workspace** | `boot === "workspace"` | [`App.tsx`](../client/src/App.tsx) → `.app` | `.app`, `.main`, `.sidebar`, `.fg-navbar`, `.fg-cmdbar`, `.fg-deep-panel`, `.mn-*`, React Flow (graph may be empty until the user generates one) |
| 3 | **Deep Answer** | `deepPageKeyword` set | [`DeepAnswerPage.tsx`](../client/src/DeepAnswerPage.tsx) → `.da-page` | `.da-*` |

Optional presentational modules (same `.fg-*` classes as inlined in `App`; useful for reuse): [`figma/Navbar.tsx`](../client/src/figma/Navbar.tsx), [`figma/CommandBar.tsx`](../client/src/figma/CommandBar.tsx), [`figma/DeepPanel.tsx`](../client/src/figma/DeepPanel.tsx), barrel [`figma/index.ts`](../client/src/figma/index.ts).

---

## Color tokens

Polaris uses a **dark navy** base, **amber/gold** accent (`#ffd369`), and **Slate / Gray** neutrals (Tailwind-like hex values). Figma-specific surfaces add **`#1e2639`** and **`#4b5563`**.

### Core palette (semantic names)

| Token | Hex / value | Usage |
|-------|----------------|--------|
| **bg-root** | `#0b1326` | Page background (home, global `:root`), graph chrome feel |
| **bg-root-solid-alt** | `#020617` | Deep Answer page background; inputs; darkest panels |
| **bg-elevated** | `#0f172a` | Sticky nav, cards, AI bubbles, paper rows |
| **bg-elevated-mid** | `#0b1220` | Deep Answer sidebar |
| **bg-sidebar-app** | `rgba(11, 19, 38, 0.95)` | Graph left sidebar |
| **bg-glass-nav** | `rgba(11, 19, 38, 0.8)` + `backdrop-filter: blur(12px)` | Figma navbar |
| **surface-cmd** | `#1e2639` | Command bar inner (home + graph) |
| **border-cmd** | `#4b5563` | Command bar border; deep panel top border |
| **border-subtle** | `#1e293b` | Dividers, borders on slate panels |
| **border-input** | `#334155` | Inputs, secondary buttons, chat field border |
| **accent** | `#ffd369` | Brand, topic labels, links on dark, primary buttons, citations, focus ring on chat input |
| **accent-hover** | `#ffe08a` | Primary button hover, navbar brand hover |
| **accent-pressed-border** | `#e6b84d` | Send button border (Deep Answer) |
| **on-accent** | `#222831` | Text on gold buttons and user chat bubbles |
| **text-primary** | `#eee` | Default body copy |
| **text-bright** | `#f8fafc` | Sidebar button label |
| **text-heading** | `#f1f5f9` / `#e2e8f0` | Headings, sidebar titles, breadcrumbs emphasis |
| **text-muted** | `#94a3b8` | Labels (`.lbl`), hints, system copy |
| **text-dim** | `#64748b` | Muted prose, meta, crumb dim |
| **text-faint** | `#6b7280` | Health line, placeholders, paper meta |
| **text-placeholder** | `#6b7280` | Input placeholders (matches Tailwind gray-500) |
| **link-default** | `#38bdf8` | Global `<a>` (sidebar); use **accent** for in-app emphasis where specified |
| **error** | `#f87171` | Sidebar error text (Deep Answer papers) |
| **review-badge** | `#d97706` on `#fffbeb` | “review” pill on nodes |
| **relevance-badge-bg** | `rgba(255, 211, 105, 0.2)` | Relevance pill background |
| **minimap-light** | `#f9fafb` / `#e5e7eb` | MiniMap override (light card on dark canvas) |

### Amber / yellow orbit (home only)

| Token | Value | Usage |
|-------|--------|--------|
| **orbit-ring-outer** | `rgba(252, 211, 77, 0.1)` | Outer ring stroke |
| **orbit-ring-mid** | `rgba(252, 211, 77, 0.2)` | Mid ring stroke |
| **orbit-dot** | `#fcd34d` + glow | Orbital dots (Tailwind amber-300 family) |
| **star-glow** | `rgba(252, 211, 77, 0.2)` | Center star glow |
| **star-ring** | `rgba(252, 211, 77, 0.4)` dashed | Ring around star asset |

### Graph edges (programmatic, `layout.ts`)

| Edge `kind` | Stroke |
|-------------|--------|
| `expands_to` | `rgba(255, 211, 105, 0.18)` (thicker stroke `1.2`) |
| `has_keyword` | `rgba(255, 211, 105, 0.15)` |
| `prerequisite_for`, `user_linked` | `rgba(156, 163, 175, 0.18)` |
| `from_openalex` | `rgba(107, 114, 128, 0.15)` |
| `has_section` | `rgba(107, 114, 128, 0.12)` |
| default | `rgba(156, 163, 175, 0.15)` |

### React Flow canvas (`App.tsx`)

- **Background dots:** `gap={24}` `color="rgba(75, 85, 99, 0.15)"` (subtle gray grid).

---

## Typography

| Use | Spec |
|-----|------|
| Base | `Inter`, system stack; default text `#eee` on dark bg |
| Home title `.fg-title` | 700, 34px (26px ≤768px), `#ffd369`, letter-spacing `-0.86px`, line-height 1.5 |
| Navbar brand `.fg-navbar-brand` | 700, 17px, `#ffd369`, letter-spacing `-0.43px` |
| Command input / bar | 14px, letter-spacing `-0.15px` |
| Deep panel title `.fg-dp-title` | 700, 18px, `#ffd369`, letter-spacing `-0.44px` |
| Deep panel body `.fg-dp-body` | 13px, line-height 1.625, `#eee` |
| Sidebar headings `.panel-section h3` | 14px |
| Labels `.lbl` | 12px, `#94a3b8` |
| Mind node topic `.mn-label-topic` | 700, 14px, `#ffd369` |
| Mind node keyword | 600, 12px, `#eee` |
| Deep Answer chat `.da-msg-text` | 14px; rendered headings scale in `.da-rendered h1–h3` |

**Uppercase meta:** `.da-msg-role` — 10px, uppercase, letter-spacing `0.05em`, `#64748b`.

---

## Radius, spacing, shadows

| Pattern | Value |
|---------|--------|
| **Command bar** | Border radius **16px**; inner padding **13px 17px**; shadow `0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.1)` |
| **Primary / CTA button** | Radius **10px**; height ~33px on command submit |
| **Inputs (app sidebar)** | Radius **8px**; padding **8–10px** |
| **Deep Answer** | Chat bubbles radius **14px** (asymmetric corners); input radius **10px**; paper cards **8px** |
| **Deep panel** | Top radius **16px**; collapsed toggle height **44px**; content max-height **315px**, horizontal padding **32px** |
| **Mind node glow** | `drop-shadow` gold `rgba(255, 211, 105, 0.3–0.6)` on hover / selected |
| **MiniMap** `.fg-minimap` | Light bg, border `#e5e7eb`, shadow `0 4px 12px rgba(0,0,0,0.5)` |

**Layout grids**

- Graph: `.main` → `grid-template-columns: minmax(300px, 360px) 1fr`.
- Deep Answer: `.da-body` → `320px` sidebar + `1fr` chat (stacks ≤768px).

---

## Motion

| Name | Location | Behavior |
|------|-----------|------------|
| `fg-rotate` | `figma-styles.css` | Continuous rotation for orbit / dashed ring |
| `fg-pulse` | `figma-styles.css` | Star glow scale/opacity |
| `mn-float` | `styles.css` | Gentle node drift; duration/delay set inline in `MindNode.tsx` |
| `da-bounce` | `styles.css` | Typing indicator dots |
| `da-spin` | `styles.css` | Loading spinner |

---

## Class map by page

### Splash (`HomePage`)

| Area | Classes |
|------|---------|
| Page | `.fg-home`, `.fg-home-bg`, `.fg-home-ambient`, `.fg-home-grid`, `.fg-home-bloom` |
| Orbit / star | `.fg-orbit-container`, `.fg-orbit`, `.fg-orbit-outer`, `.fg-orbit-mid`, `.fg-orbit-inner`, `.fg-orbit-dot*`, `.fg-star-node`, `.fg-star-glow`, `.fg-star-ring`, `.fg-star-core`, `.fg-star-img` |
| Copy | `.fg-splash-copy`, `.fg-splash-eyebrow`, `.fg-title`, `.fg-tagline`, `.fg-splash-skip` |
| Progress | `.fg-splash-progress`, `.fg-splash-progress-bar` (2s bar) |

### Graph (`App` + React Flow)

| Area | Classes |
|------|---------|
| Shell | `.app`, `.main`, `.canvas-wrap`, `.flow` |
| Navbar | `.fg-navbar`, `.fg-navbar-brand`, `.navbar-right`, `.navbar-health` |
| Sidebar | `.sidebar`, `.panel-section`, `.lbl`, `.inp`, `.q`, `.row`, `.hint`, `.sel`, `.pill`, `.status`, `.sidebar button`, `.da-btn-primary` |
| Floating search | `.floating-cmdbar`, `.fg-cmdbar`, `.fg-cmdbar-inner`, `.fg-cmdbar-icon`, `.fg-cmdbar-input`, `.fg-cmdbar-clear`, `.fg-cmdbar-submit` |
| Mind nodes | `.mn`, `.mn-selected`, `.mn-icon`, `.mn-icon-lg`, `.mn-dot*`, `.mn-label*`, `.mn-badge*`, `.mn-meta`, `.mn-handle`, `.mn-clickable`, `.mn-link-icon` |
| Deep panel (markdown) | `.fg-deep-panel`, `.fg-dp-toggle`, `.fg-dp-content`, `.fg-dp-empty`, `.md` |
| MiniMap | `.fg-minimap` (pass `className` to React Flow `MiniMap` if wired) |

### Deep Answer (`DeepAnswerPage`)

| Area | Classes |
|------|---------|
| Page | `.da-page`, `.da-body` |
| Nav | `.da-nav`, `.da-back`, `.da-breadcrumb`, `.da-crumb-*`, `.da-paper-badge` |
| Sidebar | `.da-sidebar`, `.da-sidebar-title`, `.da-sidebar-hint`, `.da-sidebar-err`, `.da-paper-list`, `.da-paper-item`, `.da-paper-rank`, `.da-paper-title`, `.da-paper-meta`, `.da-cite-count`, `.da-doi`, `.da-attribution` |
| Chat | `.da-chat`, `.da-messages`, `.da-system-msg`, `.da-suggestions`, `.da-suggestion`, `.da-msg`, `.da-msg-user`, `.da-msg-ai`, `.da-msg-role`, `.da-msg-text`, `.da-rendered`, `.da-typing`, `.da-dot`, `.da-spinner` |
| Composer | `.da-input-bar`, `.da-input`, `.da-send` |

---

## Assets (shared)

Under `client/public/assets/` (referenced as `/assets/...`):

- `search-icon.svg` — command bars  
- `polaris-star.svg` — home hero  
- `node-topic-1.svg`, `node-keyword-1.svg` — graph nodes (`MindNode.tsx`)

---

## Checklist for a new page

1. Import **`styles.css`** at minimum; add **`figma-styles.css`** if you use `.fg-*`.
2. Set page background to **bg-root** or **bg-root-solid-alt** to match neighbors.
3. Use **accent** / **on-accent** for primary actions; **border-subtle** / **border-input** for structure.
4. Prefer existing **`.fg-command-inner`** pattern for “hero” search, **`.da-*`** layout for full-height chat/split views, **`.sidebar`** patterns for dense controls.
5. Align edge/node colors with **`layout.ts`** if the page embeds React Flow.

---

*Generated from repo state; update this file when tokens or class names change.*
