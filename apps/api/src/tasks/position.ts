/**
 * Where a moved task goes, as a fractional key (see docs/architecture/02-data-model.md, rule 3).
 *
 * The client says "between afterId and beforeId" (the cards that will be directly above
 * and below it). We never renumber the column: we pick a NEW key that sorts between the
 * two neighbours' keys, so only the moved row is written.
 *
 *   column:   a0 ──── a1 ──── a2          (keys sort as plain strings)
 *   move between a0 and a1  →  generateKeyBetween('a0', 'a1') = 'a0V'
 *   result:   a0 ── a0V ── a1 ── a2
 */
import { generateKeyBetween } from 'fractional-indexing';

export type Card = { id: string; position: string };

/** A neighbour that isn't in the target column: the client's picture of the board is stale. */
export class BadNeighbour extends Error {
  constructor(readonly field: 'afterId' | 'beforeId') {
    super(`${field} is not a task in the target column`);
  }
}

/**
 * @param column  the target column in board order, WITHOUT the task being moved
 * @param afterId the card that should end up directly above (null: none given)
 * @param beforeId the card that should end up directly below (null: none given)
 */
export function positionBetween(
  column: Card[],
  afterId: string | null,
  beforeId: string | null,
): string {
  const indexOf = (id: string, field: 'afterId' | 'beforeId') => {
    const i = column.findIndex((c) => c.id === id);
    if (i === -1) throw new BadNeighbour(field);
    return i;
  };

  // Both given: they must be next to each other, in that order. If another card sits
  // between them now, the client's board is stale: a key "between" them could be that
  // card's own key, and two cards would share a position.
  if (afterId && beforeId) {
    const a = indexOf(afterId, 'afterId');
    const b = indexOf(beforeId, 'beforeId');
    if (b !== a + 1) throw new BadNeighbour('beforeId');
    return generateKeyBetween(column[a]!.position, column[b]!.position);
  }

  // Only "above" given: the lower bound is that card; the upper bound is whatever
  // is directly below it now (or nothing, if it is the last card).
  if (afterId) {
    const a = indexOf(afterId, 'afterId');
    return generateKeyBetween(column[a]!.position, column[a + 1]?.position ?? null);
  }

  // Only "below" given: the mirror image of the branch above.
  if (beforeId) {
    // The upper bound is that card; the lower bound is whatever is directly ABOVE it
    // now (or nothing, if it is the first card).
    const b = indexOf(beforeId, 'beforeId');
    return generateKeyBetween(column[b - 1]?.position ?? null, column[b]!.position);
  }

  // Neither given: the bottom of the column.
  return generateKeyBetween(column.at(-1)?.position ?? null, null);
}
