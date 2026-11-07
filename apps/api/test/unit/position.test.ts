/**
 * positionBetween(): where a dropped card lands. Pure function, no database.
 * Every case checks the only thing the board cares about: the new key sorts
 * exactly where the client asked.
 */
import { describe, expect, it } from 'vitest';
import { BadNeighbour, type Card, positionBetween } from '../../src/tasks/position';

// A column of three cards with real fractional keys.
const A: Card = { id: 'A', position: 'a0' };
const B: Card = { id: 'B', position: 'a1' };
const C: Card = { id: 'C', position: 'a2' };
const column = [A, B, C];

/** Insert the new key and return the ids in sort order (plain string compare, like Postgres COLLATE "C"). */
function order(cards: Card[], key: string): string[] {
  return [...cards, { id: 'X', position: key }]
    .sort((p, q) => (p.position < q.position ? -1 : p.position > q.position ? 1 : 0))
    .map((c) => c.id);
}

describe('positionBetween()', () => {
  it('puts the first card of an empty column somewhere valid', () => {
    expect(order([], positionBetween([], null, null))).toEqual(['X']);
  });

  it('goes to the bottom when no neighbour is given', () => {
    expect(order(column, positionBetween(column, null, null))).toEqual(['A', 'B', 'C', 'X']);
  });

  it('goes between two given neighbours', () => {
    expect(order(column, positionBetween(column, 'A', 'B'))).toEqual(['A', 'X', 'B', 'C']);
  });

  it('only afterId: directly below that card', () => {
    expect(order(column, positionBetween(column, 'A', null))).toEqual(['A', 'X', 'B', 'C']);
    expect(order(column, positionBetween(column, 'C', null))).toEqual(['A', 'B', 'C', 'X']);
  });

  it('only beforeId: directly above that card', () => {
    expect(order(column, positionBetween(column, null, 'B'))).toEqual(['A', 'X', 'B', 'C']);
  });

  it('only beforeId on the first card: to the very top', () => {
    expect(order(column, positionBetween(column, null, 'A'))).toEqual(['X', 'A', 'B', 'C']);
  });

  it('rejects a neighbour that is not in the column, naming the field', () => {
    expect(() => positionBetween(column, 'nope', null)).toThrow(BadNeighbour);
    expect(() => positionBetween(column, null, 'nope')).toThrow(
      expect.objectContaining({ field: 'beforeId' }),
    );
  });

  it('rejects neighbours given in the wrong order', () => {
    expect(() => positionBetween(column, 'C', 'A')).toThrow(BadNeighbour);
    expect(() => positionBetween(column, 'B', 'B')).toThrow(BadNeighbour);
  });

  it('keeps working when the same gap is used again and again', () => {
    // Drop 20 cards one after another right below A: keys get longer, order stays right.
    let cards = [...column];
    for (let i = 0; i < 20; i++) {
      const key = positionBetween(cards, 'A', null);
      cards = [...cards, { id: `X${i}`, position: key }].sort((p, q) =>
        p.position < q.position ? -1 : 1,
      );
    }
    expect(cards[0]!.id).toBe('A');
    expect(cards.at(-2)!.id).toBe('B');
    expect(cards.at(-1)!.id).toBe('C');
  });
});
