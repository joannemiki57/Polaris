# 키워드 추출 로직 정리 (main 브랜치 기준)

> 이 문서는 MindGraph에서 **키워드를 추출하는 모든 경로**를 정리한 것입니다.

---

## 전체 흐름 요약

```
사용자 액션                    API 엔드포인트                        키워드 추출 방식
─────────────────────────────────────────────────────────────────────────────────────
1. Generate Mind Map       POST /api/graph/expand              OpenAlex 논문 → LLM 정리
2. Expand Selection        POST /api/graph/expand-selection     LLM이 선택 노드 기반 확장
3. Expand Paper Keywords   POST /api/graph/expand-paper-keywords   논문 1편 → LLM 섹션 키워드
4. Attach Papers           POST /api/graph/attach-papers        키워드 노드에 논문 연결
5. Deep Answer Init        POST /api/deep-answer/init           키워드로 논문 10편 검색
6. Deep Answer Chat        POST /api/deep-answer/chat           논문 기반 LLM 대화
```

---

## 1. Generate Mind Map — 초기 키워드 트리 생성

**진입점**: `POST /api/graph/expand`  
**파일**: `server/src/index.ts` (80–122행)

### 1-1. 논문 검색 (OpenAlex)

```
searchWorks(question, mailto, 3, "review")   →  리뷰 논문 3편
searchWorks(question, mailto, 3, "article")  →  일반 논문 3편
```

- **함수**: `openalex.ts > searchWorks()`
- **API**: `GET https://api.openalex.org/works?search=...&filter=type:review|article&per_page=3`
- **정렬**: `typeFilter`가 있으면 정렬 없음 (OpenAlex 기본 relevance), 없으면 `cited_by_count:desc`
- **캐시**: 24시간 TTL, 디스크+메모리 캐시 (`.cache/openalex.json`)

### 1-2. 논문 상세 정보 조회

```
allHits (6편) → 각각 fetchWorkDetail(id) → topics, keywords, abstract 가져옴
```

- **함수**: `openalex.ts > fetchWorkDetail()`
- **API**: `GET https://api.openalex.org/works/{id}?select=id,display_name,keywords,topics,abstract_inverted_index`
- **반환**: `WorkDetail { topics[], keywords[], abstract }`
  - topics: `displayName`, `score`, `subfield`, `field` (최대 10개, score 내림차순)
  - keywords: `displayName`, `score` (최대 15개, score 내림차순)
  - abstract: inverted index → 텍스트로 복원 (`reconstructAbstract()`)

### 1-3. 논문 → PaperWithKeywords 구조로 변환

```typescript
interface PaperWithKeywords {
  id: string;
  title: string;
  isReview: boolean;        // type === "review"
  citedByCount: number;
  topics: { displayName, score, subfield }[];
  abstract: string | null;
}
```

### 1-4. LLM 키워드 트리 생성

**분기 조건**:
- Gemini 키 있고 + 논문에 topic 또는 abstract가 하나라도 있으면 → `organizeKeywordsToGraph()`
- 아니면 → `expandQuestionToGraph()` (순수 LLM fallback)

#### A. organizeKeywordsToGraph() (주 경로)

**파일**: `llm.ts` (155–206행)

**프롬프트 구성**:
```
REVIEW PAPERS (literature reviews):
- "논문 제목" [500 citations]
  Topics: Topic1 [Subfield] (85%), Topic2 [Subfield] (70%)
  Abstract: (최대 400자)

TOP-CITED RESEARCH ARTICLES:
- "논문 제목" [300 citations]
  Topics: ...
  Abstract: ...
```

**LLM 지시사항 (ORGANIZE_SCHEMA_HINT)**:
- root 노드 1개 (`kind: "topic"`)
- 10–20개 keyword 노드, 2–3 depth
- 구체적 연구 키워드만 (generic 용어 금지: "computer science", "AI" 등)
- edge 종류: `expands_to`, `prerequisite_for`
- `temperature: 0.3`, `responseMimeType: "application/json"`

**출력**: `MindGraph { nodes[], edges[] }`

#### B. expandQuestionToGraph() (fallback)

**파일**: `llm.ts` (92–123행)

- Gemini 키 없으면 mock 데이터 반환 (`mockExpand()`)
- 키 있으면 순수 LLM이 질문으로부터 직접 키워드 트리 생성
- `temperature: 0.4`

---

## 2. Expand Selection — 선택 노드 확장

**진입점**: `POST /api/graph/expand-selection`  
**파일**: `index.ts` (129–156행), `llm.ts > expandFromSelection()` (276–337행)

### 로직

1. 선택된 노드들의 **ancestry** (부모→조부모 체인, 최대 2단계) 계산
2. LLM에 `{ originalQuestion, selected (with ancestry), existingNodeIds }` 전달
3. LLM이 context-aware한 자식 노드 생성
4. `mergeDelta()`로 기존 그래프에 병합

**핵심**: 노드의 label만이 아니라 **전체 경로(lineage)**를 보고 더 구체적인 하위 키워드 생성

---

## 3. Expand Paper Keywords — 논문 1편의 섹션 키워드 추출

**진입점**: `POST /api/graph/expand-paper-keywords`  
**파일**: `index.ts` (253–323행)

### 로직 (2단계 fallback)

#### Step 1: LLM 추출 (우선)

```
fetchWorkDetail(openAlexId) → topics + abstract 획득
→ extractPaperSectionKeywords() 호출
```

- **함수**: `llm.ts > extractPaperSectionKeywords()` (478–525행)
- 논문의 **섹션 헤딩** (2.1, 2.2, 3.1 등) 수준의 키워드 추출
- 8–16개 키워드, 2–6 단어 라벨
- `temperature: 0.2`
- edge 종류: `has_keyword`

#### Step 2: OpenAlex raw keywords (fallback)

LLM 결과가 없으면 OpenAlex의 `keywords` 필드를 그대로 사용:
```
fetchWorkDetail() → detail.keywords
→ keywordsToGraphNodes() → 노드+엣지로 변환
```

---

## 4. Attach Papers — 키워드에 논문 연결

**진입점**: `POST /api/graph/attach-papers`  
**파일**: `index.ts` (361–394행)

### 로직

```
searchWorks(query, mailto, 8)  →  8편 검색 (typeFilter 없음, cited_by_count:desc)
→ workHitToPaperNodes() → paper 노드로 변환
→ 기존 그래프에 병합
```

- edge 종류: `from_openalex`
- 키워드 추출은 없음 — 논문을 키워드 노드에 연결만 함

---

## 5. Deep Answer Init — 논문 기반 심층 분석 세션

**진입점**: `POST /api/deep-answer/init`  
**파일**: `index.ts` (179–205행)

### 로직

```
searchResearchPapers(keyword, mailto, 10)
→ 10편 (article만, review 제외, cited_by_count:desc)
→ 세션 메모리에 저장
```

- **함수**: `openalex.ts > searchResearchPapers()` (149–198행)
- filter: `type:article,type:!review`
- abstract를 inverted index에서 복원하여 포함
- 저자명 최대 5명

---

## 6. Deep Answer Chat — 논문 기반 대화

**진입점**: `POST /api/deep-answer/chat`  
**파일**: `index.ts` (207–236행), `llm.ts > chatWithPapers()` (410–453행)

### 로직

- init에서 저장된 논문 목록을 시스템 프롬프트에 포함
- 논문 인라인 인용 (AuthorLastName et al., Year)
- 대화 히스토리 유지
- `temperature: 0.4`

---

## 데이터 모델

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
      | "has_keyword" | "has_section" | "user_linked";
}
```

---

## 외부 API 의존성

| 서비스 | 용도 | 엔드포인트 |
|--------|------|-----------|
| **OpenAlex** | 논문 검색, 토픽/키워드/초록 조회 | `api.openalex.org/works` |
| **Gemini** | LLM 키워드 정리, 확장, 섹션 추출, 대화 | Google Generative AI SDK |
| **Semantic Scholar** | 논문 섹션 헤딩 조회 (expand-paper-sections) | `api.semanticscholar.org/graph/v1/snippet/search` |

---

## 파일별 역할

| 파일 | 역할 |
|------|------|
| `server/src/index.ts` | API 라우트, 파이프라인 오케스트레이션 |
| `server/src/llm.ts` | LLM 프롬프트, JSON 파싱, 그래프 생성/병합 |
| `server/src/openalex.ts` | OpenAlex API 호출, 캐시, 데이터 변환 |
| `server/src/semanticScholar.ts` | Semantic Scholar 섹션 조회 |
| `server/src/graphTypes.ts` | 타입 정의 (GraphNode, GraphEdge, MindGraph) |
| `client/src/api.ts` | 프론트엔드 API 호출 함수 |
