import OpenAI from "openai";
import type { GraphEdge, GraphNode, MindGraph } from "./graphTypes.js";

function makeClient(apiKey: string, provider: "gemini" | "openai"): OpenAI {
  if (provider === "gemini") {
    return new OpenAI({
      apiKey,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });
  }
  return new OpenAI({ apiKey });
}

const EXPAND_SCHEMA_HINT = `Return ONLY valid JSON with this shape (no markdown):
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

export interface PaperWithKeywords {
  id: string;
  title: string;
  isReview: boolean;
  citedByCount: number;
  topics: { displayName: string; score: number; subfield: string }[];
  abstract: string | null;
}

const ORGANIZE_SCHEMA_HINT = `Return ONLY valid JSON with this shape (no markdown):
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
  provider: "gemini" | "openai" = "openai",
): Promise<MindGraph> {
  function formatPaper(p: PaperWithKeywords): string {
    const topics = p.topics
      .map((t) => `${t.displayName} [${t.subfield}] (${(t.score * 100).toFixed(0)}%)`)
      .join(", ");
    const abs = p.abstract ? `\n  Abstract: ${p.abstract.slice(0, 400)}` : "";
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

  const client = makeClient(apiKey, provider);
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You organize real research concepts (from OpenAlex paper topics and abstracts) into a knowledge graph for UI rendering. " +
          ORGANIZE_SCHEMA_HINT,
      },
      { role: "user", content: userContent },
    ],
  });
  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error("Empty LLM response");
  return parseMindGraph(text);
}

function mockExpand(question: string): MindGraph {
  const rootId = "root_topic";
  const nodes: GraphNode[] = [
    {
      id: rootId,
      kind: "topic",
      label: question.slice(0, 80) || "Topic",
      summary: "Exploration root (offline mock — set OPENAI_API_KEY for live expansion).",
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

function parseMindGraph(raw: string): MindGraph {
  const data = JSON.parse(raw) as {
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

export async function expandQuestionToGraph(
  apiKey: string | undefined,
  question: string,
  model: string,
  provider: "gemini" | "openai" = "openai",
): Promise<MindGraph> {
  if (!apiKey) return mockExpand(question);

  const client = makeClient(apiKey, provider);
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You expand user questions into a concise knowledge graph for UI rendering. " +
          EXPAND_SCHEMA_HINT,
      },
      { role: "user", content: question },
    ],
  });
  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error("Empty LLM response");
  return parseMindGraph(text);
}

const DELTA_HINT = `Return ONLY valid JSON:
{
  "new_nodes": [
    { "id": "unique_id", "kind": "keyword"|"subtask", "label": "...", "summary": "one sentence" }
  ],
  "new_edges": [
    { "id": "e_unique", "source": "existing_or_new_id", "target": "existing_or_new_id", "kind": "expands_to"|"prerequisite_for"|"user_linked" }
  ]
}
Use edges to attach new_nodes to the provided selected node ids (as sources). Do not repeat existing ids.`;

function parseDelta(raw: string): { new_nodes: GraphNode[]; new_edges: GraphEdge[] } {
  const data = JSON.parse(raw) as {
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
  model: string,
  provider: "gemini" | "openai" = "openai",
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

  const client = makeClient(apiKey, provider);
  const payload = JSON.stringify({
    originalQuestion: question,
    selected,
    existingNodeIds: base.nodes.map((n) => n.id),
  });
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.35,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Given the user's question and SELECTED nodes from their graph, add focused child nodes. " +
          DELTA_HINT,
      },
      { role: "user", content: payload },
    ],
  });
  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error("Empty LLM response");
  const delta = parseDelta(text);
  return mergeDelta(base, delta);
}

// ── Paper section-keyword extraction ──────────────────────────

export interface PaperDetail {
  title: string;
  topics: { displayName: string; score: number; subfield: string }[];
  abstract: string | null;
}

const SECTION_KW_HINT = `Return ONLY valid JSON with this shape (no markdown):
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
  provider: "gemini" | "openai" = "openai",
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

  const client = makeClient(apiKey, provider);
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You extract section-level research keywords from academic papers based on their title, topics, and abstract. " +
          SECTION_KW_HINT,
      },
      { role: "user", content: userContent },
    ],
  });
  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error("Empty LLM response");
  const data = JSON.parse(text) as {
    keywords?: { id: string; label: string; summary: string }[];
  };
  return Array.isArray(data.keywords) ? data.keywords : [];
}

export async function deepAnswer(
  apiKey: string | undefined,
  question: string,
  selected: { id: string; label: string; summary?: string }[],
  model: string,
  provider: "gemini" | "openai" = "openai",
): Promise<string> {
  const ctx = selected.map((s) => `- ${s.label}: ${s.summary ?? ""}`).join("\n");
  const user = `Original question:\n${question}\n\nSelected focus:\n${ctx}\n\nGive a structured deep answer.`;

  if (!apiKey) {
    return (
      `## Offline mode\n\n` +
      `Set **GEMINI_API_KEY** or **OPENAI_API_KEY** on the server for live answers.\n\n` +
      `### Focus\n${ctx || "(none)"}\n\n` +
      `### Sketch\n- Define terms\n- Compare approaches\n- Note risks & evaluation\n`
    );
  }

  const client = makeClient(apiKey, provider);
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.5,
    messages: [
      { role: "system", content: DEEP_SYSTEM },
      { role: "user", content: user },
    ],
  });
  return completion.choices[0]?.message?.content ?? "";
}
