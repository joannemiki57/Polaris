# 4-13 Selection Expansion Logic Summary

## Scope implemented in this session

- Added explicit multi-select expansion modes in the Selection panel:
  - `Expand Selected` (combined context)
  - `Expand Individual` (per-node expansion)
- Added guidance text when many nodes are selected:
  - `Combined relevance may be lower with 4+ selected nodes.`
- Added Gemini model fallback in the server LLM layer:
  - If the primary model (for example `gemini-2.5-flash`) returns transient capacity errors (`503` / high-demand), requests automatically retry with fallback models (default includes `gemini-2.5-pro`).
- Split graph-generation runtime state by workspace tab:
  - `busy`, `status`, and loading overlay visibility are now tracked per workspace container.
  - Async operations update only the workspace that started them, so switching tabs keeps already-created diagrams accessible while another tab is generating.
- Smoothed multi-select node highlighting:
  - Selection visual state is now applied immediately in click/clear/delete handlers.
  - Removed delayed effect-based selection sync path that caused stepped glow updates during rapid multi-select.
- Refined selected-node emphasis animation:
  - Increased selected visual scale/intensity back to a larger emphasis level.
  - Unified transitions under a single slower ease-out curve to remove the awkward "expand, pause, expand again" feel.

## Product behavior implemented

1. Single selection (`1` node)
- Keep existing behavior.
- If selected node is a paper, use paper-keyword expansion.
- Otherwise use selection expansion (LLM/OpenAlex pipeline).

2. Multi-selection (`2+` nodes)
- Show two side-by-side actions in the Selection panel.
- `Expand Selected`:
  - Sends all selected nodes in one combined request.
  - Uses combined selected labels/context to discover overlapping themes.
- `Expand Individual`:
  - Expands each selected node independently in sequence.
  - Uses paper-keyword expansion for paper nodes, and selection expansion for non-paper nodes.

3. Larger selection warning (`4+` nodes)
- Show a hint that combined relevance may be lower.
- No hard block; user can still choose either mode.

## Logic notes (current)

- Combined mode currently runs one merged expansion for all selected nodes, intended to discover cross-node overlaps.
- Individual mode is deterministic and often safer for heterogeneous selections.
- For mixed node kinds, individual mode can produce broader graph growth than combined mode.

## Cohesion score proposal (planned, not yet implemented)

A lightweight pre-check before combined expansion:

- Compute a cohesion score in `[0,1]` using:
  - label token overlap,
  - ancestry overlap,
  - optional OpenAlex top-topic overlap.
- Suggested interpretation:
  - `>= 0.60`: strong combined intent (safe default to combined)
  - `0.35 - 0.59`: medium cohesion (show caution, keep both options)
  - `< 0.35`: weak cohesion (recommend `Expand Individual`)

## Alternatives discussed

1. Anchor-node selection for large sets
- Let users pick up to 2-3 anchor nodes before running combined expansion.
- Pros: reduces noise in large selections.
- Cons: extra UX step.

2. Hybrid expansion
- Run combined expansion first, then selectively run individual expansion only for nodes with low contribution.
- Pros: balances discovery + coverage.
- Cons: more complex orchestration and status messaging.

3. Strict cap for combined mode
- Limit combined mode to 3 selected nodes.
- Pros: predictable quality.
- Cons: blocks legitimate broader queries.

## Why this shape was chosen now

- It ships immediately with minimal backend change risk.
- It preserves existing single-node ergonomics.
- It gives users explicit control when intent is ambiguous.
- It leaves room to add cohesion-driven guidance in a follow-up without breaking behavior.
