import { GoogleGenerativeAI } from "@google/generative-ai";
import type { GraphEdge, GraphNode, MindGraph } from "./graphTypes.js";
import type { OpenAlexWorkDetailed } from "./openalex.js";

const EXPAND_SCHEMA_HINT = `Return ONLY valid JSON with this shape (no markdown fences):
{
  "title": "short session title",
  "nodes": [
    { "id": "stable_snake_id", "kind": "topic"|"keyword"|"subtask", "label": "...", "summary": "one sentence" }
  ],
  "edges": [
    { "id": "e1", "source": "parent_id", "target": "child_id", "kind": "expands_to"|"prerequisite_for"|"user_linked" }
  ]
}
Rules:
- Exactly one node with kind "topic" as the root concept for the user's question.
- 10–18 additional nodes: mix keyword and subtask; labels under 6 words when possible.
- Edges must connect the topic to major branches and show dependencies where useful.
- Use ASCII ids like fl_privacy, secure_aggregation.`;

const DEEP_SYSTEM = `You are a careful tutor. Answer clearly in Markdown. If uncertain, say so. Do not invent paper titles.`;

function mockExpand(question: string): MindGraph {
  const rootId = "root_topic";
  const nodes: GraphNode[] = [
    {
      id: rootId,
      kind: "topic",
      label: question.slice(0, 80) || "Topic",
      summary: "Exploration root (offline mock — set GEMINI_API_KEY for live expansion).",
    },
    {
      id: "kw_related",
      kind: "keyword",
      label: "Related concepts",
      summary: "Pick nodes to branch deeper.",
    },
    {
      id: "st_breakdown",
      kind: "subtask",
      label: "Break into steps",
      summary: "Define data, model, evaluation, deployment.",
    },
    {
      id: "kw_sources",
      kind: "keyword",
      label: "Literature",
      summary: "Use OpenAlex search from the side panel.",
    },
  ];
  const edges: GraphEdge[] = [
    { id: "e1", source: rootId, target: "kw_related", kind: "expands_to" },
    { id: "e2", source: rootId, target: "st_breakdown", kind: "expands_to" },
    { id: "e3", source: rootId, target: "kw_sources", kind: "expands_to" },
  ];
  return {
    version: 1,
    title: "Mock graph",
    nodes,
    edges,
    updatedAt: new Date().toISOString(),
  };
}

function stripFences(raw: string): string {
  return raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
}

function parseMindGraph(raw: string): MindGraph {
  const data = JSON.parse(stripFences(raw)) as {
    title?: string;
    nodes?: GraphNode[];
    edges?: GraphEdge[];
  };
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error("Invalid graph JSON from model");
  }
  return {
    version: 1,
    title: data.title ?? "Untitled",
    nodes: data.nodes,
    edges: data.edges,
    updatedAt: new Date().toISOString(),
  };
}

const _geminiCache = new Map<string, ReturnType<GoogleGenerativeAI["getGenerativeModel"]>>();

function getGemini(apiKey: string, model: string) {
  const key = `${apiKey}:${model}`;
  let cached = _geminiCache.get(key);
  if (!cached) {
    const genAI = new GoogleGenerativeAI(apiKey);
    cached = genAI.getGenerativeModel({ model });
    _geminiCache.set(key, cached);
  }
  return cached;
}

/** Shape we pass to `generateContent` everywhere in this module (structured chat + optional JSON mode). */
type PolarisGenerateContentRequest = {
  contents: Array<{
    role: "user" | "model";
    parts: { text: string }[];
  }>;
  generationConfig?: {
    temperature?: number;
    responseMimeType?: string;
  };
};

type GeminiGenerateArg = Parameters<ReturnType<typeof getGemini>["generateContent"]>[0];

type LlmStep =
  | { provider: "gemini"; model: string }
  | { provider: "openai"; model: string };

function buildLlmFallbackChain(primaryGeminiModel: string): LlmStep[] {
  const openaiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  const openaiModel = (process.env.OPENAI_MODEL ?? "gpt-4o-mini").trim() || "gpt-4o-mini";
  const tertiary =
    (process.env.GEMINI_TERTIARY_MODEL ?? "gemini-3-flash-preview").trim() ||
    "gemini-3-flash-preview";

  const steps: LlmStep[] = [{ provider: "gemini", model: primaryGeminiModel }];
  if (openaiKey) steps.push({ provider: "openai", model: openaiModel });
  if (tertiary !== primaryGeminiModel) {
    steps.push({ provider: "gemini", model: tertiary });
  }
  return steps;
}

function stepLabel(step: LlmStep): string {
  return step.provider === "gemini" ? `gemini/${step.model}` : `openai/${step.model}`;
}

function getErrorStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  if (!("status" in err)) return undefined;
  const value = (err as { status?: unknown }).status;
  return typeof value === "number" ? value : undefined;
}

function isCapacityOrTransientError(err: unknown): boolean {
  const status = getErrorStatus(err);
  if (status === 503 || status === 429 || status === 502 || status === 404) return true;
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /(high demand|service unavailable|temporar|overload|resource_exhausted|rate limit|no longer available|not found|503|429|502|404|overloaded|timeout)/i.test(
    message,
  );
}

async function generateOpenAIChat(
  apiKey: string,
  model: string,
  request: PolarisGenerateContentRequest,
): Promise<string> {
  const gen = request.generationConfig ?? {};
  const temperature = typeof gen.temperature === "number" ? gen.temperature : 0.7;
  const wantJson = gen.responseMimeType === "application/json";

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [];
  if (wantJson) {
    messages.push({
      role: "system",
      content:
        "You must respond with only a single valid JSON object (no markdown fences, no commentary).",
    });
  }
  for (const block of request.contents) {
    const text = block.parts.map((p: { text: string }) => p.text).join("\n");
    const role = block.role === "user" ? "user" : "assistant";
    messages.push({ role, content: text });
  }

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
  };
  if (wantJson) body.response_format = { type: "json_object" };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) {
    const err = new Error(`OpenAI ${res.status}: ${raw.slice(0, 400)}`);
    Object.assign(err, { status: res.status });
    throw err;
  }
  let json: { choices?: { message?: { content?: string | null } }[] };
  try {
    json = JSON.parse(raw) as { choices?: { message?: { content?: string | null } }[] };
  } catch {
    throw new Error("OpenAI: invalid JSON response");
  }
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`Empty OpenAI response from ${model}`);
  return text;
}

async function generateTextWithFallback(
  geminiApiKey: string,
  primaryModel: string,
  request: PolarisGenerateContentRequest,
): Promise<string> {
  const steps = buildLlmFallbackChain(primaryModel);
  const openaiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  let lastError: unknown;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const hasNext = i < steps.length - 1;
    try {
      let text: string;
      if (step.provider === "gemini") {
        const gemini = getGemini(geminiApiKey, step.model);
        const result = await gemini.generateContent(request as GeminiGenerateArg);
        text = result.response.text() ?? "";
        if (!text) throw new Error(`Empty Gemini response from ${step.model}`);
      } else {
        if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");
        text = await generateOpenAIChat(openaiKey, step.model, request);
      }
      if (i > 0) {
        console.warn(
          `[llm] fallback succeeded: ${stepLabel(step)} (primary was ${stepLabel(steps[0]!)})`,
        );
      }
      return text;
    } catch (err) {
      lastError = err;
      if (!hasNext || !isCapacityOrTransientError(err)) throw err;
      console.warn(
        `[llm] ${stepLabel(step)} failed (${err instanceof Error ? err.message : String(err)}); trying ${stepLabel(steps[i + 1]!)}`,
      );
    }
  }

  throw lastError instanceof Error ? lastError : new Error("LLM request failed");
}

export async function expandQuestionToGraph(
  apiKey: string | undefined,
  question: string,
  model: string,
): Promise<MindGraph> {
  if (!apiKey) return mockExpand(question);

  const text = await generateTextWithFallback(apiKey, model, {
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              "You expand user questions into a concise knowledge graph for UI rendering. " +
              EXPAND_SCHEMA_HINT +
              "\n\nUser question: " +
              question,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      responseMimeType: "application/json",
    },
  });
  return parseMindGraph(text);
}

/* ── Hybrid pipeline: organize real paper topics into a graph ── */

export interface PaperWithKeywords {
  id: string;
  title: string;
  isReview: boolean;
  citedByCount: number;
  topics: { displayName: string; score: number; subfield: string }[];
  abstract: string | null;
}

const ORGANIZE_SCHEMA_HINT = `Return ONLY valid JSON with this shape (no markdown fences):
{
  "title": "short session title",
  "nodes": [
    { "id": "stable_snake_id", "kind": "topic"|"keyword", "label": "...", "summary": "one sentence" }
  ],
  "edges": [
    { "id": "e1", "source": "parent_id", "target": "child_id", "kind": "expands_to"|"prerequisite_for" }
  ]
}
Rules:
- Exactly one node with kind "topic" as the root concept for the user's question.
- Extract specific, research-level keywords from the paper topics and abstracts.
- Focus on SPECIFIC concepts (e.g., "differential privacy", "model aggregation", "gradient compression") NOT generic disciplines (e.g., "computer science", "engineering", "AI").
- Group related keywords hierarchically under thematic branches.
- Use "expands_to" edges for parent→child and "prerequisite_for" where logical.
- Use ASCII snake_case ids derived from the keyword label.
- Aim for 10–20 keyword nodes organized in 2–3 levels of depth.`;

export async function organizeKeywordsToGraph(
  apiKey: string,
  question: string,
  papers: PaperWithKeywords[],
  model: string,
): Promise<MindGraph> {
  function formatPaper(p: PaperWithKeywords): string {
    const topics = p.topics
      .slice(0, 5)
      .map((t) => `${t.displayName} [${t.subfield}] (${(t.score * 100).toFixed(0)}%)`)
      .join(", ");
    const abs = p.abstract ? `\n  Abstract: ${p.abstract.slice(0, 200)}` : "";
    return `- "${p.title}" [${p.citedByCount} citations]\n  Topics: ${topics || "(none)"}${abs}`;
  }

  const reviewSection = papers.filter((p) => p.isReview).map(formatPaper).join("\n");
  const articleSection = papers.filter((p) => !p.isReview).map(formatPaper).join("\n");

  const userContent = `Question: ${question}

REVIEW PAPERS (literature reviews):
${reviewSection || "(none found)"}

TOP-CITED RESEARCH ARTICLES:
${articleSection || "(none found)"}

From the topics and abstracts above, extract specific research-level keywords and organize them into a structured knowledge tree. Avoid generic terms like "computer science", "AI", "engineering" — focus on concepts that would inspire a researcher exploring "${question}".`;

  const text = await generateTextWithFallback(apiKey, model, {
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              "You organize real research concepts (from OpenAlex paper topics and abstracts) into a knowledge graph for UI rendering. " +
              ORGANIZE_SCHEMA_HINT +
              "\n\n" +
              userContent,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      responseMimeType: "application/json",
    },
  });
  return parseMindGraph(text);
}

/* ── Delta expansion ── */

function getAncestry(
  base: MindGraph,
  nodeId: string,
  maxDepth = 2,
): { id: string; label: string; kind: string }[] {
  const ancestors: { id: string; label: string; kind: string }[] = [];
  let current = nodeId;
  for (let depth = 0; depth < maxDepth; depth++) {
    const parentEdge = base.edges.find((e) => e.target === current);
    if (!parentEdge) break;
    const parentNode = base.nodes.find((n) => n.id === parentEdge.source);
    if (!parentNode) break;
    ancestors.push({ id: parentNode.id, label: parentNode.label, kind: parentNode.kind });
    current = parentNode.id;
  }
  return ancestors;
}

function deltaExpansionHint(sparsePapers: boolean): string {
  const overlapRule = sparsePapers
    ? "Paper context is sparse or missing usable abstracts: still return 3–5 concrete keyword nodes grounded in the SELECTED node labels, ancestry, and the user's original question. Use abstracts when they exist; you do NOT need a concept to appear in 2+ abstracts."
    : "Analyze the paper abstracts and identify RECURRING / OVERLAPPING concepts that appear across MULTIPLE papers. Prefer concepts that appear in 2+ abstracts when possible.";

  return `Return ONLY valid JSON (no markdown fences):
{
  "new_nodes": [
    { "id": "unique_id", "kind": "keyword", "label": "...", "summary": "one sentence" }
  ],
  "new_edges": [
    { "id": "e_unique", "source": "selected_node_id", "target": "new_keyword_id", "kind": "expands_to" }
  ]
}
Rules:
- ${overlapRule}
- Return at least 2 and at most 5 keyword nodes (never return an empty new_nodes array).
- Each keyword must be a specific research-level concept (e.g., "gradient compression", "non-IID data"), NOT generic terms like "computer science", "AI", "methods".
- Summaries should cite paper titles when abstracts exist; otherwise tie the keyword to the selected labels.
- new_edges: source MUST be one of the selected node ids from the JSON payload below; target MUST be an id from new_nodes. Prefer kind "expands_to" (parent selected → child keyword).
- Every new_nodes id must be new and MUST NOT appear in existingNodeIds from the payload.
- Use ASCII snake_case ids derived from the keyword label.`;
}

function parseDelta(raw: string): { new_nodes: GraphNode[]; new_edges: GraphEdge[] } {
  const data = JSON.parse(stripFences(raw)) as {
    new_nodes?: GraphNode[];
    new_edges?: GraphEdge[];
  };
  return {
    new_nodes: Array.isArray(data.new_nodes) ? data.new_nodes : [],
    new_edges: Array.isArray(data.new_edges) ? data.new_edges : [],
  };
}

export function mergeDelta(
  base: MindGraph,
  delta: { new_nodes: GraphNode[]; new_edges: GraphEdge[] },
): MindGraph {
  const ids = new Set(base.nodes.map((n) => n.id));
  const nodes = [...base.nodes];
  for (const n of delta.new_nodes) {
    if (!ids.has(n.id)) {
      ids.add(n.id);
      nodes.push(n);
    }
  }
  const eids = new Set(base.edges.map((e) => e.id));
  const edges = [...base.edges];
  for (const e of delta.new_edges) {
    if (!eids.has(e.id)) {
      eids.add(e.id);
      edges.push(e);
    }
  }
  return { ...base, nodes, edges, updatedAt: new Date().toISOString() };
}

export async function expandFromSelection(
  apiKey: string | undefined,
  question: string,
  selected: { id: string; label: string; kind: string }[],
  base: MindGraph,
  papers: OpenAlexWorkDetailed[],
  model: string,
): Promise<MindGraph> {
  if (!apiKey) {
    const extra: GraphNode[] = selected.map((s, i) => ({
      id: `sel_${s.id.replace(/[^a-zA-Z0-9_]/g, "_")}_${i}`,
      kind: "keyword" as const,
      label: `Dive: ${s.label}`,
      summary: "Mock child from selection.",
    }));
    const edges: GraphEdge[] = selected.map((s, i) => ({
      id: `me_${s.id}_${i}`,
      source: s.id,
      target: extra[i]!.id,
      kind: "expands_to" as const,
    }));
    return mergeDelta(base, { new_nodes: extra, new_edges: edges });
  }

  const selectedWithAncestry = selected.map((s) => {
    const ancestors = getAncestry(base, s.id);
    return {
      ...s,
      ancestry: ancestors.map((a) => a.label),
    };
  });

  // Format papers for the prompt
  const paperSection = papers
    .map((p, i) => {
      const abs = p.abstract ? `\n  Abstract: ${p.abstract.slice(0, 500)}` : "";
      return `[Paper ${i + 1}] "${p.title ?? "Untitled"}" (${p.cited_by_count ?? 0} citations, ${p.publication_year ?? "?"})${abs}`;
    })
    .join("\n\n");

  const payload = JSON.stringify({
    originalQuestion: question,
    selected: selectedWithAncestry,
    existingNodeIds: base.nodes.map((n) => n.id),
  });
  const userContent = `${payload}

RESEARCH PAPERS (top-cited articles from OpenAlex for the selected keywords):

${paperSection || "(no papers found)"}

Produce keywords that help the user explore "${question}" from the selected nodes.`;

  const abstractsUsable = papers.filter((p) => (p.abstract?.trim().length ?? 0) > 80).length;
  const sparsePapers = papers.length === 0 || abstractsUsable < 2;
  const intro = sparsePapers
    ? "You expand a knowledge graph from selected nodes. When OpenAlex returns few or shallow abstracts, still propose specific research keywords—do not return an empty graph fragment. "
    : "You analyze research papers to discover OVERLAPPING, RECURRING keywords across multiple papers. ";

  const text = await generateTextWithFallback(apiKey, model, {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: intro + deltaExpansionHint(sparsePapers) + "\n\n" + userContent,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });
  const delta = parseDelta(text);
  if (delta.new_nodes.length > 0) {
    return mergeDelta(base, delta);
  }

  if (apiKey) {
    console.warn(
      "[llm] expandFromSelection: empty new_nodes (sparsePapers=%s paperCount=%s); applying keyword stubs",
      sparsePapers,
      papers.length,
    );
  }
  const stamp = Date.now();
  const extra: GraphNode[] = selected.map((s, i) => ({
    id: `expand_fb_${stamp}_${i}_${s.id.replace(/[^a-zA-Z0-9_]/g, "_")}`,
    kind: "keyword" as const,
    label: `Explore: ${s.label}`.slice(0, 80),
    summary: "Auto-added because the model returned no nodes — try expanding again or adjust selection.",
  }));
  const stubEdges: GraphEdge[] = selected.map((s, i) => ({
    id: `expand_fb_e_${stamp}_${i}`,
    source: s.id,
    target: extra[i]!.id,
    kind: "expands_to" as const,
  }));
  return mergeDelta(base, { new_nodes: extra, new_edges: stubEdges });
}

/* ── Deep answer ── */

export async function deepAnswer(
  apiKey: string | undefined,
  question: string,
  selected: { id: string; label: string; summary?: string }[],
  model: string,
): Promise<string> {
  const ctx = selected.map((s) => `- ${s.label}: ${s.summary ?? ""}`).join("\n");
  const user = `Original question:\n${question}\n\nSelected focus:\n${ctx}\n\nGive a structured deep answer.`;

  if (!apiKey) {
    return (
      `## Offline mode\n\n` +
      `Set **GEMINI_API_KEY** on the server for live answers.\n\n` +
      `### Focus\n${ctx || "(none)"}\n\n` +
      `### Sketch\n- Define terms\n- Compare approaches\n- Note risks & evaluation\n`
    );
  }

  const text = await generateTextWithFallback(apiKey, model, {
    contents: [
      {
        role: "user",
        parts: [{ text: DEEP_SYSTEM + "\n\n" + user }],
      },
    ],
    generationConfig: { temperature: 0.5 },
  });
  return text;
}

/* ── Deep Answer: chat grounded in papers ── */

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

function buildPaperContext(papers: OpenAlexWorkDetailed[]): string {
  return papers
    .map((p, i) => {
      const authors = p.authorNames.length ? p.authorNames.join(", ") : "Unknown";
      const lines = [
        `[Paper ${i + 1}]`,
        `Title: ${p.title ?? "Untitled"}`,
        `Authors: ${authors}`,
        `Year: ${p.publication_year ?? "Unknown"}`,
        `Cited by: ${p.cited_by_count ?? 0}`,
        p.doi ? `DOI: ${p.doi}` : null,
        p.abstract ? `Abstract: ${p.abstract}` : null,
      ];
      return lines.filter(Boolean).join("\n");
    })
    .join("\n\n");
}

const CHAT_SYSTEM = (keyword: string, paperCtx: string) =>
  `You are a research assistant specialized in "${keyword}".
You have access to the following ${keyword}-related research papers. Ground ALL your answers in these papers.

${paperCtx}

Rules:
- Answer in well-structured Markdown.
- Cite papers inline like (AuthorLastName et al., Year) when referencing findings.
- If a question cannot be answered from the provided papers, say so clearly.
- Do NOT invent facts or paper titles.
- Be thorough but concise. Organize long answers with headings and bullet points.`;

export async function chatWithPapers(
  apiKey: string | undefined,
  keyword: string,
  papers: OpenAlexWorkDetailed[],
  history: ChatMessage[],
  userMessage: string,
  model: string,
): Promise<string> {
  const paperCtx = buildPaperContext(papers);

  if (!apiKey) {
    return (
      `## Offline mode\n\n` +
      `Set **GEMINI_API_KEY** to enable AI answers grounded in ${papers.length} papers about "${keyword}".\n\n` +
      `Your question: ${userMessage}`
    );
  }

  const contents = [
    {
      role: "user" as const,
      parts: [{ text: CHAT_SYSTEM(keyword, paperCtx) + "\n\nAcknowledge you have the papers ready." }],
    },
    {
      role: "model" as const,
      parts: [{ text: `I have ${papers.length} research papers about "${keyword}" loaded and ready. Ask me anything about this topic and I'll answer based on the paper contents.` }],
    },
    ...history.map((m) => ({
      role: (m.role === "user" ? "user" : "model") as "user" | "model",
      parts: [{ text: m.text }],
    })),
    {
      role: "user" as const,
      parts: [{ text: userMessage }],
    },
  ];

  const text = await generateTextWithFallback(apiKey, model, {
    contents,
    generationConfig: { temperature: 0.4 },
  });
  return text;
}

/* ── Paper section-keyword extraction ── */

export interface PaperDetail {
  title: string;
  topics: { displayName: string; score: number; subfield: string }[];
  abstract: string | null;
}

const SECTION_KW_HINT = `Return ONLY valid JSON with this shape (no markdown fences):
{
  "keywords": [
    { "id": "snake_case_id", "label": "Short Label", "summary": "one sentence description" }
  ]
}
Rules:
- Extract 8–16 keywords that represent the paper's actual section-level concepts and subtopics.
- Think about what the section headings (e.g. 2.1, 2.2, 3.1) of this paper would be, and derive keywords from those.
- For review/survey papers, the sections typically cover categorizations, challenges, methods, applications — extract THOSE specific concepts.
- Labels should be concise (2–6 words): e.g. "Non-IID Data", "Horizontal FL", "Secure Aggregation", "Gradient Compression".
- NEVER output generic discipline labels like "Computer Science", "Engineering", "AI", "Data Science", "Machine Learning".
- Focus on concepts a researcher would use to navigate this paper's content.
- Use ASCII snake_case ids derived from the label.`;

export async function extractPaperSectionKeywords(
  apiKey: string,
  paper: PaperDetail,
  model: string,
): Promise<{ id: string; label: string; summary: string }[]> {
  const topicList = paper.topics
    .map((t) => `- ${t.displayName} [${t.subfield}] (${(t.score * 100).toFixed(0)}%)`)
    .join("\n");
  const abs = paper.abstract
    ? `\nAbstract:\n${paper.abstract.slice(0, 1500)}`
    : "";

  const userContent = `Paper title: "${paper.title}"

Topics:
${topicList || "(none)"}
${abs}

Extract the specific section-level research concepts this paper covers. What would the section headings (2.1, 2.2, 3.1, etc.) of this paper be about?`;

  const text = await generateTextWithFallback(apiKey, model, {
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              "You extract section-level research keywords from academic papers based on their title, topics, and abstract. " +
              SECTION_KW_HINT +
              "\n\n" +
              userContent,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });
  const data = JSON.parse(stripFences(text)) as {
    keywords?: { id: string; label: string; summary: string }[];
  };
  return Array.isArray(data.keywords) ? data.keywords : [];
}
