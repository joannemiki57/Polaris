# Polaris (MindGraph) — Architecture Summary

## Overview

**Polaris** is a full-stack research exploration tool that transforms a user's question into an interactive knowledge graph, grounded in real academic papers from OpenAlex and powered by Google Gemini LLM.

```
User Question → Gemini LLM → Knowledge Graph → React Flow Canvas
                                    ↕
                              OpenAlex Papers → Deep Answer Chat (paper-grounded AI)
```

---

## Project Structure

```
mindgraph-openalex/
├── package.json              # npm workspaces: client + server
├── client/                   # Vite + React frontend (:5173)
│   ├── vite.config.ts        # Dev server, /api proxy → :8787
│   └── src/
│       ├── App.tsx            # Main shell: graph canvas + sidebar
│       ├── DeepAnswerPage.tsx # Paper-grounded chat UI
│       ├── MindNode.tsx       # Custom React Flow node component
│       ├── api.ts             # Typed API client
│       ├── graphTypes.ts      # Shared graph schema
│       ├── layout.ts          # Graph → React Flow layout (BFS levels)
│       └── persistence.ts     # localStorage session save/load
├── server/                   # Express BFF (:8787)
│   └── src/
│       ├── index.ts           # All HTTP routes + middleware
│       ├── llm.ts             # Gemini integration (6 LLM functions)
│       ├── openalex.ts        # OpenAlex API + disk cache (24h TTL)
│       └── graphTypes.ts      # Canonical graph types
└── start.sh                  # One-command launcher
```

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React + TypeScript | 18.3 + 5.7 |
| Graph Visualization | React Flow | 11.11 |
| Bundler | Vite | 6.0 |
| Backend | Express (Node.js) | 4.21 |
| LLM | Google Gemini (`@google/generative-ai`) | 0.24 |
| Academic Data | OpenAlex REST API | — |
| Dev Runner | concurrently | 9.1 |

---

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/health` | Status check (LLM key, OpenAlex mailto) |
| `POST` | `/api/graph/expand` | Question → full knowledge graph (Gemini + OpenAlex papers) |
| `POST` | `/api/graph/expand-selection` | Expand selected nodes with new children (LLM delta merge) |
| `POST` | `/api/graph/expand-paper-keywords` | Extract keywords from a paper node (Gemini or OpenAlex) |
| `POST` | `/api/graph/attach-papers` | Search & attach OpenAlex papers to a keyword node |
| `POST` | `/api/llm/deep` | One-shot deep answer (markdown) |
| `POST` | `/api/deep-answer/init` | Initialize paper-grounded chat session (top 10 cited papers) |
| `POST` | `/api/deep-answer/chat` | Multi-turn chat grounded in loaded papers |
| `GET` | `/api/openalex/works` | Direct OpenAlex paper search passthrough |

---

## Graph Schema

### Node Types (`kind`)

| Kind | Description |
|------|-------------|
| `topic` | Root concept from user's question |
| `keyword` | Related concept / sub-topic |
| `subtask` | Actionable research step |
| `paper` | Academic paper (from OpenAlex) |
| `note` | User annotation |

### Edge Types (`kind`)

| Kind | Description |
|------|-------------|
| `expands_to` | Hierarchy — topic branches into keywords/subtasks |
| `prerequisite_for` | Dependency between concepts |
| `from_openalex` | Links keyword/topic → paper |
| `has_keyword` | Paper → extracted keyword |
| `user_linked` | Manual connection |

---

## Core Data Flows

### 1. Question → Mind Graph

```
User types question
  → POST /api/graph/expand
    → OpenAlex: search reviews + articles
    → Fetch detail per hit (topics, keywords, abstracts)
    → Gemini: organize into structured graph (JSON)
    → Attach paper nodes with from_openalex edges
    → mergeDelta → return MindGraph
  → Client: mindGraphToFlow() → React Flow renders
```

### 2. Node Expansion

```
User selects node(s) → "Expand selected (LLM)"
  → POST /api/graph/expand-selection
    → Gemini: generate delta nodes/edges for selection
    → mergeDelta into existing graph
  → Client: updated graph re-renders
```

### 3. Deep Answer (Paper-Grounded Chat)

```
User selects one node → "Deep Answer (LLM)"
  → getAncestorLabels(): walk graph edges upward
    e.g. "Model Aggregation" → includes "Federated Learning"
  → Combined search: "Federated Learning Model Aggregation"

  → POST /api/deep-answer/init
    → OpenAlex: top 10 cited articles (reviews excluded)
    → Store papers in server session
    → Return papers to client sidebar

  → User asks question in chat
  → POST /api/deep-answer/chat
    → Gemini: system prompt with all paper abstracts
    → Multi-turn conversation with citation grounding
    → Returns markdown answer with inline citations
```

### 4. Attach Papers

```
User selects keyword node → enters search query → "Attach papers"
  → POST /api/graph/attach-papers
    → OpenAlex: search top 8 by citation count
    → Create paper nodes + from_openalex edges
    → Merge into existing graph (deduplicated)
```

---

## Key Design Decisions

- **Ancestor-aware search**: Deep Answer collects all parent node labels up to the root, producing contextual queries like "Federated Learning Model Aggregation" instead of just "Model Aggregation"
- **Paper grounding**: Chat answers are grounded in real paper abstracts with inline citations — the LLM cannot invent paper titles
- **Graceful degradation**: Without `GEMINI_API_KEY`, the app falls back to mock graphs and offline stubs
- **Disk cache**: OpenAlex responses are cached for 24 hours to reduce API load
- **Rate limiting**: Strict (20/min) for LLM-heavy endpoints, standard (60/min) for graph operations

---

## External Services

| Service | What We Use | Auth |
|---------|------------|------|
| **Google Gemini** | Graph expansion, keyword extraction, deep answers, paper chat | `GEMINI_API_KEY` |
| **OpenAlex** | Paper search, metadata, abstracts, topics, keywords | `OPENALEX_MAILTO` (polite pool) |

---

## How to Run

```bash
./start.sh
# or manually:
npm install && npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:8787
