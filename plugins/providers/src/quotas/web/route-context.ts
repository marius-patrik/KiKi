/**
 * Shared per-request context threaded through each domain's route handler,
 * plus the common "does this route match" helper used by every handler.
 * @module providers/quotas/web/route-context
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@deepseek-ai/cordis";

export interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  pathname: string;
  method: string;
  /** The plugin context the quotas surface was mounted on, for routes that call Host services. */
  plugin: Context;
}

/** True when the request matches an exact `/quotas/...` path and HTTP method. */
export function isRoute(ctx: RouteContext, pathname: string, method: string): boolean {
  return ctx.pathname === pathname && ctx.method === method;
}
