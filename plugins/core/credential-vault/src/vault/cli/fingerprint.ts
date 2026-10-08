export interface Fingerprint {
  /** Which field of the material this describes, for example `accessToken`. */
  field: string;
  /** First four characters. Enough to recognise, not enough to use. */
  prefix: string;
  length: number;
}

/**
 * The only shape in which unopened material is ever described. Four characters is
 * chosen because every credential family in the wild is self-labelling in its
 * first few bytes — `sk-a`, `gho_`, `ya29`, `eyJh`, `rt.1` — so the owner can
 * tell an Anthropic token from a GitHub one without either being usable.
 */
export function fingerprint(field: string, value: string): Fingerprint {
  return { field, prefix: value.slice(0, 4), length: value.length };
}

/**
 * Formats a fingerprint into a readable string.
 *
 * Returns a string in the format "field=prefix…(length)".
 *
 * @param print - The fingerprint object containing field, prefix, and length.
 */
export function formatFingerprint(print: Fingerprint): string {
  return `${print.field}=${print.prefix}…(${print.length})`;
}
