export interface VaultTransportRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

export interface VaultTransportResponse {
  status: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Egress for `authenticatedFetch`. This is the one place the credential is
 * visible after it leaves the record, which is why it is injected by the
 * runtime that owns the vault and never by the agent: it sits inside the trust
 * boundary the same way the cipher in `store.ts` does.
 */
export type VaultTransport = (request: VaultTransportRequest) => Promise<VaultTransportResponse>;

/**
 * Egress over the platform `fetch`, with redirects deliberately not followed.
 *
 * Following a redirect is how an allow-listed host hands a credential to one
 * that is not: the runtime would re-send the `Authorization` header to whatever
 * `Location` said. The agent gets the location back instead and may re-issue,
 * which costs it another allow-list check.
 */
export function defaultVaultTransport(): VaultTransport {
  return async (request) => {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      ...(request.body ? { body: request.body } : {}),
      redirect: "manual",
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, name) => {
      headers[name] = value;
    });
    return {
      status: response.status,
      statusText: response.statusText,
      headers,
      body: await response.text(),
    };
  };
}
