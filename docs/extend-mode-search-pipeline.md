# Extend Mode · Search Logic · Data Pipeline

> MindGraph 프로젝트의 **Expand(Extend) 모드**, **검색 로직**, **데이터 파이프라인**을 정리한 문서입니다.

---

## 목차

1. [아키텍처 개요](#1-아키텍처-개요)
2. [Extend(Expand) 모드](#2-extendexpand-모드)
3. [Search Logic (검색 로직)](#3-search-logic-검색-로직)
4. [Data Pipeline (데이터 파이프라인)](#4-data-pipeline-데이터-파이프라인)
5. [주요 파일 & 역할](#5-주요-파일--역할)
6. [API 엔드포인트](#6-api-엔드포인트)
7. [데이터 모델 / 타입](#7-데이터-모델--타입)

---

## 1. 아키텍처 개요

```
┌─────────────────────────────────┐
│          Client (React)         │
│  Vite + React Flow + TypeScript │
│        localhost:5173            │
└──────────────┬──────────────────┘
               │  /api/* (proxy)
               ▼
┌─────────────────────────────────┐
│        Server (Express)         │
│     tsx + TypeScript             │
│        localhost:8787            │
├─────────┬───────────┬───────────┤
│ OpenAlex│  Gemini   │ Semantic  │
│   API   │   LLM    │  Scholar  │
└─────────┴───────────┴───────────┘
```

- **Client:** React + Vite + React Flow 기반 마인드맵 UI
- **Server:** Express 기반 API 서버, Gemini LLM 연동
- **외부 서비스:** OpenAlex (논문 검색), Google Gemini (LLM), Semantic Scholar (스니펫 검색)
- **프록시:** Vite dev server가 `/api` 요청을 `localhost:8787`로 프록시

---

## 2. Extend(Expand) 모드

프로젝트에서 "Extend"는 **Expand** 기능으로 구현되어 있으며, 두 가지 경로가 존재합니다.

### 2-1. Initial Expand — 마인드맵 최초 생성

**트리거:** 사이드바의 "Generate mind map" 버튼 클릭

```
User Question → expandGraph(question) → POST /api/graph/expand → MindGraph 반환
```

**서버 처리 흐름:**

```
1. question 유효성 검증
      │
2. OpenAlex 병렬 검색 (2건)
      ├── searchWorks(question, 3, "review")   ← 리뷰 논문 최대 3건
      └── searchWorks(question, 3, "article")  ← 일반 논문 최대 3건
      │
3. 각 검색 결과에 대해 fetchWorkDetail 호출
      │  → topics, keywords, abstract 정보 보강
      │
4. PaperWithKeywords[] 구성
      │
5. 분기 판단
      ├── GEMINI_API_KEY 있음 + 논문에 topic/abstract 존재
      │     └── organizeKeywordsToGraph() ← Gemini가 논문 데이터 기반 트리 생성
      │
      └── 그 외
            └── expandQuestionToGraph() ← Gemini-only 또는 Mock 그래프 생성
      │
6. { graph: MindGraph } 응답
```

### 2-2. Selection Expand — 선택 노드 확장

**트리거:** 노드 선택 후 "Expand selected (LLM)" 또는 노드 툴바의 "Expand" 클릭

```
Selected Nodes → expandSelection(question, graph, selected) → POST /api/graph/expand-selection
```

**서버 처리 흐름:**

```
1. question, selected[], graph 유효성 검증
      │
2. 선택된 노드별 getAncestry() 호출
      │  → 부모 2단계까지의 조상 라벨 수집 (경로 인식 확장)
      │
3. Gemini에 delta 요청
      │  → { new_nodes: [], new_edges: [] } 형태의 확장 데이터 생성
      │
4. mergeDelta()
      │  → 기존 그래프에 새 노드/엣지 병합 (id 중복 제거)
      │
5. { graph: MindGraph } 응답 (업데이트된 전체 그래프)
```

### 2-3. Deep Answer — 논문 기반 심층 답변

**트리거:** 노드 선택 후 "Deep Answer (LLM)" 또는 노드의 "Deep" 버튼 클릭

```
1. searchKeyword 구성: [...ancestors].reverse() + nodeLabel → 공백 결합
2. POST /api/deep-answer/init → { sessionId, papers[] }
3. POST /api/deep-answer/chat → Gemini 멀티턴 대화 (논문 컨텍스트 주입)
4. Pin 기능: 선택한 논문을 메인 그래프에 paper 노드로 추가
```

---

## 3. Search Logic (검색 로직)

### 3-1. 검색 경로 요약

| 흐름 | 쿼리 소스 | 서버 함수 | 외부 API |
|------|-----------|-----------|----------|
| 마인드맵 생성 | User question | `searchWorks` ×2 + `fetchWorkDetail` | OpenAlex `/works` |
| Deep Answer 초기화 | 조상 라벨 + 노드 라벨 (역순 결합) | `searchResearchPapers` | OpenAlex `/works` |
| 논문 첨부 | query + keywordId | `searchWorks` | OpenAlex `/works` |
| OpenAlex 프록시 | q 쿼리 파라미터 | `searchWorks` | OpenAlex `/works` |

### 3-2. OpenAlex 검색 상세 (`openalex.ts`)

```
Base URL: https://api.openalex.org

searchWorks(query, mailto, perPage, type?)
  → GET /works?search={query}&per_page={perPage}
     &filter=type:{review|article}
     &sort=cited_by_count:desc
     &mailto={mailto}

fetchWorkDetail(workId)
  → GET /works/{id}?select=id,display_name,keywords,topics,abstract_inverted_index

searchResearchPapers(keyword, mailto, limit)
  → GET /works?search={keyword}
     &filter=type:article,type:!review
     &sort=cited_by_count:desc
  → abstract_inverted_index 재구성
  → authorships에서 저자명 추출
```

**캐싱:** 메모리 + 디스크 (`.cache/openalex.json`), 24시간 TTL

### 3-3. Gemini LLM 호출 (`llm.ts`)

- 라이브러리: `@google/generative-ai`
- 기본 모델: `gemini-2.5-flash` (환경변수 `GEMINI_MODEL`로 변경 가능)
- JSON 응답: `responseMimeType: "application/json"` 사용

| 함수 | 용도 |
|------|------|
| `expandQuestionToGraph` | 질문만으로 마인드 그래프 생성 |
| `organizeKeywordsToGraph` | 논문 데이터 기반 구조화된 그래프 생성 |
| `expandFromSelection` | 선택 노드 확장 (delta 생성) |
| `deepAnswer` | 마크다운 심층 답변 생성 |
| `chatWithPapers` | 논문 컨텍스트 기반 멀티턴 대화 |
| `extractPaperSectionKeywords` | 논문 섹션 키워드 추출 |

### 3-4. Semantic Scholar (`semanticScholar.ts`)

```
GET https://api.semanticscholar.org/graph/v1/snippet/search
  ?query={paperTitle}&limit=100&fields=...
  x-api-key: {S2_API_KEY}
```

- `POST /api/graph/expand-paper-sections` 에서만 사용
- 논문 제목으로 스니펫 검색 → 섹션 노드 생성

---

## 4. Data Pipeline (데이터 파이프라인)

### 전체 흐름도

```
┌──────────────────────────────────────────────────────────────────────┐
│                        User Input                                    │
│                  (Research Question 입력)                             │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Client (App.tsx)                                   │
│  expandGraph(question) / expandSelection(question, graph, selected)  │
│                  → fetch POST /api/...                               │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Server (index.ts)                                  │
│               라우트 매칭 + Rate Limit 적용                           │
│          apiLimiter: 60/min, strictLimiter: 20/min                   │
└───────┬──────────────────┬───────────────────────────────────────────┘
        │                  │
        ▼                  ▼
┌───────────────┐  ┌───────────────┐
│   OpenAlex    │  │    Gemini     │
│  (논문 검색)   │  │  (LLM 구조화) │
│               │  │               │
│ searchWorks   │  │ organize /    │
│ fetchDetail   │  │ expand /      │
│ searchPapers  │  │ deepAnswer    │
└───────┬───────┘  └───────┬───────┘
        │                  │
        ▼                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│               MindGraph 생성 / 병합                                   │
│                                                                      │
│  { version: 1, title, nodes[], edges[], updatedAt }                  │
│                                                                      │
│  mergeDelta() — 기존 그래프 + 새 노드/엣지 병합 (id 중복 제거)        │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  Client State 업데이트                                │
│                                                                      │
│  setGraph(graph)          ← React useState                           │
│  setStaggerReveal(true)   ← 진입 애니메이션 활성화                    │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  Layout 계산 (layout.ts)                              │
│                                                                      │
│  mindGraphToFlow(graph, layoutMode, stagger)                         │
│  ├── Tree 모드: BFS 레벨 기반 트리 배치                               │
│  └── Radial 모드: Force-directed 방사형 배치                          │
│                                                                      │
│  GraphNode → React Flow Node (type: "mind", color by kind)           │
│  GraphEdge → React Flow Edge                                         │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  React Flow 렌더링                                    │
│                                                                      │
│  MindNode 커스텀 노드: 선택, 디밍, Expand/Deep 툴바                   │
│  더블클릭 → DOI/OpenAlex URL 열기 (paper 노드)                       │
│  선택 하이라이팅 + 비선택 노드 opacity 감소                            │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  세션 영속화 (persistence.ts)                          │
│                                                                      │
│  localStorage key: "mindgraph_session_v1"                            │
│  saveSession() / loadSession()                                       │
│  exportToMarkdown() — 마크다운 파일 내보내기                           │
└──────────────────────────────────────────────────────────────────────┘
```

### 단계별 설명

| 단계 | 설명 | 담당 |
|------|------|------|
| **1. Input** | 사용자가 연구 질문 입력 | `App.tsx` 사이드바 |
| **2. API 요청** | `expandGraph` / `expandSelection` → fetch POST | `api.ts` |
| **3. 논문 검색** | OpenAlex에서 리뷰+아티클 검색, 상세 정보 보강 | `openalex.ts` |
| **4. LLM 구조화** | Gemini가 논문 데이터를 마인드 그래프 JSON으로 변환 | `llm.ts` |
| **5. 그래프 병합** | 새 노드/엣지를 기존 그래프에 병합 (선택 확장 시) | `llm.ts` `mergeDelta` |
| **6. 상태 업데이트** | React state에 그래프 저장, 애니메이션 트리거 | `App.tsx` |
| **7. 레이아웃** | MindGraph → React Flow 노드/엣지로 변환 + 배치 | `layout.ts` |
| **8. 렌더링** | 커스텀 노드 표시, 인터랙션 처리 | `MindNode.tsx` |
| **9. 영속화** | localStorage에 세션 저장/복원 | `persistence.ts` |

---

## 5. 주요 파일 & 역할

### Client (`client/src/`)

| 파일 | 역할 |
|------|------|
| `App.tsx` | 메인 UI — 질문 입력, 그래프 상태, 선택, expand/deep 핸들러 |
| `api.ts` | `/api/*` fetch 래퍼 함수들 |
| `graphTypes.ts` | `MindGraph`, `GraphNode`, `GraphEdge` 타입 정의 |
| `layout.ts` | `mindGraphToFlow` — tree/radial 레이아웃 계산 |
| `MindNode.tsx` | 커스텀 노드 렌더링, Expand/Deep 툴바, 논문 링크 |
| `DeepAnswerPage.tsx` | 논문 기반 채팅 UI (init + chat API) |
| `persistence.ts` | localStorage 세션 저장/복원 + 마크다운 내보내기 |
| `SkeletonMindMap.tsx` | 초기 expand 중 로딩 플레이스홀더 |
| `main.tsx` | React 루트 + ReactFlowProvider |

### Server (`server/src/`)

| 파일 | 역할 |
|------|------|
| `index.ts` | Express 앱, 모든 라우트, 환경 변수, Rate Limit |
| `llm.ts` | Gemini 호출, Mock, 그래프 생성/병합 헬퍼 |
| `openalex.ts` | OpenAlex 클라이언트, 캐시, 논문 검색/상세 |
| `semanticScholar.ts` | Semantic Scholar 스니펫 검색 → 섹션 노드 |
| `graphTypes.ts` | 서버 측 그래프 타입 (`has_section` 엣지 포함) |

---

## 6. API 엔드포인트

| Method | Path | 설명 | Rate Limit |
|--------|------|------|------------|
| `GET` | `/api/health` | 서버 상태 확인 (`{ ok, llm, openAlexMailto }`) | api (60/min) |
| `POST` | `/api/graph/expand` | 질문 → 마인드맵 생성 | strict (20/min) |
| `POST` | `/api/graph/expand-selection` | 선택 노드 확장 | strict (20/min) |
| `POST` | `/api/deep-answer/init` | Deep Answer 세션 초기화 | strict (20/min) |
| `POST` | `/api/deep-answer/chat` | Deep Answer 채팅 | strict (20/min) |
| `POST` | `/api/llm/deep` | 마크다운 심층 답변 (미사용) | strict (20/min) |
| `GET` | `/api/openalex/works?q=...` | OpenAlex 프록시 검색 | api (60/min) |
| `POST` | `/api/graph/expand-paper-keywords` | 논문 키워드 확장 | strict (20/min) |
| `POST` | `/api/graph/expand-paper-sections` | 논문 섹션 확장 | strict (20/min) |
| `POST` | `/api/graph/attach-papers` | 키워드에 논문 첨부 | strict (20/min) |

---

## 7. 데이터 모델 / 타입

### MindGraph (핵심 데이터 구조)

```typescript
interface MindGraph {
  version: 1;
  title: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  updatedAt: string;
}
```

### GraphNode

```typescript
interface GraphNode {
  id: string;
  kind: "topic" | "keyword" | "subtask" | "paper" | "note";
  label: string;
  summary?: string;
  openAlexId?: string;
  doi?: string;
  year?: number;
  citedByCount?: number;
  url?: string;
  relevance?: number;
  isReview?: boolean;
}
```

### GraphEdge

```typescript
interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: "expands_to" | "prerequisite_for" | "from_openalex"
      | "has_keyword" | "user_linked" | "has_section";  // has_section: 서버 전용
}
```

### 환경 변수

| 변수 | 설명 |
|------|------|
| `GEMINI_API_KEY` | Google Gemini API 키 (없으면 Mock 모드) |
| `GEMINI_MODEL` | 사용할 Gemini 모델 (기본: `gemini-2.5-flash`) |
| `OPENALEX_MAILTO` | OpenAlex polite pool용 이메일 |
| `S2_API_KEY` | Semantic Scholar API 키 (선택) |
| `PORT` | 서버 포트 (기본: `8787`) |

---

## 상태 관리 패턴

- **글로벌 스토어 없음** — Redux/Zustand 미사용
- **React useState/useEffect/useCallback/useMemo** 로 로컬 상태 관리
- **React Flow:** `useNodesState` / `useEdgesState` — `MindGraph`가 진짜 상태(source of truth), Flow 노드/엣지는 `graph` + `layoutMode`로부터 파생
- **서버:** in-memory `Map`으로 Deep Answer 세션 관리, OpenAlex 디스크+메모리 캐시
