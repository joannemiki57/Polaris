# Polaris API Endpoints

This document describes every HTTP endpoint implemented by the Polaris server.

## Base information

- Base URL (local): http://localhost:8787
- Content type: application/json for all API endpoints under /api
- Auth: none (no bearer token required)

## Rate limits

- Standard limiter (60 requests/minute):
  - POST /api/graph/expand
  - POST /api/graph/expand-selection
  - POST /api/graph/expand-paper-keywords
  - POST /api/graph/expand-paper-sections
  - POST /api/graph/attach-papers
- Strict limiter (20 requests/minute):
  - POST /api/llm/deep
  - POST /api/deep-answer/init
  - POST /api/deep-answer/more-papers
  - POST /api/deep-answer/chat
  - GET /api/openalex/works

When a rate limit is exceeded, the server responds with HTTP 429.

## Shared schema

### MindGraph

```ts
type NodeKind = "topic" | "keyword" | "subtask" | "paper" | "note";

type EdgeKind =
  | "expands_to"
  | "prerequisite_for"
  | "from_openalex"
  | "has_keyword"
  | "has_section"
  | "user_linked";

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

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
}

interface MindGraph {
  version: 1;
  title: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  updatedAt: string;
}
```

## Endpoint reference

## GET /

Health/info HTML page for humans.

- Response: text/html
- Notes: links to /api/health and hints for /api/graph/expand

## GET /api/health

Returns runtime health and feature availability.

- Request body: none
- Response 200:

```json
{
  "ok": true,
  "llm": true,
  "openAlexMailto": true
}
```

Field meanings:

- ok: server is up
- llm: GEMINI_API_KEY is configured
- openAlexMailto: OPENALEX_MAILTO is configured

## POST /api/graph/expand

Creates an initial graph from a research question.

- Rate limit: 60/min
- Request body:

```json
{
  "question": "federated learning privacy"
}
```

- Required fields:
  - question (string, non-empty)
- Response 200:

```json
{
  "graph": {
    "version": 1,
    "title": "...",
    "nodes": [],
    "edges": [],
    "updatedAt": "2026-04-12T12:34:56.000Z"
  }
}
```

- Error responses:
  - 400: { "error": "question required" }
  - 500: { "error": "..." }

Notes:

- Pipeline combines OpenAlex search + detail fetch with Gemini organization.
- If no Gemini key is set, server falls back to mock/offline graph expansion logic.

## POST /api/graph/expand-selection

Expands selected nodes in an existing graph.

- Rate limit: 60/min
- Request body:

```json
{
  "question": "federated learning privacy",
  "selected": [
    { "id": "kw_secure_aggregation", "label": "Secure Aggregation", "kind": "keyword" }
  ],
  "graph": {
    "version": 1,
    "title": "...",
    "nodes": [],
    "edges": [],
    "updatedAt": "2026-04-12T12:34:56.000Z"
  }
}
```

- Required fields:
  - question (string, non-empty)
  - selected (non-empty array)
  - graph with nodes array
- Response 200:

```json
{
  "graph": {
    "version": 1,
    "title": "...",
    "nodes": [],
    "edges": [],
    "updatedAt": "2026-04-12T12:34:56.000Z"
  }
}
```

- Error responses:
  - 400: { "error": "question and selected[] required" }
  - 400: { "error": "graph with nodes required" }
  - 500: { "error": "..." }

## POST /api/llm/deep

Generates a deep markdown answer from question + selected nodes.

- Rate limit: 20/min
- Request body:

```json
{
  "question": "How does secure aggregation work with non-IID data?",
  "selected": [
    {
      "id": "kw_secure_aggregation",
      "label": "Secure Aggregation",
      "summary": "Protects individual client updates during aggregation"
    }
  ]
}
```

- Required fields:
  - question (string, non-empty)
  - selected (array, can be empty)
- Response 200:

```json
{
  "markdown": "## ..."
}
```

- Error responses:
  - 400: { "error": "question required" }
  - 500: { "error": "..." }

## POST /api/deep-answer/init

Starts a paper-grounded deep-answer session for one keyword.

- Rate limit: 20/min
- Request body:

```json
{
  "keyword": "secure aggregation"
}
```

- Required fields:
  - keyword (string, non-empty)
- Response 200:

```json
{
  "sessionId": "secure aggregation_1712930000000",
  "keyword": "secure aggregation",
  "papers": [
    {
      "title": "...",
      "authors": ["Alice", "Bob"],
      "year": 2024,
      "doi": "10.1234/example",
      "citedByCount": 120,
      "abstract": "...",
      "openAlexUrl": "https://openalex.org/W1234567890"
    }
  ]
}
```

- Error responses:
  - 400: { "error": "keyword required" }
  - 500: { "error": "..." }

## POST /api/deep-answer/more-papers

Fetches additional papers for an existing deep-answer session.

- Rate limit: 20/min
- Request body:

```json
{
  "sessionId": "secure aggregation_1712930000000",
  "count": 10
}
```

Field rules:

- sessionId is required
- count is optional; defaults to 10; max 50

- Response 200:

```json
{
  "papers": [],
  "addedCount": 8,
  "nextPage": 3
}
```

- Error responses:
  - 400: { "error": "sessionId required" }
  - 404: { "error": "Session expired or not found. Please re-init." }
  - 500: { "error": "..." }

## POST /api/deep-answer/chat

Sends a chat message in a deep-answer session grounded in the session paper set.

- Rate limit: 20/min
- Request body:

```json
{
  "sessionId": "secure aggregation_1712930000000",
  "keyword": "secure aggregation",
  "message": "Compare secure aggregation approaches in practice",
  "history": [
    { "role": "user", "text": "What is secure aggregation?" },
    { "role": "assistant", "text": "..." }
  ]
}
```

- Required fields:
  - sessionId (string, non-empty)
  - keyword (string, non-empty)
  - message (string, non-empty)
  - history (array; defaults to [])
- Response 200:

```json
{
  "reply": "## ..."
}
```

- Error responses:
  - 400: { "error": "sessionId, keyword, and message required" }
  - 404: { "error": "Session expired or not found. Please re-init." }
  - 500: { "error": "..." }

## GET /api/openalex/works

Lightweight OpenAlex passthrough search endpoint.

- Rate limit: 20/min
- Query params:
  - q (required string)
- Example request:
  - /api/openalex/works?q=federated%20learning
- Response 200:

```json
{
  "results": [
    {
      "id": "https://openalex.org/W1234567890",
      "title": "...",
      "publication_year": 2023,
      "cited_by_count": 421,
      "doi": "10.1234/example",
      "type": "article"
    }
  ],
  "attribution": "Data from OpenAlex (https://openalex.org)"
}
```

- Error responses:
  - 400: { "error": "q required" }
  - 500: { "error": "..." }

## POST /api/graph/expand-paper-keywords

Expands one paper node into keyword nodes.

- Rate limit: 60/min
- Request body:

```json
{
  "graph": {
    "version": 1,
    "title": "...",
    "nodes": [],
    "edges": [],
    "updatedAt": "2026-04-12T12:34:56.000Z"
  },
  "paperNodeId": "paper_W1234567890"
}
```

- Required fields:
  - graph with nodes array
  - paperNodeId (string, non-empty)
- Response 200:

```json
{
  "graph": {
    "version": 1,
    "title": "...",
    "nodes": [],
    "edges": [],
    "updatedAt": "2026-04-12T12:34:56.000Z"
  }
}
```

- Error responses:
  - 400: { "error": "graph with nodes required" }
  - 400: { "error": "paperNodeId required" }
  - 400: { "error": "paper node not found or missing openAlexId" }
  - 500: { "error": "..." }

Notes:

- Primary path uses LLM section-keyword extraction from OpenAlex topics + abstract.
- Fallback path uses raw OpenAlex keywords if LLM path is unavailable or empty.

## POST /api/graph/expand-paper-sections

Expands one paper node using section headings from Semantic Scholar snippet search.

- Rate limit: 60/min
- Request body:

```json
{
  "graph": {
    "version": 1,
    "title": "...",
    "nodes": [],
    "edges": [],
    "updatedAt": "2026-04-12T12:34:56.000Z"
  },
  "paperNodeId": "paper_W1234567890"
}
```

- Required fields:
  - graph with nodes array
  - paperNodeId (string, non-empty)
  - target paper node must exist and have label/title
- Response 200:

```json
{
  "graph": {
    "version": 1,
    "title": "...",
    "nodes": [],
    "edges": [],
    "updatedAt": "2026-04-12T12:34:56.000Z"
  }
}
```

- Error responses:
  - 400: { "error": "graph with nodes required" }
  - 400: { "error": "paperNodeId required" }
  - 400: { "error": "paper node not found" }
  - 400: { "error": "paper node has no title/label" }
  - 500: { "error": "..." }

## POST /api/graph/attach-papers

Searches OpenAlex and attaches paper nodes to a keyword node.

- Rate limit: 60/min
- Request body:

```json
{
  "graph": {
    "version": 1,
    "title": "...",
    "nodes": [],
    "edges": [],
    "updatedAt": "2026-04-12T12:34:56.000Z"
  },
  "keywordId": "kw_secure_aggregation",
  "query": "secure aggregation federated learning"
}
```

- Required fields:
  - graph
  - keywordId (string, non-empty)
  - query (string, non-empty)
- Response 200:

```json
{
  "graph": {
    "version": 1,
    "title": "...",
    "nodes": [],
    "edges": [],
    "updatedAt": "2026-04-12T12:34:56.000Z"
  },
  "attribution": "Data from OpenAlex (https://openalex.org)"
}
```

- Error responses:
  - 400: { "error": "graph, keywordId, query required" }
  - 500: { "error": "..." }

## Error format

Most failure responses use this shape:

```json
{
  "error": "human-readable message"
}
```

Common HTTP status codes:

- 400: missing/invalid request fields
- 404: deep-answer session not found/expired
- 429: rate limit exceeded
- 500: upstream/service/internal failures
