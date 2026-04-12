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
  extractKeywordsFromStarredPapers,
  expandGraph,
  expandPaperKeywords,
  expandSelection,
  health,
} from "./api";
import { DeepAnswerPage } from "./DeepAnswerPage";
import { HomePage } from "./figma/HomePage";
import "./figma/figma-styles.css";
import type { GraphNode, MindGraph } from "./graphTypes";
import { mindGraphToFlow, type LayoutMode } from "./layout";
import { MindNode } from "./MindNode";
import {
  archiveSession,
  clearSession,
  createDefaultWorkspace,
  downloadMarkdown,
  exportMarkdown,
  loadSessionHistory,
  loadSession,
  loadWorkspaceStore,
  saveSession,
  saveWorkspaceStore,
  type SessionRecord,
  type WorkspaceItem,
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

function getDescendantIds(g: MindGraph, seedIds: string[]): Set<string> {
  const childrenBySource = new Map<string, string[]>();
  for (const e of g.edges) {
    if (!childrenBySource.has(e.source)) childrenBySource.set(e.source, []);
    childrenBySource.get(e.source)!.push(e.target);
  }

  const descendants = new Set<string>();
  const stack = [...seedIds];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (descendants.has(current)) continue;
    descendants.add(current);
    for (const childId of childrenBySource.get(current) ?? []) {
      if (!descendants.has(childId)) stack.push(childId);
    }
  }

  return descendants;
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
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("radial");
  const [sessionHistory, setSessionHistory] = useState<SessionRecord[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
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
    const store = loadWorkspaceStore();
    const legacy = loadSession();
    const migratedItems = [...store.items];
    if (
      legacy
      && migratedItems.length > 0
      && !migratedItems.some((w) => w.graph || w.question.trim())
      && (legacy.graph || legacy.question.trim())
    ) {
      migratedItems[0] = {
        ...migratedItems[0]!,
        question: legacy.question,
        graph: legacy.graph,
      };
    }
    const active = migratedItems.find((w) => w.id === store.activeId) ?? migratedItems[0]!;
    setWorkspaces(migratedItems);
    setActiveWorkspaceId(active.id);
    setQuestion(active.question);
    setGraph(active.graph);
    setSessionHistory(loadSessionHistory());
    setBoot(active.graph ? "workspace" : "splash");
  }, []);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    const ws = workspaces.find((w) => w.id === activeWorkspaceId);
    if (!ws) return;
    setQuestion(ws.question);
    setGraph(ws.graph);
    setSelectedIds([]);
    setDeepMd("");
    setDeepPageKeyword(null);
  }, [activeWorkspaceId, workspaces]);

  useEffect(() => {
    saveSession({ question, graph });
  }, [question, graph]);

  useEffect(() => {
    if (!activeWorkspaceId || workspaces.length === 0) return;
    setWorkspaces((prev) => prev.map((ws) => {
      if (ws.id !== activeWorkspaceId) return ws;
      if (ws.question === question && ws.graph === graph) return ws;
      return {
        ...ws,
        question,
        graph,
      };
    }));
  }, [question, graph, activeWorkspaceId]);

  useEffect(() => {
    if (!activeWorkspaceId || workspaces.length === 0) return;
    saveWorkspaceStore({
      activeId: activeWorkspaceId,
      items: workspaces,
    });
  }, [activeWorkspaceId, workspaces]);

  useEffect(() => {
    if (!graph) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const { nodes: n, edges: e } = mindGraphToFlow(graph, layoutMode);
    setNodes(n);
    setEdges(e);
  }, [graph, layoutMode, setEdges, setNodes]);

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

  const onNodesDelete = useCallback((deletedNodes: Node[]) => {
    if (!graph || deletedNodes.length === 0) return;

    const deletedIds = deletedNodes.map((n) => n.id);
    const subtreeIds = getDescendantIds(graph, deletedIds);

    setGraph({
      ...graph,
      nodes: graph.nodes.filter((n) => !subtreeIds.has(n.id)),
      edges: graph.edges.filter(
        (e) => !subtreeIds.has(e.source) && !subtreeIds.has(e.target),
      ),
      updatedAt: new Date().toISOString(),
    });
    setSelectedIds((prev) => prev.filter((id) => !subtreeIds.has(id)));
  }, [graph]);

  const runExpand = async (q?: string) => {
    const query = q ?? question;
    if (!query.trim()) return;
    if (q) setQuestion(q);
    setBusy(true);
    setStatus("Expanding question…");
    try {
      const { graph: g } = await expandGraph(query);
      archiveSession({ question: query, graph: g });
      setSessionHistory(loadSessionHistory());
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

  const useStarredPapersForKeywords = async (payload: {
    sessionId: string;
    keywordNodeId: string;
    starredOpenAlexUrls: string[];
  }) => {
    if (!graph) throw new Error("Graph not loaded.");
    setBusy(true);
    setStatus("Extracting keywords from starred papers...");
    try {
      const { graph: g, keywordCount, usedPapers } = await extractKeywordsFromStarredPapers(
        graph,
        payload.keywordNodeId,
        payload.sessionId,
        payload.starredOpenAlexUrls,
      );
      setGraph(g);
      setStatus(`Added ${keywordCount} keywords from ${usedPapers} starred papers.`);
    } catch (e) {
      setStatus((e as Error).message);
      throw e;
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

  const handleGoHome = () => {
    archiveSession({ question, graph });
    setSessionHistory(loadSessionHistory());
    setGraph(null);
    setSelectedIds([]);
    setDeepMd("");
    setQuestion("");
    setStatus("");
    clearSession();
    setBoot("workspace");
  };

  const createWorkspace = () => {
    const nextIndex = workspaces.length + 1;
    const next = createDefaultWorkspace(`Workspace ${nextIndex}`);
    setWorkspaces((prev) => [...prev, next]);
    setActiveWorkspaceId(next.id);
    setQuestion("");
    setGraph(null);
    setSelectedIds([]);
    setDeepMd("");
    setStatus(`Created ${next.name}.`);
    setBoot("workspace");
  };

  const renameWorkspace = (id: string) => {
    const ws = workspaces.find((w) => w.id === id);
    if (!ws) return;
    const nextName = window.prompt("Workspace name", ws.name)?.trim();
    if (!nextName) return;
    setWorkspaces((prev) => prev.map((w) => (w.id === id ? { ...w, name: nextName } : w)));
  };

  const deleteWorkspace = (id: string) => {
    if (workspaces.length <= 1) return;
    const ws = workspaces.find((w) => w.id === id);
    if (!ws) return;
    if (!window.confirm(`Delete ${ws.name}?`)) return;

    const remaining = workspaces.filter((w) => w.id !== id);
    setWorkspaces(remaining);
    if (activeWorkspaceId === id) {
      const fallback = remaining[0]!;
      setActiveWorkspaceId(fallback.id);
      setQuestion(fallback.question);
      setGraph(fallback.graph);
      setSelectedIds([]);
      setDeepMd("");
    }
  };

  const finishSplash = useCallback(() => {
    setBoot("workspace");
  }, []);

  // Deep Answer page (full-screen)
  if (deepPageKeyword) {
    return (
      <DeepAnswerPage
        workspaceId={activeWorkspaceId}
        keyword={deepPageKeyword}
        keywordNodeId={deepPageNodeId!}
        ancestors={deepPageAncestors}
        onBack={() => setDeepPageKeyword(null)}
        onUseStarredKeywords={useStarredPapersForKeywords}
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
        <div className="workspace-tabs" aria-label="Workspace tabs">
          {workspaces.map((ws) => {
            const active = ws.id === activeWorkspaceId;
            return (
              <div key={ws.id} className={`workspace-tab${active ? " workspace-tab-active" : ""}`}>
                <button
                  type="button"
                  className="workspace-tab-main"
                  onClick={() => setActiveWorkspaceId(ws.id)}
                  title={ws.name}
                >
                  {ws.name}
                </button>
                <button
                  type="button"
                  className="workspace-tab-icon"
                  onClick={() => renameWorkspace(ws.id)}
                  title="Rename workspace"
                  aria-label="Rename workspace"
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="workspace-tab-icon"
                  onClick={() => deleteWorkspace(ws.id)}
                  title={workspaces.length <= 1 ? "At least one workspace is required" : "Delete workspace"}
                  aria-label="Delete workspace"
                  disabled={workspaces.length <= 1}
                >
                  ×
                </button>
              </div>
            );
          })}
          <button
            type="button"
            className="workspace-tab-add"
            onClick={createWorkspace}
            title="Create workspace"
            aria-label="Create workspace"
          >
            +
          </button>
        </div>
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

          {/* Layout toggle */}
          <div className="panel-section">
            <h3>Layout</h3>
            <div className="layout-toggle">
              <button
                type="button"
                className={`layout-btn${layoutMode === "tree" ? " layout-active" : ""}`}
                onClick={() => setLayoutMode("tree")}
              >
                <span className="layout-icon">→</span> Tree
              </button>
              <button
                type="button"
                className={`layout-btn${layoutMode === "radial" ? " layout-active" : ""}`}
                onClick={() => setLayoutMode("radial")}
              >
                <span className="layout-icon">◎</span> Graph
              </button>
            </div>
          </div>

          {/* Session */}
          <div className="panel-section">
            <h3>Session</h3>
            <div className="row stack">
              <button type="button" disabled={!graph} onClick={exportMd}>
                Export Markdown
              </button>
              <button type="button" onClick={createWorkspace}>
                New workspace
              </button>
            </div>
            {sessionHistory.length > 0 && (
              <div className="session-history">
                <p className="hint small">Recent sessions</p>
                <ul className="session-list">
                  {sessionHistory.slice(0, 5).map((s) => (
                    <li key={s.id} className="session-item">
                      <div className="session-title">{s.question}</div>
                      <div className="session-meta">
                        {new Date(s.at).toLocaleString()} · {s.nodeCount} nodes · {s.edgeCount} edges
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {status && <p className="status">{status}</p>}
        </aside>

        <section className="canvas-wrap">
          {/* Graph canvas */}
          <div className="flow">
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
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onNodesDelete={onNodesDelete}
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
          <div className={`fg-deep-panel${deepPanelOpen ? " fg-deep-panel-open" : ""}`}>
            <button
              className="fg-dp-toggle"
              type="button"
              onClick={() => setDeepPanelOpen(!deepPanelOpen)}
            >
              {deepPanelOpen ? "\u25BC" : "\u25B2"} Deep Panel &middot;{" "}
              {deepMd ? "Ready" : "Select a node"}
            </button>
            <div className="fg-dp-content">
              {deepMd ? (
                <pre className="md">{deepMd}</pre>
              ) : (
                <p className="fg-dp-empty">
                  Run &quot;Deep Answer&quot; after selecting a node to see a research summary.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
