import fs from "node:fs";
import path from "node:path";
import type { GraphNode } from "./graphTypes.js";

const BASE = "https://api.openalex.org";

export interface OpenAlexWorkHit {
  id: string;
  title: string | null;
  publication_year: number | null;
  cited_by_count: number | null;
  doi: string | null;
}

interface CacheEntry {
  at: number;
  hits: OpenAlexWorkHit[];
}

const TTL_MS = 1000 * 60 * 60 * 24; // 24h
let memoryCache: Map<string, CacheEntry> | null = null;

function cachePath(): string {
  const dir = path.join(process.cwd(), ".cache");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "openalex.json");
}

function loadDiskCache(): Map<string, CacheEntry> {
  const m = new Map<string, CacheEntry>();
  try {
    const raw = fs.readFileSync(cachePath(), "utf8");
    const obj = JSON.parse(raw) as Record<string, CacheEntry>;
    for (const [k, v] of Object.entries(obj)) {
      if (Date.now() - v.at < TTL_MS) m.set(k, v);
    }
  } catch {
    /* empty */
  }
  return m;
}

function saveDiskCache(map: Map<string, CacheEntry>) {
  const obj: Record<string, CacheEntry> = {};
  for (const [k, v] of map) obj[k] = v;
  fs.writeFileSync(cachePath(), JSON.stringify(obj), "utf8");
}

function getCache(): Map<string, CacheEntry> {
  if (!memoryCache) memoryCache = loadDiskCache();
  return memoryCache;
}

export async function searchWorks(
  query: string,
  mailto: string | undefined,
  perPage = 8,
): Promise<OpenAlexWorkHit[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const cache = getCache();
  const hit = cache.get(q);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.hits;

  const params = new URLSearchParams({
    search: query,
    per_page: String(perPage),
    sort: "cited_by_count:desc",
  });
  if (mailto) params.set("mailto", mailto);

  const url = `${BASE}/works?${params.toString()}`;
  const uaMail = mailto ?? "anonymous@example.com";
  const res = await fetch(url, {
    headers: { "User-Agent": `MindGraphOpenAlex/1.0 (mailto:${uaMail})` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAlex ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    results?: Array<{
      id: string;
      title: string | null;
      publication_year: number | null;
      cited_by_count: number | null;
      doi: string | null;
    }>;
  };
  const results = json.results ?? [];
  const hits: OpenAlexWorkHit[] = results.map((r) => ({
    id: r.id,
    title: r.title,
    publication_year: r.publication_year,
    cited_by_count: r.cited_by_count,
    doi: r.doi,
  }));
  cache.set(q, { at: Date.now(), hits });
  saveDiskCache(cache);
  return hits;
}

export interface OpenAlexWorkDetailed extends OpenAlexWorkHit {
  abstract: string | null;
  authorNames: string[];
}

function reconstructAbstract(
  invertedIndex: Record<string, number[]> | null | undefined,
): string | null {
  if (!invertedIndex || typeof invertedIndex !== "object") return null;
  const pairs: [string, number][] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) pairs.push([word, pos]);
  }
  pairs.sort((a, b) => a[1] - b[1]);
  return pairs.map(([w]) => w).join(" ") || null;
}

export async function searchResearchPapers(
  query: string,
  mailto: string | undefined,
  perPage = 10,
): Promise<OpenAlexWorkDetailed[]> {
  const q = query.trim();
  if (!q) return [];

  const params = new URLSearchParams({
    search: query,
    per_page: String(perPage),
    sort: "cited_by_count:desc",
    filter: "type:article,type:!review",
  });
  if (mailto) params.set("mailto", mailto);

  const url = `${BASE}/works?${params.toString()}`;
  const uaMail = mailto ?? "anonymous@example.com";
  const res = await fetch(url, {
    headers: { "User-Agent": `MindGraphOpenAlex/1.0 (mailto:${uaMail})` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAlex ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    results?: Array<{
      id: string;
      title: string | null;
      publication_year: number | null;
      cited_by_count: number | null;
      doi: string | null;
      abstract_inverted_index?: Record<string, number[]> | null;
      authorships?: Array<{ author?: { display_name?: string } }>;
    }>;
  };
  return (json.results ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    publication_year: r.publication_year,
    cited_by_count: r.cited_by_count,
    doi: r.doi,
    abstract: reconstructAbstract(r.abstract_inverted_index),
    authorNames: (r.authorships ?? [])
      .map((a) => a.author?.display_name)
      .filter((n): n is string => Boolean(n))
      .slice(0, 5),
  }));
}

export function workHitToPaperNodes(
  hits: OpenAlexWorkHit[],
  attachToId: string,
): { nodes: GraphNode[]; edgeTargets: { paperId: string; sourceId: string }[] } {
  const nodes: GraphNode[] = [];
  const edgeTargets: { paperId: string; sourceId: string }[] = [];
  for (const h of hits) {
    const shortId = h.id.split("/").pop() ?? h.id;
    const paperId = `paper_${shortId.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    const url = h.id.startsWith("http") ? h.id : `https://openalex.org/${shortId}`;
    nodes.push({
      id: paperId,
      kind: "paper",
      label: (h.title ?? "Untitled").slice(0, 200),
      openAlexId: h.id,
      doi: h.doi ?? undefined,
      year: h.publication_year ?? undefined,
      citedByCount: h.cited_by_count ?? undefined,
      url,
      summary: h.doi ? `DOI: ${h.doi}` : undefined,
    });
    edgeTargets.push({ paperId, sourceId: attachToId });
  }
  return { nodes, edgeTargets };
}
