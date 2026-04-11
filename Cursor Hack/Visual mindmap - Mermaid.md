---
tags: [diagram, mindmap]
---

# Visual mindmap (Mermaid)

Turn on **Reading view** in Obsidian for this note so Mermaid renders.

## Product + data flow

```mermaid
flowchart TB
  subgraph user [User]
    Q[Question]
    Pick[Select nodes]
  end
  subgraph app [MindGraph app]
    Map[React Flow graph]
    Deep[Deep answer panel]
    MD[Export Markdown]
  end
  subgraph backend [Express BFF]
    Ex[expand graph]
    Sel[expand selection]
    DP[deep LLM]
    AP[attach papers]
  end
  subgraph external [External]
    OAI[OpenAI API]
    OAX[OpenAlex API]
  end
  Q --> Ex
  Ex --> OAI
  Ex --> Map
  Map --> Pick
  Pick --> Sel
  Sel --> OAI
  Pick --> DP
  DP --> OAI
  Pick --> AP
  AP --> OAX
  AP --> Map
  Map --> MD
  Deep --> DP
```

## Repo modules (flowchart — works on all Mermaid versions)

```mermaid
flowchart TB
  root[Cursor Hackaton]
  root --> client[client]
  root --> server[server]
  root --> vault[Cursor Hack vault]
  client --> c1[Vite + React]
  client --> c2[React Flow + UI]
  server --> s1[Express BFF]
  server --> s2[LLM + OpenAlex]
  vault --> v1[These markdown notes]
```

## OpenAlex

See also: [[OpenAlex]] (stub for graph links).
