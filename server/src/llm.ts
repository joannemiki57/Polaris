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

function getGemini(apiKey: string, model: string) {
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model });
}

export async function expandQuestionToGraph(
  apiKey: string | undefined,
  question: string,
  model: string,
): Promise<MindGraph> {
  if (!apiKey) return mockExpand(question);

  const gemini = getGemini(apiKey, model);
  const result = await gemini.generateContent({
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
  const text = result.response.text();
  if (!text) throw new Error("Empty Gemini response");
  return parseMindGraph(text);
}

const DELTA_HINT = `Return ONLY valid JSON (no markdown fences):
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

  const gemini = getGemini(apiKey, model);
  const payload = JSON.stringify({
    originalQuestion: question,
    selected,
    existingNodeIds: base.nodes.map((n) => n.id),
  });
  const result = await gemini.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              "Given the user's question and SELECTED nodes from their graph, add focused child nodes. " +
              DELTA_HINT +
              "\n\n" +
              payload,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.35,
      responseMimeType: "application/json",
    },
  });
  const text = result.response.text();
  if (!text) throw new Error("Empty Gemini response");
  const delta = parseDelta(text);
  return mergeDelta(base, delta);
}

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

  const gemini = getGemini(apiKey, model);
  const result = await gemini.generateContent({
    contents: [
      {
        role: "user",
        parts: [{ text: DEEP_SYSTEM + "\n\n" + user }],
      },
    ],
    generationConfig: { temperature: 0.5 },
  });
  return result.response.text() ?? "";
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

  const gemini = getGemini(apiKey, model);
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

  const result = await gemini.generateContent({
    contents,
    generationConfig: { temperature: 0.4 },
  });
  return result.response.text() ?? "";
}
