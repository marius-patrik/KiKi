/**
 * HTTP client for the DeepSeek Harness web API.
 *
 * All dsh communication goes through POST /api/* (JSON-RPC style) and
 * GET /api/events.mux (SSE). No WebSocket needed — the SSE stream provides
 * the same data as the WS downlinks, and is simpler for a standalone client.
 *
 * Wire format:
 *   Request:  { type: "client-request", rpcId, method, payload }
 *   Response: { type: "server-response", rpcId, result: { ok, value } }
 *   SSE push: { type: "server-request", rpcId, method, payload }
 *
 * @module dsh-tui/client
 */

import http from "node:http";
import { randomUUID } from "node:crypto";
import type { ClientRequest, ServerResponse, MuxFrame } from "./protocol.js";

/** Configuration for connecting to a dsh harness instance. */
export interface DshClientConfig {
  /** Base URL of the harness, e.g. "http://127.0.0.1:3080". */
  baseUrl: string;
  /** Request timeout in ms (default 30_000). */
  timeoutMs?: number;
}

/**
 * A pending RPC call waiting for its response.
 */
interface PendingRpc {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Minimal HTTP client that speaks the dsh RPC protocol.
 *
 * Usage:
 *   const client = new DshClient({ baseUrl: 'http://127.0.0.1:3080' })
 *   const sessions = await client.call('session.list', {})
 *   const sub = client.subscribeMux((frame) => { ... })
 */
export class DshClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly pending = new Map<string, PendingRpc>();
  private muxController: AbortController | null = null;
  private muxListener: ((frame: MuxFrame) => void) | null = null;
  private muxConnected = false;

  /** Constructs an instance. */
  constructor(config: DshClientConfig) {
    // Strip trailing slash
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  /**
   * Call an RPC method on the harness and return the result.
   *
   * @param method - RPC method name, e.g. "session.list", "session.prompt"
   * @param payload - Method-specific payload
   * @returns The result value from the server response
   */
  async call<T = unknown>(method: string, payload: Record<string, unknown> = {}): Promise<T> {
    const rpcId = randomUUID();
    const body: ClientRequest = {
      type: "client-request",
      rpcId,
      method,
      payload,
    };
    const json = JSON.stringify(body);
    const url = new URL("/api", this.baseUrl);

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(rpcId);
        reject(new Error(`RPC ${method} timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      this.pending.set(rpcId, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });

      const req = http.request(
        url,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(json),
          },
          timeout: this.timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            try {
              const parsed = JSON.parse(raw) as ServerResponse;
              const pending = this.pending.get(rpcId);
              if (pending) {
                clearTimeout(pending.timer);
                this.pending.delete(rpcId);
                if (parsed.result?.ok === false) {
                  pending.reject(
                    new Error(`RPC ${method} failed: ${JSON.stringify(parsed.result)}`),
                  );
                } else {
                  pending.resolve(parsed.result?.value ?? parsed.result);
                }
              }
            } catch (err) {
              const pending = this.pending.get(rpcId);
              if (pending) {
                clearTimeout(pending.timer);
                this.pending.delete(rpcId);
                pending.reject(
                  new Error(`Failed to parse RPC response: ${(err as Error).message}`),
                );
              }
            }
          });
        },
      );

      req.on("error", (err) => {
        const pending = this.pending.get(rpcId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(rpcId);
          pending.reject(err);
        }
      });

      req.on("timeout", () => {
        req.destroy();
        const pending = this.pending.get(rpcId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(rpcId);
          pending.reject(new Error(`RPC ${method} connection timed out`));
        }
      });

      req.write(json);
      req.end();
    });
  }

  /**
   * Subscribe to the mux SSE stream. Returns a cleanup function.
   *
   * The callback receives parsed MuxFrame objects as they arrive.
   * Reconnection is not handled automatically — the caller can
   * re-subscribe when the stream closes.
   */
  subscribeMux(onFrame: (frame: MuxFrame) => void, onError?: (err: Error) => void): () => void {
    this.muxController = new AbortController();
    this.muxListener = onFrame;
    const url = new URL("/api/events.mux", this.baseUrl);

    const controller = this.muxController;
    const abortSignal = controller.signal;

    (async () => {
      try {
        const res = await fetch(url.toString(), {
          headers: { accept: "text/event-stream" },
          signal: abortSignal,
        });

        if (!res.ok || !res.body) {
          onError?.(new Error(`SSE connect failed: ${res.status} ${res.statusText}`));
          return;
        }

        this.muxConnected = true;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Parse SSE frames: lines starting with "data: " separated by "\n\n"
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            const dataLines: string[] = [];
            for (const line of part.split("\n")) {
              if (line.startsWith("data: ")) {
                dataLines.push(line.slice(6));
              } else if (line === ": connected") {
                // Ignore SSE comment lines (heartbeat/connected markers)
                continue;
              }
            }
            if (dataLines.length === 0) continue;
            const data = dataLines.join("\n");
            try {
              const frame = JSON.parse(data) as MuxFrame;
              onFrame(frame);
            } catch {
              // Non-JSON SSE data — ignore
            }
          }
        }
        this.muxConnected = false;
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          onError?.(err as Error);
        }
      }
    })();

    return () => {
      this.muxConnected = false;
      this.muxController?.abort();
    };
  }

  /** Whether the mux stream is currently connected. */
  get connected(): boolean {
    return this.muxConnected;
  }

  /** Cancel all pending RPCs and close the mux stream. */
  destroy(): void {
    this.muxController?.abort();
    for (const [rpcId, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error("client destroyed"));
    }
    this.pending.clear();
  }
}
