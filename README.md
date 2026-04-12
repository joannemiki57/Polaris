# Polaris — MindGraph

An interactive research exploration tool that generates **literature-grounded knowledge graphs** from academic questions. Users ask a question, the system retrieves real papers from [OpenAlex](https://openalex.org), uses an LLM (Gemini) to organize their topics into a navigable mind map, and lets users selectively expand nodes, chat with research papers, and pin findings back to the graph — all rendered on a React Flow canvas.

## Table of contents

- [Architecture overview](#architecture-overview)
- [Tech stack](#tech-stack)
- [Repo layout](#repo-layout)
- [Data model](#data-model)
- [API routes](#api-routes)
- [Core pipelines](#core-pipelines)
  - [Hybrid initial expansion](#1-hybrid-initial-expansion-post-apigraphexpand)
  - [Selection expansion](#2-selection-expansion-post-apigraphexpand-selection)
  - [Paper keyword expansion](#3-paper-keyword-expansion-post-apigraphexpand-paper-keywords)
  - [Paper section expansion](#4-paper-section-expansion-post-apigraphexpand-paper-sections)
  - [Paper attachment](#5-paper-attachment-post-apigraphattach-papers)
  - [Deep Answer chat](#6-deep-answer-chat)
- [Data flow: end-to-end walkthrough](#data-flow-end-to-end-walkthrough)
- [OpenAlex integration](#openalex-integration)
- [Semantic Scholar integration](#semantic-scholar-integration)
- [LLM integration](#llm-integration)
- [Client architecture](#client-architecture)
- [Key design decisions](#key-design-decisions)
- [Known limitations and risks](#known-limitations-and-risks)
- [Quick start](#quick-start)

---

## Architecture overview

```
┌─────────────────────────────────────┐
│           Browser (5173)            │
│  React + React Flow canvas          │
│  Question input → Graph UI          │
│  Node toolbar → Expand / Deep       │
│  Deep Answer → Chat with papers     │
└──────────┬──────────────────────────┘
           │  /api/* (proxied by Vite)
           ▼
┌─────────────────────────────────────┐
│         Express BFF (8787)          │
│  ┌───────────┐  ┌────────────────┐  │
│  │  llm.ts   │  │  openalex.ts   │  │
│  │  Gemini   │  │  Search, topics│  │
│  │  JSON gen,│  │  abstracts,    │  │
│  │  chat,    │  │  keywords      │  │
│  │  keyword  │  │  + disk cache  │  │
│  │  extract  │  ├────────────────┤  │
│  └───────────┘  │ semanticScholar│  │
│                 │  .ts           │  │
│                 │  Section       │  │
│                 │  headings      │  │
│                 └────────────────┘  │
└──────────┬──────────┬──────────┬────┘
           │          │          │
           ▼          ▼          ▼
        Gemini    OpenAlex    Semantic
        API       API         Scholar API
```

The server acts as a **Backend-for-Frontend (BFF)**: it holds API keys, orchestrates calls to OpenAlex, Semantic Scholar, and Gemini, merges graph deltas, and returns complete `MindGraph` JSON to the client.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Client | Vite, React 18, React Flow, TypeScript |
| Server | Express, TypeScript, tsx (dev watch) |
| LLM | Google Gemini (via `@google/generative-ai` SDK, default model: `gemini-2.5-flash`) |
| Academic data | OpenAlex REST API (CC0, free tier) |
| Paper sections | Semantic Scholar Snippet Search API |
| Monorepo | npm workspaces, concurrently |

---

## Repo layout

```
Polaris/
├── client/                  # Vite + React frontend
│   └── src/
│       ├── App.tsx           # Main app: question input, graph canvas, layout toggle
│       ├── MindNode.tsx      # Custom React Flow node with inline toolbar (Expand / Deep)
│       ├── DeepAnswerPage.tsx # Full-page chat UI: paper sidebar + AI conversation
│       ├── SkeletonMindMap.tsx # Animated SVG loading skeleton during generation
│       ├── api.ts            # Typed fetch wrappers for all server endpoints
│       ├── graphTypes.ts     # Shared data model (mirrored from server)
│       ├── layout.ts         # MindGraph → React Flow conversion (tree + force-directed)
│       ├── persistence.ts    # Session save/load (localStorage) + markdown export
│       ├── main.tsx          # Entry point
│       └── styles.css        # Global styles + Deep Answer page styles
├── server/                  # Express BFF
│   └── src/
│       ├── index.ts          # Routes, middleware, rate limiting, paper sessions
│       ├── llm.ts            # Gemini calls: graph gen, expansion, deep answers, chat, keyword extraction
│       ├── openalex.ts       # OpenAlex API: search, topics, keywords, abstracts, caching
│       ├── semanticScholar.ts # Semantic Scholar: paper section heading extraction
│       └── graphTypes.ts     # Shared data model (canonical source)
├── docs/                    # Design and research documents
│   ├── animations.md         # Animation design notes
│   ├── sample-results/      # Example graph exports (markdown)
│   │   ├── example.md
│   │   └── example2.md
│   └── plan-phase/          # Planning-phase notes (vision, research, API ref, risks)
│       ├── direction-plan.md
│       ├── agentic-research.md
│       ├── api-summary.md
│       └── limitations.md
├── sessions/                # Development session notes
├── package.json             # Root workspace config
└── README.md                # This file
```

---

## Data model

Defined in `graphTypes.ts` (shared between client and server).

### Node kinds

| Kind | Description |
|------|-------------|
| `topic` | Root-level research topic derived from the user's question |
| `keyword` | Research concept extracted from papers, topics, or generated by LLM |
| `subtask` | Actionable research sub-task |
| `paper` | Academic paper from OpenAlex, carries `openAlexId`, `doi`, citation count |
| `note` | User-created annotation |

### Edge kinds

| Kind | Description |
|------|-------------|
| `expands_to` | Parent concept → child concept (hierarchical) |
| `prerequisite_for` | Concept A is required knowledge for concept B |
| `from_openalex` | Topic/keyword → paper (search result or pinned paper linkage) |
| `has_keyword` | Paper → keyword (extracted from OpenAlex metadata or LLM section-keyword extraction) |
| `has_section` | Paper → section heading (from Semantic Scholar snippet search) |
| `user_linked` | Manual user-created connection |

### MindGraph schema

```typescript
interface MindGraph {
  version: 1;
  title: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  updatedAt: string;
}

interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  summary?: string;
  openAlexId?: string;
  doi?: string;
  year?: number;
  citedByCount?: number;
  url?: string;
  relevance?: number;
  isReview?: boolean;
}
```

---

## API routes

Detailed endpoint-by-endpoint reference: [docs/api-endpoints.md](docs/api-endpoints.md)

All routes are served from Express on port `8787`. The Vite dev server proxies `/api/*` requests.

| Method | Path | Rate limit | Description |
|--------|------|-----------|-------------|
| `GET` | `/api/health` | default | Returns LLM (Gemini) availability and OpenAlex config |
| `POST` | `/api/graph/expand` | 60/min | **Initial graph**: question → hybrid OpenAlex + Gemini pipeline |
| `POST` | `/api/graph/expand-selection` | 60/min | Expand selected nodes via Gemini (ancestry-aware) |
| `POST` | `/api/graph/expand-paper-keywords` | 60/min | Expand a paper node with section-level keywords (LLM) or raw OpenAlex keywords (fallback) |
| `POST` | `/api/graph/expand-paper-sections` | 60/min | Expand a paper node with section headings from Semantic Scholar |
| `POST` | `/api/graph/attach-papers` | 60/min | Search OpenAlex and attach paper nodes to a keyword |
| `POST` | `/api/llm/deep` | 20/min | Generate a deep markdown answer for selected nodes |
| `POST` | `/api/deep-answer/init` | 20/min | Initialize a paper-grounded chat session (fetches top papers) |
| `POST` | `/api/deep-answer/chat` | 20/min | Send a message in a paper-grounded chat session |
| `POST` | `/api/deep-answer/reload-papers` | 20/min | Keep pinned papers and refill unpinned slots with new high-citation papers |
| `GET` | `/api/openalex/works` | 20/min | Raw OpenAlex search passthrough |

---

## Core pipelines

### 1. Hybrid initial expansion (`POST /api/graph/expand`)

The main graph generation pipeline. Produces a literature-grounded knowledge graph rather than relying on pure LLM invention.

```
User question
    │
    ├──→ OpenAlex: search 3 review papers (type:review, relevance-sorted)
    ├──→ OpenAlex: search 3 top-cited articles (type:article, relevance-sorted)
    │         (6 papers fetched in parallel)
    │
    ├──→ For each paper: fetchWorkDetail()
    │         → topics (with subfield/field hierarchy, scored)
    │         → abstract (reconstructed from inverted index)
    │
    └──→ Gemini (organizeKeywordsToGraph):
         "Extract specific research-level keywords from these
          topics and abstracts. Organize them into a tree.
          Avoid generic terms like 'Computer Science' or 'AI'."
              │
              ▼
         MindGraph with:
         - 1 topic root node
         - 10–20 keyword nodes in 2–3 depth levels
         - Hierarchical edges (expands_to, prerequisite_for)
```

The LLM receives paper titles, OpenAlex topics (with subfield/field hierarchy and relevance scores), and the first 400 characters of each abstract. It organizes real research concepts — it does not hallucinate generic terms.

### 2. Selection expansion (`POST /api/graph/expand-selection`)

When the user selects nodes and clicks "Expand Selected":

- The server computes each selected node's **ancestry** (parent → grandparent chain, up to 2 levels).
- Gemini receives the node labels **with their full lineage**, producing child nodes that are contextually grounded in the path from root, not just the label in isolation.
- New nodes/edges are deduplicated and merged via `mergeDelta`.

```
Selected: "Model Aggregation"
   Ancestry: ["Federated Learning", "Privacy-Preserving ML"]
       │
       └──→ Gemini generates children specific to
            "Model Aggregation in the context of
             Federated Learning / Privacy-Preserving ML"
```

### 3. Paper keyword expansion (`POST /api/graph/expand-paper-keywords`)

Two-tier approach for extracting keywords from a paper:

```
Paper node (has openAlexId)
    │
    ├──→ fetchWorkDetail() → topics + abstract
    │
    ├──→ [Primary] LLM (extractPaperSectionKeywords):
    │    "What would the section headings of this paper be?
    │     Extract 8–16 section-level concepts."
    │         │
    │         ▼
    │    Keyword nodes with summaries
    │    (e.g. "Non-IID Data", "Gradient Compression", "Secure Aggregation")
    │
    └──→ [Fallback] Raw OpenAlex keywords
         (if no LLM key or LLM returns empty)
              │
              ▼
         Keyword nodes with relevance scores (capped at ~15)
```

### 4. Paper section expansion (`POST /api/graph/expand-paper-sections`)

Data-driven, no LLM required — uses Semantic Scholar's snippet search:

```
Paper node (has title)
    │
    └──→ Semantic Scholar: snippet search by paper title
              │
              ├──→ Match snippets to the target paper (by title or corpusId)
              ├──→ Collect unique section headings
              ├──→ Filter out boilerplate (Abstract, Introduction, References, etc.)
              │
              ▼
         Section nodes + has_section edges
         (sorted by snippet count)
```

### 5. Paper attachment (`POST /api/graph/attach-papers`)

Search OpenAlex for a query string and attach matching papers to a keyword node as `paper` nodes with `from_openalex` edges. Deduplicates against existing graph nodes.

### 6. Deep Answer chat

A two-step pipeline providing **paper-grounded conversational AI**:

**Step 1 — Init** (`POST /api/deep-answer/init`):
```
Keyword (e.g. "Federated Learning")
    │
    ├──→ Ancestor labels are prepended for context
    │    (e.g. "Privacy-Preserving ML Federated Learning")
    │
    └──→ OpenAlex: searchResearchPapers()
              │
              ├──→ Top 10 cited articles (reviews excluded)
              ├──→ Fetches titles, authors, years, DOIs, abstracts
              │
              ▼
         Session created (in-memory Map)
         Returns: sessionId + paper list to client
```

**Step 2 — Chat** (`POST /api/deep-answer/chat`):
```
User message + sessionId + conversation history
    │
    └──→ Gemini with full paper context as system prompt:
         "You have access to these 10 papers about [keyword].
          Ground ALL answers in these papers.
          Cite as (Author et al., Year)."
              │
              ▼
         Markdown response with inline citations
```

Users can **pin papers** from the Deep Answer sidebar back to the graph as new paper nodes.

---

## Data flow: end-to-end walkthrough

This section traces a complete user session from first question to deep exploration.

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. USER ASKS A QUESTION                                        │
│    "What is federated learning and its privacy risks?"          │
│                                                                  │
│ 2. INITIAL GRAPH GENERATION                                     │
│    Client → POST /api/graph/expand                              │
│    ┌─────────────────────────────────────────────────────┐      │
│    │ Server orchestrates:                                │      │
│    │  a) OpenAlex search (3 reviews + 3 articles)       │      │
│    │  b) Fetch topics + abstracts for each paper         │      │
│    │  c) Gemini organizes into keyword tree              │      │
│    └─────────────────────────────────────────────────────┘      │
│    Client receives MindGraph → renders with stagger animation   │
│                                                                  │
│ 3. USER EXPLORES THE GRAPH                                      │
│    Click a node → see it highlighted with connected neighbors   │
│    Shift+click → multi-select                                   │
│    Inline toolbar appears: [★ Expand] [🔍 Deep]                │
│                                                                  │
│ 4. EXPAND A NODE                                                │
│    Click "Expand" on a keyword node                             │
│    → POST /api/graph/expand-selection (ancestry-aware)          │
│    → New child nodes merge into graph                           │
│                                                                  │
│    Click "Expand" on a paper node                               │
│    → POST /api/graph/expand-paper-keywords                      │
│    → Section-level keywords extracted by LLM (or OpenAlex       │
│      keywords as fallback)                                      │
│                                                                  │
│ 5. DEEP ANSWER (CHAT WITH PAPERS)                               │
│    Click "Deep" on any node                                     │
│    → Navigate to full-page Deep Answer view                     │
│    ┌─────────────────────────────────────────────────────┐      │
│    │  Left sidebar: 10 source papers with metadata       │      │
│    │  Right panel: Chat interface                        │      │
│    │                                                     │      │
│    │  AI answers grounded in paper contents               │      │
│    │  with inline citations (Author et al., Year)        │      │
│    │                                                     │      │
│    │  Pin papers ☆→★ back to the graph                  │      │
│    └─────────────────────────────────────────────────────┘      │
│                                                                  │
│ 6. SESSION MANAGEMENT                                           │
│    Graph auto-saved to localStorage                             │
│    Export as Markdown file                                       │
│    Clear and start fresh                                        │
└──────────────────────────────────────────────────────────────────┘
```

---

## OpenAlex integration

`server/src/openalex.ts` wraps the [OpenAlex API](https://api.openalex.org) with:

| Function | Purpose |
|----------|---------|
| `searchWorks` | Full-text search with optional type filter (`review` / `article`). Uses relevance sorting for filtered queries, citation sorting for unfiltered. |
| `searchResearchPapers` | Fetches detailed papers for Deep Answer sessions: titles, authors, abstracts, citation counts. Excludes review papers. |
| `fetchWorkDetail` | Fetches topics (with subfield/field hierarchy), keywords, and reconstructed abstract for a single work |
| `fetchWorkKeywords` | Backward-compat wrapper returning just keywords with relevance scores |
| `workHitToPaperNodes` | Converts search results into `GraphNode[]` with proper IDs and metadata |
| `keywordsToGraphNodes` | Converts keyword arrays into nodes + `has_keyword` edges |
| `reconstructAbstract` | Rebuilds readable text from OpenAlex's `abstract_inverted_index` format |

**Caching**: Disk-based JSON cache at `server/.cache/openalex.json` with 24-hour TTL. Prevents redundant API calls during development and exploration.

**Rate compliance**: Uses `mailto` header for OpenAlex polite pool access. Single-work lookups are free and unlimited.

---

## Semantic Scholar integration

`server/src/semanticScholar.ts` extracts paper section headings via the [Semantic Scholar Snippet Search API](https://api.semanticscholar.org):

| Function | Purpose |
|----------|---------|
| `fetchPaperSections` | Searches snippets by paper title, matches to the target paper, and collects unique section headings. Filters out boilerplate sections (Abstract, Introduction, References, Acknowledgements, etc.). |
| `sectionsToGraphNodes` | Converts section headings into keyword nodes with `has_section` edges |

Requires an optional `S2_API_KEY` for higher rate limits. Works without a key at reduced throughput.

---

## LLM integration

`server/src/llm.ts` handles all LLM interactions via the Google Generative AI SDK (Gemini):

| Function | Purpose |
|----------|---------|
| `organizeKeywordsToGraph` | Takes real paper data (titles, topics with subfield hierarchy, abstracts) and produces a structured `MindGraph`. Prompt explicitly forbids generic discipline labels. |
| `expandQuestionToGraph` | Fallback: pure LLM graph generation when OpenAlex data is unavailable |
| `expandFromSelection` | Generates delta nodes/edges from selected concepts, **ancestry-aware**: each node includes its parent → grandparent chain so the LLM generates contextually specific children |
| `extractPaperSectionKeywords` | Extracts 8–16 section-level research concepts from a paper's topics and abstract (e.g., "Non-IID Data", "Secure Aggregation") |
| `mergeDelta` | Deduplicates and merges new nodes/edges into an existing graph |
| `deepAnswer` | Generates long-form markdown analysis |
| `chatWithPapers` | Multi-turn conversation grounded in a set of research papers. System prompt includes full paper context; LLM must cite papers inline. |

All LLM calls produce structured JSON (via `responseMimeType: "application/json"`) or markdown, parsed and validated before returning to the client. Temperature ranges from 0.2 (keyword extraction) to 0.5 (deep answers) depending on the task.

---

## Client architecture

### App structure

`App.tsx` is the main component with three areas:

1. **Sidebar** — Question input, generate button, selection display, expand/deep actions, layout toggle (tree / graph), session management (export markdown, clear)
2. **Canvas** — React Flow graph with custom `MindNode` components, minimap, and controls. Shows a `SkeletonMindMap` animated loading state during initial generation.
3. **Deep panel** — Placeholder for legacy deep-dive markdown answers

### Deep Answer page (`DeepAnswerPage.tsx`)

A full-page view that replaces the graph canvas when the user clicks "Deep" on a node:

- **Paper sidebar** — Lists the 10 source papers with titles, authors, year, citation counts, DOI links, and a pin button to add papers back to the graph
- **Chat panel** — Conversational interface with suggested starter questions, markdown-rendered AI responses with inline citations, and typing indicators
- **Breadcrumb navigation** — Shows the node's ancestry path (e.g., Deep Answer / Privacy-Preserving ML / Federated Learning)

### Custom node rendering (`MindNode.tsx`)

Nodes are styled by `kind` with distinct border colors:

| Kind | Color |
|------|-------|
| `topic` | Purple (`#7c3aed`) |
| `keyword` | Teal (`#0d9488`) |
| `subtask` | Orange (`#ea580c`) |
| `paper` | Blue (`#2563eb`), amber border for reviews |
| `note` | Slate (`#64748b`) |

When a node is selected, an **inline toolbar** appears above it with two buttons:
- **Expand** — generates child nodes via LLM or data APIs
- **Deep** — opens the Deep Answer chat page for that node

Paper nodes show citation counts and year. Double-clicking a paper node opens its DOI link or OpenAlex page in a new tab.

### Layout (`layout.ts`)

Two layout modes, toggled via the sidebar:

| Mode | Algorithm | Best for |
|------|-----------|----------|
| **Tree** | Level-based horizontal layout (root → leaves left to right) | Reading hierarchical structure |
| **Graph** | Force-directed simulation (repulsion + spring + centering, 300 iterations) | Seeing cluster relationships |

Edge handles are dynamically assigned — tree mode uses right→left connections; graph mode computes the optimal handle pair based on node positions.

### Stagger reveal animation

When a new graph is generated, nodes and edges appear progressively by tree level with 120ms delay between nodes. Edges fade in after their connected nodes appear. The `SkeletonMindMap` component shows an animated SVG skeleton with shimmer effects during the ~10-20 second generation period.

### Persistence (`persistence.ts`)

Session state (question + graph) is saved to `localStorage` on every change, so users resume exploration across page reloads. Markdown export downloads the full graph as a structured `.md` file.

### API client (`api.ts`)

Typed fetch wrappers for every server endpoint. All calls go through a shared `j()` helper that handles JSON serialization and error handling.

---

## Key design decisions

### Hybrid LLM + data pipeline over pure LLM generation

The original approach was 100% LLM — Gemini invented keywords from training knowledge. This produced hallucinated topics disconnected from real literature. The hybrid pipeline fetches real papers and keywords from OpenAlex first, then uses the LLM only to **organize** them into a coherent tree.

### Relevance-first search over citation-count sorting

Sorting by `cited_by_count:desc` returned globally popular papers unrelated to the query (e.g., "Radiomics" for a "federated learning" search). Switching to OpenAlex's default relevance sorting for type-filtered queries fixed this while still returning well-cited papers.

### Topics + abstracts over generic keywords

OpenAlex `keywords` are discipline-level labels ("Computer Science", "Engineering") that lack research specificity. OpenAlex `topics` are hierarchical research concepts (domain > field > subfield > topic) that provide real insight. The pipeline now sends topics (with subfield/field context and relevance scores) and abstract excerpts to the LLM.

### Ancestry-aware node expansion

When expanding a selected node, the LLM receives its ancestry chain (parent → grandparent). This prevents a node labeled "Privacy" under "Federated Learning" from expanding into generic privacy topics — instead, the LLM generates children specific to privacy in federated learning.

### Paper-grounded chat over free-form LLM answers

The Deep Answer feature retrieves the top 10 cited research papers from OpenAlex and loads them into Gemini's context. The LLM is instructed to cite papers inline and refuse to answer when the papers don't cover a topic. This grounds every answer in real literature.

### Section-level keyword extraction

Rather than using OpenAlex's generic keywords, the paper keyword expansion prompts Gemini to infer what the paper's section headings would be. This produces specific, navigable concepts like "Non-IID Data Distribution", "Horizontal vs. Vertical FL", "Gradient Compression" — far more useful than "Computer Science" or "Engineering".

### BFF pattern

The server holds API keys, enforces rate limits, manages chat sessions (in-memory), and orchestrates multi-step pipelines (search → fetch details → LLM organize → merge). The client stays simple — it sends a question and gets back a complete graph.

---

## Known limitations and risks

Detailed analysis in [`docs/plan-phase/limitations.md`](docs/plan-phase/limitations.md).

| Area | Risk |
|------|------|
| **Scope** | The vision bundles semantic search, graph reasoning, long-term memory, and vault integration — each non-trivial alone |
| **Controlled distance** | No operational criteria yet for "fruitful analogy" vs. noise in cross-domain edges |
| **Graph UX** | Visual graphs scale poorly in the head; large graphs become "pretty pictures" without filters, summaries, and progressive disclosure |
| **Trust boundaries** | Vault integration (read/write scope, provenance, permissions) is unspecified |
| **LLM cost** | Graph-guided LLM calls can be expensive; depth/width/token bounds needed |
| **Chat sessions** | Paper sessions are stored in-memory (server Map) — lost on restart, no persistence |

### Not yet implemented

- Recursive expansion (keyword → search works → expand those works' keywords)
- Keyword deduplication beyond ID matching (synonym merging)
- User controls for review vs. article ratio in initial expansion
- Vault/MCP integration
- Persistent chat sessions (currently in-memory only)
- Paper section expansion exposed in the client UI (API ready, frontend pending)

---

## Quick start

```bash
npm install
cp server/.env.example server/.env   # then edit with your keys
npm run dev
```

### Session changelog hook

```bash
npm run hooks:install
npm run session:changelog -- 2026-04-12 "feature 1" "feature 2"
```

- `sessions/CHANGELOG.md` follows a Keep a Changelog-style structure (date headings + short bullet entries).
- The hook script also appends the same brief update to `agent.md` / `Claude.md` / `VS Code.md` / `cursor.md` when those files exist.
- Current pre-commit hook blocks code commits if `sessions/CHANGELOG.md` was not updated.

### Environment variables (`server/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes (for LLM features) | Google Gemini API key |
| `GEMINI_MODEL` | No (default: `gemini-2.5-flash`) | Gemini model name |
| `OPENALEX_MAILTO` | Recommended | Email for OpenAlex polite pool access |
| `S2_API_KEY` | No | Semantic Scholar API key for higher rate limits |
| `PORT` | No (default: `8787`) | Server port |

- **Web UI**: http://localhost:5173
- **API**: http://localhost:8787 (try `/api/health`)

Without `GEMINI_API_KEY`, the system falls back to mock graphs with placeholder nodes.

---

## Further reading

| Document | Description |
|----------|-------------|
| [`docs/plan-phase/direction-plan.md`](docs/plan-phase/direction-plan.md) | Product vision: inspiration-aware knowledge graph with selectable expansion |
| [`docs/plan-phase/agentic-research.md`](docs/plan-phase/agentic-research.md) | Technical background: LLM limitations, graph reasoning (GoT, NoT), KG+RAG pipelines |
| [`docs/plan-phase/api-summary.md`](docs/plan-phase/api-summary.md) | OpenAlex API reference (entities, filters, query parameters) |
| [`docs/plan-phase/limitations.md`](docs/plan-phase/limitations.md) | Scope risks, UX challenges, trust boundaries |
| [`sessions/`](sessions/) | Development session notes documenting architectural evolution |
