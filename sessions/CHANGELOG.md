# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog, adapted for date-based session updates.

## [Unreleased]

### Added

- 2026-04-13: Added in-canvas animated multi-select feedback for nodes (halo ring + core pulse) so Shift-selected nodes are visibly active in the graph itself.
- 2026-04-13: Added reduced-motion fallback for selected-node glow animations (`prefers-reduced-motion`) to keep interaction feedback accessible.
- 2026-04-13: Added a Selection-panel "Deselect all" button (right side of the Selection header) for one-click clearing of current node selections.
- 2026-04-13: Added side-by-side multi-select expansion actions: `Expand Selected` (combined context) and `Expand Individual` (per-node expansion sequence).
- 2026-04-12: Added constellation shimmer loading animation that plays while the graph is generating — central star expands outward to children and grandchildren with golden glow and twinkling effects.
- 2026-04-12: Graph now smoothly centers (fitView) after loading completes instead of appearing off to the side or in a corner.
- 2026-04-12: Loading animation fades out smoothly when the graph is ready, instead of disappearing abruptly.
- 2026-04-12: Graph layout transitions are now animated with a 500ms ease-out cubic lerp when nodes are deleted or the layout changes, instead of snapping instantly.
- 2026-04-12: Updated changelog hook to write Unreleased bullets
- 2026-04-12: Converted changelog to Keep a Changelog format
- 2026-04-12: Workspace tabs now auto-name from the main query keyword phrase (first sentence + up to 5 tokens).
- 2026-04-12: Edge-case naming rule added for non-word or symbol-heavy inputs: use a short sentence slice fallback.
- 2026-04-12: Added Export PNG for the current mind graph view (React Flow canvas capture, download-ready).
- 2026-04-12: Workspace tab labels now stay synchronized with query-derived keywords when the tab still uses a generic name (e.g., Workspace 1).
- 2026-04-12: Opening a recent session now reuses an existing matching workspace tab instead of creating duplicate tabs.
- 2026-04-12: Added PNG export settings (gear icon in Session panel) with scope toggle: Full graph vs Visible area.
- 2026-04-12: Added Recent sessions delete mode (trash toggle + per-session X button) for direct history cleanup from the sidebar.
- 2026-04-12: Added top-right personal settings to choose search command bar position (fixed bottom default or fixed top), with local preference persistence.
- 2026-04-12: Added landing-page logo slot with graceful asset fallback (`/assets/polaris-logo.svg` then `/assets/polaris-logo.png`).
- 2026-04-12: Added top-right personal preference for graph connection lines: diagonal straight or parallel straight (persisted locally).
- 2026-04-12: Improved parallel line mode to align sibling/grandchild connectors on a shared elbow axis instead of independent per-edge offsets.
- 2026-04-12: Updated tree layout to parent-centered hierarchical spacing so parent and grandchild levels align more consistently in parallel mode; parallel line color/width is now unified.
- 2026-04-12: Parallel line mode now uses an opaque single-tone stroke to prevent darker-looking overlaps when segments stack.
- 2026-04-12: Tree+parallel mode now anchors parent connectors using child median alignment (odd child counts connect to exact middle child) and renders primary tree edges for cleaner right-side branching.

### Changed

- 2026-04-13: Selected-node glow timing is now phase-synchronized across all selected nodes; newly selected nodes join the current pulse cycle instead of starting an independent cycle.
- 2026-04-13: Multi-select glow now uses a single shared pulse offset per selection update, so all selected nodes stay in one unified animation phase rather than per-node timing instances.
- 2026-04-13: Multi-select combined expansion now runs as a single merged request for selected nodes instead of paper-only per-node loops, and shows guidance that relevance may drop when 4+ nodes are selected.
- 2026-04-13: Replaced circular selected-node pulse/ring animation with a stronger static glow treatment (glyph scale + brighter halo + label glow) for clearer multi-select visibility.
- 2026-04-13: LLM pipeline now auto-retries with fallback Gemini models when the primary model returns transient capacity errors (e.g., 503/high-demand), reducing user-visible failures.
- 2026-04-13: Workspace tabs now isolate runtime loading/status containers, so generating a diagram in one tab no longer shows the loader overlay or operation state in other tabs.
- 2026-04-13: Smoothed multi-select highlighting by applying node selection state immediately in click handlers (removed one-frame delayed effect-based sync), reducing visible step/lag when selecting multiple nodes.
- 2026-04-13: Retuned selected-node highlight to restore larger visual emphasis and use a single slower easing curve (no staged jump), making multi-select expansion feel smoother.
- 2026-04-12: PNG export now defaults to Full graph and renders all nodes into one image instead of only the current viewport.
- 2026-04-12: Refined Recent sessions delete UI to remove extra boxed controls (transparent in-card X overlay) and tightened row spacing.
- 2026-04-12: Updated the Recent sessions delete toggle to the standard trash can emoji (🗑️) for clearer deletion affordance.
- 2026-04-12: Made graph zoom controls reposition upward responsively on shorter viewport heights to keep critical controls visible while resizing.
- 2026-04-12: Kept the research question command bar bottom-anchored while making it push upward responsively on short heights; also locked the app/canvas layout to the viewport to prevent right-pane page scrolling.
- 2026-04-12: Expanded git ignore coverage for local Obsidian workspace metadata (`Cursor Hack/.obsidian/`) and cleaned tracked machine-specific files from the branch.

- 2026-04-12: Removed the inline Deep Panel UI from the main workspace for a cleaner, single-path Deep Answer flow.

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
