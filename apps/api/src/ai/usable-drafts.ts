import type { TaskDraft } from '@taskflow/api-contract/schema';
import { matchesSchema } from '../common/contract';

export const MAX_DRAFTS = 20;

/** A draft we can hand to the client: the contract's TaskDraft, and a title that isn't blank. */
export function isUsableDraft(item: unknown): item is TaskDraft {
  return matchesSchema('TaskDraft', item) && (item as TaskDraft).title.trim() !== '';
}

/**
 * The model's output is untrusted: keep what matches the contract, at most 20, in order.
 * Shared by the endpoint and the eval, so the eval grades exactly what users would see.
 */
export function keepUsableDrafts(raw: unknown[]): TaskDraft[] {
  return raw.filter(isUsableDraft).slice(0, MAX_DRAFTS);
}
