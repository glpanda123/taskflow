/**
 * Grading for the task-drafts eval. Code checks everything it can check exactly
 * (count, dates, priorities, language, contract validity); the judge model only
 * decides which draft is which expected item, and what was invented or forbidden.
 */
import type { Draft, DueRule, EvalCase, ExpectedItem, Verdict } from './types.ts';

export function dueMatches(rule: DueRule, value: string | null): boolean {
  if ('is' in rule) return value === rule.is;
  if (value === null) return 'nullOrOnOrAfter' in rule || 'nullOrOnOrBefore' in rule;
  if ('between' in rule) return value >= rule.between[0] && value <= rule.between[1];
  if ('onOrBefore' in rule) return value <= rule.onOrBefore;
  if ('nullOrOnOrAfter' in rule) return value >= rule.nullOrOnOrAfter;
  return value <= rule.nullOrOnOrBefore;
}

const VIETNAMESE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

/** Titles in the brief's language: Vietnamese titles carry Vietnamese letters, English ones don't. */
export function languageOk(drafts: Draft[], language: 'en' | 'vi'): boolean {
  if (drafts.length === 0) return true;
  const vietnamese = drafts.filter((d) => VIETNAMESE.test(d.title)).length;
  return language === 'vi' ? vietnamese * 2 >= drafts.length : vietnamese === 0;
}

/** Share of matched items whose due date and priority follow the case's rules (1 when nothing to check). */
function itemChecks(items: ExpectedItem[], matches: number[], drafts: Draft[]) {
  let dueChecked = 0;
  let dueOk = 0;
  let priorityChecked = 0;
  let priorityOk = 0;
  items.forEach((item, i) => {
    const draft = drafts[matches[i] ?? -1];
    if (!draft) return;
    if (item.due) {
      dueChecked++;
      if (dueMatches(item.due, draft.dueDate)) dueOk++;
    }
    if (item.priority) {
      priorityChecked++;
      if (item.priority.includes(draft.priority)) priorityOk++;
    }
  });
  return { dueChecked, dueOk, priorityChecked, priorityOk };
}

export type Grade = {
  pass: number;
  coverage: number;
  dates: number;
  priority: number;
  count_ok: number;
  no_invented: number;
  no_forbidden: number;
  no_duplicates: number;
  language_ok: number;
  no_past_due: number;
  all_valid: number;
};

/**
 * `drafts` is what survived the contract filter (what users see); `dropped` is how many
 * of the model's items the filter rejected as invalid (the 20-draft cap is not counted).
 * Each metric is 0 or 1 except coverage, dates and priority (shares).
 */
export function grade(c: EvalCase, dropped: number, drafts: Draft[], verdict: Verdict): Grade {
  const e = c.expect;
  const found = verdict.required.filter((i) => i >= 0 && i < drafts.length).length;
  const req = itemChecks(e.required, verdict.required, drafts);
  const opt = itemChecks(e.optional, verdict.optional, drafts);
  const dueChecked = req.dueChecked + opt.dueChecked;
  const priorityChecked = req.priorityChecked + opt.priorityChecked;

  const g: Omit<Grade, 'pass'> = {
    coverage: e.required.length === 0 ? 1 : found / e.required.length,
    dates: dueChecked === 0 ? 1 : (req.dueOk + opt.dueOk) / dueChecked,
    priority: priorityChecked === 0 ? 1 : (req.priorityOk + opt.priorityOk) / priorityChecked,
    count_ok: Number(drafts.length >= e.count[0] && drafts.length <= e.count[1]),
    no_invented: Number(verdict.invented.length === 0),
    no_forbidden: Number(verdict.forbidden.length === 0),
    no_duplicates: Number(verdict.duplicates.length === 0),
    language_ok: Number(languageOk(drafts, e.language)),
    no_past_due: Number(drafts.every((d) => d.dueDate === null || d.dueDate >= c.today)),
    all_valid: Number(dropped === 0),
  };
  const pass = Number(Object.values(g).every((v) => v === 1));
  return { pass, ...g };
}
