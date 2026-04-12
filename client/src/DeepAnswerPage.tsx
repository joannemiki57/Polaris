import { useCallback, useEffect, useRef, useState } from "react";
import {
  deepAnswerChat,
  deepAnswerInit,
  deepAnswerMorePapers,
  deepAnswerReloadPapers,
  type ChatMsg,
  type DeepPaper,
} from "./api";
import { loadDeepSession, saveDeepSession } from "./persistence";

interface Props {
  keyword: string;
  keywordNodeId: string;
  ancestors: string[];
  onBack: () => void;
}

function renderMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
    )
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>")
    .replace(/\n{2,}/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}

export function DeepAnswerPage({ keyword, keywordNodeId: _keywordNodeId, ancestors, onBack }: Props) {
  const searchKeyword = ancestors.length > 0
    ? [...ancestors].reverse().concat(keyword).join(" ")
    : keyword;
  const starsStorageKey = `deep-stars:${searchKeyword.toLowerCase()}`;
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [papers, setPapers] = useState<DeepPaper[]>([]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [morePaperCount, setMorePaperCount] = useState(10);
  const [addingPapers, setAddingPapers] = useState(false);
  const [reloadingPapers, setReloadingPapers] = useState(false);
  const [starredUrls, setStarredUrls] = useState<Set<string>>(new Set());
  const chatEndRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (!addMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [addMenuOpen]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(starsStorageKey);
      if (!raw) {
        setStarredUrls(new Set());
        return;
      }
      const parsed = JSON.parse(raw) as string[];
      setStarredUrls(new Set(parsed));
    } catch {
      setStarredUrls(new Set());
    }
  }, [starsStorageKey]);

  useEffect(() => {
    setSessionId(null);
    setPapers([]);
    setMessages([]);
    setInput("");
    setError(null);
    setLoading(true);
    setAddMenuOpen(false);
  }, [searchKeyword]);

  const init = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await deepAnswerInit(searchKeyword);
      setSessionId(res.sessionId);
      setPapers(res.papers);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [searchKeyword]);

  useEffect(() => {
    const snapshot = loadDeepSession(searchKeyword);
    if (snapshot && (snapshot.sessionId || snapshot.papers.length > 0 || snapshot.messages.length > 0 || snapshot.input.trim())) {
      setSessionId(snapshot.sessionId);
      setPapers(snapshot.papers as DeepPaper[]);
      setMessages(snapshot.messages as ChatMsg[]);
      setInput(snapshot.input);
      setLoading(false);
      return;
    }
    init();
  }, [init, searchKeyword]);

  useEffect(() => {
    const hasState = Boolean(sessionId) || papers.length > 0 || messages.length > 0 || input.trim().length > 0;
    if (!hasState) return;
    saveDeepSession(searchKeyword, {
      sessionId,
      papers,
      messages,
      input,
      updatedAt: new Date().toISOString(),
    });
  }, [searchKeyword, sessionId, papers, messages, input]);

  const send = async () => {
    if (!input.trim() || !sessionId || sending) return;
    const userMsg: ChatMsg = { role: "user", text: input.trim() };
    const history = [...messages];
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);
    try {
      const { reply } = await deepAnswerChat(
        sessionId,
        searchKeyword,
        userMsg.text,
        history,
      );
      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Error: ${(e as Error).message}` },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const addMorePapers = async () => {
    if (!sessionId || addingPapers) return;
    const n = Math.min(50, Math.max(1, Math.floor(morePaperCount) || 10));
    setAddingPapers(true);
    setError(null);
    try {
      const { papers: next } = await deepAnswerMorePapers(sessionId, n);
      setPapers(next);
      setAddMenuOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAddingPapers(false);
    }
  };

  const toggleStar = (url: string) => {
    setStarredUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      localStorage.setItem(starsStorageKey, JSON.stringify([...next]));
      return next;
    });
  };

  const pinnedVisibleCount = papers.reduce(
    (acc, p) => (starredUrls.has(p.openAlexUrl) ? acc + 1 : acc),
    0,
  );

  const reloadPapers = async () => {
    if (!sessionId || reloadingPapers || papers.length === 0) return;
    setReloadingPapers(true);
    setError(null);
    try {
      const pinnedOpenAlexUrls = papers
        .filter((p) => starredUrls.has(p.openAlexUrl))
        .map((p) => p.openAlexUrl);
      const { papers: next } = await deepAnswerReloadPapers(
        sessionId,
        pinnedOpenAlexUrls,
        papers.length,
      );
      setPapers(next);
      setAddMenuOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReloadingPapers(false);
    }
  };

  return (
    <div className="da-page">
      <nav className="da-nav">
        <button type="button" className="da-back" onClick={onBack}>
          &larr; Back to Graph
        </button>
        <div className="da-breadcrumb">
          <span className="da-crumb-dim">Deep Answer</span>
          {[...ancestors].reverse().map((a) => (
            <span key={a}>
              <span className="da-crumb-sep">/</span>
              <span className="da-crumb-dim">{a}</span>
            </span>
          ))}
          <span className="da-crumb-sep">/</span>
          <span className="da-crumb-node">{keyword}</span>
        </div>
        {papers.length > 0 && (
          <span className="da-paper-badge">{papers.length} papers loaded</span>
        )}
      </nav>

      <div className="da-body">
        {/* Papers sidebar */}
        <aside className="da-sidebar">
          <div className="da-sidebar-head">
            <h3 className="da-sidebar-title">Source Papers</h3>
            {sessionId && !loading && (
              <div className="da-paper-actions">
                <button
                  type="button"
                  className="da-reload-papers-btn"
                  title={
                    pinnedVisibleCount >= papers.length
                      ? "All papers are pinned"
                      : "Replace unpinned papers with new highly cited papers"
                  }
                  aria-label="Reload unpinned papers"
                  disabled={reloadingPapers || addingPapers || pinnedVisibleCount >= papers.length}
                  onClick={reloadPapers}
                >
                  {reloadingPapers ? "Reloading..." : "Reload"}
                </button>
                <div className="da-add-papers-wrap" ref={addMenuRef}>
                  <button
                    type="button"
                    className="da-add-papers-btn"
                    title="Load more papers from OpenAlex"
                    aria-label="Load more research papers"
                    aria-expanded={addMenuOpen}
                    aria-haspopup="dialog"
                    disabled={addingPapers || reloadingPapers}
                    onClick={() => setAddMenuOpen((o) => !o)}
                  >
                    <span className="da-add-papers-icon" aria-hidden>
                      +
                    </span>
                  </button>
                  {addMenuOpen && (
                    <div
                      className="da-add-papers-popover"
                      role="dialog"
                      aria-label="Add more papers"
                    >
                      <label className="da-add-papers-label" htmlFor="da-more-paper-count">
                        How many new papers to fetch (next OpenAlex page, by citations)
                      </label>
                      <div className="da-add-papers-row">
                        <input
                          id="da-more-paper-count"
                          type="number"
                          min={1}
                          max={50}
                          className="da-add-papers-input"
                          value={morePaperCount}
                          onChange={(e) => setMorePaperCount(Number(e.target.value))}
                        />
                        <button
                          type="button"
                          className="da-add-papers-confirm"
                          disabled={addingPapers || reloadingPapers}
                          onClick={addMorePapers}
                        >
                          {addingPapers ? "Loading..." : "Add"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          {loading && <p className="da-sidebar-hint">Searching papers...</p>}
          {error && <p className="da-sidebar-err">{error}</p>}
          <ul className="da-paper-list">
            {papers.map((p, i) => {
              const isStarred = starredUrls.has(p.openAlexUrl);
              return (
                <li key={p.openAlexUrl} className="da-paper-item">
                  <div className="da-paper-rank">#{i + 1}</div>
                  <div className="da-paper-info">
                    <a
                      href={p.openAlexUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="da-paper-title"
                    >
                      {p.title}
                    </a>
                    <div className="da-paper-meta">
                      {p.authors.slice(0, 3).join(", ")}
                      {p.authors.length > 3 ? " et al." : ""}
                      {p.year ? ` · ${p.year}` : ""}
                    </div>
                    <div className="da-paper-stats">
                      {p.citedByCount != null && (
                        <span className="da-cite-count">
                          {p.citedByCount.toLocaleString()} citations
                        </span>
                      )}
                      {p.doi && (
                        <a
                          href={p.doi}
                          target="_blank"
                          rel="noreferrer"
                          className="da-doi"
                        >
                          DOI
                        </a>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`da-star-btn${isStarred ? " da-starred" : ""}`}
                    title={isStarred ? "Unstar paper" : "Star paper"}
                    aria-label={isStarred ? "Unstar paper" : "Star paper"}
                    onClick={() => toggleStar(p.openAlexUrl)}
                  >
                    {isStarred ? "★" : "☆"}
                  </button>
                </li>
              );
            })}
          </ul>
          {papers.length > 0 && (
            <p className="da-attribution">
              Data from{" "}
              <a href="https://openalex.org" target="_blank" rel="noreferrer">
                OpenAlex
              </a>{" "}
              · Review papers excluded
            </p>
          )}
        </aside>

        {/* Chat area */}
        <main className="da-chat">
          <div className="da-messages">
            {loading && (
              <div className="da-system-msg">
                <div className="da-spinner" />
                Searching for research papers about
                <strong> "{searchKeyword}"</strong>...
              </div>
            )}

            {!loading && papers.length > 0 && messages.length === 0 && (
              <div className="da-system-msg">
                <strong>{papers.length} research papers</strong> about "
                {searchKeyword}" loaded (sorted by citation count, review papers
                excluded).
                <br />
                <br />
                Ask any question — the AI will answer based on the paper
                contents.
                <div className="da-suggestions">
                  {[
                    `What are the key approaches in ${keyword}?`,
                    `What are the main challenges and limitations?`,
                    `Summarize the most cited findings`,
                  ].map((q) => (
                    <button
                      key={q}
                      type="button"
                      className="da-suggestion"
                      onClick={() => {
                        setInput(q);
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!loading && papers.length === 0 && !error && (
              <div className="da-system-msg da-empty">
                No research papers found for "{searchKeyword}". Try a different node.
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={`msg-${i}`}
                className={`da-msg ${m.role === "user" ? "da-msg-user" : "da-msg-ai"}`}
              >
                <div className="da-msg-role">
                  {m.role === "user" ? "You" : "AI Research Assistant"}
                </div>
                {m.role === "user" ? (
                  <div className="da-msg-text">{m.text}</div>
                ) : (
                  <div
                    className="da-msg-text da-rendered"
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdown(m.text),
                    }}
                  />
                )}
              </div>
            ))}

            {sending && (
              <div className="da-msg da-msg-ai">
                <div className="da-msg-role">AI Research Assistant</div>
                <div className="da-msg-text da-typing">
                  <span className="da-dot" />
                  <span className="da-dot" />
                  <span className="da-dot" />
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          <div className="da-input-bar">
            <textarea
              className="da-input"
              placeholder={
                loading
                  ? "Loading papers..."
                  : `Ask about "${searchKeyword}" — answers grounded in ${papers.length} papers`
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={loading || !sessionId}
              rows={1}
            />
            <button
              type="button"
              className="da-send"
              disabled={!input.trim() || sending || loading}
              onClick={send}
            >
              Send
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
