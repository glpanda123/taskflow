# Data model — ERD (v1)

Status: Stage 3 draft · 2026-10-26 · PostgreSQL 16. Every table the v1 API needs, including activity log, outbox and AI usage.

```mermaid
erDiagram
    users ||--o{ refresh_tokens : "has sessions"
    users ||--o{ memberships : "belongs to"
    workspaces ||--o{ memberships : "has"
    workspaces ||--o{ projects : "has"
    workspaces ||--o{ invitations : "sends"
    projects ||--o{ project_viewers : "shared with"
    users ||--o{ project_viewers : "can view"
    projects ||--o{ tasks : "contains"
    users |o--o{ tasks : "assigned"
    projects ||--o{ activity_events : "logs"
    users ||--o{ activity_events : "acts"
    workspaces ||--o{ ai_draft_logs : "uses"

    users {
        uuid id PK
        citext email UK
        text name
        text password_hash "argon2id"
        text avatar_url "nullable"
        timestamptz created_at
    }
    refresh_tokens {
        uuid id PK
        uuid user_id FK
        uuid family_id "one login = one family"
        text token_hash UK "SHA-256, never the token"
        timestamptz expires_at
        timestamptz used_at "set on rotation"
        timestamptz revoked_at "reuse => revoke family"
    }
    workspaces {
        uuid id PK
        text name
        uuid created_by FK
        timestamptz created_at
    }
    memberships {
        uuid workspace_id PK, FK
        uuid user_id PK, FK
        role role "owner | admin | member | viewer"
        timestamptz joined_at
    }
    projects {
        uuid id PK
        uuid workspace_id FK
        text name
        timestamptz created_at
    }
    project_viewers {
        uuid project_id PK, FK
        uuid user_id PK, FK
        uuid workspace_id FK "for tenant filters"
        timestamptz added_at
    }
    tasks {
        uuid id PK
        uuid workspace_id FK "denormalised"
        uuid project_id FK
        text title
        text description "nullable"
        task_status status
        priority priority
        uuid assignee_id FK "nullable"
        date due_date "nullable"
        text position "fractional key, COLLATE C"
        int version "optimistic lock"
        uuid created_by FK
        timestamptz created_at
        timestamptz updated_at
    }
    invitations {
        uuid id PK
        uuid workspace_id FK
        citext email
        role role "admin | member | viewer"
        uuid_array project_ids "viewers only"
        text token_hash UK
        uuid invited_by FK
        timestamptz expires_at "7 days"
        timestamptz accepted_at "nullable"
    }
    activity_events {
        uuid id PK
        uuid workspace_id FK
        uuid project_id FK
        uuid task_id "no FK: history outlives tasks"
        text task_title "as it was"
        uuid actor_id FK
        activity_type type "task.created | task.updated | task.moved"
        jsonb changes "[{field, from, to}]"
        timestamptz created_at
    }
    outbox {
        bigint id PK "identity, ordered"
        text topic "project:{id}"
        jsonb payload "the event the browser gets"
        timestamptz created_at
        timestamptz published_at "null = waiting"
    }
    ai_draft_logs {
        uuid id PK
        uuid workspace_id FK
        uuid user_id FK
        text model
        int input_chars
        int draft_count
        int input_tokens
        int output_tokens
        int latency_ms
        timestamptz created_at
    }
```

`outbox` has no relationships on purpose: it is a queue table, written in the same transaction as the change it announces.

## Indexes that carry the API

| Query (endpoint)                                                | Index                                                                | Why                                                                                      |
| --------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Board: tasks of a project in order (`GET /projects/{id}/tasks`) | `tasks (project_id, status, position, id)`                           | Matches the sort exactly; also the keyset cursor `(status, position, id)` for pagination |
| Today: late and due soon (`GET /workspaces/{id}/today`)         | `tasks (workspace_id, due_date) WHERE status <> 'done'`              | Partial index: done tasks (most of them, over time) are never scanned                    |
| My tasks / filters                                              | `tasks (assignee_id) WHERE assignee_id IS NOT NULL`                  | Assignee filter                                                                          |
| Activity tab (`GET /projects/{id}/activity`)                    | `activity_events (project_id, created_at DESC, id)`                  | Newest first + cursor                                                                    |
| Outbox relay                                                    | `outbox (id) WHERE published_at IS NULL`                             | The relay only ever reads the waiting rows                                               |
| Login                                                           | `users (email)` unique, `citext`                                     | Case-insensitive, one account per email                                                  |
| Refresh                                                         | `refresh_tokens (token_hash)` unique                                 | Lookup by hash                                                                           |
| Pending invite per email                                        | unique `invitations (workspace_id, email) WHERE accepted_at IS NULL` | "Already invited" (409) enforced by the database, not by a check-then-insert race        |

## Rules the schema enforces

1. **Tenant isolation:** every tenant row carries `workspace_id`; every query filters by the workspace the caller is a member of. Foreign keys stay inside one workspace (a task's project and assignee belong to the task's workspace; checked in the service, optionally by RLS).
2. **Optimistic locking:** writes are `UPDATE tasks SET …, version = version + 1 WHERE id = $1 AND version = $2`. Zero rows updated = 409 with the current row. One statement, so no race between check and write.
3. **Ordering:** `position` is a fractional-index string compared byte by byte, so the column uses `COLLATE "C"`. With a language collation, Postgres would sort `a0Z` and `a0a` differently from the client and the mock.
4. **Refresh tokens:** only the hash is stored. Using a token marks it `used_at` and issues the next one in the same family; presenting an already-used token revokes the whole family (likely theft).
5. **Viewers:** a `viewer` membership alone grants nothing; access to a project needs a `project_viewers` row. Owners, admins and members see every project in the workspace.
6. **History outlives data:** `activity_events.task_id` has no foreign key and keeps `task_title`, so deleting a task later doesn't erase who did what.
7. **Privacy for AI:** `ai_draft_logs` records usage and cost signals, never the client's brief.

## Deliberately not in v1

- `labels`: the API contract still returns `labels: []`; the table (or a `text[]` column) comes with labels in v1.1. To decide in the contract review: drop the field until then?
- `comments`, `attachments`, full-text search columns: v1.1 roadmap.
- Soft delete / archive: no delete endpoints in v1.
