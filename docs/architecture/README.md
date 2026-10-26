# Architecture

System design for TaskFlow v1, done before the backend is written (Stage 3: Oct 26–28).

| Doc                                                                         | What it answers                                                                  |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [01 — Context and containers (C4 levels 1–2)](01-context-and-containers.md) | Who uses it, what it depends on, which deployable pieces exist and how they talk |
| [02 — Data model (ERD)](02-data-model.md)                                   | Tables, keys, indexes, and the rules the schema enforces                         |
| 03 — Sequences _(Oct 27)_                                                   | Drag and drop across instances, AI drafting, token refresh                       |
| ADR-001, ADR-002 _(Oct 28)_                                                 | Backend stack; infrastructure                                                    |

## Requirements in one screen

- **Scope:** v1 in the PRD v1.3 — accounts, workspaces and 4 roles, client viewers per project, live board with drag and drop, Today, activity log, AI task drafting (real LLM). Comments, labels, attachments and search are v1.1.
- **Scale (year 1):** 20k users, ~10k daily, **~35 requests/s at peak** (6 reads : 1 write), **~4k concurrent WebSocket connections**, ~25 GB of data per year. Designed to survive 10× without a rewrite.
- **Latency:** board API p95 < 200 ms at 100k tasks per workspace; a change visible in other tabs p95 < 1 s.
- **Availability:** 99.9% → at least two API instances, zero-downtime deploys, backups with point-in-time recovery.
- **Consistency:** strong for task writes and memberships (concurrent edits → 409, never a silent overwrite); eventual (seconds) for realtime fan-out, Today counts and the activity feed.
- **Security:** workspace A never sees workspace B; roles enforced in the API; clients see only the projects they were invited to.

The hard parts are correctness, not scale: tenant isolation, concurrent edits, ordering without rewriting lists, realtime across instances.
