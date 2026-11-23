// Writes cases.md, the readable copy of cases.json for review: node render-cases.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const cases = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'));
const weekday = (iso, style = 'long') =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: style, timeZone: 'UTC' });
const range = ([lo, hi]) => (lo === hi ? `${lo}` : `${lo}–${hi}`);
const due = (d) => {
  const [rule, v] = Object.entries(d)[0];
  if (rule === 'is') return v === null ? 'none (null)' : v;
  if (rule === 'between') return `${v[0]} … ${v[1]}`;
  if (rule === 'onOrBefore') return `on or before ${v}`;
  if (rule === 'nullOrOnOrAfter') return `none, or on/after ${v}`;
  if (rule === 'nullOrOnOrBefore') return `none, or on/before ${v}`;
  throw new Error(`Unknown due rule ${rule}`);
};
const item = (r) => {
  const extra = [];
  if (r.due) extra.push(`due: ${due(r.due)}`);
  if (r.priority) extra.push(`priority: ${r.priority.join(' or ')}`);
  return `- ${r.what}${extra.length ? ` — ${extra.join('; ')}` : ''}`;
};

const out = [
  '# Eval cases: task drafts from a brief',
  '',
  'Generated from `cases.json` by `render-cases.mjs`; edit the JSON, not this file.',
  'Written by Claude (the coding assistant) on 2026-11-20/21. Approved by the project owner on 2026-11-21. Expected answers were written **before** any model run.',
  '',
  'Every case also checks, without listing it: no draft is dropped by the contract filter, no due date is before "today", and drafts are in the brief\'s language.',
  '',
  '| # | id | group | lang | today | tasks | traps |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...cases.map(
    (c, i) =>
      `| ${i + 1} | \`${c.id}\` | ${c.tags[0]} | ${c.tags[1]} | ${c.today} (${weekday(c.today, 'short')}) | ${range(c.expect.count)} | ${c.trap} |`,
  ),
];
cases.forEach((c, i) => {
  const e = c.expect;
  out.push('', `## ${i + 1}. \`${c.id}\``, '');
  out.push(
    `Today: **${c.today}** (${weekday(c.today)}) · tags: ${c.tags.join(', ')} · tasks: **${range(e.count)}**`,
    '',
  );
  out.push(`Trap: ${c.trap}`, '', '````text', c.brief, '````', '');
  if (e.required.length) out.push('**Must have**', '', ...e.required.map(item), '');
  if (e.optional.length)
    out.push(
      '**May have** (fine either way; if present, these rules apply)',
      '',
      ...e.optional.map(item),
      '',
    );
  if (e.forbidden.length)
    out.push('**Must not have**', '', ...e.forbidden.map((f) => `- ${f}`), '');
});
writeFileSync(new URL('./cases.md', import.meta.url), out.join('\n'));
