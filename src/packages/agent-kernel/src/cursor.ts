/**
 * Unsigned-decimal cursor normalization and comparison.
 * @module agent-kernel/cursor
 */

/** Normalize an unsigned-decimal cursor and reject ambiguous encodings. */
export function normalizeCursor(cursor: string): string {
  if (!/^(0|[1-9][0-9]*)$/.test(cursor)) {
    throw new Error(`agent-kernel: invalid unsigned-decimal cursor "${cursor}"`);
  }
  return BigInt(cursor).toString();
}

/** Compare two normalized or normalizable unsigned-decimal cursors. */
export function compareCursor(left: string, right: string): number {
  const a = BigInt(normalizeCursor(left));
  const b = BigInt(normalizeCursor(right));
  return a < b ? -1 : a > b ? 1 : 0;
}
