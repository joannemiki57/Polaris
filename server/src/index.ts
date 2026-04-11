import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import type { GraphEdge, MindGraph } from "./graphTypes.js";
import type { PaperWithKeywords } from "./llm.js";
import {
  deepAnswer,
  expandFromSelection,
  expandQuestionToGraph,
  extractPaperSectionKeywords,
  mergeDelta,
  organizeKeywordsToGraph,
} from "./llm.js";
import { fetchWorkDetail, fetchWorkKeywords, keywordsToGraphNodes, searchWorks, workHitToPaperNodes } from "./openalex.js";
import { fetchPaperSections, sectionsToGraphNodes } from "./semanticScholar.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });
dotenv.config({ path: path.join(__dirname, "../../.env") });

const app = express();
const PORT = Number(process.env.PORT) || 8787;
const LLM_KEY = process.env.GEMINI_API_KEY ?? process.env.OPENAI_API_KEY;
const LLM_MODEL = process.env.GEMINI_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const LLM_PROVIDER: "gemini" | "openai" = process.env.GEMINI_API_KEY ? "gemini" : "openai";
const OPENALEX_MAILTO = process.env.OPENALEX_MAILTO;
const S2_API_KEY = process.env.S2_API_KEY;

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
    llm: Boolean(LLM_KEY),
    llmProvider: LLM_PROVIDER,
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

    // Hybrid pipeline: fetch real papers, then let LLM organize their topics+abstracts
    const [reviews, articles] = await Promise.all([
      searchWorks(question, OPENALEX_MAILTO, 3, "review"),
      searchWorks(question, OPENALEX_MAILTO, 3, "article"),
    ]);
    const allHits = [...reviews, ...articles];

    // Fetch topics + abstracts for each paper in parallel
    const papersWithKeywords: PaperWithKeywords[] = await Promise.all(
      allHits.map(async (h) => {
        const detail = await fetchWorkDetail(h.id, OPENALEX_MAILTO);
        return {
          id: h.id,
          title: h.title ?? "Untitled",
          isReview: h.type === "review",
          citedByCount: h.cited_by_count ?? 0,
          topics: detail.topics.map((t) => ({
            displayName: t.displayName, score: t.score, subfield: t.subfield,
          })),
          abstract: detail.abstract,
        };
      }),
    );

    // LLM organizes topics + abstracts into a tree (or fallback to pure LLM if no key)
    let keywordGraph: MindGraph;
    if (LLM_KEY && papersWithKeywords.some((p) => p.topics.length > 0 || p.abstract)) {
      keywordGraph = await organizeKeywordsToGraph(
        LLM_KEY, question, papersWithKeywords, LLM_MODEL, LLM_PROVIDER,
      );
    } else {
      keywordGraph = await expandQuestionToGraph(LLM_KEY, question, LLM_MODEL, LLM_PROVIDER);
    }

    // Build paper nodes and attach them to the root topic
    const rootNode = keywordGraph.nodes.find((n) => n.kind === "topic");
    const rootId = rootNode?.id ?? keywordGraph.nodes[0]?.id ?? "root";
    const { nodes: paperNodes, edgeTargets } = workHitToPaperNodes(allHits, rootId);
    // Mark review papers
    for (const pn of paperNodes) {
      const hit = allHits.find((h) => h.id === pn.openAlexId);
      if (hit?.type === "review") pn.isReview = true;
    }
    const paperEdges: GraphEdge[] = edgeTargets.map((t, i) => ({
      id: `init_${t.paperId}_${i}`,
      source: t.sourceId,
      target: t.paperId,
      kind: "from_openalex",
    }));

    const graph = mergeDelta(keywordGraph, { new_nodes: paperNodes, new_edges: paperEdges });
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
      LLM_KEY,
      question,
      selected,
      base,
      LLM_MODEL,
      LLM_PROVIDER,
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
    const text = await deepAnswer(LLM_KEY, question, selected ?? [], LLM_MODEL, LLM_PROVIDER);
    res.json({ markdown: text });
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

app.post("/api/graph/expand-paper-keywords", apiLimiter, async (req, res) => {
  try {
    const base = req.body?.graph as MindGraph | undefined;
    const paperNodeId = String(req.body?.paperNodeId ?? "").trim();
    if (!base || !Array.isArray(base.nodes)) {
      res.status(400).json({ error: "graph with nodes required" });
      return;
    }
    if (!paperNodeId) {
      res.status(400).json({ error: "paperNodeId required" });
      return;
    }
    const paperNode = base.nodes.find((n) => n.id === paperNodeId);
    if (!paperNode?.openAlexId) {
      res.status(400).json({ error: "paper node not found or missing openAlexId" });
      return;
    }

    const detail = await fetchWorkDetail(paperNode.openAlexId, OPENALEX_MAILTO);

    // LLM path: extract section-level keywords from topics + abstract
    if (LLM_KEY && (detail.topics.length > 0 || detail.abstract)) {
      const sectionKws = await extractPaperSectionKeywords(
        LLM_KEY,
        {
          title: paperNode.label,
          topics: detail.topics.map((t) => ({
            displayName: t.displayName,
            score: t.score,
            subfield: t.subfield,
          })),
          abstract: detail.abstract,
        },
        LLM_MODEL,
        LLM_PROVIDER,
      );
      if (sectionKws.length > 0) {
        const existingIds = new Set(base.nodes.map((n) => n.id));
        const newNodes = sectionKws
          .filter((kw) => !existingIds.has(kw.id))
          .map((kw) => ({
            id: kw.id,
            kind: "keyword" as const,
            label: kw.label,
            summary: kw.summary,
          }));
        const newEdges: GraphEdge[] = newNodes.map((n, i) => ({
          id: `sk_${paperNodeId}_${n.id}_${i}`,
          source: paperNodeId,
          target: n.id,
          kind: "has_keyword" as const,
        }));
        const graph = mergeDelta(base, { new_nodes: newNodes, new_edges: newEdges });
        res.json({ graph });
        return;
      }
    }

    // Fallback: raw OpenAlex keywords (if no LLM key or LLM returned nothing)
    const keywords = detail.keywords;
    if (keywords.length === 0) {
      res.json({ graph: base });
      return;
    }
    const { nodes: kwNodes, edges: kwEdges } = keywordsToGraphNodes(keywords, paperNodeId);
    const graph = mergeDelta(base, { new_nodes: kwNodes, new_edges: kwEdges });
    res.json({ graph });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: (e as Error).message });
  }
});

app.post("/api/graph/expand-paper-sections", apiLimiter, async (req, res) => {
  try {
    const base = req.body?.graph as MindGraph | undefined;
    const paperNodeId = String(req.body?.paperNodeId ?? "").trim();
    if (!base || !Array.isArray(base.nodes)) {
      res.status(400).json({ error: "graph with nodes required" });
      return;
    }
    if (!paperNodeId) {
      res.status(400).json({ error: "paperNodeId required" });
      return;
    }
    const paperNode = base.nodes.find((n) => n.id === paperNodeId);
    if (!paperNode) {
      res.status(400).json({ error: "paper node not found" });
      return;
    }
    const title = paperNode.label;
    if (!title) {
      res.status(400).json({ error: "paper node has no title/label" });
      return;
    }
    const sections = await fetchPaperSections(title, undefined, S2_API_KEY);
    if (sections.length === 0) {
      res.json({ graph: base });
      return;
    }
    const { nodes: secNodes, edges: secEdges } = sectionsToGraphNodes(sections, paperNodeId);
    const graph = mergeDelta(base, { new_nodes: secNodes, new_edges: secEdges });
    res.json({ graph });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: (e as Error).message });
  }
});

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
  console.log(`API http://localhost:${PORT} [${LLM_PROVIDER}/${LLM_MODEL}]`);
});
