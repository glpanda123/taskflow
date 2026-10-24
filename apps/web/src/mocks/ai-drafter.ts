/**
 * Stand-in for the LLM behind POST /task-drafts, so the prototype works offline.
 *
 * Rule-based on purpose: it recognises common agency work in the brief (hero, pricing,
 * forms, copy review, analytics, mobile QA, demo call, launch), reads dates like
 * "next Friday", "by Wednesday", "tomorrow", and falls back to one task per sentence.
 * The real feature (after the core backend) calls an LLM with a JSON schema and is
 * checked by evals; the request/response shape stays the same.
 */
import type { TaskDraft } from '@taskflow/api-contract';

type Template = { match: RegExp; title: (s: string) => string; priority: TaskDraft['priority'] };

const templates: Template[] = [
  {
    match: /\bhero\b/i,
    title: (s) =>
      /(photo|shot|image)/i.test(s)
        ? 'Build hero section with product shots'
        : 'Build hero section',
    priority: 'high',
  },
  { match: /\bpricing\b/i, title: () => 'Build pricing table', priority: 'medium' },
  {
    match: /\b(sign ?up|newsletter|contact) form\b|\bform\b/i,
    title: (s) =>
      /mailchimp/i.test(s)
        ? 'Connect signup form to Mailchimp'
        : 'Build signup form with validation',
    priority: 'medium',
  },
  {
    match: /\bcopy\b.*\breview|\breview.*\bcopy\b/i,
    title: () => 'Get client sign-off on page copy',
    priority: 'high',
  },
  {
    match: /\banalytics|tracking\b/i,
    title: () => 'Set up analytics events for signups',
    priority: 'medium',
  },
  {
    match: /\bmobile|responsive\b/i,
    title: () => 'QA the page on mobile devices',
    priority: 'medium',
  },
  {
    match: /\b(demo|walkthrough)\b.*\b(call|meeting)\b|\bcall\b.*\bdemo\b/i,
    title: () => 'Schedule demo call with the client',
    priority: 'low',
  },
  {
    match: /\b(launch(ing)?|go(ing)? live|release)\b/i,
    title: () => 'Launch: final checks and go live',
    priority: 'high',
  },
];

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** First date phrase in the sentence, relative to `today`. */
function findDate(sentence: string, today: Date): string | null {
  const s = sentence.toLowerCase();
  const add = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return iso(d);
  };
  if (/\btomorrow\b/.test(s)) return add(1);
  const weekday = s.match(
    /\b(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
  );
  if (weekday) {
    let diff = (WEEKDAYS.indexOf(weekday[2]!) - today.getDay() + 7) % 7 || 7;
    if (weekday[1] && diff <= 2) diff += 7; // "next Friday" said on a Thursday means the one after
    return add(diff);
  }
  if (/\bnext week\b/.test(s)) return add(7);
  if (/\bend of (the )?month\b/.test(s)) {
    const d = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return iso(d);
  }
  return null;
}

/** "we also need to make sure the page loads fast" → "Make sure the page loads fast" */
function sentenceToTitle(sentence: string): string {
  let t = sentence
    .replace(/^(also|and|then|please|so)\b[,\s]*/i, '')
    .replace(/^(we|i|you)\s+(also\s+)?(need|want|have)\s+to\s+/i, '')
    .replace(/^(need|needs)\s+(to\s+)?/i, '')
    .trim();
  // The date becomes dueDate, so it doesn't need to stay in the title.
  t = t
    .replace(/[.!?]+$/, '')
    .replace(
      /\s+(by\s+|on\s+)?(tomorrow|next week|(the\s+)?end of (the\s+)?month|(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday))$/i,
      '',
    );
  if (t.length > 70) t = `${t.slice(0, 70).replace(/\s+\S*$/, '')}…`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function draftTasksFromText(text: string, today = new Date()): TaskDraft[] {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+|^\s*[-*•]\s*/m)
    .map((s) => s.replace(/^[-*•]\s*/, '').trim())
    .filter((s) => s.length > 3);

  const launchDate =
    sentences.map((s) => (/launch|go live/i.test(s) ? findDate(s, today) : null)).find(Boolean) ??
    null;
  const drafts: TaskDraft[] = [];
  const seen = new Set<string>();
  const push = (draft: TaskDraft) => {
    if (seen.has(draft.title) || drafts.length >= 10) return;
    seen.add(draft.title);
    drafts.push(draft);
  };

  for (const sentence of sentences) {
    const date = findDate(sentence, today);
    const hits = templates.filter((t) => t.match.test(sentence));
    const description = `From the brief: “${sentence.replace(/\s+/g, ' ')}”`;
    if (hits.length === 0) {
      push({ title: sentenceToTitle(sentence), description, priority: 'medium', dueDate: date });
      continue;
    }
    for (const t of hits) {
      // Work without its own date is due by launch.
      push({
        title: t.title(sentence),
        description,
        priority: t.priority,
        dueDate: date ?? launchDate,
      });
    }
  }
  return drafts;
}
