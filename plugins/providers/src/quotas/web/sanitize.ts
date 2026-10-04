/**
 * Shared identifier sanitization for values that get interpolated into shell
 * commands (tmux/docker session and container names). Strips everything but
 * safe identifier characters so the caller never has to reimplement the
 * regex at each call site.
 * @module providers/quotas/web/sanitize
 */

/** Strip everything except letters, digits, `_` and `-` from a user-supplied identifier. */
export function sanitizeIdentifier(value: unknown, fallback = ""): string {
  return String(value ?? fallback).replace(/[^a-zA-Z0-9_-]/g, "");
}

/** Strip everything except digits from a user-supplied numeric identifier. */
export function sanitizeDigits(value: unknown, fallback = ""): string {
  return String(value ?? fallback).replace(/[^0-9]/g, "");
}
