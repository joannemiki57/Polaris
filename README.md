# Polaris

MindGraph MVP: keyword mind map from a question, selection-based deep answers, and OpenAlex paper nodes — Vite + React (React Flow) and an Express BFF.

## Quick start

```bash
npm install
cp server/.env.example server/.env   # add OPENAI_API_KEY, OPENALEX_MAILTO as needed
npm run dev
```

- Web UI: http://localhost:5173  
- API: http://localhost:8787 (try `/api/health`)

## Repo layout

- `client/` — frontend  
- `server/` — API, LLM proxy, OpenAlex + cache  
- `Cursor Hack/` — Obsidian vault (notes + graph)  

See the vault hub note `Cursor Hack/00 · Hub - MindGraph project.md` for architecture links.
