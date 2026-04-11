import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  expandGraph,
  expandSelection,
  health,
} from "./api";
import { DeepAnswerPage } from "./DeepAnswerPage";
import type { GraphNode, MindGraph } from "./graphTypes";
import { mindGraphToFlow, type LayoutMode } from "./layout";
import { MindNode } from "./MindNode";
import { SkeletonMindMap } from "./SkeletonMindMap";
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
  const [generating, setGenerating] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("tree");
  const [deepPageKeyword, setDeepPageKeyword] = useState<string | null>(null);
  const [deepPageAncestors, setDeepPageAncestors] = useState<string[]>([]);

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
    if (!graph) return;

    const selectedSet = new Set(selectedIds);
    const connectedNodes = new Set<string>();
    const connectedEdges = new Set<string>();
    const hasSelection = selectedIds.length > 0;

    for (const edge of graph.edges) {
      const srcSel = selectedSet.has(edge.source);
      const tgtSel = selectedSet.has(edge.target);
      if (srcSel || tgtSel) {
        if (srcSel) connectedNodes.add(edge.target);
        if (tgtSel) connectedNodes.add(edge.source);
        connectedEdges.add(edge.id);
      }
    }
    for (const id of selectedIds) connectedNodes.delete(id);

    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          connected: connectedNodes.has(n.id),
          dimmed: hasSelection && !selectedSet.has(n.id) && !connectedNodes.has(n.id),
        },
      })),
    );

    setEdges((eds) =>
      eds.map((e) => {
        const graphEdge = graph.edges.find((ge) => ge.id === e.id);
        if (connectedEdges.has(e.id)) {
          return {
            ...e,
            animated: true,
            style: { ...e.style, stroke: "#818cf8", strokeWidth: 2.5 },
            className: "edge-connected",
          };
        }
        if (graphEdge) {
          return {
            ...e,
            animated:
              layoutMode === "tree" &&
              (graphEdge.kind === "expands_to" || graphEdge.kind === "has_keyword"),
            style: {
              ...e.style,
              stroke: graphEdge.kind === "has_keyword" ? "#0d9488" : "#475569",
              strokeWidth:
                layoutMode === "radial"
                  ? 1
                  : graphEdge.kind === "has_keyword"
                    ? 1.6
                    : 1.2,
              opacity: hasSelection ? 0.25 : 1,
            },
            className: undefined,
          };
        }
        return e;
      }),
    );
  }, [graph, selectedIds, layoutMode, setNodes, setEdges]);

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

  const runExpand = async () => {
    setBusy(true);
    setGenerating(true);
    setGraph(null);
    setStatus("Expanding question…");
    try {
      const { graph: g } = await expandGraph(question);
      setGraph(g);
      setSelectedIds([]);
      setDeepMd("");
      setStatus("Graph ready.");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
      setGenerating(false);
    }
  };

  const runExpandSelection = async () => {
    if (!graph || !selectedNodes.length) return;
    setBusy(true);
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

  const [deepPageNodeId, setDeepPageNodeId] = useState<string | null>(null);

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

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <strong>MindGraph</strong>
          <span className="sub">keywords · graph · OpenAlex</span>
        </div>
        {apiHealth && (
          <div className="health">
            LLM: {apiHealth.llm ? "on" : "mock"} · OpenAlex mailto:{" "}
            {apiHealth.openAlexMailto ? "set" : "optional"}
          </div>
        )}
      </header>

      <div className="main">
        <aside className="sidebar">
          <label className="lbl">Your question</label>
          <textarea
            className="q"
            rows={4}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. What is federated learning and what are the main privacy risks?"
          />
          <div className="row">
            <button type="button" disabled={busy || !question.trim()} onClick={runExpand}>
              Generate mind map
            </button>
          </div>

          <div className="panel-section">
            <h3>Selection</h3>
            <p className="hint">Click a node. Shift+click to multi-select.</p>
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
                Expand selected (LLM)
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

          <div className="panel-section">
            <h3>Session</h3>
            <div className="row stack">
              <button
                type="button"
                disabled={!graph}
                onClick={exportMd}
              >
                Export Markdown
              </button>
              <button
                type="button"
                onClick={() => {
                  clearSession();
                  setGraph(null);
                  setSelectedIds([]);
                  setDeepMd("");
                  setStatus("Cleared.");
                }}
              >
                Clear saved session
              </button>
            </div>
          </div>

          {status && <p className="status">{status}</p>}
        </aside>

        <section className="canvas-wrap">
          <div className="flow">
            {generating ? (
              <SkeletonMindMap />
            ) : (
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
                <Background gap={16} color="#1e293b" />
              </ReactFlow>
            )}
          </div>
          <div className="deep-panel">
            <h3>Deep panel</h3>
            {deepMd ? (
              <pre className="md">{deepMd}</pre>
            ) : (
              <p className="muted">Run “Deep answer” after selecting nodes.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
