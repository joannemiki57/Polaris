# Git Merge: `expand-selected` → `main` Conflict Analysis

**Date:** April 11, 2026  
**Current branch:** `expand-selected` (commits: `d6edcd6` → `50425ec` → `b96a7f4`)  
**Remote main:** `d6edcd6` → `07c0247` → `67f1b50` → `cf6c41e` → `4c0a06e` → `26acf56`

## What main added (that we don't have)

Main merged two PRs that introduced:

1. **Native Gemini SDK** — switched from `openai` npm package (OpenAI-compat mode) to `@google/generative-ai` native SDK
2. **`chatWithPapers()` / deep-answer chat** — a multi-turn chat grounded in paper abstracts (`/api/deep-answer/init`, `/api/deep-answer/chat`)
3. **`searchResearchPapers()`** — a new OpenAlex function that fetches detailed papers (with abstracts + author names)
4. **`OpenAlexWorkDetailed`** interface — extends `OpenAlexWorkHit` with `abstract` and `authorNames`
5. **`stripFences()` helper** — strips markdown fences from Gemini JSON output (Gemini sometimes wraps JSON in ` ```json `)
6. **`ChatMessage` type export** from `llm.ts`
7. **Cross-platform `start.sh`** — uses `xdg-open` fallback for Linux

## What our branch added (that main doesn't have)

1. **Hybrid keyword pipeline** — `organizeKeywordsToGraph()` using real paper topics + abstracts from OpenAlex
2. **`fetchWorkDetail()` / `fetchWorkKeywords()`** — OpenAlex topic/keyword/abstract fetching with cache
3. **`keywordsToGraphNodes()`** — converts OpenAlex keywords to graph nodes
4. **`extractPaperSectionKeywords()`** — LLM-based section-level keyword extraction (the fix from this session)
5. **`PaperWithKeywords` interface** — carries topics + abstract for LLM organizer
6. **`has_keyword` / `has_section` edge kinds** + `relevance` / `isReview` on `GraphNode`
7. **Semantic Scholar module** — `semanticScholar.ts` for section extraction
8. **`expand-paper-sections` route** — separate route for S2 snippet-based sections
9. **`attach-papers` route** — attach OpenAlex papers to any keyword node
10. **Multi-provider support** — `LLM_KEY` / `LLM_PROVIDER` / `LLM_MODEL` abstraction (Gemini OR OpenAI)

---

## Conflicting Files (4)

### 1. `server/src/llm.ts` — 5 conflict regions

| Region | Ours (`expand-selected`) | Main (`origin/main`) | Resolution |
|--------|--------------------------|----------------------|------------|
| **Imports + client setup** (L1–19) | `import OpenAI` + `makeClient()` helper supporting Gemini-via-OpenAI-compat and native OpenAI | `import { GoogleGenerativeAI }` + `getGemini()` using native SDK | **Take main's native Gemini SDK.** Our `makeClient()` was a workaround; main's approach is cleaner and matches what's deployed. Port our extra functions (`organizeKeywordsToGraph`, `extractPaperSectionKeywords`, `PaperWithKeywords`) to use `getGemini()` instead of `makeClient()`. |
| **`expandQuestionToGraph()`** (L190–201) | Uses `client.chat.completions.create()` with OpenAI-compat | Uses `gemini.generateContent()` with native SDK | **Take main's SDK call pattern.** Our function signature has an extra `provider` param — drop it, use `model: string` only. |
| **`expandFromSelection()`** (L294–298) | `makeClient(apiKey, provider)` | `getGemini(apiKey, model)` | **Take main.** Same pattern. |
| **`deepAnswer()` offline text** (L410–414) | `"Set **GEMINI_API_KEY** or **OPENAI_API_KEY**..."` | `"Set **GEMINI_API_KEY**..."` | **Take main.** We're Gemini-only for now. |
| **`deepAnswer()` API call** (L420–436) | `client.chat.completions.create()` | `gemini.generateContent()` | **Take main.** Keep native SDK. |

**What to preserve from ours:**
- `organizeKeywordsToGraph()` — port to use `getGemini()` + `gemini.generateContent()`
- `extractPaperSectionKeywords()` — port to use `getGemini()` + `gemini.generateContent()`
- `PaperWithKeywords` interface
- `PaperDetail` interface

**What to adopt from main (new):**
- `chatWithPapers()` function + `ChatMessage` type + `buildPaperContext()` helper
- `stripFences()` helper — use it in our `parseMindGraph()` too
- `getGemini()` helper — replace our `makeClient()`

### 2. `server/src/index.ts` — 6 conflict regions

| Region | Ours | Main | Resolution |
|--------|------|------|------------|
| **Imports** (L9–26) | Imports `extractPaperSectionKeywords`, `organizeKeywordsToGraph`, `fetchWorkDetail`, `fetchWorkKeywords`, `keywordsToGraphNodes`, `semanticScholar` | Imports `chatWithPapers`, `ChatMessage`, `searchResearchPapers`, `OpenAlexWorkDetailed` | **Merge both.** Keep all our imports AND main's new ones. |
| **LLM config** (L34–41) | `LLM_KEY` / `LLM_MODEL` / `LLM_PROVIDER` (multi-provider) | `GEMINI_KEY` / `GEMINI_MODEL` (Gemini-only) | **Take main's naming** (`GEMINI_KEY`, `GEMINI_MODEL`). Drop `LLM_PROVIDER`. Update all call sites. |
| **`/api/health`** (L79–84) | `llm: Boolean(LLM_KEY), llmProvider: LLM_PROVIDER` | `llm: Boolean(GEMINI_KEY)` | **Take main.** Drop `llmProvider`. |
| **`/api/graph/expand`** (L96–151) | Full hybrid pipeline (search reviews+articles → fetchWorkDetail → organizeKeywordsToGraph → merge papers) | Simple `expandQuestionToGraph(GEMINI_KEY, question, GEMINI_MODEL)` | **Keep ours** — this is the core improvement. But update to use `GEMINI_KEY` / `GEMINI_MODEL` instead of `LLM_KEY` / `LLM_MODEL` / `LLM_PROVIDER`. |
| **`/api/graph/expand-selection`** (L175–188) | `LLM_KEY, ..., LLM_MODEL, LLM_PROVIDER` | `GEMINI_KEY, ..., GEMINI_MODEL` | **Take main's var names.** Drop provider param. |
| **`/api/llm/deep`** (L207–211) | `deepAnswer(LLM_KEY, ..., LLM_MODEL, LLM_PROVIDER)` | `deepAnswer(GEMINI_KEY, ..., GEMINI_MODEL)` | **Take main's var names.** Drop provider param. |

**What to preserve from ours:**
- The hybrid pipeline in `/api/graph/expand` (the entire review+article → topics+abstracts → LLM organizer flow)
- `/api/graph/expand-paper-keywords` route (with LLM-based section keyword extraction)
- `/api/graph/expand-paper-sections` route
- `/api/graph/attach-papers` route

**What to adopt from main (new):**
- `/api/deep-answer/init` route
- `/api/deep-answer/chat` route  
- `paperSessions` in-memory store

### 3. `start.sh` — 1 conflict region

| Ours | Main |
|------|------|
| Uses `curl` polling loop, macOS-only `open` | Uses `sleep 3` + cross-platform (`open` / `xdg-open` / echo fallback) |

**Resolution: Take main's version.** It's more portable. Both do the same thing.

### 4. `docs/api-summary.md` — 1 conflict region (trivial)

Both sides have identical content — same trailing attribution line. **Take either side.**

---

## Non-conflicting changes to verify

These files auto-merged but should be sanity-checked:

| File | What changed |
|------|-------------|
| `client/src/App.tsx` | Both branches modified — auto-merged. Check that hyperlink/URL features from our branch survived. |
| `client/src/api.ts` | Both branches added API helpers — auto-merged. Verify no duplicate functions. |
| `client/src/styles.css` | Both branches added styles — auto-merged. Verify no duplicate CSS rules. |
| `server/src/openalex.ts` | Our branch added `fetchWorkDetail`, `fetchWorkKeywords`, `keywordsToGraphNodes`, `OpenAlexTopic`, `WorkDetail`, typed cache entries. Main added `searchResearchPapers`, `OpenAlexWorkDetailed`, `reconstructAbstract`. Auto-merged — both should coexist. |
| `package-lock.json` | Different deps (`openai` vs `@google/generative-ai`). After resolution, re-run `npm install` to regenerate. |

---

## Dependency change

| Package | Our branch | Main |
|---------|-----------|------|
| `openai` | `^4.77.0` | *(removed)* |
| `@google/generative-ai` | *(not present)* | `^0.24.1` |

**Resolution:** Drop `openai`, add `@google/generative-ai`. All LLM calls go through native Gemini SDK.

---

## Merge strategy summary

1. **Adopt main's Gemini SDK pattern** — replace `makeClient()` / OpenAI-compat with `getGemini()` / native Gemini calls
2. **Keep our pipeline logic** — the hybrid expand, section keyword extraction, topic-based organization
3. **Keep our new types** — `has_keyword`, `has_section` edge kinds, `relevance`, `isReview` on GraphNode
4. **Adopt main's new features** — `chatWithPapers`, deep-answer init/chat routes, `searchResearchPapers`
5. **Unify variable naming** — use `GEMINI_KEY` / `GEMINI_MODEL` everywhere, drop `LLM_PROVIDER`
6. **Take main's `start.sh`** — more portable
7. **Re-run `npm install`** after swapping `openai` → `@google/generative-ai`
