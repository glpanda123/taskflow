# Sequences — the three hard flows (v1)

Status: Stage 3 draft · 2026-10-28. Each diagram reads top to bottom in time. Containers are the ones in [01](01-context-and-containers.md); tables are in [02](02-data-model.md).

## 1. Moving a task, seen live by someone on another instance

Ly's browser holds a WebSocket to **API A**. Minh's request is routed to **API B**.

```mermaid
sequenceDiagram
    autonumber
    participant Minh as Minh's browser
    participant B as API instance B
    participant DB as Postgres
    participant W as Worker
    participant R as Redis
    participant A as API instance A
    participant Ly as Ly's browser

    Note over Ly,A: Earlier: Ly opened the board.<br/>Socket → A, auth, subscribe project P.<br/>A subscribes to Redis channel project:P.

    Minh->>Minh: drop card (optimistic: card stays where dropped)
    Minh->>B: POST /tasks/T/move {version: 4, status, afterId, beforeId}
    B->>B: verify JWT, role in workspace, can see project
    B->>DB: BEGIN
    B->>DB: read neighbours' positions (same column)
    B->>DB: UPDATE tasks SET status, position, version = 5<br/>WHERE id = T AND version = 4
    alt 0 rows updated (someone changed T first)
        B->>DB: ROLLBACK
        B-->>Minh: 409 + current task
        Minh->>Minh: show latest card, explain, let Minh retry
    else 1 row updated
        B->>DB: INSERT activity_events (task.moved, from, to)
        B->>DB: INSERT outbox (topic project:P, payload task.changed)
        B->>DB: COMMIT
        B-->>Minh: 200 + task (version 5)
        W->>DB: SELECT … FROM outbox WHERE published_at IS NULL<br/>FOR UPDATE SKIP LOCKED
        W->>R: PUBLISH project:P {task.changed}
        W->>DB: UPDATE outbox SET published_at = now()
        R-->>A: message on project:P
        R-->>B: message on project:P (B's own subscribers get it too)
        A-->>Ly: WS {type: task.changed, task, actor: Minh}
        Ly->>Ly: put task into cache, toast "Minh moved…"
    end
```

What to notice:

- **The 409 path never reaches Redis.** Nothing is announced unless the transaction commits; that is the job of the outbox: the activity row and the outbox row are written in the same transaction as the update.
- **The worker can crash between PUBLISH and the UPDATE.** Then the event is sent twice. Browsers handle that by comparing `version`: an event older than or equal to the cached version is ignored (idempotent apply).
- **`FOR UPDATE SKIP LOCKED`** lets two workers run without sending the same rows at the same moment.
- **Latency budget (< 1 s p95):** commit ~20 ms, worker poll ≤ 200 ms, Redis + socket ~10 ms.

## 2. Drafting tasks with AI

```mermaid
sequenceDiagram
    autonumber
    participant U as Lead's browser
    participant API as API
    participant R as Redis
    participant LLM as LLM API
    participant DB as Postgres

    U->>API: POST /projects/P/task-drafts {text}
    API->>API: verify JWT, role ≥ member, can see project, 10 ≤ length ≤ 4000
    API->>R: INCR ai:ws:{workspace}:{minute}  (rate limit)
    alt over the limit
        API-->>U: 429 + Retry-After
    else allowed
        API->>LLM: prompt + brief + JSON schema of TaskDraft[] (timeout 20 s)
        alt timeout or provider error
            API-->>U: 503 "Drafting is unavailable, try again"
        else response
            LLM-->>API: JSON
            API->>API: validate against TaskDraft schema,<br/>drop invalid items, cap at 20
            API->>DB: INSERT ai_draft_logs (tokens, latency, count, no brief)
            API-->>U: 200 {drafts}
        end
    end
    U->>U: user edits, unticks, clicks "Add N tasks"
    loop each kept draft
        U->>API: POST /projects/P/tasks (the normal create path)
    end
```

What to notice:

- **Nothing the model writes is saved directly.** It only becomes data through the normal, validated `createTask`, after a person approved it.
- **Two layers of protection for cost:** a per-workspace rate limit before the call, and a timeout during it.
- **Validation after the model**, not trust: a malformed or oversized answer is trimmed or rejected, never stored.
- **Privacy:** the log keeps numbers for cost and quality (tokens, latency, draft count), not the client's brief.

## 3. Staying logged in: refresh rotation and the open socket

```mermaid
sequenceDiagram
    autonumber
    participant UI as Browser
    participant API as API
    participant DB as Postgres

    Note over UI: access token in memory (15 min),<br/>refresh token in httpOnly cookie
    UI->>API: GET /me (access token expired)
    API-->>UI: 401
    UI->>API: POST /auth/refresh (cookie sent by the browser)
    API->>DB: find refresh_tokens by hash
    alt token unknown, expired or revoked
        API-->>UI: 401 → go to login
    else token already used (used_at set) → likely stolen
        API->>DB: revoke every token in the family
        API-->>UI: 401 → go to login
    else valid and unused
        API->>DB: mark it used, insert the next token in the same family
        API-->>UI: 200 {accessToken} + Set-Cookie (new refresh token)
        UI->>API: GET /me (retry with the new access token)
    end

    Note over UI,API: The WebSocket outlives the 15-minute token
    API-->>UI: WS {type: error, code: token_expired} (checked on a timer)
    UI->>API: POST /auth/refresh
    UI->>API: WS {type: auth, token: new access token}
```

What to notice:

- **Several tabs refreshing at once** would look like reuse. The client sends one refresh at a time per tab (a shared promise) and accepts a few seconds of grace for the token it just rotated.
- **The socket is re-authenticated, not trusted forever:** the server checks expiry on a timer and asks for a fresh token; a socket that doesn't answer is closed.

## Realtime messages (contract draft)

The WebSocket at `/api/v1/realtime` carries JSON messages. Types live in `apps/web/src/lib/realtime/protocol.ts` until they move into the contract package.

| Direction       | `type`         | Fields                                                                          | When                                                   |
| --------------- | -------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------ |
| client → server | `auth`         | `token`                                                                         | first message, and after every refresh                 |
| client → server | `subscribe`    | `projectId`                                                                     | when a board opens (server checks the user can see it) |
| server → client | `presence`     | `projectId`, `users[]`                                                          | after subscribe, and when someone joins or leaves      |
| server → client | `task.changed` | `projectId`, `change` (`created`, `moved`, `updated`), `task`, `actor`, `from?` | every committed task write, via the outbox             |
| server → client | `error`        | `code`: `unauthorized`, `not_found`, `token_expired`                            | the client refreshes or leaves the project             |

Changes compared with the prototype: `change: "updated"` (edits from the task drawer) and `error: "token_expired"` are new in this design.
