import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import type { GraphEdge, MindGraph } from "./graphTypes.js";
import {
  chatWithPapers,
  deepAnswer,
  expandFromSelection,
  expandQuestionToGraph,
  type ChatMessage,
} from "./llm.js";
import { searchResearchPapers, searchWorks, workHitToPaperNodes } from "./openalex.js";
import type { OpenAlexWorkDetailed } from "./openalex.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });
dotenv.config({ path: path.join(__dirname, "../../.env") });

const app = express();
const PORT = Number(process.env.PORT) || 8787;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const OPENALEX_MAILTO = process.env.OPENALEX_MAILTO;

app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html><head><meta charset="utf-8"><title>MindGraph API</title></head>
<body style="font-family:system-ui;padding:1.5rem;max-width:40rem">
  <h1>MindGraph API</h1>
  <p>There is no page at <code>/</code>. JSON endpoints live under <code>/api</code>.</p>
  <ul>
    <li><a href="/api/health"><code>GET /api/health</code></a> — status</li>
    <li><code>POST /api/graph/expand</code> — body: <code>{"question":"..."}</code></li>
  </ul>
  <p>Use the web app at <a href="http://localhost:5173">http://localhost:5173</a>; it proxies <code>/api</code> to this server.</p>
</body></html>`);
});

const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

const strictLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    llm: Boolean(GEMINI_KEY),
    openAlexMailto: Boolean(OPENALEX_MAILTO),
  });
});

app.post("/api/graph/expand", apiLimiter, async (req, res) => {
  try {
    const question = String(req.body?.question ?? "").trim();
    if (!question) {
      res.status(400).json({ error: "question required" });
      return;
    }
    const graph = await expandQuestionToGraph(GEMINI_KEY, question, GEMINI_MODEL);
    res.json({ graph });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: (e as Error).message });
  }
});

app.post("/api/graph/expand-selection", apiLimiter, async (req, res) => {
  try {
    const question = String(req.body?.question ?? "").trim();
    const selected = req.body?.selected as
      | { id: string; label: string; kind: string }[]
      | undefined;
    const base = req.body?.graph as MindGraph | undefined;
    if (!question || !Array.isArray(selected) || selected.length === 0) {
      res.status(400).json({ error: "question and selected[] required" });
      return;
    }
    if (!base || !Array.isArray(base.nodes)) {
      res.status(400).json({ error: "graph with nodes required" });
      return;
    }
    const graph = await expandFromSelection(
      GEMINI_KEY,
      question,
      selected,
      base,
      GEMINI_MODEL,
    );
    res.json({ graph });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: (e as Error).message });
  }
});

app.post("/api/llm/deep", strictLimiter, async (req, res) => {
  try {
    const question = String(req.body?.question ?? "").trim();
    const selected = req.body?.selected as
      | { id: string; label: string; summary?: string }[]
      | undefined;
    if (!question) {
      res.status(400).json({ error: "question required" });
      return;
    }
    const text = await deepAnswer(GEMINI_KEY, question, selected ?? [], GEMINI_MODEL);
    res.json({ markdown: text });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// In-memory store for paper sessions (per keyword)
const paperSessions = new Map<string, OpenAlexWorkDetailed[]>();

app.post("/api/deep-answer/init", strictLimiter, async (req, res) => {
  try {
    const keyword = String(req.body?.keyword ?? "").trim();
    if (!keyword) {
      res.status(400).json({ error: "keyword required" });
      return;
    }
    const papers = await searchResearchPapers(keyword, OPENALEX_MAILTO, 10);
    const sessionId = `${keyword}_${Date.now()}`;
    paperSessions.set(sessionId, papers);

    const paperList = papers.map((p) => ({
      title: p.title ?? "Untitled",
      authors: p.authorNames,
      year: p.publication_year,
      doi: p.doi,
      citedByCount: p.cited_by_count,
      abstract: p.abstract,
      openAlexUrl: p.id.startsWith("http") ? p.id : `https://openalex.org/${p.id}`,
    }));

    res.json({ sessionId, keyword, papers: paperList });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: (e as Error).message });
  }
});

app.post("/api/deep-answer/chat", strictLimiter, async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId ?? "").trim();
    const keyword = String(req.body?.keyword ?? "").trim();
    const message = String(req.body?.message ?? "").trim();
    const history = (req.body?.history ?? []) as ChatMessage[];

    if (!sessionId || !keyword || !message) {
      res.status(400).json({ error: "sessionId, keyword, and message required" });
      return;
    }
    const papers = paperSessions.get(sessionId);
    if (!papers) {
      res.status(404).json({ error: "Session expired or not found. Please re-init." });
      return;
    }
    const reply = await chatWithPapers(
      GEMINI_KEY,
      keyword,
      papers,
      history,
      message,
      GEMINI_MODEL,
    );
    res.json({ reply });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: (e as Error).message });
  }
});

app.get("/api/openalex/works", strictLimiter, async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (!q) {
      res.status(400).json({ error: "q required" });
      return;
    }
    const hits = await searchWorks(q, OPENALEX_MAILTO, 10);
    res.json({ results: hits, attribution: "Data from OpenAlex (https://openalex.org)" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Merge paper nodes + edges into an existing graph client-side; server can also return merged graph */
app.post("/api/graph/attach-papers", apiLimiter, async (req, res) => {
  try {
    const base = req.body?.graph as MindGraph | undefined;
    const keywordId = String(req.body?.keywordId ?? "").trim();
    const query = String(req.body?.query ?? "").trim();
    if (!base || !keywordId || !query) {
      res.status(400).json({ error: "graph, keywordId, query required" });
      return;
    }
    const hits = await searchWorks(query, OPENALEX_MAILTO, 8);
    const { nodes: paperNodes, edgeTargets } = workHitToPaperNodes(hits, keywordId);
    const existingIds = new Set(base.nodes.map((n) => n.id));
    const newNodes = paperNodes.filter((n) => !existingIds.has(n.id));
    const newEdges: GraphEdge[] = edgeTargets.map((t, i) => ({
      id: `oa_${t.paperId}_${i}`,
      source: t.sourceId,
      target: t.paperId,
      kind: "from_openalex",
    }));
    const merged: MindGraph = {
      ...base,
      nodes: [...base.nodes, ...newNodes],
      edges: [...base.edges, ...newEdges],
      updatedAt: new Date().toISOString(),
    };
    res.json({
      graph: merged,
      attribution: "Data from OpenAlex (https://openalex.org)",
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: (e as Error).message });
  }
});

app.listen(PORT, () => {
  console.log(`API http://localhost:${PORT}`);
});
