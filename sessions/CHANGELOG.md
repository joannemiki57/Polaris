# Changelog

All notable changes to this project are documented in this file.

Entries under **[Unreleased]** are grouped **by session** (topic in the `###` heading, **one date per group**). Bullets inside a group do not repeat the date.

`npm run session:changelog` appends dated lines **after** `<!-- changelog-append -->` inside **[Unreleased]**; fold those into the right session group when you tidy or cut a release.

## [Unreleased]

### 2026-04-13 — LLM fallback & expand-selected

- Multi-provider chain when Gemini hits transient errors: primary Gemini → optional OpenAI `gpt-4o-mini` → tertiary `GEMINI_TERTIARY_MODEL` (default `gemini-3-flash-preview`); `/api/health` exposes `openai` when configured; removed the old `GEMINI_FALLBACK_MODELS`-only Gemini swap.
- Expand selected (`POST /api/graph/expand-selection`): empty client `question` falls back to combined selection labels / graph title; **sparse OpenAlex** path uses a relaxed prompt so the model is not pushed into empty `new_nodes`; explicit **selected → new keyword** `expands_to` rules; if the model still returns nothing, **stub `Explore: …` keywords** are merged with a server warning.
- `server/.env.example` is key-only; blank `GEMINI_MODEL` in `.env` is treated as unset (default `gemini-2.5-flash`).

### 2026-04-13 — Deep Answer

- “Load more papers”: **+** control in the **Source Papers** sidebar header (squircle + right-anchored popover).
- Chat transcript area is **scrollable** (message list no longer `overflow: hidden`); short static input placeholder.
- **Back** / **Send** / composer field aligned with graph **command bar** tokens (ghost back, `fg-cmdbar`-style submit + input).

### 2026-04-13 — Multi-select & workspace UI

- In-canvas **Shift multi-select** glow (halo + pulse) with **reduced-motion** fallback; **Deselect all**; paired actions **Expand Selected** (combined) and **Expand Individual** (sequence).
- Glow **phase-synced** across selected nodes; **combined expansion** is one merged server request with guidance when **4+** nodes are selected; **static glow** emphasis (replacing ring pulse); **workspace tabs** no longer share loader/status across tabs; selection applied **immediately** on pointer down; highlight easing **retuned**.

### 2026-04-12 — Loading, layout motion, & viewport

- **Constellation** shimmer while generating; **fitView** after load; loader **fade-out**; graph layout **500ms ease-out lerp** on structural changes.

### 2026-04-12 — Workspaces & naming

- Tab names from main query phrase (first sentence, ≤5 tokens); **symbol-heavy** query fallback; tab label **sync** with derived keywords; **reuse workspace tab** when reopening a matching recent session.

### 2026-04-12 — PNG export & UI chrome

- **Export PNG** (full canvas capture) with settings (**Full graph** vs visible); **Recent sessions** trash mode; **command bar** top/bottom preference; **logo** slot with SVG/PNG fallback; responsive **zoom controls** & viewport-locked **canvas** (no extra page scroll).

### 2026-04-12 — Tree & edge drawing

- **Parallel vs diagonal** connectors (persisted); parallel **shared elbow** axis; **tree spacing** refinements; **opaque** parallel stroke; **median-based** parent connectors for cleaner branching.

### 2026-04-12 — Tooling & repo hygiene

- Session changelog **hook** + structured log file; `.gitignore` extended for `Cursor Hack/.obsidian/` and cleaned machine-specific blobs.

### 2026-04-12 — Deep Answer shell

- Removed the **inline Deep panel** from the main workspace (single-path **Deep Answer** page).

<!-- changelog-append -->

## [2026-04-12]

### Added

- Deep mode now restores chat and paper context when moving between graph and deep views.
- Reload now preserves starred papers and refills only unstarred slots with new high-citation papers.
- Session changelog workflow was introduced (hook + pre-commit enforcement).
- Starred-paper keyword extraction was added using abstracts, topics, and section heading signals.
- Multi-workspace tabs were added (create, rename, delete with last-tab protection).

### Changed

- Deep persistence scope was changed to workspace-scoped state.
- Workspace state now restores per tab with local storage-backed active workspace.
