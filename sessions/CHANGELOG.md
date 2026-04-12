# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog, adapted for date-based session updates.

## [Unreleased]

### Added

- 2026-04-12: Updated changelog hook to write Unreleased bullets
- 2026-04-12: Converted changelog to Keep a Changelog format
- 2026-04-12: Workspace tabs now auto-name from the main query keyword phrase (first sentence + up to 5 tokens).
- 2026-04-12: Edge-case naming rule added for non-word or symbol-heavy inputs: use a short sentence slice fallback.
- 2026-04-12: Added Export PNG for the current mind graph view (React Flow canvas capture, download-ready).
- 2026-04-12: Workspace tab labels now stay synchronized with query-derived keywords when the tab still uses a generic name (e.g., Workspace 1).
- 2026-04-12: Opening a recent session now reuses an existing matching workspace tab instead of creating duplicate tabs.
- 2026-04-12: Added PNG export settings (gear icon in Session panel) with scope toggle: Full graph vs Visible area.
- 2026-04-12: Added Recent sessions delete mode (trash toggle + per-session X button) for direct history cleanup from the sidebar.

### Changed

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
