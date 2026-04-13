# Algorithm Optimization Plan — 2026-04-13

## Problem

The main user-facing bottleneck: typing a research question and waiting for the mind map to appear takes **~15 seconds**. This document breaks down exactly where those seconds go in `/api/graph/expand`, identifies wasted work, and proposes concrete fixes. Secondary pipelines are covered at the end.

---

## Deep Dive: `/api/graph/expand` — The Question-to-Graph Pipeline

This is the pipeline that runs when the user types a question and hits "Generate graph."

### Current Flow (3 sequential steps)

```
User types question → POST /api/graph/expand

Step 1: Search OpenAlex for papers                          ~1-2s
  Promise.all([
    searchWorks(question, 2, "review"),     → 2 review papers
    searchWorks(question, 6, "article"),    → 6 research articles
  ])
  Returns: 8 OpenAlexWorkHit objects (id, title, year, citations, doi, type)
  ⚠ DISCARDS topics, abstracts, keywords from response

Step 2: Re-fetch each paper for topics + abstracts          ~2-3s
  Promise.all(
    allHits.map(h => fetchWorkDetail(h.id))  → 8 individual API calls
  )
  Each call: GET /works/{id}?select=id,display_name,keywords,topics,abstract_inverted_index
  Returns: topics[], keywords[], abstract per paper

Step 3: LLM organizes topics + abstracts into graph         ~8-12s
  organizeKeywordsToGraph(question, papersWithKeywords)
  Sends to Gemini: 8 papers × (all topics + 400-char abstracts)
  Returns: MindGraph JSON (1 topic root + 10-20 keyword nodes + edges)

Total wall-clock: ~11-17s (typically ~15s)
```

### Where the time goes

| Step | What | Time | % of Total |
|------|------|------|------------|
| 1 | `searchWorks` × 2 (parallel) | ~1.5s | 10% |
| 2 | `fetchWorkDetail` × 8 (parallel) | ~2.5s | 17% |
| 3 | `organizeKeywordsToGraph` (Gemini) | ~10s | **~67%** |
| — | Network overhead, JSON parsing | ~1s | 6% |

### Key Finding: Step 2 Is Completely Redundant

**The OpenAlex `/works?search=` endpoint already returns the full work object**, including `topics`, `keywords`, and `abstract_inverted_index`. But `searchWorks()` in `openalex.ts:77-130` only captures `id`, `title`, `publication_year`, `cited_by_count`, `doi`, and `type` — it throws away exactly the fields we need.

Then step 2 makes **8 separate API calls** back to OpenAlex to re-fetch those same works individually, just to get the discarded fields.

**This means we're making 10 OpenAlex API calls (2 search + 8 detail) when we only need 2.**

#### Code evidence

`searchWorks` response mapping (`openalex.ts:119-126`):
```typescript
// Only captures 6 fields — topics, keywords, abstract are IGNORED
const hits: OpenAlexWorkHit[] = results.map((r) => ({
  id: r.id, title: r.title, publication_year: r.publication_year,
  cited_by_count: r.cited_by_count, doi: r.doi, type: r.type,
}));
```

`fetchWorkDetail` then re-fetches (`openalex.ts:241-242`):
```typescript
// Makes a NEW API call for each paper to get what was already returned
select: "id,display_name,keywords,topics,abstract_inverted_index",
```

---

## Optimizations for `/api/graph/expand`

### Optimization A: Eliminate Step 2 — Capture topics + abstracts from search response

**Impact: ~2-3s saved (removes 8 API round-trips)**  
**Effort: Small**  
**Risk: None — same data, fewer calls**

Expand `searchWorks` (or create a new `searchWorksWithDetail` variant) to also capture `topics`, `keywords`, and `abstract_inverted_index` from the search response that OpenAlex already returns.

**Files to change:**

1. `server/src/openalex.ts:77-130` — `searchWorks()`
   - Expand the response type to include `topics`, `keywords`, `abstract_inverted_index`
   - Map them into the return type (reuse `reconstructAbstract` + topic mapping from `fetchWorkDetail`)
   - Return an enriched hit type: `OpenAlexWorkHitWithDetail`

2. `server/src/index.ts:88-110` — `/api/graph/expand` handler
   - Remove the entire `Promise.all(allHits.map(h => fetchWorkDetail(...)))` block (lines 96-110)
   - Build `papersWithKeywords` directly from the enriched search results

**Before (10 API calls):**
```
searchWorks(review)  ──┐
searchWorks(article) ──┤ parallel → 8 hits (no detail)
                       ↓
fetchWorkDetail × 8  ──┤ parallel → 8 details
                       ↓
LLM call
```

**After (2 API calls):**
```
searchWorksWithDetail(review)  ──┐
searchWorksWithDetail(article) ──┤ parallel → 8 hits WITH topics + abstracts
                                 ↓
LLM call
```

### Optimization B: Shrink the LLM prompt

**Impact: ~2-4s saved on Gemini response time**  
**Effort: Tiny (two line changes)**  
**Risk: Slightly less context for LLM — but top topics and first 2 sentences carry most signal**

The `organizeKeywordsToGraph` prompt currently sends:
- All topics per paper (up to 10 each, many redundant across papers)
- 400-char abstract per paper (8 × 400 = 3,200 chars of abstracts alone)

Changes:
1. `server/src/llm.ts:223` — `p.abstract.slice(0, 400)` → `p.abstract.slice(0, 200)`
2. `server/src/llm.ts:220-221` — cap topics at 5 per paper: `.slice(0, 5)` before mapping
3. `server/src/index.ts:104` — also cap `detail.topics` to 5 when building `papersWithKeywords`

This cuts input tokens by ~40%. Gemini's time-to-first-token and total generation time both scale with input size.

### Optimization C: Cache the full graph result

**Impact: ~0s for repeat queries (100% savings)**  
**Effort: Small**  
**Risk: None — users get the same graph they'd have gotten anyway**

After `organizeKeywordsToGraph` returns, store `{normalizedQuestion → MindGraph}` in a cache with 24h TTL. Same disk+memory cache infrastructure already used for OpenAlex.

**File:** `server/src/index.ts:80-127`

```typescript
// At top of handler:
const graphCacheKey = `graph:${question.trim().toLowerCase()}`;
const cached = graphResultCache.get(graphCacheKey);
if (cached && Date.now() - cached.at < TTL_MS) {
  return res.json({ graph: cached.graph });
}

// After LLM returns:
graphResultCache.set(graphCacheKey, { at: Date.now(), graph: keywordGraph });
```

This is especially impactful for Polaris since:
- Users often regenerate the same question after tweaking graph layout
- Multiple users may search similar/identical terms
- A future "popular searches" feature could pre-warm the cache

### Optimization D: Overlap LLM with OpenAlex (if A is not enough)

**Impact: Safety net — ~5s fallback if OpenAlex is slow**  
**Effort: Medium**  
**Risk: Low — uses existing `expandQuestionToGraph` as fallback**

Fire a "speculative" pure-LLM expansion (no papers, just the question) in parallel with the full paper pipeline. If the paper pipeline succeeds, use its result (higher quality). If OpenAlex is down or slow, the speculative result returns in ~5s instead of timing out.

```typescript
const [papersResult, speculative] = await Promise.allSettled([
  fullPaperPipeline(question),
  expandQuestionToGraph(apiKey, question, model),
]);
// Prefer paper-based result; fall back to speculative
```

This is a **lower priority** — Optimizations A-C should bring the total well under 10s already.

---

## Projected Timeline After Optimizations

```
BEFORE:
  searchWorks × 2        [====] 1.5s
  fetchWorkDetail × 8    [======] 2.5s
  Gemini LLM             [========================] 10s
  Total:                  ================================ ~14s

AFTER (A + B):
  searchWorksWithDetail × 2  [====] 1.5s
  Gemini LLM (smaller prompt) [================] 7s
  Total:                      ===================== ~8.5s

AFTER (A + B + C, cached):
  Cache hit               [=] ~0s
```

| Scenario | Before | After A | After A+B | After A+B+C (cached) |
|----------|--------|---------|-----------|---------------------|
| First query | ~14s | ~11s | ~8.5s | ~8.5s |
| Same query again | ~14s | ~11s | ~8.5s | **~0s** |

---

## Implementation Order

| Priority | Task | Files | Time Saved | Effort |
|----------|------|-------|------------|--------|
| **P0** | **A: Merge search+detail (eliminate 8 API calls)** | `openalex.ts`, `index.ts` | ~2-3s | Small |
| **P0** | **C: Cache full graph result** | `index.ts` | 100% on repeats | Small |
| **P1** | **B: Trim LLM prompt** | `llm.ts`, `index.ts` | ~2-4s | Tiny |
| **P2** | **D: Speculative parallel LLM** | `index.ts` | Fallback safety | Medium |

### Task A: Detailed Implementation Steps

1. **Create enriched return type** in `openalex.ts`:
   ```typescript
   export interface OpenAlexWorkHitEnriched extends OpenAlexWorkHit {
     topics: OpenAlexTopic[];
     keywords: OpenAlexKeyword[];
     abstract: string | null;
   }
   ```

2. **Update `searchWorks`** to parse `topics`, `keywords`, `abstract_inverted_index` from the search response (they're already in the JSON — just not mapped). Return `OpenAlexWorkHitEnriched[]`.

3. **Update `/api/graph/expand` handler** in `index.ts`:
   - Remove the `fetchWorkDetail` Promise.all block entirely (lines 96-110)
   - Build `papersWithKeywords` directly from enriched search hits:
     ```typescript
     const papersWithKeywords: PaperWithKeywords[] = allHits.map((h) => ({
       id: h.id,
       title: h.title ?? "Untitled",
       isReview: h.type === "review",
       citedByCount: h.cited_by_count ?? 0,
       topics: h.topics.slice(0, 5).map(t => ({
         displayName: t.displayName, score: t.score, subfield: t.subfield,
       })),
       abstract: h.abstract,
     }));
     ```

4. **Keep `fetchWorkDetail` intact** — it's still used by other pipelines (`expand-paper-keywords`, `keywords-from-starred-papers`). This change only affects the expand pipeline.

### Task C: Detailed Implementation Steps

1. Add a `graphResultCache` Map at module level in `index.ts` (alongside `paperSessions`)
2. At the top of the `/api/graph/expand` handler, check cache before any API calls
3. After successful graph generation, write to cache
4. Use same 24h TTL as OpenAlex cache

### Task B: Detailed Implementation Steps

1. In `llm.ts:220-221`, add `.slice(0, 5)` to topics before formatting
2. In `llm.ts:223`, change `p.abstract.slice(0, 400)` → `p.abstract.slice(0, 200)`
3. In `index.ts:104`, cap `detail.topics` to `.slice(0, 5)` (only needed if Task A isn't done yet)

---

## Secondary Pipelines (Lower Priority)

These don't affect the "type question → see graph" flow, but are worth optimizing later.

### `/api/graph/keywords-from-starred-papers`

**Current:** Sequential loop of up to 12 papers × 3 API calls each = ~30-84s  
**Fix:** Replace `for` loop with `Promise.all(starredPapers.map(...))` + parallelize inner `fetchPaperSections` and `fetchWorkDetail`. Optional: batch the 12 per-paper LLM calls into 1 combined call.  
**Files:** `server/src/index.ts:569-623`, optionally `server/src/llm.ts`  
**Expected:** ~84s → ~8-10s

### `/api/deep-answer/reload-papers`

**Current:** Sequential pagination loop of up to 30 OpenAlex calls = ~15-30s  
**Fix:** Estimate pages needed, fetch up to 5 pages in parallel with `Promise.all`.  
**File:** `server/src/index.ts:335-354`  
**Expected:** ~20s → ~1-2s

### `/api/graph/expand-selection`

**Current:** `searchResearchPapers` (uncached) + LLM = ~6-10s  
**Fix:** Add cache to `searchResearchPapers` (key: `research:${query}:${page}`, 24h TTL). Also truncate abstracts in LLM prompt from 500→250 chars.  
**Files:** `server/src/openalex.ts:149-200`, `server/src/llm.ts:370`  
**Expected:** ~6-10s → ~5-8s (cached search saves ~1-2s)

### Missing Caches

| Function | Currently Cached | Proposed Key |
|----------|-----------------|--------------|
| `searchWorks` | Yes (24h) | — |
| `fetchWorkDetail` | Yes (24h) | — |
| `searchResearchPapers` | **No** | `research:${query}:${page}` |
| `fetchPaperSections` | **No** | `s2:${normalizedTitle}` |
| Full graph result | **No** | `graph:${normalizedQuestion}` |
