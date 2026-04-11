# Keyword Pipeline Redesign: Topics + Abstracts over Generic Keywords

**Date:** April 11, 2026  
**Previous session:** `4-11-1227.md` (Hybrid Initial Expansion)

## Problem

The hybrid pipeline from the previous session was producing:
1. **Irrelevant papers** — sorting by `cited_by_count:desc` returned globally popular papers (Radiomics, CNN Survey, Human Connectome) instead of papers actually about the query topic.
2. **Generic keywords** — OpenAlex `keywords` are discipline-level labels ("Computer Science", "Engineering", "AI") that provide no research-level insight.

### Before (searching "federated learning")

| Papers | Keywords |
|--------|----------|
| Radiomics (5,419 cites) | Computer Science (91%) |
| CNN Survey (4,618 cites) | Taxonomy (60%) |
| Human Connectome (3,347 cites) | Software Deployment (48%) |

## Root Causes

1. **`sort=cited_by_count:desc`** overpowers relevance — returns the most-cited papers in all of OpenAlex that vaguely match, not the most relevant ones.
2. **OpenAlex `keywords`** are auto-extracted discipline tags, not research concepts.
3. **OpenAlex `topics`** are far more specific (e.g., "Privacy-Preserving Technologies in Data") but we weren't using them.
4. **Abstracts** are available via `abstract_inverted_index` but we weren't fetching them.

## Changes

### 1. Relevance-first search (`openalex.ts`)

Removed `sort=cited_by_count:desc` when a type filter is applied (review/article). OpenAlex's default relevance sorting returns papers that are actually about the query, while still having strong citation counts.

```typescript
// Before: always citation-sorted
params.set("sort", "cited_by_count:desc");

// After: relevance sort for filtered searches, citation sort only for unfiltered
if (typeFilter) params.set("filter", `type:${typeFilter}`);
else params.set("sort", "cited_by_count:desc");
```

### 2. Topics instead of keywords (`openalex.ts`)

Added `OpenAlexTopic` interface and `fetchWorkDetail()` function that fetches:
- **Topics** — hierarchical research concepts with subfield/field classification
- **Keywords** — kept for backward compatibility
- **Abstract** — reconstructed from `abstract_inverted_index`

### 3. Abstract reconstruction (`openalex.ts`)

OpenAlex stores abstracts as inverted indexes (`{ "word": [position1, position2] }`). Added `reconstructAbstract()` to convert these back to readable text.

### 4. Updated LLM prompt (`llm.ts`)

- `PaperWithKeywords` now carries `topics` and `abstract` instead of just `keywords`
- Prompt explicitly instructs: extract specific concepts, avoid generic terms
- Each paper's topics and first 400 chars of abstract are included in the prompt

### 5. Pipeline integration (`index.ts`)

Updated `/api/graph/expand` to call `fetchWorkDetail()` instead of `fetchWorkKeywords()`, passing topics and abstracts to the LLM organizer.

## After (searching "federated learning")

| Papers | Keywords |
|--------|----------|
| A review of applications in federated learning (1,367 cites) [REVIEW] | Differential Privacy |
| Federated Learning for Smart Healthcare (695 cites) [REVIEW] | Homomorphic Encryption |
| Privacy-preserving Federated Learning (563 cites) [REVIEW] | Secure Multi-Party Computation |
| Advances and Open Problems in FL (4,412 cites) [ARTICLE] | Model Aggregation |
| FL: Challenges, Methods, Future Directions (4,427 cites) [ARTICLE] | Distributed Optimization |
| Future of digital health with FL (2,297 cites) [ARTICLE] | Internet-of-Medical-Things (IoMT) |

## Files Modified

- `server/src/openalex.ts` — Added `OpenAlexTopic`, `WorkDetail`, `fetchWorkDetail()`, `reconstructAbstract()`; changed search sorting
- `server/src/llm.ts` — Updated `PaperWithKeywords` to include topics/abstract; rewrote LLM prompt
- `server/src/index.ts` — Switched from `fetchWorkKeywords` to `fetchWorkDetail` in expand route

## Debugging Note

A significant debugging session was needed because `tsx watch` was failing silently on restart (EADDRINUSE), so code changes weren't taking effect. Also, the OpenAlex cache file was at `server/.cache/openalex.json` (server CWD), not the project root — clearing the wrong cache location masked the fix working.
