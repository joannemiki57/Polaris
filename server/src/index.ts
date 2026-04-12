import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import type { GraphEdge, MindGraph } from "./graphTypes.js";
import type { PaperWithKeywords } from "./llm.js";
import {
  chatWithPapers,
  deepAnswer,
  expandFromSelection,
  expandQuestionToGraph,
  extractPaperSectionKeywords,
  mergeDelta,
  organizeKeywordsToGraph,
  type ChatMessage,
} from "./llm.js";
import {
  fetchWorkDetail,
  fetchWorkKeywords,
  keywordsToGraphNodes,
  searchResearchPapers,
  searchWorks,
  workHitToPaperNodes,
} from "./openalex.js";
import type { OpenAlexWorkDetailed } from "./openalex.js";
import { fetchPaperSections, sectionsToGraphNodes } from "./semanticScholar.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });
dotenv.config({ path: path.join(__dirname, "../../.env") });

const app = express();
const PORT = Number(process.env.PORT) || 8787;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
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
    if (GEMINI_KEY && papersWithKeywords.some((p) => p.topics.length > 0 || p.abstract)) {
      keywordGraph = await organizeKeywordsToGraph(
        GEMINI_KEY, question, papersWithKeywords, GEMINI_MODEL,
      );
    } else {
      keywordGraph = await expandQuestionToGraph(GEMINI_KEY, question, GEMINI_MODEL);
    }

    res.json({ graph: keywordGraph });
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

type DeepAnswerSession = {
  keyword: string;
  papers: OpenAlexWorkDetailed[];
  /** Next 1-based OpenAlex `page` to fetch for this keyword. */
  nextPage: number;
};

const paperSessions = new Map<string, DeepAnswerSession>();

function toOpenAlexUrl(id: string): string {
  return id.startsWith("http") ? id : `https://openalex.org/${id}`;
}

function slugifyKeyword(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function mapPapersForClient(papers: OpenAlexWorkDetailed[]) {
  return papers.map((p) => ({
    title: p.title ?? "Untitled",
    authors: p.authorNames,
    year: p.publication_year,
    doi: p.doi,
    citedByCount: p.cited_by_count,
    abstract: p.abstract,
    openAlexUrl: toOpenAlexUrl(p.id),
  }));
}

app.post("/api/deep-answer/init", strictLimiter, async (req, res) => {
  try {
    const keyword = String(req.body?.keyword ?? "").trim();
    if (!keyword) {
      res.status(400).json({ error: "keyword required" });
      return;
    }
    const papers = await searchResearchPapers(keyword, OPENALEX_MAILTO, 10, 1);
    const sessionId = `${keyword}_${Date.now()}`;
    paperSessions.set(sessionId, {
      keyword,
      papers: [...papers],
      nextPage: 2,
    });

    res.json({
      sessionId,
      keyword,
      papers: mapPapersForClient(papers),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: (e as Error).message });
  }
});

app.post("/api/deep-answer/more-papers", strictLimiter, async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId ?? "").trim();
    const raw = Number(req.body?.count);
    const count = Number.isFinite(raw) && raw > 0 ? Math.min(50, Math.floor(raw)) : 10;

    if (!sessionId) {
      res.status(400).json({ error: "sessionId required" });
      return;
    }
    const session = paperSessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session expired or not found. Please re-init." });
      return;
    }

    const fetched = await searchResearchPapers(
      session.keyword,
      OPENALEX_MAILTO,
      count,
      session.nextPage,
    );
    const seen = new Set(session.papers.map((p) => p.id));
    let added = 0;
    for (const p of fetched) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        session.papers.push(p);
        added += 1;
      }
    }
    session.nextPage += 1;

    res.json({
      papers: mapPapersForClient(session.papers),
      addedCount: added,
      nextPage: session.nextPage,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: (e as Error).message });
  }
});

app.post("/api/deep-answer/reload-papers", strictLimiter, async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId ?? "").trim();
    const pinnedOpenAlexUrls = Array.isArray(req.body?.pinnedOpenAlexUrls)
      ? req.body.pinnedOpenAlexUrls.map((v: unknown) => String(v).trim()).filter(Boolean)
      : [];
    const rawCount = Number(req.body?.count);

    if (!sessionId) {
      res.status(400).json({ error: "sessionId required" });
      return;
    }

    const session = paperSessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session expired or not found. Please re-init." });
      return;
    }

    const targetCount = Number.isFinite(rawCount) && rawCount > 0
      ? Math.min(200, Math.floor(rawCount))
      : session.papers.length;

    const working = session.papers.slice(0, Math.max(0, targetCount));
    const pinnedSet = new Set(pinnedOpenAlexUrls);
    const isPinned = (p: OpenAlexWorkDetailed) => pinnedSet.has(toOpenAlexUrl(p.id));

    const pinnedCount = working.filter(isPinned).length;
    const replacementSlots = Math.max(0, working.length - pinnedCount);

    const seen = new Set(session.papers.map((p) => p.id));
    const replacements: OpenAlexWorkDetailed[] = [];
    const perPage = Math.min(50, Math.max(10, replacementSlots));
    let attempts = 0;
    while (replacements.length < replacementSlots && attempts < 30) {
      const fetched = await searchResearchPapers(
        session.keyword,
        OPENALEX_MAILTO,
        perPage,
        session.nextPage,
      );
      session.nextPage += 1;
      attempts += 1;

      if (fetched.length === 0) break;

      for (const paper of fetched) {
        if (!seen.has(paper.id)) {
          seen.add(paper.id);
          replacements.push(paper);
          if (replacements.length >= replacementSlots) break;
        }
      }
    }

    const reloaded: OpenAlexWorkDetailed[] = [];
    let replacementIndex = 0;
    for (const paper of working) {
      if (isPinned(paper)) {
        reloaded.push(paper);
        continue;
      }

      const nextPaper = replacements[replacementIndex];
      if (nextPaper) {
        reloaded.push(nextPaper);
        replacementIndex += 1;
      } else {
        // Keep the original paper if OpenAlex cannot provide enough unseen papers.
        reloaded.push(paper);
      }
    }

    session.papers = reloaded;

    res.json({
      papers: mapPapersForClient(session.papers),
      replacedCount: replacementIndex,
      keptPinnedCount: pinnedCount,
      nextPage: session.nextPage,
    });
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
    const session = paperSessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session expired or not found. Please re-init." });
      return;
    }
    const reply = await chatWithPapers(
      GEMINI_KEY,
      keyword,
      session.papers,
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
    if (GEMINI_KEY && (detail.topics.length > 0 || detail.abstract)) {
      const sectionKws = await extractPaperSectionKeywords(
        GEMINI_KEY,
        {
          title: paperNode.label,
          topics: detail.topics.map((t) => ({
            displayName: t.displayName,
            score: t.score,
            subfield: t.subfield,
          })),
          abstract: detail.abstract,
        },
        GEMINI_MODEL,
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

    // Fallback: raw OpenAlex keywords
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

app.post("/api/graph/keywords-from-starred-papers", apiLimiter, async (req, res) => {
  try {
    const base = req.body?.graph as MindGraph | undefined;
    const attachToNodeId = String(req.body?.attachToNodeId ?? "").trim();
    const sessionId = String(req.body?.sessionId ?? "").trim();
    const starredOpenAlexUrls = Array.isArray(req.body?.starredOpenAlexUrls)
      ? req.body.starredOpenAlexUrls.map((v: unknown) => String(v).trim()).filter(Boolean)
      : [];

    if (!base || !Array.isArray(base.nodes)) {
      res.status(400).json({ error: "graph with nodes required" });
      return;
    }
    if (!attachToNodeId) {
      res.status(400).json({ error: "attachToNodeId required" });
      return;
    }
    if (!sessionId) {
      res.status(400).json({ error: "sessionId required" });
      return;
    }
    if (starredOpenAlexUrls.length === 0) {
      res.status(400).json({ error: "starredOpenAlexUrls required" });
      return;
    }

    const attachNode = base.nodes.find((n) => n.id === attachToNodeId);
    if (!attachNode) {
      res.status(400).json({ error: "attach target node not found" });
      return;
    }

    const session = paperSessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session expired or not found. Please re-init." });
      return;
    }

    const starredSet = new Set(starredOpenAlexUrls);
    const starredPapers = session.papers.filter((p) => starredSet.has(toOpenAlexUrl(p.id))).slice(0, 12);
    if (starredPapers.length === 0) {
      res.status(400).json({ error: "No starred papers matched this session" });
      return;
    }

    type KeywordCandidate = { label: string; summary: string; score: number };
    const candidates = new Map<string, KeywordCandidate>();
    const putCandidate = (label: string, summary: string, weight = 1) => {
      const norm = label.trim().toLowerCase();
      if (!norm) return;
      const prev = candidates.get(norm);
      if (prev) {
        prev.score += weight;
        if (summary.length > prev.summary.length) prev.summary = summary;
        return;
      }
      candidates.set(norm, {
        label: label.trim(),
        summary: summary.trim() || "Keyword extracted from starred papers.",
        score: weight,
      });
    };

    for (const paper of starredPapers) {
      const title = paper.title ?? "Untitled";

      try {
        const sections = await fetchPaperSections(title, undefined, S2_API_KEY);
        for (const sec of sections.slice(0, 8)) {
          putCandidate(
            sec.name,
            `Section heading in starred paper \"${title}\" (${sec.snippetCount} snippets).`,
            2,
          );
        }
      } catch {
        // Section API may fail for some papers; continue with other sources.
      }

      try {
        const detail = await fetchWorkDetail(paper.id, OPENALEX_MAILTO);

        for (const topic of detail.topics.slice(0, 8)) {
          putCandidate(
            topic.displayName,
            topic.subfield
              ? `OpenAlex topic from subfield: ${topic.subfield}.`
              : "OpenAlex topic from starred papers.",
            1,
          );
        }

        if (GEMINI_KEY && (detail.topics.length > 0 || detail.abstract)) {
          try {
            const llmKeywords = await extractPaperSectionKeywords(
              GEMINI_KEY,
              {
                title,
                topics: detail.topics.map((t) => ({
                  displayName: t.displayName,
                  score: t.score,
                  subfield: t.subfield,
                })),
                abstract: detail.abstract,
              },
              GEMINI_MODEL,
            );
            for (const kw of llmKeywords.slice(0, 10)) {
              putCandidate(kw.label, kw.summary, 3);
            }
          } catch {
            // LLM extraction may fail for some papers; keep deterministic candidates.
          }
        }
      } catch {
        // OpenAlex detail call may fail for some papers.
      }
    }

    const ranked = [...candidates.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 24);

    if (ranked.length === 0) {
      res.json({ graph: base, keywordCount: 0, usedPapers: starredPapers.length });
      return;
    }

    const existingIds = new Set(base.nodes.map((n) => n.id));
    const newNodes = ranked.map((kw, idx) => {
      const seed = slugifyKeyword(kw.label) || `kw_${idx}`;
      let nodeId = `star_kw_${seed}`;
      let bump = 1;
      while (existingIds.has(nodeId)) {
        nodeId = `star_kw_${seed}_${bump}`;
        bump += 1;
      }
      existingIds.add(nodeId);
      return {
        id: nodeId,
        kind: "keyword" as const,
        label: kw.label,
        summary: kw.summary,
      };
    });

    const newEdges: GraphEdge[] = newNodes.map((n, i) => ({
      id: `spk_${attachToNodeId}_${n.id}_${i}`,
      source: attachToNodeId,
      target: n.id,
      kind: "has_keyword",
    }));

    const graph = mergeDelta(base, { new_nodes: newNodes, new_edges: newEdges });
    res.json({
      graph,
      keywordCount: newNodes.length,
      usedPapers: starredPapers.length,
    });
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
  console.log(`API http://localhost:${PORT} [gemini/${GEMINI_MODEL}]`);
});
