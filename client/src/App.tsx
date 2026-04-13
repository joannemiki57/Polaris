import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { toPng } from "html-to-image";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  getRectOfNodes,
  getTransformForBounds,
  type Node as FlowNode,
  useEdgesState,
  useNodesState,
  useReactFlow,
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
import { mindGraphToFlow, type EdgeLineMode, type LayoutMode } from "./layout";
import { MindNode } from "./MindNode";
import { ConstellationLoader } from "./ConstellationLoader";
import { ParallelStraightEdge } from "./ParallelStraightEdge";
import {
  archiveSession,
  clearSession,
  createDefaultWorkspace,
  deleteSessionRecord,
  downloadMarkdown,
  exportMarkdown,
  loadSessionHistory,
  loadSession,
  loadWorkspaceStore,
  promoteSessionRecord,
  saveSession,
  saveWorkspaceStore,
  type SessionRecord,
  type WorkspaceItem,
} from "./persistence";

const nodeTypes = { mind: MindNode };
const edgeTypes = { parallelStraight: ParallelStraightEdge };
const CMD_BAR_ANCHOR_KEY = "mindgraph_cmdbar_anchor_v1";
const EDGE_LINE_MODE_KEY = "mindgraph_edge_line_mode_v1";

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

function deriveWorkspaceNameFromQuestion(question: string, fallback: string): string {
  const normalized = question.trim().replace(/\s+/g, " ");
  if (!normalized) return fallback;

  const firstSentence = normalized.split(/[.?!\n]+/)[0]?.trim() || normalized;
  const keywordTokens = firstSentence.match(/[\p{L}\p{N}][\p{L}\p{N}\-']*/gu) ?? [];

  let baseName: string;
  if (keywordTokens.length > 0) {
    baseName = keywordTokens.slice(0, 5).join(" ");
  } else {
    // For inputs that are not tokenized as words, fall back to a short sentence slice.
    baseName = firstSentence.slice(0, 28).trim();
  }

  if (!baseName) return fallback;
  return baseName.length > 30 ? `${baseName.slice(0, 30).trimEnd()}...` : baseName;
}

function isGenericWorkspaceName(name: string): boolean {
  const normalized = name.trim();
  return /^workspace\s+\d+$/i.test(normalized) || /^recovered session$/i.test(normalized);
}

function getWorkspaceDisplayName(name: string, question: string): string {
  if (!question.trim()) return name;
  if (!isGenericWorkspaceName(name)) return name;
  return deriveWorkspaceNameFromQuestion(question, name);
}

export default function App() {
  const [pngExportMode, setPngExportMode] = useState<"full" | "visible">("full");
  const [showPngExportSettings, setShowPngExportSettings] = useState(false);
  const [cmdbarAnchor, setCmdbarAnchor] = useState<"bottom" | "top">("bottom");
  const [edgeLineMode, setEdgeLineMode] = useState<EdgeLineMode>("diagonal");
  const [showCmdbarSettings, setShowCmdbarSettings] = useState(false);
  const [recentDeleteMode, setRecentDeleteMode] = useState(false);
  const [question, setQuestion] = useState("");
  const [graph, setGraph] = useState<MindGraph | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [apiHealth, setApiHealth] = useState<{
    llm: boolean;
    openAlexMailto: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [deepPageKeyword, setDeepPageKeyword] = useState<string | null>(null);
  const [deepPageNodeId, setDeepPageNodeId] = useState<string | null>(null);
  const [deepPageAncestors, setDeepPageAncestors] = useState<string[]>([]);
  const [paperQuery, setPaperQuery] = useState("");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("radial");
  const [sessionHistory, setSessionHistory] = useState<SessionRecord[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  /** After splash: main workspace (sidebar + canvas) even before a graph exists */
  const [boot, setBoot] = useState<"loading" | "splash" | "workspace">("loading");

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [showLoader, setShowLoader] = useState(false);
  const { fitView: rfFitView } = useReactFlow();
  const flowRef = useRef<HTMLDivElement | null>(null);
  const pngExportSettingsRef = useRef<HTMLDivElement | null>(null);
  const cmdbarSettingsRef = useRef<HTMLDivElement | null>(null);

  // Keep loader mounted during fade-out after busy ends, then center graph
  useEffect(() => {
    if (busy) {
      setShowLoader(true);
    } else if (showLoader) {
      const t = setTimeout(() => {
        setShowLoader(false);
        // Re-center the graph after the loader fades out
        requestAnimationFrame(() => rfFitView({ duration: 400, padding: 0.12 }));
      }, 700);
      return () => clearTimeout(t);
    }
  }, [busy]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CMD_BAR_ANCHOR_KEY);
      if (stored === "top" || stored === "bottom") {
        setCmdbarAnchor(stored);
      }
      const storedLine = localStorage.getItem(EDGE_LINE_MODE_KEY);
      if (storedLine === "diagonal" || storedLine === "parallel") {
        setEdgeLineMode(storedLine);
      }
    } catch {
      // Keep default bottom on storage failures.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CMD_BAR_ANCHOR_KEY, cmdbarAnchor);
      localStorage.setItem(EDGE_LINE_MODE_KEY, edgeLineMode);
    } catch {
      // Ignore localStorage quota/privacy mode errors.
    }
  }, [cmdbarAnchor, edgeLineMode]);

  useEffect(() => {
    if (!showPngExportSettings) return;

    const onPointerDown = (evt: PointerEvent) => {
      const target = evt.target as globalThis.Node | null;
      if (!target || !pngExportSettingsRef.current?.contains(target)) {
        setShowPngExportSettings(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [showPngExportSettings]);

  useEffect(() => {
    if (!showCmdbarSettings) return;

    const onPointerDown = (evt: PointerEvent) => {
      const target = evt.target as globalThis.Node | null;
      if (!target || !cmdbarSettingsRef.current?.contains(target)) {
        setShowCmdbarSettings(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [showCmdbarSettings]);

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
    const syncedItems = migratedItems.map((ws) => ({
      ...ws,
      name: getWorkspaceDisplayName(ws.name, ws.question),
    }));
    const active = syncedItems.find((w) => w.id === store.activeId) ?? syncedItems[0]!;
    setWorkspaces(syncedItems);
    setActiveWorkspaceId(active.id);
    setQuestion(active.question);
    setGraph(active.graph);
    setSessionHistory(loadSessionHistory());
    setBoot(active.graph ? "workspace" : "splash");
  }, []);

  useEffect(() => {
    saveSession({ question, graph });
  }, [question, graph]);

  useEffect(() => {
    if (!activeWorkspaceId || workspaces.length === 0) return;
    setWorkspaces((prev) => {
      let changed = false;
      const next = prev.map((ws) => {
        if (ws.id !== activeWorkspaceId) return ws;
        const nextName = getWorkspaceDisplayName(ws.name, question);
        if (ws.question === question && ws.graph === graph && ws.name === nextName) return ws;
        changed = true;
        return {
          ...ws,
          name: nextName,
          question,
          graph,
        };
      });
      return changed ? next : prev;
    });
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
    const { nodes: n, edges: e } = mindGraphToFlow(graph, layoutMode, edgeLineMode);
    setNodes(n);
    setEdges(e);
  }, [graph, layoutMode, edgeLineMode, setEdges, setNodes]);

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

  const onNodeClick = useCallback((evt: ReactMouseEvent, node: FlowNode) => {
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

  const onNodesDelete = useCallback((deletedNodes: FlowNode[]) => {
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
      setWorkspaces((prev) => prev.map((ws) => (
        ws.id === activeWorkspaceId
          ? { ...ws, name: getWorkspaceDisplayName(ws.name, query) }
          : ws
      )));
      setGraph(g);
      setSelectedIds([]);
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

  const exportPng = async () => {
    if (!graph) return;

    const flowRoot = flowRef.current?.querySelector(".react-flow") as HTMLElement | null;
    const viewportEl = flowRef.current?.querySelector(".react-flow__viewport") as HTMLElement | null;
    if (!flowRoot || !viewportEl) {
      setStatus("Unable to find diagram area for PNG export.");
      return;
    }

    setBusy(true);
    setStatus("Rendering PNG...");
    try {
      const isFullGraph = pngExportMode === "full";
      const baseWidth = Math.max(1, Math.round(flowRoot.clientWidth));
      const baseHeight = Math.max(1, Math.round(flowRoot.clientHeight));

      let target = flowRoot;
      let width = baseWidth;
      let height = baseHeight;
      let style: Partial<CSSStyleDeclaration> | undefined;
      let filter: ((node: HTMLElement) => boolean) | undefined;

      if (isFullGraph && nodes.length > 0) {
        const nodesBounds = getRectOfNodes(nodes);
        const paddedWidth = Math.ceil(nodesBounds.width + 180);
        const paddedHeight = Math.ceil(nodesBounds.height + 180);

        width = Math.max(baseWidth, Math.min(7000, paddedWidth));
        height = Math.max(baseHeight, Math.min(7000, paddedHeight));

        const [x, y, zoom] = getTransformForBounds(nodesBounds, width, height, 0.9, 2);

        target = viewportEl;
        style = {
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${x}px, ${y}px) scale(${zoom})`,
          transformOrigin: "0 0",
        };
        filter = () => true;
      } else {
        filter = (node) => {
          const cls = node.classList;
          if (!cls) return true;
          return !cls.contains("react-flow__controls")
            && !cls.contains("react-flow__minimap")
            && !cls.contains("react-flow__attribution");
        };
      }

      const dataUrl = await toPng(target, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#09090b",
        width,
        height,
        style,
        filter,
      });

      const stem = (graph.title || question || "mindgraph").replace(/[^\w\-]+/g, "_");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${stem}.png`;
      a.click();
      setStatus(isFullGraph ? "PNG downloaded (full graph)." : "PNG downloaded (visible area).");
    } catch (e) {
      setStatus(`PNG export failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleGoHome = () => {
    archiveSession({ question, graph });
    setSessionHistory(loadSessionHistory());
    setGraph(null);
    setSelectedIds([]);
    setQuestion("");
    setStatus("");
    clearSession();
    setBoot("workspace");
  };

  const createWorkspace = () => {
    const nextIndex = workspaces.length + 1;
    const next = createDefaultWorkspace(`Workspace ${nextIndex}`);
    setWorkspaces((prev) => {
      const withCurrent = prev.map((ws) => (
        ws.id === activeWorkspaceId ? { ...ws, question, graph } : ws
      ));
      return [...withCurrent, next];
    });
    setActiveWorkspaceId(next.id);
    setQuestion("");
    setGraph(null);
    setSelectedIds([]);
    setDeepPageKeyword(null);
    setStatus(`Created ${next.name}.`);
    setBoot("workspace");
  };

  const switchWorkspace = (id: string) => {
    if (id === activeWorkspaceId) return;
    const withCurrent = workspaces.map((ws) => (
      ws.id === activeWorkspaceId ? { ...ws, question, graph } : ws
    ));
    const target = withCurrent.find((ws) => ws.id === id);
    if (!target) return;
    setWorkspaces(withCurrent);
    setActiveWorkspaceId(id);
    setQuestion(target.question);
    setGraph(target.graph);
    setSelectedIds([]);
    setDeepPageKeyword(null);
    setStatus(`Switched to ${target.name}.`);
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
    }
  };

  const openRecentSessionAsWorkspace = (record: SessionRecord) => {
    const findExistingWorkspace = (list: WorkspaceItem[]): WorkspaceItem | undefined => {
      const expectedTitle = record.graph?.title || record.graphTitle || "Untitled graph";
      return list.find((ws) => {
        const wsTitle = ws.graph?.title || "Untitled graph";
        const wsNodeCount = ws.graph?.nodes.length ?? 0;
        const wsEdgeCount = ws.graph?.edges.length ?? 0;
        return ws.question === record.question
          && wsTitle === expectedTitle
          && wsNodeCount === record.nodeCount
          && wsEdgeCount === record.edgeCount;
      });
    };

    const withCurrent = workspaces.map((ws) => (
      ws.id === activeWorkspaceId ? { ...ws, question, graph } : ws
    ));
    const existing = findExistingWorkspace(withCurrent);
    if (existing) {
      const updated = withCurrent.map((ws) => {
        if (ws.id !== existing.id) return ws;
        const nextQuestion = record.question;
        const nextGraph = record.graph ?? ws.graph;
        return {
          ...ws,
          name: getWorkspaceDisplayName(ws.name, nextQuestion),
          question: nextQuestion,
          graph: nextGraph,
        };
      });
      const target = updated.find((ws) => ws.id === existing.id)!;
      setWorkspaces(updated);
      setActiveWorkspaceId(target.id);
      setQuestion(target.question);
      setGraph(target.graph);
      setSelectedIds([]);
      setDeepPageKeyword(null);
      setSessionHistory(promoteSessionRecord(record.id));
      if (!target.graph && target.question.trim()) {
        setStatus(`Switched to ${target.name}. Regenerating graph from question...`);
        setTimeout(() => {
          void runExpand(target.question);
        }, 0);
      } else {
        setStatus(`Switched to existing workspace: ${target.name}.`);
      }
      setBoot("workspace");
      return;
    }

    const baseName = deriveWorkspaceNameFromQuestion(record.question, "Recovered session");
    const next = createDefaultWorkspace(baseName);
    const fromRecent: WorkspaceItem = {
      ...next,
      question: record.question,
      graph: record.graph,
    };
    setWorkspaces((prev) => {
      const withCurrentInPrev = prev.map((ws) => (
        ws.id === activeWorkspaceId ? { ...ws, question, graph } : ws
      ));
      return [...withCurrentInPrev, fromRecent];
    });
    setActiveWorkspaceId(fromRecent.id);
    setQuestion(fromRecent.question);
    setGraph(fromRecent.graph);
    setSelectedIds([]);
    setDeepPageKeyword(null);
    setSessionHistory(promoteSessionRecord(record.id));
    if (!record.graph && record.question.trim()) {
      setStatus(`Opened ${fromRecent.name}. Regenerating graph from question...`);
      setTimeout(() => {
        void runExpand(record.question);
      }, 0);
    } else {
      setStatus(`Opened recent session as ${fromRecent.name}.`);
    }
    setBoot("workspace");
  };

  const finishSplash = useCallback(() => {
    setBoot("workspace");
  }, []);

  const removeRecentSession = useCallback((id: string) => {
    const next = deleteSessionRecord(id);
    setSessionHistory(next);
    if (next.length === 0) {
      setRecentDeleteMode(false);
    }
    setStatus("Recent session deleted.");
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
            const displayName = getWorkspaceDisplayName(ws.name, ws.question);
            return (
              <div key={ws.id} className={`workspace-tab${active ? " workspace-tab-active" : ""}`}>
                <button
                  type="button"
                  className="workspace-tab-main"
                  onClick={() => switchWorkspace(ws.id)}
                  title={displayName}
                >
                  {displayName}
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
          <div className="navbar-settings" ref={cmdbarSettingsRef}>
            <button
              type="button"
              className="navbar-settings-btn"
              onClick={() => setShowCmdbarSettings((prev) => !prev)}
              aria-haspopup="menu"
              aria-expanded={showCmdbarSettings}
              title="Personal settings"
            >
              ⚙
            </button>
            {showCmdbarSettings && (
              <div className="navbar-settings-popover" role="menu" aria-label="Personal settings">
                <p className="navbar-settings-title">Search bar position</p>
                <label className="navbar-settings-option">
                  <input
                    type="radio"
                    name="cmdbar-anchor"
                    value="bottom"
                    checked={cmdbarAnchor === "bottom"}
                    onChange={() => setCmdbarAnchor("bottom")}
                  />
                  Fixed at bottom (default)
                </label>
                <label className="navbar-settings-option">
                  <input
                    type="radio"
                    name="cmdbar-anchor"
                    value="top"
                    checked={cmdbarAnchor === "top"}
                    onChange={() => setCmdbarAnchor("top")}
                  />
                  Fixed at top
                </label>
                <hr className="navbar-settings-divider" />
                <p className="navbar-settings-title">Connection lines</p>
                <label className="navbar-settings-option">
                  <input
                    type="radio"
                    name="edge-line-mode"
                    value="diagonal"
                    checked={edgeLineMode === "diagonal"}
                    onChange={() => setEdgeLineMode("diagonal")}
                  />
                  Diagonal straight
                </label>
                <label className="navbar-settings-option">
                  <input
                    type="radio"
                    name="edge-line-mode"
                    value="parallel"
                    checked={edgeLineMode === "parallel"}
                    onChange={() => setEdgeLineMode("parallel")}
                  />
                  Parallel straight
                </label>
              </div>
            )}
          </div>
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
            <div className="panel-head">
              <h3>Session</h3>
              <div className="session-settings" ref={pngExportSettingsRef}>
                <button
                  type="button"
                  className="session-settings-btn"
                  onClick={() => setShowPngExportSettings((prev) => !prev)}
                  aria-haspopup="menu"
                  aria-expanded={showPngExportSettings}
                  title="PNG export settings"
                >
                  ⚙
                </button>
                {showPngExportSettings && (
                  <div className="session-settings-popover" role="menu" aria-label="PNG export settings">
                    <p className="session-settings-title">PNG export scope</p>
                    <label className="session-settings-option">
                      <input
                        type="radio"
                        name="png-export-mode"
                        value="full"
                        checked={pngExportMode === "full"}
                        onChange={() => setPngExportMode("full")}
                      />
                      Full graph (all nodes)
                    </label>
                    <label className="session-settings-option">
                      <input
                        type="radio"
                        name="png-export-mode"
                        value="visible"
                        checked={pngExportMode === "visible"}
                        onChange={() => setPngExportMode("visible")}
                      />
                      Visible area only
                    </label>
                  </div>
                )}
              </div>
            </div>
            <div className="row stack">
              <button type="button" disabled={!graph} onClick={exportMd}>
                Export Markdown
              </button>
              <button type="button" disabled={!graph || busy} onClick={exportPng}>
                {pngExportMode === "full" ? "Export PNG (Full graph)" : "Export PNG (Visible area)"}
              </button>
              <button type="button" onClick={createWorkspace}>
                New workspace
              </button>
            </div>
            {sessionHistory.length > 0 && (
              <div className="session-history">
                <div className="session-history-head">
                  <p className="hint small">Recent sessions</p>
                  <button
                    type="button"
                    className={`session-trash-btn${recentDeleteMode ? " session-trash-btn-active" : ""}`}
                    onClick={() => setRecentDeleteMode((prev) => !prev)}
                    title={recentDeleteMode ? "Exit delete mode" : "Delete recent sessions"}
                    aria-label={recentDeleteMode ? "Exit delete mode" : "Delete recent sessions"}
                  >
                    🗑️
                  </button>
                </div>
                <ul className="session-list">
                  {sessionHistory.slice(0, 5).map((s) => (
                    <li
                      key={s.id}
                      className={`session-item${recentDeleteMode ? " session-item-delete-mode" : ""}`}
                    >
                      <div className="session-item-row">
                      <button
                        type="button"
                        className="session-open-btn"
                        onClick={() => openRecentSessionAsWorkspace(s)}
                        title="Open this recent session as a new workspace tab"
                      >
                        <div className="session-title">{s.question}</div>
                        <div className="session-meta">
                          {new Date(s.at).toLocaleString()} · {s.nodeCount} nodes · {s.edgeCount} edges
                        </div>
                      </button>
                        {recentDeleteMode && (
                          <button
                            type="button"
                            className="session-delete-btn"
                            onClick={() => removeRecentSession(s.id)}
                            title="Delete this recent session"
                            aria-label="Delete this recent session"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {status && <p className="status">{status}</p>}
        </aside>

        <section className={`canvas-wrap${cmdbarAnchor === "top" ? " canvas-wrap-cmdbar-top" : ""}`}>
          {/* Graph canvas */}
          <div className="flow" ref={flowRef}>
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
            {showLoader && <ConstellationLoader status={status} visible={busy} />}
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onNodesDelete={onNodesDelete}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
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
          {/* Deep panel removed: Deep workflow now runs through full-screen Deep Answer page. */}
        </section>
      </div>
    </div>
  );
}
