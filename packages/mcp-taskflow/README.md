# TaskFlow MCP server

Lets an MCP client such as Claude Code use TaskFlow: "which tasks in Acme are in progress?".
It is a client of the TaskFlow REST API, like the web app, so it logs in as a real user and
sees only what that user may see. It never touches the database.

| Tool            | What                                              | Writes? |
| --------------- | ------------------------------------------------- | ------- |
| `list_projects` | Projects the user can see, by workspace, with ids | No      |

## Run it with Claude Code

1. Start the API locally (`pnpm --filter @taskflow/api dev`) and sign up in the web app.
2. Set the account in your shell, not in a file (Git Bash):
   ```bash
   export TASKFLOW_EMAIL=you@example.com
   read -s TASKFLOW_PASSWORD && export TASKFLOW_PASSWORD
   ```
   `TASKFLOW_API_URL` defaults to `http://localhost:3001/api/v1`.
3. Start `claude` from the repo root. It reads `.mcp.json`, asks once to approve the
   `taskflow` server, and starts it. Check with `/mcp`.

Needs Node 22.18 or later: Node runs the TypeScript files directly by stripping the types,
so there is no build step.

## Try it without Claude

```bash
pnpm --filter @taskflow/mcp inspect
```

Opens the MCP Inspector in the browser: list the tools, call one, see the raw result.

## Rules

- stdout is the MCP channel. Log with `console.error`, never `console.log` (lint enforces it).
- An API error is returned as a tool result with `isError`, so the model can read it and
  fix its call. Anything else is a bug and is thrown.
- Names and titles in results are user data. Tool descriptions say so, because a task can
  be titled "ignore previous instructions".
