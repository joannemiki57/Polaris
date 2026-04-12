---
tags: [session, cursor]
---

# Sessions — Cursor recap

Summary of workstreams in this repo’s Cursor sessions (from project transcript + follow-ups).

## Session A — Product plan (Korean)

- **Idea**: Federated learning style topics → show **many related keywords**; user **picks** keywords to go deeper (like Cursor breaking a big task into steps).
- **Visualization**: **Mind map** of keywords for inspiration / expansion.
- **Papers**: Use **OpenAlex** public REST API to suggest paper links for chosen keywords.
- **North star**: Obsidian-*like* knowledge experience (graph + notes), not full Obsidian clone in v1.

Outcome: a structured implementation plan (phases: scope, data model, LLM JSON, graph UI, OpenAlex, BFF, persistence).

## Session B — Implement MVP

- **Stack**: `client` (Vite + React + **React Flow**) + `server` (Express **BFF**).
- **LLM**: OpenAI on server only; **mock graph** if no `OPENAI_API_KEY`.
- **Expand selection**: LLM returns **`new_nodes` / `new_edges`** merged into existing graph (not a full replace).
- **OpenAlex**: `works` search, **disk cache** under `server/.cache/`, polite `User-Agent` / `mailto`.
- **Client**: sidebar (question, selection, papers, session), graph canvas, deep answer panel, **localStorage** + **Markdown download**.

## Session C — “How do I run it?”

- Documented: `npm install`, `server/.env`, `npm run dev`, ports **5173** (UI) and **8787** (API).

## Session D — API root confusion

- **Issue**: Opening `http://localhost:8787/` looked “broken” because there was no `GET /`.
- **Fix**: Added a small **HTML landing** at `/` pointing to `/api/health` and explaining the Vite proxy.

## Session E — This vault

- Initialized Obsidian vault in **`Cursor Hack/`**.
- Vault notes added to mirror architecture + sessions + MCP instructions + Mermaid “mind map”.

---

*If you add new Cursor chats later, append a short bullet here so the vault stays a living changelog.*

## Update Changelog

- 2026-04-12: Added sessions CHANGELOG template and two-feature row policy | Added session changelog hook and pre-commit enforcement
- 2026-04-12: Converted changelog to Keep a Changelog format | Updated changelog hook to write Unreleased bullets
