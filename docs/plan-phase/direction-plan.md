# Direction plan (team ideation summary)

This document summarizes the **direction and components** discussed for a knowledge/research companion product—without attributing ideas to individuals.

---

## North star

Build something that helps people **discover non-obvious connections** (especially in research and creative work): not only “top keyword hits,” but **cross-domain inspiration**—similar in spirit to a rich **personal knowledge graph** (Obsidian-like linking), but oriented toward **serendipity and structured exploration**, not just synonym expansion or the most probable next phrase.

A parallel UX goal: make **plans and breakdowns** (tasks, architecture choices, research steps) **editable and navigable as a graph**, not only as a linear chat or a finished markdown file—so users can **branch, revisit choices, and tune sub-parts** instead of only asking for one-shot outputs.

---

## Problem framing

1. **Generic outputs**  
   Large language models optimize for **likely continuations**, which can feel generic compared to highly contextual, personalized reasoning.

2. **Prompt engineering limits**  
   Better prompts help, but not everyone can craft them; broad prompts also lack the **specific “hooks”** that spark real insight.

3. **Research discovery**  
   Keyword and high-correlation retrieval miss **analogous methods in other fields** (e.g., an idea from LLM fine-tuning inspiring a **communication-reduction** angle in federated learning). Pure “low relevance” dumps are **too noisy**; the open design question is how to surface **controlled distance** in the graph.

4. **Workflow**  
   Many people get better results by **splitting work into stages** rather than one giant request—so the product should **externalize and visualize** that structure.

---

## Product components (building blocks)

| Component | Description |
|-----------|-------------|
| **Knowledge / citation graph** | Nodes and edges representing concepts, papers, methods; links justified by **mechanism or analogy**, not only shared keywords. |
| **Interactive keyword expansion** | Early idea: the system surfaces **candidate keywords/topics**; the user **selects** which threads to deepen (reduces overwhelm vs. dumping “low relevance” lists). |
| **Plan ↔ graph** | Turn **plans, architecture decisions, and sectioned specs** (e.g., structured markdown with phases) into a **node diagram** users can click, reorder, or fork—complementing chat-only “planning mode” style Q&A. |
| **Per-session / project memory** | Connect long-running AI sessions to **durable notes** (e.g., project rules files, vault integration) so context isn’t lost across many short chats. |
| **Tooling integration** | Same pattern as linking editors and assistants to a note vault: **MCP (or similar)** so assistants can **read/update** linked notes and graph structures **automatically** where appropriate. |
| **Node detail** | Nodes may carry **rationale and sources** (why this node exists, which papers or snippets support it)—exact UX TBD. |

---

## Technical / research questions (called out in discussion)

- **Architecture of LLMs** (transformers, training objectives) vs. **product-level** behavior: what can be improved **beyond prompt engineering** (retrieval, reranking, graph construction, human-in-the-loop)—versus expectations of **changing core model internals** (typically not what a small product team “alters” directly).
- **Defining “low relevance”** in a useful way: avoid both **filter bubbles** and **random unrelated** content; possible directions include **analogy retrieval**, **constraint-based expansion**, and **user-controlled sliders** for how far to wander.

---

## Example use case (concrete narrative)

**Federated learning + communication cost:** search might stay anchored on “reduce communication in federated learning,” while the graph adds a branch from **parameter-efficient / low-footprint training ideas** (e.g., methods developed in other model families) as **inspiration**, not as a forced conclusion. The tool might suggest **combinations** (“consider pairing X with Y”) without claiming a **final thesis**—matching how real research often **composes** disparate ideas.

---

## Adjacent ideas (same brainstorm, possibly separate products)

- **Price comparison** across major retailers (regional “comparison shopping” analog).
- **Vertical marketplaces / discovery** for cosmetic dermatology and clinics (regional equivalents elsewhere).
- **Lifestyle / utility:** sunset prediction with strong UI; **recipe suggestions** from available ingredients.
- **Study / focus app** with a distinctive theme (e.g., space) as an alternative framing to existing focus apps.
- **Trend digest:** summarize short-form video feeds into a **scannable trend tracker** (acknowledged as a crowded space—differentiation TBD).

---

## Open decisions

- **Scope:** standalone product vs. **editor extension** vs. **Obsidian-style plugin**—tradeoffs: reach, depth, and whether “pretty graph” alone is enough value.
- **Graph generation:** balance **automatic** graph suggestions with **user-curated** links to avoid junk nodes.
- **Revisit choices:** wizard-style planners often **finalize** to a document; the team discussed whether users need to **re-open earlier branches** in the graph without only relying on “edit the markdown later.”

---

## Summary line

**Direction:** an **inspiration-aware knowledge graph** for research and building, with **selectable expansion**, **source-backed nodes**, and **plan-as-graph** editing—integrated with everyday AI coding/research workflows—not only prettier visualization, but **structure, memory, and controlled serendipity**.
