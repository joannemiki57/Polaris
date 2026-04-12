import type { MindGraph } from "./graphTypes";

const KEY = "mindgraph_session_v1";
const DEEP_PREFIX = "mindgraph_deep_session_v1:";
const HISTORY_KEY = "mindgraph_session_history_v1";
const WORKSPACES_KEY = "mindgraph_workspaces_v1";

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
  graph: MindGraph | null;
};

export type WorkspaceItem = {
  id: string;
  name: string;
  question: string;
  graph: MindGraph | null;
};

export type WorkspaceStore = {
  activeId: string;
  items: WorkspaceItem[];
};

function deepKey(workspaceId: string, topicKey: string): string {
  return `${DEEP_PREFIX}${workspaceId.toLowerCase()}:${topicKey.toLowerCase()}`;
}

export function createDefaultWorkspace(name = "Workspace 1"): WorkspaceItem {
  return {
    id: `ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    question: "",
    graph: null,
  };
}

export function loadWorkspaceStore(): WorkspaceStore {
  try {
    const raw = localStorage.getItem(WORKSPACES_KEY);
    if (!raw) {
      const first = createDefaultWorkspace("Workspace 1");
      return { activeId: first.id, items: [first] };
    }
    const parsed = JSON.parse(raw) as WorkspaceStore;
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
      const first = createDefaultWorkspace("Workspace 1");
      return { activeId: first.id, items: [first] };
    }
    const activeExists = parsed.items.some((w) => w.id === parsed.activeId);
    return {
      activeId: activeExists ? parsed.activeId : parsed.items[0]!.id,
      items: parsed.items,
    };
  } catch {
    const first = createDefaultWorkspace("Workspace 1");
    return { activeId: first.id, items: [first] };
  }
}

export function saveWorkspaceStore(store: WorkspaceStore) {
  localStorage.setItem(WORKSPACES_KEY, JSON.stringify(store));
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

export function loadDeepSession(workspaceId: string, topicKey: string): DeepSessionSnapshot | null {
  try {
    const raw = localStorage.getItem(deepKey(workspaceId, topicKey));
    if (!raw) return null;
    return JSON.parse(raw) as DeepSessionSnapshot;
  } catch {
    return null;
  }
}

export function saveDeepSession(
  workspaceId: string,
  topicKey: string,
  snapshot: DeepSessionSnapshot,
) {
  localStorage.setItem(deepKey(workspaceId, topicKey), JSON.stringify(snapshot));
}

export function clearDeepSession(workspaceId: string, topicKey: string) {
  localStorage.removeItem(deepKey(workspaceId, topicKey));
}

export function loadSessionHistory(): SessionRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Partial<SessionRecord>>;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((r) => ({
      id: String(r.id ?? `${Date.now()}`),
      at: String(r.at ?? new Date().toISOString()),
      question: String(r.question ?? "(empty question)"),
      graphTitle: String(r.graphTitle ?? "Untitled graph"),
      nodeCount: Number(r.nodeCount ?? 0),
      edgeCount: Number(r.edgeCount ?? 0),
      graph: (r.graph as MindGraph | null) ?? null,
    }));
  } catch {
    return [];
  }
}

function saveSessionHistory(records: SessionRecord[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(records));
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
    graph: graph ?? null,
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
  saveSessionHistory(merged);
}

export function promoteSessionRecord(id: string): SessionRecord[] {
  const records = loadSessionHistory();
  const idx = records.findIndex((r) => r.id === id);
  if (idx <= 0) return records;
  const picked = records[idx]!;
  const next = [picked, ...records.slice(0, idx), ...records.slice(idx + 1)];
  saveSessionHistory(next);
  return next;
}

export function deleteSessionRecord(id: string): SessionRecord[] {
  const records = loadSessionHistory();
  const next = records.filter((r) => r.id !== id);
  if (next.length !== records.length) {
    saveSessionHistory(next);
  }
  return next;
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
