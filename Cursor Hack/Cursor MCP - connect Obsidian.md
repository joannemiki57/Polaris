---
tags: [mcp, cursor, obsidian]
---

# Cursor MCP → Obsidian (what is possible)

## What I could not do from here

This chat **cannot** click Cursor Settings or authenticate plugins for you. MCP servers run **on your machine** from **your** Cursor config. Below is the reliable setup path.

## Recommended path

1. **Obsidian** → Settings → Community plugins → install **Local REST API** (or equivalent REST bridge you trust).
2. Enable it, set an **API key**, note **host** + **port** (often `127.0.0.1:27124`).
3. **Keep Obsidian open** while using MCP (the plugin serves the API).

4. **Cursor** → Settings → **MCP** → add a server.

Use one of these ecosystems (pick one and follow its README — versions change):

- Community listings: [MCP Directory — Obsidian](https://mcp.directory/servers/obsidian-local-rest-api), [Cursor Directory — Obsidian](https://cursor.directory/mcp/obsidian-2)
- Example env pattern (conceptual): `OBSIDIAN_API_KEY`, `OBSIDIAN_HOST`, `OBSIDIAN_PORT` pointing at the Local REST API plugin.

## Project template (optional)

A **copy-paste starter** lives at repo root: **`.cursor/mcp.json.example`** (sibling of the `client/` folder). After you pick a concrete MCP server package, duplicate/rename it per Cursor’s docs and fill real keys.

> Cursor may read global `~/.cursor/mcp.json` or project `.cursor/mcp.json` depending on your version — use whichever your Cursor build documents.

## Without MCP

You can still:

- Edit this vault manually (what we are doing now).
- Use the app’s **Export Markdown** and paste into Obsidian.

**Hub**: [[00 · Hub - MindGraph project]]
