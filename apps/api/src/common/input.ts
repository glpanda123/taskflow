import { validationFailed } from './problem';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Checked before any value reaches a uuid column: Postgres rejects the rest with an error (a 500). */
export const isUuid = (value: string) => UUID.test(value);

/**
 * A required name or title, trimmed. The contract's `minLength: 1` counts spaces,
 * so "   " passes it; this rejects it with the same 422 shape.
 */
export function requiredText(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw validationFailed([{ field, message: 'Must not be empty.' }]);
  return trimmed;
}
