import type { MindGraph } from "./graphTypes";

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function health(): Promise<{
  ok: boolean;
  llm: boolean;
  openAlexMailto: boolean;
}> {
  return j("/api/health");
}

export async function expandGraph(question: string): Promise<{ graph: MindGraph }> {
  return j("/api/graph/expand", {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}

export async function expandSelection(
  question: string,
  graph: MindGraph,
  selected: { id: string; label: string; kind: string }[],
): Promise<{ graph: MindGraph }> {
  return j("/api/graph/expand-selection", {
    method: "POST",
    body: JSON.stringify({ question, graph, selected }),
  });
}

export async function deepAnswer(
  question: string,
  selected: { id: string; label: string; summary?: string }[],
): Promise<{ markdown: string }> {
  return j("/api/llm/deep", {
    method: "POST",
    body: JSON.stringify({ question, selected }),
  });
}

export async function expandPaperKeywords(
  graph: MindGraph,
  paperNodeId: string,
): Promise<{ graph: MindGraph }> {
  return j("/api/graph/expand-paper-keywords", {
    method: "POST",
    body: JSON.stringify({ graph, paperNodeId }),
  });
}

export async function attachPapers(
  graph: MindGraph,
  keywordId: string,
  query: string,
): Promise<{ graph: MindGraph; attribution?: string }> {
  return j("/api/graph/attach-papers", {
    method: "POST",
    body: JSON.stringify({ graph, keywordId, query }),
  });
}

/* ── Deep Answer (chat with papers) ── */

export interface DeepPaper {
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  citedByCount: number | null;
  abstract: string | null;
  openAlexUrl: string;
}

export interface DeepInitResponse {
  sessionId: string;
  keyword: string;
  papers: DeepPaper[];
}

export interface ChatMsg {
  role: "user" | "assistant";
  text: string;
}

export async function deepAnswerInit(
  keyword: string,
): Promise<DeepInitResponse> {
  return j("/api/deep-answer/init", {
    method: "POST",
    body: JSON.stringify({ keyword }),
  });
}

export async function deepAnswerChat(
  sessionId: string,
  keyword: string,
  message: string,
  history: ChatMsg[],
): Promise<{ reply: string }> {
  return j("/api/deep-answer/chat", {
    method: "POST",
    body: JSON.stringify({ sessionId, keyword, message, history }),
  });
}

export async function deepAnswerMorePapers(
  sessionId: string,
  count = 10,
): Promise<{ papers: DeepPaper[]; addedCount: number; nextPage: number }> {
  return j("/api/deep-answer/more-papers", {
    method: "POST",
    body: JSON.stringify({ sessionId, count }),
  });
}
