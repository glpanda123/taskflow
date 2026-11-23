/**
 * The eval's code checks (evals/task-drafts/grade.ts). A grader that is wrong makes the
 * eval's number wrong, so the parts that don't need a model are tested like any code.
 */
import { describe, expect, it } from 'vitest';
import { dueMatches, grade, languageOk } from '../../evals/task-drafts/grade.ts';
import type { Draft, EvalCase, Verdict } from '../../evals/task-drafts/types.ts';

const draft = (
  title: string,
  dueDate: string | null = null,
  priority: Draft['priority'] = 'medium',
): Draft => ({
  title,
  description: null,
  priority,
  dueDate,
});

const acme: EvalCase = {
  id: 'acme',
  tags: ['relative-date', 'en'],
  today: '2026-11-18',
  trap: '',
  brief: 'Landing page next Friday: hero banner, pricing table (urgent).',
  expect: {
    count: [2, 3],
    language: 'en',
    required: [
      { what: 'Hero banner', due: { is: '2026-11-27' } },
      { what: 'Pricing table', due: { is: '2026-11-27' }, priority: ['high'] },
    ],
    optional: [{ what: 'Launch', due: { is: '2026-11-27' } }],
    forbidden: ['SEO work'],
  },
};
const clean: Verdict = {
  required: [0, 1],
  optional: [-1],
  invented: [],
  forbidden: [],
  duplicates: [],
  explanation: '',
};

describe('dueMatches', () => {
  it('is: an exact date, or exactly null', () => {
    expect(dueMatches({ is: '2026-11-27' }, '2026-11-27')).toBe(true);
    expect(dueMatches({ is: '2026-11-27' }, '2026-11-20')).toBe(false);
    expect(dueMatches({ is: '2026-11-27' }, null)).toBe(false);
    expect(dueMatches({ is: null }, null)).toBe(true);
    expect(dueMatches({ is: null }, '2026-11-27')).toBe(false);
  });

  it('between is inclusive at both ends; null is outside', () => {
    const rule = { between: ['2026-11-27', '2026-11-30'] as [string, string] };
    expect(dueMatches(rule, '2026-11-27')).toBe(true);
    expect(dueMatches(rule, '2026-11-30')).toBe(true);
    expect(dueMatches(rule, '2026-12-01')).toBe(false);
    expect(dueMatches(rule, null)).toBe(false);
  });

  it('onOrBefore needs a date; the nullOr rules accept null', () => {
    expect(dueMatches({ onOrBefore: '2026-12-15' }, null)).toBe(false);
    expect(dueMatches({ onOrBefore: '2026-12-15' }, '2026-12-15')).toBe(true);
    expect(dueMatches({ nullOrOnOrAfter: '2027-01-01' }, null)).toBe(true);
    expect(dueMatches({ nullOrOnOrAfter: '2027-01-01' }, '2026-12-31')).toBe(false);
    expect(dueMatches({ nullOrOnOrBefore: '2026-11-23' }, '2026-11-24')).toBe(false);
  });
});

describe('languageOk', () => {
  it('Vietnamese briefs need mostly Vietnamese titles; English ones none', () => {
    expect(languageOk([draft('Làm lại banner Black Friday'), draft('Fix popup')], 'vi')).toBe(true);
    expect(languageOk([draft('Redo the banner'), draft('Add a popup')], 'vi')).toBe(false);
    expect(languageOk([draft('Redo the banner')], 'en')).toBe(true);
    expect(languageOk([draft('Sửa banner')], 'en')).toBe(false);
  });
});

describe('grade', () => {
  it('an answer that meets every expectation passes (oracle)', () => {
    const drafts = [
      draft('Hero banner', '2026-11-27'),
      draft('Pricing table', '2026-11-27', 'high'),
    ];
    expect(grade(acme, 0, drafts, clean)).toMatchObject({
      pass: 1,
      coverage: 1,
      dates: 1,
      priority: 1,
    });
  });

  it('an empty answer fails (null baseline)', () => {
    const verdict = { ...clean, required: [-1, -1] };
    expect(grade(acme, 0, [], verdict)).toMatchObject({ pass: 0, coverage: 0, count_ok: 0 });
  });

  it('a wrong date or priority fails only that check', () => {
    const drafts = [
      draft('Hero banner', '2026-11-20'),
      draft('Pricing table', '2026-11-27', 'medium'),
    ];
    const g = grade(acme, 0, drafts, clean);
    expect(g).toMatchObject({ pass: 0, coverage: 1, dates: 0.5, priority: 0 });
  });

  it('a due date before today fails no_past_due', () => {
    const drafts = [
      draft('Hero banner', '2026-11-27'),
      draft('Pricing table', '2026-11-10', 'high'),
    ];
    expect(grade(acme, 0, drafts, clean).no_past_due).toBe(0);
  });

  it('drafts the contract filter dropped fail all_valid', () => {
    const drafts = [
      draft('Hero banner', '2026-11-27'),
      draft('Pricing table', '2026-11-27', 'high'),
    ];
    expect(grade(acme, 1, drafts, clean).all_valid).toBe(0);
    expect(grade(acme, 0, drafts, clean).all_valid).toBe(1);
  });

  it('invented, forbidden and duplicate drafts each fail their own check', () => {
    const drafts = [
      draft('Hero banner', '2026-11-27'),
      draft('Pricing table', '2026-11-27', 'high'),
    ];
    const g = grade(acme, 0, drafts, {
      ...clean,
      invented: [1],
      forbidden: [[1, 0]],
      duplicates: [1],
    });
    expect(g).toMatchObject({ pass: 0, no_invented: 0, no_forbidden: 0, no_duplicates: 0 });
  });

  it('a case that expects no tasks passes with none', () => {
    const empty: EvalCase = {
      ...acme,
      expect: { ...acme.expect, count: [0, 0], required: [], optional: [] },
    };
    expect(grade(empty, 0, [], { ...clean, required: [], optional: [] }).pass).toBe(1);
  });
});
