import type { ServerResponse } from "node:http";

/** Send a JSON response with the no-store, JSON-charset headers every plugin web route wants. */
// jscpd:ignore-start -- small shape mirrored inline in credential-vault/src/web.ts prior to full adoption of this shared helper there
export function sendJsonResponse(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(payload);
}
// jscpd:ignore-end
