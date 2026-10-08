/**
 * Shared "run a shell action, respond 200 with its result or 500 with the
 * error message" wrapper. Every mutating route (tmux/docker/git actions)
 * follows this exact try/catch/respond shape; this is the one place it's
 * implemented.
 * @module providers/quotas/web/action-response
 */

import type { ServerResponse } from "node:http";
import { sendJsonResponse } from "@dsh-stack/plugin-kit";

/** Run `action`, sending its result (defaulting to `{ success: true }`) as a 200, or the error message as a 500. */
export async function respondToAction<T>(
  res: ServerResponse,
  action: () => T | Promise<T>,
  buildSuccess: (result: T) => Record<string, unknown> = () => ({ success: true }),
): Promise<void> {
  try {
    const result = await action();
    sendJsonResponse(res, 200, buildSuccess(result));
  } catch (err) {
    sendJsonResponse(res, 500, { error: (err as Error).message });
  }
}
