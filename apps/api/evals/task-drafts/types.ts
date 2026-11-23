/** The shape of cases.json. Expected answers are written by people, before any model run. */
export type DueRule =
  | { is: string | null }
  | { between: [string, string] }
  | { onOrBefore: string }
  | { nullOrOnOrAfter: string }
  | { nullOrOnOrBefore: string };

export type Priority = 'low' | 'medium' | 'high';

export type ExpectedItem = { what: string; due?: DueRule; priority?: Priority[] };

export type EvalCase = {
  id: string;
  tags: string[];
  today: string;
  trap: string;
  brief: string;
  expect: {
    count: [number, number];
    language: 'en' | 'vi';
    required: ExpectedItem[];
    optional: ExpectedItem[];
    forbidden: string[];
  };
};

export type Draft = {
  title: string;
  description: string | null;
  priority: Priority;
  dueDate: string | null;
};

/** What the judge model decides; everything else is checked by code. */
export type Verdict = {
  /** For each required item, in order: the index of the draft that does it, or -1. */
  required: number[];
  /** For each optional item, in order: the index of the draft that does it, or -1. */
  optional: number[];
  /** Drafts asking for work the brief does not ask for. */
  invented: number[];
  /** Drafts that break one of the case's "must not have" rules: [draft index, rule index]. */
  forbidden: [number, number][];
  /** Drafts that repeat the work of an earlier draft. */
  duplicates: number[];
  explanation: string;
};
