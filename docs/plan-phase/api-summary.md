# OpenAlex API Summary

> Reference guide for the OpenAlex API — an open catalog of the global research system.

**Base URL:** `https://api.openalex.org`
**Content Downloads:** `https://content.openalex.org`
**Docs:** [developers.openalex.org](https://developers.openalex.org)
**License:** CC0 (free to access and share)

---

## Table of Contents

- [Authentication & Pricing](#authentication--pricing)
- [Entity Endpoints](#entity-endpoints)
- [Query Parameters](#query-parameters)
- [Filter Syntax](#filter-syntax)
- [Entity Schemas](#entity-schemas)
  - [Works](#works)
  - [Authors](#authors)
  - [Sources](#sources)
  - [Institutions](#institutions)
  - [Topics](#topics)
  - [Publishers](#publishers)
  - [Funders](#funders)
  - [Keywords](#keywords)
- [External ID Formats](#external-id-formats)
- [Response Format](#response-format)
- [Content Downloads](#content-downloads)
- [Autocomplete](#autocomplete)
- [Deprecated Endpoints & Fields](#deprecated-endpoints--fields)
- [Limits](#limits)
- [Example Queries](#example-queries)

---

## Authentication & Pricing

An API key is **free** — create an account at [openalex.org](https://openalex.org) and copy your key from [openalex.org/settings/api](https://openalex.org/settings/api).

Pass the key via query parameter:

```
https://api.openalex.org/works?api_key=YOUR_KEY
```

### Free Daily Allowance ($1/day)

| Action             | Free Calls/Day | Results/Day  | Unit Cost |
| ------------------ | -------------- | ------------ | --------- |
| Get single entity  | Unlimited      | Unlimited    | Free      |
| List + filter      | 10,000         | 1,000,000    | $0.0001   |
| Search             | 1,000          | 100,000      | $0.001    |
| Content download   | 100            | 100 PDFs     | $0.01     |

Without an API key, the rate limit drops to $0.01/day.

---

## Entity Endpoints

All endpoints are `GET`-only (read-only API).

| Endpoint                      | Description                                      | Scale        |
| ----------------------------- | ------------------------------------------------ | ------------ |
| `GET /works`                  | Scholarly documents (articles, books, datasets)   | 270M+        |
| `GET /works/{id}`             | Single work by OpenAlex ID or external ID         |              |
| `GET /authors`                | Researcher profiles                               | 90M+         |
| `GET /authors/{id}`           | Single author by ID or ORCID                      |              |
| `GET /sources`                | Journals, repositories, conferences               | 100K+        |
| `GET /sources/{id}`           | Single source by ID or ISSN                       |              |
| `GET /institutions`           | Universities and organizations                    |              |
| `GET /institutions/{id}`      | Single institution by ID or ROR                   |              |
| `GET /topics`                 | Research topic classifications                    |              |
| `GET /topics/{id}`            | Single topic by ID                                |              |
| `GET /keywords`               | Keywords extracted from works                     |              |
| `GET /keywords/{id}`          | Single keyword by ID                              |              |
| `GET /publishers`             | Publishing organizations                          |              |
| `GET /publishers/{id}`        | Single publisher by ID                            |              |
| `GET /funders`                | Funding agencies (~32K)                           |              |
| `GET /funders/{id}`           | Single funder by ID                               |              |
| `GET /autocomplete/{entity}`  | Fast typeahead search across any entity type      |              |

### Important: Always Resolve Names to IDs

Names are ambiguous; IDs are not. Always search first, then filter by ID:

```
# WRONG
/works?filter=authorships.author.display_name:Einstein

# RIGHT — two-step approach
1. /authors?search=Einstein  →  get id "A5012345678"
2. /works?filter=authorships.author.id:A5012345678
```

---

## Query Parameters

| Parameter    | Description                                         | Example                                |
| ------------ | --------------------------------------------------- | -------------------------------------- |
| `api_key`    | Your API key                                        | `api_key=YOUR_KEY`                     |
| `filter`     | Filter results (field:value)                        | `filter=publication_year:2024`         |
| `search`     | Full-text search                                    | `search=CRISPR`                        |
| `sort`       | Sort by field                                       | `sort=cited_by_count:desc`             |
| `per_page`   | Results per page (max 100)                          | `per_page=50`                          |
| `page`       | Page number (basic paging, max 10K results)         | `page=2`                               |
| `cursor`     | Deep pagination (use `cursor=*` to start)           | `cursor=*`                             |
| `sample`     | Random sample (max 10,000)                          | `sample=100&seed=42`                   |
| `select`     | Limit fields returned                               | `select=id,display_name,doi`           |
| `group_by`   | Aggregate counts by a field                         | `group_by=publication_year`            |

### Semantic Search (requires API key)

```
/works?search.semantic=machine+learning+in+healthcare&api_key=YOUR_KEY
```

Finds conceptually related works even when exact terms don't match.

---

## Filter Syntax

| Pattern     | Syntax                                          | Example                                     |
| ----------- | ----------------------------------------------- | ------------------------------------------- |
| Single      | `field:value`                                   | `?filter=publication_year:2024`             |
| AND         | Comma-separated                                 | `?filter=publication_year:2024,is_oa:true`  |
| OR          | Pipe-separated (max 100 values)                 | `?filter=type:article\|book\|dataset`       |
| NOT         | Prefix with `!`                                 | `?filter=type:!paratext`                    |
| Range       | Hyphen-separated                                | `?filter=publication_year:2020-2024`        |
| Comparison  | `>`, `<`, `>=`, `<=`                            | `?filter=cited_by_count:>100`               |

---

## Entity Schemas

### Works

Scholarly documents — journal articles, books, datasets, theses, etc.

**Key top-level fields:**

| Field                  | Sort | Group | Filter | Description                        |
| ---------------------- | ---- | ----- | ------ | ---------------------------------- |
| `display_name`         | ✓    |       | ✓      | Title of the work                  |
| `doi`                  | ✓    |       | ✓      | Digital Object Identifier          |
| `publication_year`     | ✓    | ✓     | ✓      | Year published                     |
| `publication_date`     | ✓    |       | ✓      | Full publication date              |
| `type`                 | ✓    | ✓     | ✓      | article, book, dataset, etc.       |
| `cited_by_count`       | ✓    | ✓     | ✓      | Number of citations                |
| `is_oa`                |      | ✓     | ✓      | Is open access                     |
| `is_retracted`         | ✓    | ✓     | ✓      | Has been retracted                 |
| `language`             | ✓    | ✓     | ✓      | Language of the work               |
| `fwci`                 | ✓    |       | ✓      | Field-Weighted Citation Impact     |
| `has_fulltext`         | ✓    | ✓     | ✓      | Has searchable full text           |
| `has_doi`              | ✓    | ✓     | ✓      | Has a DOI                          |
| `has_abstract`         |      | ✓     | ✓      | Has an abstract                    |
| `authors_count`        | ✓    | ✓     | ✓      | Number of authors                  |
| `referenced_works_count` | ✓  | ✓     | ✓      | Number of references               |
| `oa_status`            |      | ✓     | ✓      | OA status (gold, green, etc.)      |
| `best_open_version`    | ✓    | ✓     | ✓      | Best available open version        |

**Nested field groups:** `authorships`, `primary_location`, `best_oa_location`, `locations`, `topics`, `primary_topic`, `keywords`, `awards`, `funders`, `concepts`, `biblio`, `apc_list`, `apc_paid`, `citation_normalized_percentile`, `cited_by_percentile_year`, `sustainable_development_goals`, `open_access`, `has_content`, `ids`, `institution_assertions`

**Common work filters:**

```
authorships.author.id          — by author
authorships.institutions.id    — by institution
primary_location.source.id     — by journal/source
topics.id                      — by topic
awards.funder_id               — by funder
```

---

### Authors

Researcher profiles with disambiguated identities.

**Key fields:**

| Field                | Sort | Group | Filter | Description                    |
| -------------------- | ---- | ----- | ------ | ------------------------------ |
| `display_name`       | ✓    |       | ✓      | Author name                    |
| `orcid`              | ✓    | ✓     | ✓      | ORCID identifier               |
| `cited_by_count`     | ✓    | ✓     | ✓      | Total citations                |
| `works_count`        | ✓    | ✓     | ✓      | Number of works                |
| `has_orcid`          | ✓    | ✓     | ✓      | Has an ORCID                   |

**Nested field groups:** `affiliations`, `last_known_institutions`, `summary_stats` (h_index, i10_index, 2yr_mean_citedness), `topics`, `topic_share`, `parsed_longest_name`

---

### Sources

Journals, conferences, preprint repositories, and institutional repositories.

**Key fields:**

| Field                    | Sort | Group | Filter | Description                         |
| ------------------------ | ---- | ----- | ------ | ----------------------------------- |
| `display_name`           | ✓    |       | ✓      | Source name                         |
| `type`                   | ✓    | ✓     | ✓      | journal, repository, etc.           |
| `issn`                   | ✓    | ✓     | ✓      | ISSN                                |
| `is_oa`                  | ✓    | ✓     | ✓      | Open access source                  |
| `is_in_doaj`             | ✓    | ✓     | ✓      | Listed in DOAJ                      |
| `cited_by_count`         | ✓    | ✓     | ✓      | Total citations                     |
| `works_count`            | ✓    | ✓     | ✓      | Total works                         |
| `country_code`           | ✓    | ✓     | ✓      | Country of source                   |
| `apc_usd`                | ✓    | ✓     | ✓      | APC in USD                          |
| `host_organization`      | ✓    | ✓     | ✓      | Publisher or host org               |

**Nested field groups:** `summary_stats`, `topics`, `topic_share`, `apc_prices`

---

### Institutions

Universities and organizations affiliated with authors.

**Key fields:**

| Field                | Sort | Group | Filter | Description                    |
| -------------------- | ---- | ----- | ------ | ------------------------------ |
| `display_name`       | ✓    |       | ✓      | Institution name               |
| `type`               | ✓    | ✓     | ✓      | education, company, etc.       |
| `country_code`       | ✓    | ✓     | ✓      | Country                        |
| `continent`          | ✓    | ✓     | ✓      | Continent                      |
| `ror`                | ✓    | ✓     | ✓      | ROR identifier                 |
| `cited_by_count`     | ✓    | ✓     | ✓      | Total citations                |
| `works_count`        | ✓    | ✓     | ✓      | Total works                    |
| `is_global_south`    | ✓    | ✓     | ✓      | Located in Global South        |

**Nested field groups:** `summary_stats`, `topics`, `topic_share`, `repositories`, `roles`

---

### Topics

Research areas automatically assigned to works. Four-level hierarchy: **domain > field > subfield > topic**.

**Key fields:**

| Field            | Sort | Group | Filter | Description                   |
| ---------------- | ---- | ----- | ------ | ----------------------------- |
| `display_name`   | ✓    |       | ✓      | Topic name                    |
| `domain.id`      | ✓    | ✓     | ✓      | Top-level domain              |
| `field.id`       | ✓    | ✓     | ✓      | Field within domain           |
| `subfield.id`    | ✓    | ✓     | ✓      | Subfield within field         |
| `cited_by_count` | ✓    | ✓     | ✓      | Total citations               |
| `works_count`    | ✓    | ✓     | ✓      | Total works                   |

---

### Publishers

Companies and organizations that distribute works. Support hierarchical parent/child relationships.

**Key fields:**

| Field               | Sort | Group | Filter | Description                   |
| ------------------- | ---- | ----- | ------ | ----------------------------- |
| `display_name`      | ✓    |       | ✓      | Publisher name                |
| `country_codes`     | ✓    | ✓     | ✓      | Country codes                 |
| `hierarchy_level`   | ✓    | ✓     | ✓      | Position in hierarchy         |
| `parent_publisher`  | ✓    | ✓     | ✓      | Parent publisher ID           |
| `cited_by_count`    | ✓    | ✓     | ✓      | Total citations               |
| `works_count`       | ✓    | ✓     | ✓      | Total works                   |

**Nested field groups:** `summary_stats`, `roles`, `ids` (openalex, ror, wikidata)

---

### Funders

Organizations that fund research (~32K indexed). Data sourced from Crossref, enhanced with Wikidata and ROR.

**Key fields:**

| Field               | Sort | Group | Filter | Description                   |
| ------------------- | ---- | ----- | ------ | ----------------------------- |
| `display_name`      | ✓    |       | ✓      | Funder name                   |
| `country_code`      | ✓    | ✓     | ✓      | Country                       |
| `awards_count`      | ✓    | ✓     | ✓      | Number of awards              |
| `cited_by_count`    | ✓    | ✓     | ✓      | Total citations               |
| `works_count`       | ✓    | ✓     | ✓      | Total works                   |
| `is_global_south`   | ✓    | ✓     | ✓      | Located in Global South       |

**Nested field groups:** `summary_stats`, `roles`, `ids` (openalex, crossref, doi, ror, wikidata)

---

### Keywords

Keywords extracted from scholarly works.

**Endpoint:** `GET /keywords` and `GET /keywords/{id}`

---

## External ID Formats

Singleton lookups accept multiple ID formats:

| ID Type | Format                                                     |
| ------- | ---------------------------------------------------------- |
| DOI     | `/works/https://doi.org/10.1234/example`                   |
| DOI     | `/works/doi:10.1234/example`                               |
| PMID    | `/works/pmid:29456894`                                     |
| PMCID   | `/works/pmcid:PMC1234567`                                  |
| ORCID   | `/authors/https://orcid.org/0000-0001-6187-6610`           |
| ROR     | `/institutions/https://ror.org/0161xgx34`                  |
| ISSN    | `/sources/issn:2167-8359`                                  |

---

## Response Format

### List Response

```json
{
  "meta": {
    "count": 286750097,
    "page": 1,
    "per_page": 25
  },
  "results": [ ... ],
  "group_by": []
}
```

### Group-by Response

```json
[
  { "key": "2024", "key_display_name": "2024", "count": 18627 },
  { "key": "2023", "key_display_name": "2023", "count": 15933 }
]
```

---

## Content Downloads

Download full-text PDFs and structured XML (requires API key):

```
GET https://content.openalex.org/works/{id}.pdf?api_key=YOUR_KEY
GET https://content.openalex.org/works/{id}.grobid-xml?api_key=YOUR_KEY
```

Use the filter `has_content.pdf:true` to find works with downloadable content.

---

## Autocomplete

Fast typeahead search across any entity type:

```
GET /autocomplete/works?q=machine+learning
GET /autocomplete/authors?q=einstein
GET /autocomplete/institutions?q=stanford
```

---

## Deprecated Endpoints & Fields

| Deprecated                | Replacement            |
| ------------------------- | ---------------------- |
| `/concepts`               | `/topics`              |
| `/text` endpoint          | Removed                |
| `host_venue` field        | `primary_location`     |
| `grants` field            | `funders` and `awards` |
| `.search` filter fields   | `search` parameter     |

---

## Limits

| Limit                     | Value                  |
| ------------------------- | ---------------------- |
| OR values per filter      | 100                    |
| `per_page` max            | 100                    |
| `sample` max              | 10,000                 |
| Basic paging max          | 10,000 results         |
| Deep paging               | Unlimited (use cursor) |
| Bulk DOI lookup           | Up to 50 per request   |

---

## Example Queries

### Highly cited 2024 articles

```
GET /works?filter=publication_year:2024,type:article,cited_by_count:>50&sort=cited_by_count:desc&per_page=100
```

### Open access works from an institution

```
GET /works?filter=authorships.institutions.id:I27837315,is_oa:true&per_page=100
```

### Bulk DOI lookup

```
GET /works?filter=doi:10.1234/a|10.1234/b|10.1234/c&per_page=50
```

### Random sample with seed

```
GET /works?sample=100&seed=42
```

### Count works by topic for a given year

```
GET /works?filter=publication_year:2024&group_by=topics.id
```

### Search then filter (two-step)

```
# Step 1: Find the institution ID
GET /institutions?search=MIT

# Step 2: Get their works from 2020-2024
GET /works?filter=authorships.institutions.id:I63966007,publication_year:2020-2024&sort=cited_by_count:desc
```

### Semantic search for related works

```
GET /works?search.semantic=machine+learning+in+healthcare&api_key=YOUR_KEY
```

---

*Source: [OpenAlex Developer Documentation](https://developers.openalex.org)*
