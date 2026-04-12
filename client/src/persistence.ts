import type { MindGraph } from "./graphTypes";

const KEY = "mindgraph_session_v1";
const DEEP_PREFIX = "mindgraph_deep_session_v1:";
const HISTORY_KEY = "mindgraph_session_history_v1";

export type Session = {
  question: string;
  graph: MindGraph | null;
};

export type DeepChatMessage = {
  role: "user" | "assistant";
  text: string;
};

export type DeepPaperSnapshot = {
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  citedByCount: number | null;
  abstract: string | null;
  openAlexUrl: string;
};

export type DeepSessionSnapshot = {
  sessionId: string | null;
  papers: DeepPaperSnapshot[];
  messages: DeepChatMessage[];
  input: string;
  updatedAt: string;
};

export type SessionRecord = {
  id: string;
  at: string;
  question: string;
  graphTitle: string;
  nodeCount: number;
  edgeCount: number;
};

function deepKey(topicKey: string): string {
  return `${DEEP_PREFIX}${topicKey.toLowerCase()}`;
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function saveSession(s: Session) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearSession() {
  localStorage.removeItem(KEY);
}

export function loadDeepSession(topicKey: string): DeepSessionSnapshot | null {
  try {
    const raw = localStorage.getItem(deepKey(topicKey));
    if (!raw) return null;
    return JSON.parse(raw) as DeepSessionSnapshot;
  } catch {
    return null;
  }
}

export function saveDeepSession(topicKey: string, snapshot: DeepSessionSnapshot) {
  localStorage.setItem(deepKey(topicKey), JSON.stringify(snapshot));
}

export function clearDeepSession(topicKey: string) {
  localStorage.removeItem(deepKey(topicKey));
}

export function loadSessionHistory(): SessionRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SessionRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function archiveSession(session: Session) {
  const question = session.question.trim();
  const graph = session.graph;
  if (!question && !graph) return;

  const nextRecord: SessionRecord = {
    id: `${Date.now()}`,
    at: new Date().toISOString(),
    question: question || "(empty question)",
    graphTitle: graph?.title || "Untitled graph",
    nodeCount: graph?.nodes.length ?? 0,
    edgeCount: graph?.edges.length ?? 0,
  };

  const prev = loadSessionHistory();
  const latest = prev[0];
  if (
    latest
    && latest.question === nextRecord.question
    && latest.graphTitle === nextRecord.graphTitle
    && latest.nodeCount === nextRecord.nodeCount
    && latest.edgeCount === nextRecord.edgeCount
  ) {
    return;
  }
  const merged = [nextRecord, ...prev].slice(0, 30);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(merged));
}

export function exportMarkdown(question: string, graph: MindGraph): string {
  const lines: string[] = [];
  lines.push(`# ${graph.title || "Mind graph"}`);
  lines.push("");
  lines.push(`> Question: ${question}`);
  lines.push("");
  lines.push("## Nodes");
  for (const n of graph.nodes) {
    const bits = [
      `- **${n.label}** (\`${n.kind}\`, id: \`${n.id}\`)`,
      n.summary ? `  - ${n.summary}` : "",
      n.openAlexId ? `  - OpenAlex: ${n.openAlexId}` : "",
      n.url ? `  - ${n.url}` : "",
    ].filter(Boolean);
    lines.push(bits.join("\n"));
  }
  lines.push("");
  lines.push("## Edges");
  for (const e of graph.edges) {
    lines.push(`- \`${e.source}\` —${e.kind}→ \`${e.target}\``);
  }
  lines.push("");
  lines.push(
    "_OpenAlex data via [OpenAlex](https://openalex.org) — cite and respect their terms._",
  );
  return lines.join("\n");
}

export function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
