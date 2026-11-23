/**
 * Runs the task-drafts eval: each case through the production drafter (Claude), the
 * production contract filter, then the judge and the code checks in grade.ts.
 *
 *   pnpm --filter @taskflow/api build            # the eval runs the built drafter
 *   node --env-file=.env evals/task-drafts/run.mts [--limit 5] [--only id,id] [--reps 1] [--variant baseline]
 *
 * Writes out/<variant>/results.jsonl (one row per case and rep, written as it finishes),
 * traces/<id>_rep<k>.json, errors.jsonl (attempts that produced nothing to grade) and
 * summary.md. A rerun skips (case, rep) pairs already in results.jsonl.
 */
import Anthropic from '@anthropic-ai/sdk';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClaudeTaskDrafter as DrafterClass } from '../../src/ai/claude-task-drafter.ts';
import type {
  isUsableDraft as IsUsableFn,
  keepUsableDrafts as KeepFn,
} from '../../src/ai/usable-drafts.ts';
import { grade, type Grade } from './grade.ts';
import { judge, judgeClient as makeJudgeClient, JUDGE_MODEL } from './judge.ts';
import type { Draft, EvalCase } from './types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// The built production code (apps/api/dist), so the eval runs exactly what ships.
const { ClaudeTaskDrafter } = require('../../dist/ai/claude-task-drafter.js') as {
  ClaudeTaskDrafter: typeof DrafterClass;
};
const { isUsableDraft, keepUsableDrafts } = require('../../dist/ai/usable-drafts.js') as {
  isUsableDraft: typeof IsUsableFn;
  keepUsableDrafts: typeof KeepFn;
};

// ── Options ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const variant = opt('variant') ?? 'baseline';
const reps = Number(opt('reps') ?? 1);
const limit = opt('limit') ? Number(opt('limit')) : undefined;
const only = opt('only')?.split(',');
const concurrency = Number(opt('concurrency') ?? 3);
const CASE_CEILING_MS = 150_000; // per case, drafter + judge, whatever the stream does

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set: the eval calls Claude for real.');
  process.exit(1);
}

// Prices in USD per million tokens (first-party API). Cache writes 1.25x, reads 0.1x input.
const PRICES: Record<string, { in: number; out: number }> = {
  'claude-opus-5-5': { in: 4, out: 20 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5 },
};
function cost(model: string, u: Anthropic.Usage): number {
  const p = PRICES[model];
  if (!p) return NaN;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  return (
    (u.input_tokens * p.in +
      cacheWrite * p.in * 1.25 +
      cacheRead * p.in * 0.1 +
      u.output_tokens * p.out) /
    1e6
  );
}

// ── Cases and output ──────────────────────────────────────────────────────────
let cases = JSON.parse(readFileSync(join(here, 'cases.json'), 'utf8')) as EvalCase[];
if (only) cases = cases.filter((c) => only.includes(c.id));
if (limit) cases = cases.slice(0, limit);

const outDir = join(here, 'out', variant);
mkdirSync(join(outDir, 'traces'), { recursive: true });
const resultsFile = join(outDir, 'results.jsonl');
const done = new Set(
  existsSync(resultsFile)
    ? readFileSync(resultsFile, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          const r = JSON.parse(l) as { prompt_id: string; rep: number };
          return `${r.prompt_id}#${r.rep}`;
        })
    : [],
);

type Row = {
  prompt_id: string;
  rep: number;
  tags: string[];
  prompt: string;
  status: 'ok' | 'truncated' | 'refused' | 'unparseable';
  stop_reason: string | null;
  grade: Grade | null;
  explanation?: Record<string, string>;
  drafts: Draft[];
  model: string;
  usage: Anthropic.Usage;
  judge_model?: string;
  judge_usage?: Anthropic.Usage;
  latency_s: number;
  cost_usd: number;
};

const drafter = new ClaudeTaskDrafter();
const judgeClient = makeJudgeClient();

function withCeiling<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const ceiling = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`case took longer than ${ms / 1000} s`)), ms);
  });
  return Promise.race([work, ceiling]).finally(() => clearTimeout(timer));
}

async function runCase(c: EvalCase, rep: number): Promise<Row> {
  const input = { brief: c.brief, today: c.today };
  const request = drafter.buildRequest(input);
  const started = performance.now();
  const response = await drafter.request(input);
  const latency_s = (performance.now() - started) / 1000;
  if (!response.model.startsWith(request.model)) {
    throw new Error(`served by ${response.model}, asked for ${request.model}`);
  }
  const trace: unknown[] = [
    { role: 'system', content: request.system },
    { role: 'user', content: request.messages[0]?.content },
  ];
  const text = response.content.find((b) => b.type === 'text');
  trace.push({ role: 'assistant', content: text?.text ?? '' });

  const base = {
    prompt_id: c.id,
    rep,
    tags: c.tags,
    prompt: c.brief,
    stop_reason: response.stop_reason,
    model: response.model,
    usage: response.usage,
    latency_s,
    cost_usd: cost(request.model, response.usage),
  };
  const save = (extra: unknown[] = []) =>
    writeFileSync(
      join(outDir, 'traces', `${c.id}_rep${rep}.json`),
      JSON.stringify([...trace, ...extra], null, 2),
    );

  let raw: unknown[];
  try {
    raw = ClaudeTaskDrafter.parseDrafts(response);
  } catch (error) {
    save();
    const status =
      response.stop_reason === 'max_tokens'
        ? 'truncated'
        : response.stop_reason === 'refusal'
          ? 'refused'
          : 'unparseable';
    // Truncated, refused or unreadable: users get no drafts, so it is the model's failure
    // under the production token budget, not an infra error.
    return {
      ...base,
      status,
      grade: zero(),
      drafts: [],
      explanation: { pass: String(error) },
    };
  }
  const drafts = keepUsableDrafts(raw) as Draft[];
  const j = await judge(judgeClient, c, drafts);
  save([
    { role: 'user', content: `[judge input]\n${j.prompt}` },
    { role: 'assistant', content: `[judge verdict]\n${JSON.stringify(j.verdict, null, 2)}` },
  ]);
  return {
    ...base,
    status: 'ok',
    grade: grade(c, raw.filter((d) => !isUsableDraft(d)).length, drafts, j.verdict),
    explanation: { judge: j.verdict.explanation },
    drafts,
    judge_model: j.response.model,
    judge_usage: j.response.usage,
    cost_usd: base.cost_usd + cost(JUDGE_MODEL, j.response.usage),
  };
}

function zero(): Grade {
  return {
    pass: 0,
    coverage: 0,
    dates: 0,
    priority: 0,
    count_ok: 0,
    no_invented: 0,
    no_forbidden: 0,
    no_duplicates: 0,
    language_ok: 0,
    no_past_due: 0,
    all_valid: 0,
  };
}

// ── Run ───────────────────────────────────────────────────────────────────────
const jobs = cases
  .flatMap((c) => Array.from({ length: reps }, (_, rep) => ({ c, rep })))
  .filter((j) => !done.has(`${j.c.id}#${j.rep}`));
console.log(
  `Eval ${variant}: ${jobs.length} runs (${cases.length} cases × ${reps} reps), drafter ${process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5'}, judge ${JUDGE_MODEL}`,
);
const wallStart = performance.now();
let next = 0;
async function worker() {
  while (next < jobs.length) {
    const { c, rep } = jobs[next++]!;
    try {
      const row = await withCeiling(runCase(c, rep), CASE_CEILING_MS);
      appendFileSync(resultsFile, JSON.stringify(row) + '\n');
      const failed = row.grade
        ? Object.entries(row.grade)
            .filter(([k, v]) => k !== 'pass' && v < 1)
            .map(([k]) => k)
        : [row.status];
      console.log(
        `${row.grade?.pass ? 'PASS' : 'FAIL'} ${c.id}#${rep} ${row.latency_s.toFixed(1)}s $${row.cost_usd.toFixed(4)}${failed.length ? `  (${failed.join(', ')})` : ''}`,
      );
    } catch (error) {
      // Nothing to grade (API error after retries, timeout, judge failure): kept out of the scores.
      appendFileSync(
        join(outDir, 'errors.jsonl'),
        JSON.stringify({ prompt_id: c.id, rep, error: String(error) }) + '\n',
      );
      console.log(`ERROR ${c.id}#${rep}: ${String(error)}`);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));

// ── Summary ───────────────────────────────────────────────────────────────────
// No file when every attempt failed (a bad key, an outage): summarise errors only.
const rows = (existsSync(resultsFile) ? readFileSync(resultsFile, 'utf8') : '')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l) as Row);
const graded = rows.filter((r) => r.grade);
const n = graded.length;
const mean = (k: keyof Grade) => (n ? graded.reduce((s, r) => s + r.grade![k], 0) / n : NaN);
const p = mean('pass');
// Wilson 95% interval: unlike p ± 1.96·sqrt(p(1-p)/n), it stays honest at 0% and 100%.
const wilson = (k: number, total: number): [number, number] => {
  if (!total) return [NaN, NaN];
  const z = 1.96;
  const ph = k / total;
  const centre = (ph + (z * z) / (2 * total)) / (1 + (z * z) / total);
  const spread =
    (z * Math.sqrt((ph * (1 - ph)) / total + (z * z) / (4 * total * total))) /
    (1 + (z * z) / total);
  return [Math.max(0, centre - spread), Math.min(1, centre + spread)];
};
const [low, high] = wilson(Math.round(p * n), n);
const errors = existsSync(join(outDir, 'errors.jsonl'))
  ? readFileSync(join(outDir, 'errors.jsonl'), 'utf8').split('\n').filter(Boolean).length
  : 0;
const totalCost = rows.reduce((s, r) => s + r.cost_usd, 0);
const lat = rows.map((r) => r.latency_s).sort((a, b) => a - b);
const metrics: (keyof Grade)[] = [
  'coverage',
  'dates',
  'priority',
  'count_ok',
  'no_invented',
  'no_forbidden',
  'no_duplicates',
  'language_ok',
  'no_past_due',
  'all_valid',
];
const pct = (v: number) => `${Math.round(v * 100)}%`;
const md = [
  `## AI eval: task drafts (${variant})`,
  '',
  `**Pass: ${graded.filter((r) => r.grade!.pass === 1).length}/${n} (${pct(p)}, 95% interval ${pct(low)}–${pct(high)})** · errors: ${errors} · truncated: ${rows.filter((r) => r.status === 'truncated').length} · cost: $${totalCost.toFixed(2)} · drafter latency median ${lat[Math.floor(lat.length / 2)]?.toFixed(1) ?? '–'} s, max ${lat.at(-1)?.toFixed(1) ?? '–'} s · wall clock ${((performance.now() - wallStart) / 1000).toFixed(0)} s`,
  '',
  '| ' + metrics.join(' | ') + ' |',
  '| ' + metrics.map(() => '---').join(' | ') + ' |',
  '| ' + metrics.map((m) => pct(mean(m))).join(' | ') + ' |',
  '',
  '| case | rep | result | failed checks | drafts | latency | cost | judge note |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...rows.map((r) => {
    const failed = r.grade
      ? Object.entries(r.grade)
          .filter(([k, v]) => k !== 'pass' && v < 1)
          .map(([k]) => k)
          .join(', ')
      : r.status;
    const note = (r.explanation?.judge ?? r.explanation?.pass ?? '')
      .replace(/\|/g, '/')
      .replace(/\n/g, ' ');
    return `| ${r.prompt_id} | ${r.rep} | ${r.grade?.pass ? '✅' : '❌'} | ${failed} | ${r.drafts.length} | ${r.latency_s.toFixed(1)} s | $${r.cost_usd.toFixed(3)} | ${note} |`;
  }),
].join('\n');
writeFileSync(join(outDir, 'summary.md'), md + '\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
console.log(`\n${md.split('\n')[2]}`);
// Nothing graded is a broken run (bad key, outage), not a score: fail the job.
if (n === 0 && errors > 0) process.exitCode = 1;
