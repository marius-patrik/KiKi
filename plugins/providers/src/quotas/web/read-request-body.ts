/**
 * Single shared reader for buffering an incoming HTTP request body and
 * parsing it as JSON. Every POST route under `/quotas/api/*` reads its body
 * through this helper instead of re-implementing the `data`/`end` stream
 * plumbing inline.
 * @module providers/quotas/web/read-request-body
 */

import type { IncomingMessage } from "node:http";

/** Buffer an incoming request body and parse it as JSON, resolving `{}` on any read/parse failure. */
export async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}
