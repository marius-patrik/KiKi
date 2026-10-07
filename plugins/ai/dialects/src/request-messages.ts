/**
 * Splitting one harness request history into the conversation turns a provider
 * conversation is built from and the single system prompt that precedes them.
 *
 * The harness puts the rendered system prompt in one of two places: a loop-built
 * request carries it as a leading `system`-role message, while a one-shot caller
 * sets `GenerateOptions.system`. Both are read here and joined, so no dialect
 * has to know which builder produced the request it was handed.
 *
 * `developer`-role messages record mid-session tool changes for routes that
 * declare in-history tool updates. No dialect here declares that capability, and
 * the harness projects those messages away before dispatch for exactly that
 * reason, so one reaching a serializer means the request is being served by a
 * route that cannot express it: refused, not silently dropped.
 *
 * @module dialects/request-messages
 */

import { LlmError } from "@deepseek-ai/dsh-llm";
import type {
  DeveloperMessage,
  GenerateOptions,
  RequestMessage,
  SystemMessage,
} from "@deepseek-ai/dsh-llm";
import type { DialectId } from "./types.js";

/**
 * A conversation turn a dialect serializes into the provider conversation.
 *
 * The system and developer roles are absent by construction: `splitRequestMessages`
 * lifts the former into the system prompt and refuses the latter, so a switch on
 * `role` over these turns is exhaustive without a dead branch.
 */
export type RequestTurn = Exclude<RequestMessage, SystemMessage | DeveloperMessage>;

/** One request history split into its conversation turns and its system prompt. */
export interface DialectRequestMessages {
  /** Conversation turns in order, system and developer messages removed. */
  readonly turns: readonly RequestTurn[];
  /**
   * Every system-prompt fragment this request carries, joined; absent when it
   * carries none. A wire route with a system slot sends this; one without
   * (Antigravity) folds it into the conversation text it does send.
   */
  readonly system: string | undefined;
}

/**
 * Split one request history into conversation turns plus the system prompt that
 * precedes them.
 *
 * Only a system message ahead of the first turn is the request's prompt; one
 * later in the history is a mid-conversation prompt change, which a route
 * without in-history system support cannot send.
 * @param dialect - the dialect refusing an unsendable message, for diagnosis.
 * @param options - the request; only its `system` slot is read here.
 * @param messages - the request's history, in order.
 * @returns the conversation turns and the joined system prompt.
 * @throws LlmError `UNSUPPORTED_CONTENT` on a mid-conversation system message or a developer message.
 */
export function splitRequestMessages(
  dialect: DialectId,
  options: Pick<GenerateOptions, "system">,
  messages: readonly RequestMessage[],
): DialectRequestMessages {
  const prompts: string[] = [];
  if (options.system !== undefined) prompts.push(options.system);
  const turns: RequestTurn[] = [];
  let sawTurn = false;
  for (const message of messages) {
    if (message.role === "system") {
      if (sawTurn) {
        throw new LlmError(
          `The ${dialect} dialect cannot send a mid-conversation system prompt update.`,
          "UNSUPPORTED_CONTENT",
        );
      }
      prompts.push(
        message.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join(""),
      );
      continue;
    }
    if (message.role === "developer") {
      throw new LlmError(
        `The ${dialect} dialect cannot send developer messages; the route declares no in-history tool updates.`,
        "UNSUPPORTED_CONTENT",
      );
    }
    sawTurn = true;
    turns.push(message);
  }
  const system = prompts.filter((prompt) => prompt.length > 0).join("\n\n");
  return { turns, system: system.length === 0 ? undefined : system };
}
