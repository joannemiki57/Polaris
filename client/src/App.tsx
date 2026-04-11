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
  deepAnswer,
  expandGraph,
  expandSelection,
  health,
} from "./api";
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

export default function App() {
  const [question, setQuestion] = useState("");
  const [graph, setGraph] = useState<MindGraph | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [paperQuery, setPaperQuery] = useState("");
  const [deepMd, setDeepMd] = useState("");
  const [status, setStatus] = useState("");
  const [apiHealth, setApiHealth] = useState<{
    llm: boolean;
    openAlexMailto: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);

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

  const runExpand = async () => {
    setBusy(true);
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

  const runDeep = async () => {
    if (!graph) return;
    setBusy(true);
    setStatus("Deep answer…");
    try {
      const sel = selectedNodes.map((n) => ({
        id: n.id,
        label: n.label,
        summary: n.summary,
      }));
      const { markdown } = await deepAnswer(question, sel);
      setDeepMd(markdown);
      setStatus("Deep answer ready.");
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

  const exportMd = () => {
    if (!graph) return;
    const md = exportMarkdown(question, graph);
    downloadMarkdown(
      `${(graph.title || "mindgraph").replace(/[^\w\-]+/g, "_")}.md`,
      md,
    );
    setStatus("Markdown downloaded.");
  };

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
                disabled={busy || !graph || selectedNodes.length === 0}
                onClick={runDeep}
              >
                Deep answer (LLM)
              </button>
            </div>
          </div>

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
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.2}
              maxZoom={1.5}
            >
              <MiniMap pannable zoomable />
              <Controls />
              <Background gap={16} color="#1e293b" />
            </ReactFlow>
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
