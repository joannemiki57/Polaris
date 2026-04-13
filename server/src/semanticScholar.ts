import type { GraphEdge, GraphNode } from "./graphTypes.js";

const BASE = "https://api.semanticscholar.org/graph/v1";

const SKIP_SECTIONS = new Set([
  "abstract",
  "introduction",
  "conclusion",
  "conclusions",
  "conclusion and future work",
  "conclusions and future work",
  "references",
  "acknowledgements",
  "acknowledgments",
  "appendix",
  "supplementary material",
  "funding",
  "author contributions",
  "declaration of competing interest",
  "declarations",
  "data availability",
  "ethics statement",
  "conflict of interest",
  "",
]);

export interface PaperSection {
  name: string;
  snippetCount: number;
}

/**
 * Extract unique section headings from a paper via Semantic Scholar snippet search.
 * Searches by paper title, then filters snippets matching the target paper's corpusId.
 * Falls back to title matching if corpusId is unknown.
 */
const S2_CACHE_TTL = 1000 * 60 * 60 * 24;
const s2Cache = new Map<string, { at: number; sections: PaperSection[] }>();

export async function fetchPaperSections(
  paperTitle: string,
  semanticScholarId?: string,
  apiKey?: string,
): Promise<PaperSection[]> {
  const cacheKey = `s2:${paperTitle.toLowerCase().trim()}`;
  const cached = s2Cache.get(cacheKey);
  if (cached && Date.now() - cached.at < S2_CACHE_TTL) return cached.sections;

  const headers: Record<string, string> = {};
  if (apiKey) headers["x-api-key"] = apiKey;

  const params = new URLSearchParams({
    query: paperTitle,
    limit: "100",
    fields: "snippet.text,snippet.section",
  });

  const url = `${BASE}/snippet/search?${params.toString()}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Semantic Scholar ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    data?: Array<{
      paper: { corpusId: string; title: string };
      snippet: { text: string; section: string };
    }>;
  };

  const data = json.data ?? [];

  const targetTitle = paperTitle.toLowerCase().trim();
  const matching = data.filter((d) => {
    if (semanticScholarId) return d.paper.corpusId === semanticScholarId;
    return d.paper.title.toLowerCase().trim() === targetTitle;
  });

  const sectionCounts = new Map<string, number>();
  for (const d of matching) {
    const section = d.snippet.section?.trim();
    if (!section) continue;
    sectionCounts.set(section, (sectionCounts.get(section) ?? 0) + 1);
  }

  const sections: PaperSection[] = [];
  for (const [name, snippetCount] of sectionCounts) {
    if (SKIP_SECTIONS.has(name.toLowerCase())) continue;
    sections.push({ name, snippetCount });
  }

  const result = sections.sort((a, b) => b.snippetCount - a.snippetCount);
  s2Cache.set(cacheKey, { at: Date.now(), sections: result });
  return result;
}

/**
 * Convert section headings into graph keyword nodes linked to a paper node.
 */
export function sectionsToGraphNodes(
  sections: PaperSection[],
  paperNodeId: string,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const section of sections) {
    const nodeId = `sec_${paperNodeId}_${section.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 60)}`;

    nodes.push({
      id: nodeId,
      kind: "keyword",
      label: section.name,
      summary: `Section heading from paper (${section.snippetCount} snippet${section.snippetCount > 1 ? "s" : ""})`,
    });

    edges.push({
      id: `hs_${paperNodeId}_${nodeId}`,
      source: paperNodeId,
      target: nodeId,
      kind: "has_section",
    });
  }

  return { nodes, edges };
}
