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
  type: string | null;
}

export interface OpenAlexWorkHitEnriched extends OpenAlexWorkHit {
  topics: OpenAlexTopic[];
  keywords: OpenAlexKeyword[];
  abstract: string | null;
}

export interface OpenAlexKeyword {
  id: string;
  displayName: string;
  score: number;
}

export interface OpenAlexTopic {
  id: string;
  displayName: string;
  score: number;
  subfield: string;
  field: string;
}

export interface WorkDetail {
  topics: OpenAlexTopic[];
  keywords: OpenAlexKeyword[];
  abstract: string | null;
}

interface CacheEntry {
  at: number;
  hits?: OpenAlexWorkHit[] | OpenAlexWorkHitEnriched[];
  keywords?: OpenAlexKeyword[];
  detail?: WorkDetail;
  researchPapers?: OpenAlexWorkDetailed[];
  sections?: import("./semanticScholar.js").PaperSection[];
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

let _savePending = false;

function saveDiskCache(map: Map<string, CacheEntry>) {
  if (_savePending) return;
  _savePending = true;
  queueMicrotask(() => {
    _savePending = false;
    const obj: Record<string, CacheEntry> = {};
    for (const [k, v] of map) obj[k] = v;
    fs.promises.writeFile(cachePath(), JSON.stringify(obj), "utf8").catch(() => {});
  });
}

function getCache(): Map<string, CacheEntry> {
  if (!memoryCache) memoryCache = loadDiskCache();
  return memoryCache;
}

export async function searchWorks(
  query: string,
  mailto: string | undefined,
  perPage = 8,
  typeFilter?: "review" | "article",
  enriched?: false,
): Promise<OpenAlexWorkHit[]>;
export async function searchWorks(
  query: string,
  mailto: string | undefined,
  perPage: number,
  typeFilter: "review" | "article" | undefined,
  enriched: true,
): Promise<OpenAlexWorkHitEnriched[]>;
export async function searchWorks(
  query: string,
  mailto: string | undefined,
  perPage = 8,
  typeFilter?: "review" | "article",
  enriched = false,
): Promise<OpenAlexWorkHit[] | OpenAlexWorkHitEnriched[]> {
  const filterSuffix = typeFilter ? `:${typeFilter}` : "";
  const enrichTag = enriched ? ":enriched" : "";
  const cacheKey = `${query.trim().toLowerCase()}${filterSuffix}${enrichTag}`;
  if (!cacheKey) return [];

  const cache = getCache();
  const hit = cache.get(cacheKey);
  if (hit?.hits && Date.now() - hit.at < TTL_MS) return hit.hits;

  const params = new URLSearchParams({
    search: query,
    per_page: String(perPage),
  });
  if (typeFilter) params.set("filter", `type:${typeFilter}`);
  params.set("sort", "cited_by_count:desc");
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
      type: string | null;
      topics?: Array<{
        id: string;
        display_name: string;
        score: number;
        subfield?: { display_name?: string };
        field?: { display_name?: string };
      }>;
      keywords?: Array<{ id: string; display_name: string; score: number }>;
      abstract_inverted_index?: Record<string, number[]> | null;
    }>;
  };
  const results = json.results ?? [];

  if (enriched) {
    const hits: OpenAlexWorkHitEnriched[] = results.map((r) => ({
      id: r.id,
      title: r.title,
      publication_year: r.publication_year,
      cited_by_count: r.cited_by_count,
      doi: r.doi,
      type: r.type,
      topics: (r.topics ?? [])
        .map((t) => ({
          id: t.id,
          displayName: t.display_name,
          score: t.score,
          subfield: t.subfield?.display_name ?? "",
          field: t.field?.display_name ?? "",
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_TOPICS),
      keywords: (r.keywords ?? [])
        .map((k) => ({ id: k.id, displayName: k.display_name, score: k.score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_KEYWORDS),
      abstract: reconstructAbstract(r.abstract_inverted_index ?? null),
    }));
    cache.set(cacheKey, { at: Date.now(), hits });
    saveDiskCache(cache);
    return hits;
  }

  const hits: OpenAlexWorkHit[] = results.map((r) => ({
    id: r.id,
    title: r.title,
    publication_year: r.publication_year,
    cited_by_count: r.cited_by_count,
    doi: r.doi,
    type: r.type,
  }));
  cache.set(cacheKey, { at: Date.now(), hits });
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
  page = 1,
): Promise<OpenAlexWorkDetailed[]> {
  const q = query.trim();
  if (!q) return [];

  const cacheKey = `research:${q.toLowerCase()}:${page}:${perPage}`;
  const cache = getCache();
  const cached = cache.get(cacheKey);
  if (cached?.researchPapers && Date.now() - cached.at < TTL_MS) return cached.researchPapers;

  const params = new URLSearchParams({
    search: query,
    per_page: String(perPage),
    page: String(Math.max(1, page)),
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
  const papers = (json.results ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    publication_year: r.publication_year,
    cited_by_count: r.cited_by_count,
    doi: r.doi,
    type: "article" as string | null,
    abstract: reconstructAbstract(r.abstract_inverted_index),
    authorNames: (r.authorships ?? [])
      .map((a) => a.author?.display_name)
      .filter((n): n is string => Boolean(n))
      .slice(0, 5),
  }));
  cache.set(cacheKey, { at: Date.now(), researchPapers: papers });
  saveDiskCache(cache);
  return papers;
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
      isReview: h.type === "review",
      url,
      summary: h.doi ? `DOI: ${h.doi}` : undefined,
    });
    edgeTargets.push({ paperId, sourceId: attachToId });
  }
  return { nodes, edgeTargets };
}

const MAX_KEYWORDS = 15;
const MAX_TOPICS = 10;

export async function fetchWorkDetail(
  openAlexId: string,
  mailto: string | undefined,
): Promise<WorkDetail> {
  const cacheKey = `detail:${openAlexId}`;
  const cache = getCache();
  const cached = cache.get(cacheKey);
  if (cached?.detail && Date.now() - cached.at < TTL_MS) return cached.detail;

  const params = new URLSearchParams({
    select: "id,display_name,keywords,topics,abstract_inverted_index",
  });
  if (mailto) params.set("mailto", mailto);

  const id = openAlexId.startsWith("http") ? openAlexId : `https://openalex.org/${openAlexId}`;
  const url = `${BASE}/works/${encodeURIComponent(id)}?${params.toString()}`;
  const uaMail = mailto ?? "anonymous@example.com";
  const res = await fetch(url, {
    headers: { "User-Agent": `MindGraphOpenAlex/1.0 (mailto:${uaMail})` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAlex ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    keywords?: Array<{ id: string; display_name: string; score: number }>;
    topics?: Array<{
      id: string;
      display_name: string;
      score: number;
      subfield?: { display_name?: string };
      field?: { display_name?: string };
    }>;
    abstract_inverted_index?: Record<string, number[]> | null;
  };

  const keywords: OpenAlexKeyword[] = (json.keywords ?? [])
    .map((k) => ({ id: k.id, displayName: k.display_name, score: k.score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_KEYWORDS);

  const topics: OpenAlexTopic[] = (json.topics ?? [])
    .map((t) => ({
      id: t.id,
      displayName: t.display_name,
      score: t.score,
      subfield: t.subfield?.display_name ?? "",
      field: t.field?.display_name ?? "",
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_TOPICS);

  const abstract = reconstructAbstract(json.abstract_inverted_index ?? null);

  const detail: WorkDetail = { topics, keywords, abstract };
  cache.set(cacheKey, { at: Date.now(), detail });
  saveDiskCache(cache);
  return detail;
}

/** Backward-compat wrapper for the expand-paper-keywords route */
export async function fetchWorkKeywords(
  openAlexId: string,
  mailto: string | undefined,
): Promise<OpenAlexKeyword[]> {
  const detail = await fetchWorkDetail(openAlexId, mailto);
  return detail.keywords;
}

export function keywordsToGraphNodes(
  keywords: OpenAlexKeyword[],
  paperNodeId: string,
): { nodes: GraphNode[]; edges: { id: string; source: string; target: string; kind: "has_keyword" }[] } {
  const nodes: GraphNode[] = [];
  const edges: { id: string; source: string; target: string; kind: "has_keyword" }[] = [];

  for (const kw of keywords) {
    const shortId = kw.id.split("/").pop() ?? kw.id;
    const nodeId = `kw_${shortId.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    nodes.push({
      id: nodeId,
      kind: "keyword",
      label: kw.displayName,
      openAlexId: kw.id,
      relevance: kw.score,
      summary: `Relevance: ${(kw.score * 100).toFixed(0)}%`,
    });
    edges.push({
      id: `hk_${paperNodeId}_${nodeId}`,
      source: paperNodeId,
      target: nodeId,
      kind: "has_keyword",
    });
  }

  return { nodes, edges };
}
