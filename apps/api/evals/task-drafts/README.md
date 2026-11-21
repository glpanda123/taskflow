# Eval: task drafts from a brief

Measures how well `POST /projects/{id}/task-drafts` turns a client brief into drafts.
The tests (`test/task-drafts.e2e.test.ts`) check our code with a stand-in model; this eval
checks the model's work, with the real model, and gives a score.

| File         | What                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cases.json` | 18 briefs with expected answers, written before any model run. Edit this one.                                                                    |
| `cases.md`   | Readable copy for review: `node render-cases.mjs`                                                                                                |
| `grade.ts`   | Checks done by code: count, dates, priorities, language, past dates, contract validity                                                           |
| `judge.ts`   | Checks that need reading (Sonnet 5.5, not the model under test): which draft is which expected item, invented work, "must not" rules, duplicates |
| `run.mts`    | Runs the production drafter and filter (built `dist/`), grades, writes `out/<variant>/`                                                          |

A case passes when every check passes. `coverage`, `dates` and `priority` are shares;
the others are 0 or 1.

## Run it

```bash
pnpm --filter @taskflow/api build
cd apps/api
pnpm eval:drafts --limit 5           # pilot
pnpm eval:drafts                     # all cases
pnpm eval:drafts --variant v1        # after a prompt or model change, next to baseline
ANTHROPIC_MODEL=claude-haiku-5-5 pnpm eval:drafts --variant haiku
```

It calls Claude for real: about one to two cents per case (drafter plus judge). Output in
`out/<variant>/`: `summary.md`, `results.jsonl` (a row per case, written as it finishes; a
rerun skips rows already there), `traces/` (the full exchange, judge included) and
`errors.jsonl` (attempts that produced nothing to grade, kept out of the score).

In CI: `.github/workflows/eval-ai.yml`, on pull requests that touch the AI code or the eval,
or by hand from the Actions tab. It needs the `ANTHROPIC_API_KEY` repository secret.
