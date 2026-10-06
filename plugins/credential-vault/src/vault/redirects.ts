/**
 * The `fetch` every credentialed egress in the engine goes through.
 *
 * ## The hazard
 *
 * `fetch` defaults to `redirect: "follow"`, and a redirect is the shortest path
 * from "this request carries a secret" to "that secret is at an origin nobody
 * chose". Measured on Node and on Bun 1.3.14 against two loopback servers:
 *
 * - `Authorization` **is** stripped on a cross-origin hop. That is the one case
 *   the fetch specification handles, and it is the case people remember.
 * - `x-api-key` and `x-goog-api-key` are **not** stripped. The strip list is a
 *   fixed set of well-known names, and a provider's auth header is whatever its
 *   descriptor says it is, so the runtime cannot know it is a credential.
 * - A **307 or 308 replays the request body verbatim**, method included. No
 *   implementation strips a body, because there is no rule that could say which
 *   bodies are sensitive. An OAuth refresh-token grant is
 *   `grant_type=refresh_token&refresh_token=…` in a POST body, so the whole
 *   long-lived credential arrives intact at whatever the `Location` named.
 *
 * The body case is strictly worse than the header case and is the one that
 * decided the design below.
 *
 * ## What this does, and the alternative that was rejected
 *
 * `redirect: "manual"`, then follow the `Location` here — but **only when it is
 * same-origin**, at most a few hops. A cross-origin `Location` is refused with
 * a `CrossOriginRedirectError` rather than followed.
 *
 * The tempting alternative is to follow anywhere and strip credentials on the
 * cross-origin hop. It was rejected on three counts, in increasing order of how
 * decisive they are:
 *
 * 1. *The strip list cannot be written.* Stripping means enumerating which
 *    headers are secret, and the whole point of a provider descriptor is that
 *    the auth header is provider-defined. Any list is a list of the headers
 *    someone remembered.
 * 2. *It does not address the body at all.* Dropping the body on a 307 turns a
 *    token grant into a malformed request that the target answers with an
 *    error; keeping it hands over the refresh token. There is no third option,
 *    so "strip credentials" is not actually expressible for the case that
 *    matters most.
 * 3. *It succeeds quietly.* Having stripped, the request goes out anyway — now
 *    unauthenticated, to an attacker-chosen origin, and the caller sees a
 *    plain 401 from somewhere it never meant to talk to. Refusing produces an
 *    error that names both origins, which is the only outcome an operator can
 *    act on.
 *
 * Following *same-origin* redirects rather than refusing all of them is the
 * deliberate concession: `https://api.example.com/v1` → `…/v1/` and
 * `http://host` → `https://host` are ordinary provider behaviour, no credential
 * leaves the origin it was minted for, and refusing them would mean every
 * caller re-implementing the follow.
 *
 * `tools.ts` stays on bare `redirect: "manual"` and does not use this, and that
 * is not an oversight: it hands the 3xx back to the agent on purpose, so the
 * agent must re-issue and pay for a second allow-list check. Here there is no
 * agent to hand anything to.
 *
 * Ported verbatim from Andromeda `src/utils/redirects.ts`.
 * @module credentials/vault/redirects
 */

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Enough for the ordinary `/v1` → `/v1/` → canonical-host chain and far too few
 * to be a useful amplifier. Same-origin throughout, so this bounds work, not
 * exposure.
 */
const MAX_SAME_ORIGIN_HOPS = 5;

export class CrossOriginRedirectError extends Error {
  readonly requestOrigin: string;
  readonly redirectOrigin: string;

  /** Constructs an instance. */
  constructor(requestOrigin: string, redirectOrigin: string, status: number) {
    super(
      `refusing to follow a ${status} redirect from ${requestOrigin} to ${redirectOrigin}: ` +
        "the request carries credentials, and neither headers nor a request body are reliably " +
        "stripped on a cross-origin hop",
    );
    this.name = "CrossOriginRedirectError";
    this.requestOrigin = requestOrigin;
    this.redirectOrigin = redirectOrigin;
  }
}

/**
 * `fetch`, with cross-origin redirects refused and same-origin ones followed.
 *
 * Drop-in for `globalThis.fetch` at every credentialed call site. A caller that
 * wants the 3xx itself should keep using `redirect: "manual"` directly; passing
 * `redirect` here is ignored, because the whole contract of this function is
 * that it owns that decision.
 */
export async function fetchWithoutCrossOriginRedirects(
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  let target = new URL(String(input));
  let request: RequestInit = { ...init, redirect: "manual" };

  for (let hop = 0; ; hop += 1) {
    const response = await fetch(target, request);
    if (!REDIRECT_STATUSES.has(response.status)) return response;
    const location = response.headers.get("location");
    // A 3xx with no usable `Location` is the provider's problem, not a
    // redirect: hand it back rather than inventing a destination.
    if (!location) return response;

    let next: URL;
    try {
      next = new URL(location, target);
    } catch {
      return response;
    }
    if (next.origin !== target.origin) {
      await discard(response);
      throw new CrossOriginRedirectError(target.origin, next.origin, response.status);
    }
    if (hop + 1 >= MAX_SAME_ORIGIN_HOPS) {
      await discard(response);
      throw new Error(
        `too many same-origin redirects (${MAX_SAME_ORIGIN_HOPS}) starting at ${input.toString()}`,
      );
    }

    await discard(response);
    request = nextRequest(request, response.status);
    target = next;
  }
}

/**
 * How the next hop is shaped.
 *
 * 303 always becomes a GET, and 301/302 do too for anything that is not already
 * GET or HEAD — that is what every implementation does, and diverging would
 * mean this wrapper behaves differently from the `redirect: "follow"` it
 * replaces in the one respect callers can observe. 307 and 308 exist precisely
 * to preserve the method and body, and since the hop is same-origin there is
 * nothing unsafe about honouring them.
 *
 * A body that cannot be replayed is refused rather than silently sent empty. In
 * practice every engine call site passes a string, so this is a guard against a
 * future one passing a stream and getting a truncated request that looks like a
 * provider bug.
 */
function nextRequest(request: RequestInit, status: number): RequestInit {
  const method = (request.method ?? "GET").toUpperCase();
  const rewriteToGet =
    status === 303 || ((status === 301 || status === 302) && method !== "GET" && method !== "HEAD");
  if (rewriteToGet) {
    const { body: _dropped, ...rest } = request;
    return { ...rest, method: "GET" };
  }
  if (request.body != null && !isReplayableBody(request.body)) {
    throw new Error(`cannot follow a ${status} redirect: the request body is a one-shot stream`);
  }
  return request;
}

/** isReplayableBody implementation. */
function isReplayableBody(body: unknown): boolean {
  return (
    typeof body === "string" ||
    body instanceof URLSearchParams ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    body instanceof Blob
  );
}

/** Release the connection an intermediate response is holding. */
async function discard(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // A body already consumed or already errored has nothing left to release.
  }
}
