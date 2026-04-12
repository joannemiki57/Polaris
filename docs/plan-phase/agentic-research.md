# Agentic research: LLM architecture, limits, and a graph-based knowledge network

This note complements [`direction-plan.md`](./direction-plan.md). It summarizes **technical background** (how LLMs are trained, where generic outputs come from), **recent research directions** (memory, graphs, retrieval, concept-level models), and a **feasible system design** for cross-domain inspiration—going **beyond prompt engineering alone** by changing **retrieval, structure, and reasoning**, not by claiming we can trivially “retrain the base model” in a product setting.

---

## Executive summary

- **Pre-training** fits a **next-token** objective; decoder-style models use **left-to-right** masking and learn broad **statistical** patterns over text.
- That objective **scales** but tends to favor **high-probability** continuations, which can feel **generic**; **teacher-forcing** and single-step prediction also interact badly with **planning** and **long-horizon** consistency.
- **Mitigations in the literature** include: **data-dependent position / memory** (e.g., PaTH-style encodings, memory-augmented decoders), **graph-structured reasoning** (GoT, NoT), **KG + RAG** (MindMap-style pipelines), **concept- / multi-token-level** objectives, and **diversity-aware** decoding (e.g., G2-style guiding).
- For **cross-domain discovery** (e.g., federated learning plus industrial engineering), combine **multilingual embeddings**, **explicit KGs**, **adjustable retrieval** (including controlled “distant” hits), and a **UI** that makes paths **inspectable**—aligned with the **mind-map / selectable expansion** direction in `direction-plan.md`.

---

## 1. Pre-training and the next-token objective

### 1.1 What pre-training optimizes

During **pre-training**, the model learns **statistical regularities** by predicting **tokens**. In typical **decoder-only** setups, **left-to-right masking** enforces causal prediction; the objective is usually **cross-entropy** on the **next token**. That process builds a **statistical representation** of language useful for downstream tasks.

### 1.2 Token-level objectives and limitations

**Core issue:** minimizing next-token loss **encourages likely continuations**, which can yield **generic or repetitive** text.

**Teacher-forcing and planning:** Work on the **pitfalls of next-token prediction** argues that **teacher-forcing** can create **shortcuts** (“Clever Hans”): later tokens leak information about earlier steps, so the model may not learn a **true** step-by-step predictor; **planning-heavy** tasks remain hard. Proposed directions include predicting **multiple** tokens per step or **teacherless** objectives.

**Other limitations:**

| Limitation | Sketch |
|------------|--------|
| **Error compounding** | In **autoregressive** generation, small mistakes **accumulate** and derail long outputs. |
| **Generic / low-diversity outputs** | **Guide-to-Generation (G2)**-style analysis: many sampling tweaks trade **diversity vs. quality**; G2 uses **guiding modules** and **selective** interventions to improve diversity **without** trashing quality. |
| **Context length** | Standard Transformers use **finite** windows (e.g., on the order of **4k–8k** tokens); long documents risk **forgetting** early content or **hallucination**. |
| **Cross-domain retrieval** | **Keyword** retrieval surfaces **high lexical / correlational** overlap but often misses **analogical** structures or **low-correlation** inspirational links. |

---

## 2. Innovations in architecture and reasoning

Recent work addresses the above with **new modules**, **memory**, **explicit graphs**, and **non-token-level** targets.

### 2.1 Data-dependent positional encodings and state tracking

**PaTH Attention** (**P**osition via **A**ccumulating **H**ouseholder **T**ransformations) replaces **static** RoPE-like schemes with **content-dependent** transformations along the sequence: positions are not only “distance” but a **path** of small reflections whose parameters depend on **token content**. This can track **how meaning evolves** over long sequences—useful for **state-tracking** tasks. With a **forgetting** mechanism (**PaTH-FoX**), irrelevant context can be **down-weighted** for **long-context** understanding.

### 2.2 Memory-augmented Transformers

**Large Memory Model (LM²)** adds an **auxiliary memory bank** to the decoder: stored vectors interact with the main stream via **cross-attention**; **input / forget / output**-style gating updates memory. It **preserves** the usual Transformer path while adding a **second** information channel. Reported gains include stronger **multi-hop** and **long-context QA** (e.g., benchmarks like **BABILong**), relative to strong **Llama** baselines.

### 2.3 Graph-based reasoning: GoT and NoT

| Framework | Idea | Contrast to linear CoT |
|-----------|------|-------------------------|
| **Chain-of-Thought (CoT)** | Linear step-by-step trace | Single path, no merge. |
| **Tree-of-Thought (ToT)** | Branching search | Branches, but **no** arbitrary **merge** of paths. |
| **Graph of Thoughts (GoT)** | Each “thought” is a **vertex**; **edges** are dependencies; supports **merge**, **feedback**, **backtracking** | Generalizes CoT/ToT; reported gains on tasks like **sorting** vs. ToT. |
| **Network-of-Thought (NoT)** | **Directed graph** with **typed** nodes; **heuristic controller** chooses expansion | Targets **reuse**, **loops**, **multi-source** evidence; strong on **multi-hop** QA vs. tree methods. |

These frameworks matter for a **product** because they separate **reasoning topology** from “one long string of tokens.”

### 2.4 Knowledge-graph prompting and MindMap-style pipelines

**MindMap**-style approaches use a **KG** in the **prompting / retrieval** loop: extract **entities** from a question, pull a **subgraph** of evidence, **merge**, then **reason**. Motivations include **less hallucination** and **transparent** reasoning paths; the user can see a **mind-map-like** trace of **how** the model connected dots.

### 2.5 Knowledge graphs, RAG, and search

Surveys on **LLMs + KGs + search engines** describe **synergies**: KGs can **annotate** data, **co-train** with text, or **inject triples** into prompts; **RAG** pulls **documents** at inference time into context. Open problems include **reliability**, **freshness**, and **efficiency** of combining these layers.

### 2.6 Concept-level models and multi-token prediction

**Large Concept Models (LCM)** operate at **sentence- / concept-level** abstractions (e.g., **SONAR** embedding space, **200+** languages), with **autoregressive** prediction in embedding space and variants (regression, diffusion, quantization). This is a different **unit of prediction** than raw subwords.

**Multi-token prediction** and **teacherless** training (e.g., **MARS**-style fine-tuning) try to align training with **lookahead** structure without always changing the **outer** architecture—directly addressing **next-token** pathologies called out in §1.2.

### 2.7 Diversity-oriented generation (G2)

**G2** adds **in-model** guides: a **base** generator for quality, a **diversity** guide for novelty, a **dedupe** guide against repetition; **center selection** and **entropy-based** intervention apply guidance when **uncertainty** is high—improving **diversity** with smaller quality loss.

---

## 3. Cross-domain retrieval and federated learning

### 3.1 Federated learning (FL) as context

**Federated learning** trains across **clients** with **local** data; only **updates** (not raw data) are shared—**privacy** and **decentralization** are central. System design involves **communication cost**, **client selection**, **compression**, **heterogeneity**, etc. Toolkits and **architectural patterns** (e.g., registries, selectors, compressors, multi-task trainers) make FL engineering **explicit**.

**Analogy to LLM systems:** **distributed** computation, **aggregation** of partial updates, and **heterogeneous** sources parallel themes in **multi-agent** or **memory-augmented** setups—useful when explaining **cross-domain** links (e.g., “distributed memory” in LM² vs. “distributed training” in FL) in a **knowledge graph**, not as a mathematical identity.

### 3.2 Finding FL-related work across languages and domains

**연합 학습** is Korean for **federated learning**. Industrial-engineering papers may use different **terminology** (e.g., **IIoT**, **smart manufacturing**, **edge**). Practical retrieval strategies:

1. **Multilingual embeddings** (e.g., **SONAR**, multilingual **SBERT**) on **titles/abstracts** with queries in **English + Korean** and related phrases (**distributed optimization**, **privacy-preserving ML**, **split learning**, **edge computing**).
2. **Knowledge graph** links between **FL**, **privacy**, **edge**, **communication-efficient** training, and **domain-specific** ontologies (e.g., manufacturing) so **analogy edges** are first-class.
3. **Hybrid retrieval:** **dense** (embedding) + **sparse** (TF–IDF/BM25) over **Semantic Scholar**-class indexes; **tunable** inclusion of **lower-scoring** hits for **inspiration** (with UI guardrails—see §4).
4. **Human-in-the-loop:** curated **seed lists** of papers for a vertical (industrial engineering) **merged** into the graph.

This directly supports the **direction-plan** idea: **controlled distance** in the graph beats both **pure keyword** lists and **unfiltered** low-relevance dumps.

---

## 4. Proposed mind-map network system

### 4.1 Concept

A **mind-map / knowledge-graph** layer that connects **ideas beyond surface keywords**, aimed at researchers who need **cross-domain inspiration** (e.g., architecture from **LLM fine-tuning** informing **communication-efficient FL**—not necessarily found by a single keyword query).

**Design pillars:**

1. **Semantic nodes** — Documents (papers, reports) embedded with **multilingual** sentence encoders; **paragraph/topic** granularity; metadata (**domain, year, language**).
2. **KG integration** — NER/RE → triples; **entity linking** to **Wikidata** (and domain ontologies where available); optional vertical KGs (**UMLS**, industry taxonomies).
3. **Edge semantics** — Edges from **embedding similarity**, **co-citation**, **shared mechanism** labels—not only **word overlap**; optional **low-weight** edges for **serendipity** (user-tunable).
4. **Graph reasoning** — Query-time traversal with **NoT/GoT**-style **heuristics**: **merge** paths, **revisit** nodes, **fuse** evidence; **MindMap**-like **transparent** subgraphs for answers.
5. **Interactive UI** — **Obsidian-like** exploration: expand nodes, **summaries**, **provenance**, **annotations**; strategies like **high-similarity** (focus) vs. **exploratory** (distant) neighborhoods.
6. **LLM layer** — **Summarization**, **suggested links**, **RAG** answers over retrieved subgraphs; LLM as **controller heuristic** for traversal (within cost limits), not only as a **single-shot** generator.

### 4.2 Implementation outline

| Stage | Tasks |
|-------|--------|
| **Ingestion** | arXiv, IEEE, reports; **language ID**; optional **translation**; metadata + citations. |
| **Embedding & clustering** | Multilingual embeddings; **theme** clusters for navigation. |
| **KG construction** | NER/RE; **entity linking**; triple store + vector index. |
| **Edges** | Cosine similarity, **citation**, **co-authorship**, **curated** analogy links. |
| **Reasoning** | Heuristic search (A*, **MCTS**, etc.), **NoT**-style expansion policy; **RAG** over selected nodes. |
| **UI** | Graph + notes; filters (**domain, language, year**); **“serendipity”** control for distant edges. |

### 4.3 Feasibility and challenges

**What literature already supports:** richer **position/memory** (§2.1–2.2), **graph reasoning** (§2.3), **KG+RAG+MindMap** pipelines (§2.4–2.5), **concept / multi-token** training directions (§2.6), **diversity** tools (§2.7). That stack is **not** “only prompts”: it is **architecture + data structures + algorithms + UI**.

**Hard parts:**

- **Scale** — Large graphs need **efficient** stores (**Neo4j**, etc.) and possibly **GNN**-style scoring; indexing at **million-node** scale is non-trivial.
- **Quality & bias** — KGs are **incomplete**; **entity disambiguation** and **conflicting** sources need policies.
- **Cost** — **LLM-guided** graph search can be **expensive**; must bound **depth**, **width**, and **tokens**.
- **Adoption** — Users must understand **why** a distant edge appeared; **explainability** (MindMap/GoT spirit) is part of the value prop.

**Boundary:** A product team typically **does not** replace the **foundation model’s** pre-training objective overnight; **this** roadmap alters **what surrounds** the LM: **memory**, **graphs**, **retrieval**, **decoding**, and **interaction**—which is exactly where **agentic, graph-first research** can be **shipped** incrementally.

---

## 5. Conclusion

**Transformers** trained with **next-token** objectives achieve broad linguistic competence but **bias** toward **likely** text, with known issues in **planning**, **long context**, **diversity**, and **keyword-bound retrieval**. **Recent research** addresses this through **better positional/state tracking**, **external memory**, **graph-structured reasoning**, **KG-aware prompting**, **RAG**, **concept-level** prediction, and **guided decoding**.

For **cross-domain inspiration**—including **federated learning** in settings like **industrial engineering**—a **mind-map network** that combines **embeddings**, **explicit graphs**, **weighted edges** (including **controlled** low-correlation links), and **inspectable** reasoning aligns with both the **literature** and the product **direction** in [`direction-plan.md`](./direction-plan.md). Implementation is **demanding** but **modular**: many **components** exist as **research artifacts**; the engineering task is to **integrate** them into a **coherent**, **user-governed** exploration tool—not to pretend that **prompt engineering alone** replaces **structure**.

---

## 6. Source map (papers & themes cited in this synthesis)

Use this as a **reading list** for deeper dives; add formal citations in any academic write-up.

| Theme | Examples / keywords |
|--------|---------------------|
| Next-token pitfalls, teacher-forcing, multi-token | “Pitfalls of Next-Token Prediction”; MARS-style multi-token fine-tuning |
| Long-context, position, forgetting | PaTH Attention, PaTH-FoX |
| Memory in Transformers | LM² (Large Memory Model), BABILong-style benchmarks |
| Graph reasoning | Graph of Thoughts (GoT), Network-of-Thought (NoT), vs. CoT/ToT |
| KG + LLM + transparency | MindMap (KG prompting), LLM+KG+search surveys |
| Concept-level / multilingual | Large Concept Models (LCM), SONAR embeddings |
| Diversity | Guide-to-Generation (G2) |
| FL systems | AP4Fed / architectural patterns for federated learning |
| Retrieval | RAG, hybrid dense+sparse, Semantic Scholar-class indexes |

---

*Document purpose: research synthesis for the ideation project; not peer-reviewed.*
