# Limitations and risks

This document captures **gaps, risks, and open questions** in the current direction so the team can **tighten scope** before over-investing. It complements [`direction-plan.md`](./direction-plan.md) and [`agentic-research.md`](./agentic-research.md).

---

## Summary

The **north star**—an **inspiration-aware knowledge graph** backed by **structured reasoning** and **retrieval beyond naive token prediction**—is defensible. The main risks are **scope creep**, **underspecified relevance**, **graph UX overload**, **diluted vision** from unrelated ideas, and **unclear trust boundaries** for tool integration. Addressing these early improves the odds of shipping something **usable**, not only **conceptually attractive**.

---

## 1. Scope and feasibility

### Issue

The direction bundles **many heavy capabilities** in one place: **semantic search**, **graph-based planning**, **long-term project memory**, **note-vault integration**, optional **MCP-style** automation, and references to **other product ideas**. Each slice is **non-trivial** on its own; stacking them risks **thin execution** and long time-to-learning.

Concrete example: **memory-augmented** or long-context setups need **careful gating, evaluation, and tuning** so that extra memory does not **hurt** core quality or latency. That engineering cost is easy to underestimate when it is one bullet among many.

### Implication

A **narrower MVP** should **validate one or two core assumptions** first—for example:

- **Retrieval + graph visualization** over a **curated or vertical corpus**, *before* full vault sync; or  
- **User-selected expansion** (keyword/thread picking) *before* automatic “serendipity” edges.

Peripheral features can wait until the **core loop** (ask → explore graph → deepen → save) is proven.

---

## 2. “Low relevance” and controlled distance

### Issue

The plan admits that **distant but useful analogies** are hard to retrieve, but it does not yet define **operational criteria** for **fruitful** “controlled distance” versus **noise**. Without such criteria, the system may either:

- **Overwhelm** users with **spurious** links, or  
- **Miss** genuinely useful **non-obvious** connections.

### Implication

A **principled starting point** (not a final answer) could combine:

- **Concept-level** representations (e.g., sentence- or paragraph-level embeddings, ontology nodes) so “distance” is not only lexical.  
- **Knowledge-graph** structure (entities, relation types) so edges have **semantics**, not only cosine similarity—consistent with **knowledge-graph prompting** and KG+RAG lines of work summarized in `agentic-research.md`.

Still required:

- **User-tunable** controls (e.g., similarity thresholds, domain filters, “exploration” vs. “focus” modes).  
- **Iterative refinement** (feedback on edges: useful / not useful) to **learn** what “good distance” means for a given user or project.

Until these are specified, “low relevance” remains a **label**, not a **specification**.

---

## 3. User workflow and cognitive load

### Issue

**Staging work** and **graph UIs** align with how some people think, but **visual graphs scale poorly** in the head: large or hairball graphs become **pretty pictures** instead of **tools**, especially for users who already face **high intrinsic complexity** (research, large codebases).

### Implication

Explicit **UX mitigations** should be part of the core plan, not an afterthought:

| Mitigation | Role |
|------------|------|
| **Default templates** | Onboarding: typical flows (literature review, architecture decision, weekly synthesis). |
| **Search and filters** | Domain, time range, language, source type—**reduce** visible nodes to a workable set. |
| **Summarization** | Node- and cluster-level summaries so users do not read full text at every vertex. |
| **Progressive disclosure** | Collapse regions, focus mode, “expand neighborhood” instead of full graph at once. |

**UX research** (task studies, prototypes) should test whether the graph **reduces** or **adds** cognitive load for the **target** workflow.

---

## 4. Adjacent ideas and vision clarity

### Issue

Brainstorm lists that mix **core vision** (knowledge graph, research inspiration) with **unrelated products** (e.g., price comparison, vertical marketplaces, lifestyle utilities) can **dilute** the story for teammates, investors, and users.

### Implication

Treat **adjacent ideas** as **separate tracks** or a **parking lot** document—not as part of the **same** MVP narrative unless there is a **hard dependency**. That keeps the **primary goal** legible and avoids **confusing** positioning.

---

## 5. Integration with existing tools (vault, MCP, assistants)

### Issue

**Note-vault integration** and **MCP** are mentioned, but depth is unspecified: **what** is read/written, **when**, and under **whose control**? Without clarity, users may fear **silent edits**, **leaks**, or **unclear provenance** (“did the model infer this or did I write it?”).

### Implication

Define **trust boundaries** early:

| Topic | Questions to answer |
|-------|---------------------|
| **Read scope** | Whole vault vs. selected folders vs. tagged notes? |
| **Write scope** | Append-only suggestions vs. direct edits? User confirmation per write? |
| **Permissions** | OS / editor / MCP token scopes; what runs locally vs. remotely. |
| **Provenance** | Which nodes or edges came from **retrieval**, **LLM suggestion**, or **user**—surfaced in UI. |
| **Conflict handling** | Vault changed offline while the agent proposed edits—how to merge? |

These are **product and security** requirements, not implementation details only.

---

## 6. Recommended focus (meta)

To move from **vision** to **product**:

1. **Shrink the MVP** to a **narrow feature set** that proves **one** core loop.  
2. **Define relevance** at least at the level of **metrics + user controls + feedback**, even if the first version is crude.  
3. **Invest in UX research** so the graph **supports** creative and research work rather than **competing** with it for attention.  
4. **Isolate** non-core product ideas so messaging stays **sharp**.  
5. **Specify integration** policies so **trust** scales with **adoption**.

---

## Relationship to strengths

None of the above negates the **north star**. Structured reasoning (graphs, retrieval, optional KG) remains a **credible** direction; the critique is that **shipping** requires **focus**, **metrics**, **UX discipline**, and **trust design**—not only a richer architecture diagram.
