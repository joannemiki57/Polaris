import type { MindGraph } from "./graphTypes";

const KEY = "mindgraph_session_v1";

export type Session = {
  question: string;
  graph: MindGraph | null;
};

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
