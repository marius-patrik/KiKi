/**
 * Minimal client for a local OpenAI-compatible inference server.
 *
 * The Stack runs local models for mechanical work that does not warrant a
 * frontier model: an MLX server on macOS, llama.cpp or Ollama elsewhere. They
 * all speak the OpenAI chat-completions wire, so one client covers every host.
 *
 * Model load dominates latency and completion does not. Measured against the
 * MLX server on this host: a 7B first request took 32.9s, the second 5.1s; a
 * 0.5B took 7.8s then 0.51s. So a dispatcher should pin one model and keep it
 * warm rather than spreading work across several -- switching models pays the
 * load cost again every time.
 *
 * @module @dsh-stack/scripts/local-model-client
 */

/** Endpoint of the local inference server. */
export const LOCAL_MODEL_URL = process.env.DSH_LOCAL_MODEL_URL ?? "http://127.0.0.1:8080/v1";

/** Model served for mechanical work. */
export const LOCAL_MODEL =
  process.env.DSH_LOCAL_MODEL ?? "mlx-community/Qwen2.5-7B-Instruct-1M-4bit";

/**
 * Ask the local model for one completion.
 *
 * @param system - instruction describing the transformation and its output shape.
 * @param user - the concrete input to transform.
 * @param options - `maxTokens` caps the reply; `timeoutMs` must allow for a cold
 *   model load on the first call, which is far slower than steady state.
 * @returns the reply text, or null when the server errors, times out, or
 *   answers with a body that carries no content. Callers skip rather than
 *   guess -- a mangled edit applied silently is worse than one not attempted.
 */
export async function completeLocally(system, user, options = {}) {
  const { maxTokens = 256, timeoutMs = 120_000, temperature = 0.2 } = options;
  try {
    const res = await fetch(`${LOCAL_MODEL_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LOCAL_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: maxTokens,
        temperature,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const text = body?.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Confirm the server answers and report which models it serves.
 * @returns the served model ids, or null when the server is unreachable.
 */
export async function listLocalModels() {
  try {
    const res = await fetch(`${LOCAL_MODEL_URL}/models`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const body = await res.json();
    return (body?.data ?? []).map((entry) => entry.id);
  } catch {
    return null;
  }
}
