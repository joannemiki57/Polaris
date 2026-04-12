import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Node,
  useEdgesState,
  useNodesState,
} from "reactflow";
import "reactflow/dist/style.css";

import {
  attachPapers,
  expandGraph,
  expandPaperKeywords,
  expandSelection,
  health,
} from "./api";
import { DeepAnswerPage } from "./DeepAnswerPage";
import { HomePage } from "./figma/HomePage";
import "./figma/figma-styles.css";
import type { GraphNode, MindGraph } from "./graphTypes";
import { mindGraphToFlow } from "./layout";
import { MindNode } from "./MindNode";
import {
  clearSession,
  downloadMarkdown,
  exportMarkdown,
  loadSession,
  saveSession,
} from "./persistence";

const nodeTypes = { mind: MindNode };

function graphNodeById(g: MindGraph, id: string): GraphNode | undefined {
  return g.nodes.find((n) => n.id === id);
}

function getAncestorLabels(g: MindGraph, nodeId: string): string[] {
  const labels: string[] = [];
  const visited = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const e of g.edges) {
      if (e.target === cur && !visited.has(e.source)) {
        const parent = graphNodeById(g, e.source);
        if (parent) labels.push(parent.label);
        queue.push(e.source);
      }
    }
  }
  return labels;
}

export default function App() {
  const [question, setQuestion] = useState("");
  const [graph, setGraph] = useState<MindGraph | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deepMd, setDeepMd] = useState("");
  const [status, setStatus] = useState("");
  const [apiHealth, setApiHealth] = useState<{
    llm: boolean;
    openAlexMailto: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [deepPageKeyword, setDeepPageKeyword] = useState<string | null>(null);
  const [deepPageNodeId, setDeepPageNodeId] = useState<string | null>(null);
  const [deepPageAncestors, setDeepPageAncestors] = useState<string[]>([]);
  const [deepPanelOpen, setDeepPanelOpen] = useState(false);
  const [paperQuery, setPaperQuery] = useState("");
  /** After splash: main workspace (sidebar + canvas) even before a graph exists */
  const [boot, setBoot] = useState<"loading" | "splash" | "workspace">("loading");

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    health()
      .then((h) => setApiHealth({ llm: h.llm, openAlexMailto: h.openAlexMailto }))
      .catch(() => setApiHealth(null));
  }, []);

  useEffect(() => {
    const s = loadSession();
    if (s) {
      setQuestion(s.question);
      setGraph(s.graph);
      setBoot(s.graph ? "workspace" : "splash");
    } else {
      setBoot("splash");
    }
  }, []);

  useEffect(() => {
    saveSession({ question, graph });
  }, [question, graph]);

  useEffect(() => {
    if (!graph) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const { nodes: n, edges: e } = mindGraphToFlow(graph);
    setNodes(n);
    setEdges(e);
  }, [graph, setEdges, setNodes]);

  const selectedNodes = useMemo(() => {
    if (!graph) return [];
    return selectedIds
      .map((id) => graph.nodes.find((n) => n.id === id))
      .filter(Boolean) as GraphNode[];
  }, [graph, selectedIds]);

  useEffect(() => {
    if (selectedNodes.length === 1) {
      setPaperQuery(selectedNodes[0]!.label);
    }
  }, [selectedNodes]);

  const allSelectedArePapers = useMemo(() => {
    return (
      selectedNodes.length > 0 &&
      selectedNodes.every((n) => n.kind === "paper" && n.openAlexId)
    );
  }, [selectedNodes]);

  const onNodeClick = useCallback((evt: ReactMouseEvent, node: Node) => {
    setSelectedIds((prev) => {
      if (evt.shiftKey) {
        return prev.includes(node.id)
          ? prev.filter((x) => x !== node.id)
          : [...prev, node.id];
      }
      return [node.id];
    });
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const runExpand = async (q?: string) => {
    const query = q ?? question;
    if (!query.trim()) return;
    if (q) setQuestion(q);
    setBusy(true);
    setStatus("Expanding question…");
    try {
      const { graph: g } = await expandGraph(query);
      setGraph(g);
      setSelectedIds([]);
      setDeepMd("");
      setStatus("Graph ready.");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runExpandSelection = async () => {
    if (!graph || !selectedNodes.length) return;
    setBusy(true);

    if (allSelectedArePapers) {
      setStatus("Fetching keywords from OpenAlex…");
      try {
        let g = graph;
        for (const n of selectedNodes) {
          const result = await expandPaperKeywords(g, n.id);
          g = result.graph;
        }
        setGraph(g);
        setStatus("Keywords expanded from OpenAlex.");
      } catch (e) {
        setStatus((e as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }

    setStatus("Expanding selection…");
    try {
      const sel = selectedNodes.map((n) => ({
        id: n.id,
        label: n.label,
        kind: n.kind,
      }));
      const { graph: g } = await expandSelection(question, graph, sel);
      setGraph(g);
      setStatus("Merged new nodes.");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runPapers = async () => {
    if (!graph || selectedIds.length !== 1) return;
    const kid = selectedIds[0]!;
    setBusy(true);
    setStatus("Fetching OpenAlex…");
    try {
      const { graph: g } = await attachPapers(graph, kid, (paperQuery || graphNodeById(graph, kid)?.label) ?? "");
      setGraph(g);
      setStatus("Papers attached. Data: OpenAlex.");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runDeep = () => {
    if (!graph || selectedIds.length !== 1) return;
    const node = graphNodeById(graph, selectedIds[0]!);
    if (!node) return;
    const ancestors = getAncestorLabels(graph, node.id);
    setDeepPageAncestors(ancestors);
    setDeepPageNodeId(node.id);
    setDeepPageKeyword(node.label);
  };

  const exportMd = () => {
    if (!graph) return;
    const md = exportMarkdown(question, graph);
    downloadMarkdown(
      `${(graph.title || "mindgraph").replace(/[^\w\-]+/g, "_")}.md`,
      md,
    );
    setStatus("Markdown downloaded.");
  };

  /* ── Pin paper from Deep Answer back into the graph ── */

  const pinnedUrls = useMemo(() => {
    if (!graph) return new Set<string>();
    return new Set(
      graph.nodes.filter((n) => n.kind === "paper" && n.url).map((n) => n.url!),
    );
  }, [graph]);

  const handlePinPaper = useCallback(
    (paper: import("./api").DeepPaper) => {
      if (!graph || !deepPageNodeId) return;
      const shortId = paper.openAlexUrl.split("/").pop() ?? "";
      const paperId = `paper_${shortId.replace(/[^a-zA-Z0-9_]/g, "_")}`;
      if (graph.nodes.some((n) => n.id === paperId)) return;

      const newNode: GraphNode = {
        id: paperId,
        kind: "paper",
        label: paper.title,
        doi: paper.doi ?? undefined,
        year: paper.year ?? undefined,
        citedByCount: paper.citedByCount ?? undefined,
        url: paper.openAlexUrl,
        openAlexId: paper.openAlexUrl,
        summary: paper.doi ? `DOI: ${paper.doi}` : undefined,
      };
      const newEdge = {
        id: `pin_${deepPageNodeId}_${paperId}`,
        source: deepPageNodeId,
        target: paperId,
        kind: "from_openalex" as const,
      };
      setGraph({
        ...graph,
        nodes: [...graph.nodes, newNode],
        edges: [...graph.edges, newEdge],
        updatedAt: new Date().toISOString(),
      });
    },
    [graph, deepPageNodeId],
  );

  const handleGoHome = () => {
    setGraph(null);
    setSelectedIds([]);
    setDeepMd("");
    setQuestion("");
    setStatus("");
    clearSession();
    setBoot("workspace");
  };

  const finishSplash = useCallback(() => {
    setBoot("workspace");
  }, []);

  // Deep Answer page (full-screen)
  if (deepPageKeyword) {
    return (
      <DeepAnswerPage
        keyword={deepPageKeyword}
        keywordNodeId={deepPageNodeId!}
        ancestors={deepPageAncestors}
        onBack={() => setDeepPageKeyword(null)}
        onPinPaper={handlePinPaper}
        pinnedUrls={pinnedUrls}
      />
    );
  }

  if (boot === "loading") {
    return (
      <div className="fg-boot-screen" aria-busy="true" aria-label="Loading Polaris">
        <div className="fg-boot-pulse" />
      </div>
    );
  }

  if (boot === "splash") {
    return <HomePage onContinue={finishSplash} />;
  }

  // Main workspace (graph may still be null — ask from command bar)
  return (
    <div className="app">
      {/* Figma Navbar */}
      <header className="fg-navbar">
        <button className="fg-navbar-brand" type="button" onClick={handleGoHome}>
          Polaris
        </button>
        <div className="navbar-right">
          {apiHealth && (
            <span className="navbar-health">
              LLM: {apiHealth.llm ? "on" : "mock"} · OpenAlex:{" "}
              {apiHealth.openAlexMailto ? "set" : "—"}
            </span>
          )}
        </div>
      </header>

      <div className="main">
        <aside className="sidebar">
          {/* Selection */}
          <div className="panel-section" style={{ borderTop: "none", paddingTop: 0, marginTop: 0 }}>
            <h3>Selection</h3>
            {!graph && (
              <p className="hint">
                Enter a research question in the bar below, then generate your first graph.
              </p>
            )}
            {graph && (
              <p className="hint">Click a node. Shift+click to multi-select.</p>
            )}
            <ul className="sel">
              {selectedNodes.map((n) => (
                <li key={n.id}>
                  <span className="pill">{n.kind}</span> {n.label}
                </li>
              ))}
            </ul>
            <div className="row stack">
              <button
                type="button"
                disabled={busy || !graph || selectedNodes.length === 0}
                onClick={runExpandSelection}
              >
                {allSelectedArePapers ? "Expand keywords (OpenAlex)" : "Expand selected (LLM)"}
              </button>
              <button
                type="button"
                className="da-btn-primary"
                disabled={busy || !graph || selectedIds.length !== 1}
                onClick={runDeep}
              >
                Deep Answer (LLM)
              </button>
            </div>
          </div>

          {/* OpenAlex papers */}
          <div className="panel-section">
            <h3>OpenAlex papers</h3>
            <label className="lbl">Search query</label>
            <input
              className="inp"
              value={paperQuery}
              onChange={(e) => setPaperQuery(e.target.value)}
              placeholder="English keywords work best"
            />
            <button
              type="button"
              disabled={busy || !graph || selectedIds.length !== 1}
              onClick={runPapers}
            >
              Attach papers to selected node
            </button>
            <p className="hint small">
              Attribution:{" "}
              <a href="https://openalex.org" target="_blank" rel="noreferrer">
                OpenAlex
              </a>
            </p>
          </div>

          {/* Session */}
          <div className="panel-section">
            <h3>Session</h3>
            <div className="row stack">
              <button type="button" disabled={!graph} onClick={exportMd}>
                Export Markdown
              </button>
              <button type="button" onClick={handleGoHome}>
                New session
              </button>
            </div>
          </div>

          {status && <p className="status">{status}</p>}
        </aside>

        <section className="canvas-wrap">
          {/* Floating command bar */}
          <div className="floating-cmdbar">
            <form className="fg-cmdbar" onSubmit={(e) => { e.preventDefault(); runExpand(); }}>
              <div className="fg-cmdbar-inner">
                <img className="fg-cmdbar-icon" src="/assets/search-icon.svg" alt="" />
                <input
                  className="fg-cmdbar-input"
                  type="text"
                  placeholder="Ask a research question..."
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                />
                {question && (
                  <button
                    className="fg-cmdbar-clear"
                    type="button"
                    onClick={() => setQuestion("")}
                  >
                    &times;
                  </button>
                )}
                <button
                  className="fg-cmdbar-submit"
                  type="submit"
                  disabled={busy || !question.trim()}
                >
                  {graph ? "Regenerate" : "Generate graph"}
                </button>
              </div>
            </form>
          </div>

          {/* Graph canvas */}
          <div className="flow">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.2}
              maxZoom={1.5}
            >
              <MiniMap pannable zoomable />
              <Controls />
              <Background gap={24} color="rgba(75, 85, 99, 0.15)" />
            </ReactFlow>
          </div>

          {/* Deep panel */}
          <div className="fg-deep-panel">
            <button
              className="fg-dp-toggle"
              type="button"
              onClick={() => setDeepPanelOpen(!deepPanelOpen)}
            >
              {deepPanelOpen ? "\u25BC" : "\u25B2"} Deep Panel &middot;{" "}
              {deepMd ? "Ready" : "Select a node"}
            </button>
            {deepPanelOpen && (
              <div className="fg-dp-content">
                {deepMd ? (
                  <pre className="md">{deepMd}</pre>
                ) : (
                  <p className="fg-dp-empty">
                    Run &quot;Deep Answer&quot; after selecting a node to see a research summary.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
