/**
 * Action files: the authoring input agent-actions merges into the built-in
 * action vocabulary.
 *
 * An action file is either Markdown (optional `---` frontmatter with scalar
 * keys `name`, `description`, `provider`, `model`, and a comma-separated
 * `tools` allowlist; the body is the action's policy text) or JSON
 * (`{ name?, description?, tools?, provider?, model?, route?, policy }`). The
 * id is the file stem, sanitized to the action-id character set.
 *
 * A file whose id matches a built-in action OVERRIDES that built-in
 * (description, tools allowlist, route, and policy all come from the file);
 * any other id adds a custom action to the vocabulary.
 * @module agent-actions/action
 */

import { basename, extname } from "node:path";
import { sanitizeAuthoringId, splitAuthoringMarkdown } from "@dsh-stack/plugin-kit";

/** One action's routing hint: the provider/model the session's requests use. */
export interface ActionRoute {
  provider: string;
  model: string;
}

/** A parsed action: one entry of the effective action vocabulary. */
export interface ActionSpec {
  /** Action id (the `/action` argument and the catalog key). */
  id: string;
  /** Display name; falls back to the id. */
  name?: string;
  /** One sentence on what this action is for. */
  description?: string;
  /** Tool allowlist; undefined means every tool is available. */
  tools?: readonly string[];
  /** Routing hint applied to the session's requests while the action is active. */
  route?: ActionRoute;
  /** The policy text rendered into the system prompt while the action is active. */
  policy: string;
  /** Absolute path of the authoring file; undefined for built-in actions. */
  source?: string;
}

/** The built-in action vocabulary (formerly the session modes). */
export const ACTIONS = ["tool", "search", "action", "plan", "agent", "shell", "code"] as const;

/** A built-in action id. */
export type BuiltInAction = (typeof ACTIONS)[number];

/** The default action a fresh session runs on. */
export const DEFAULT_ACTION: BuiltInAction = "agent";

/** The built-in actions, with their default policy texts. */
export const BUILT_IN_ACTIONS: readonly ActionSpec[] = [
  {
    id: "tool",
    description: "Direct tool use",
    policy:
      "Tool action: answer through direct tool calls with minimal planning; keep steps small and explicit.",
  },
  {
    id: "search",
    description: "Research and lookup",
    policy:
      "Search action: prioritize search and fetch tools; ground answers in sources and cite them.",
  },
  {
    id: "action",
    description: "Eager execution",
    policy:
      "Action action: execute concrete changes eagerly; prefer doing over deliberating, and verify each change.",
  },
  {
    id: "plan",
    description: "Plan before acting",
    policy:
      "Plan action: analyze the request and propose a plan; do not mutate files or run destructive commands until the user approves the plan.",
  },
  {
    id: "agent",
    description: "Full agent (default)",
    policy: "Agent action: full autonomous multi-step execution with the complete tool surface.",
  },
  {
    id: "shell",
    description: "Shell-first operation",
    policy:
      "Shell action: operate primarily through the shell; prefer shell pipelines over one-off file edits.",
  },
  {
    id: "code",
    description: "Code reading and editing",
    policy:
      "Code action: focus on reading, writing, and refactoring code; keep edits minimal and typed.",
  },
];

/**
 * Sanitize a file stem into an action id: lowercase, map disallowed
 * characters to `-`, collapse runs, and guarantee a leading alphanumeric.
 * Unusable input (empty after cleanup) falls back to `action`.
 */
export function sanitizeId(stem: string): string {
  return sanitizeAuthoringId(stem, "action");
}

/** Parse a comma-separated tool allowlist, or undefined when absent/empty. */
function toolList(raw: string | undefined): readonly string[] | undefined {
  if (raw === undefined) return undefined;
  const tools = raw
    .split(",")
    .map((tool) => tool.trim())
    .filter((tool) => tool !== "");
  return tools.length === 0 ? undefined : tools;
}

/** An action's optional metadata, from either frontmatter or JSON. */
interface ActionFields {
  name?: string;
  description?: string;
  tools?: readonly string[];
  route?: ActionRoute;
}

/** A string array from a JSON action's `tools`, or undefined. */
function jsonTools(raw: unknown, filePath: string): readonly string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.some((tool) => typeof tool !== "string")) {
    throw new Error(`${filePath}: a JSON action's "tools" must be an array of strings`);
  }
  const tools = (raw as string[]).map((tool) => tool.trim()).filter((tool) => tool !== "");
  return tools.length === 0 ? undefined : tools;
}

/** A route from a JSON action's `route` or `provider`/`model` pair, or undefined. */
function jsonRoute(
  parsed: { provider?: unknown; model?: unknown; route?: unknown },
  filePath: string,
): ActionRoute | undefined {
  if (parsed.route !== undefined) {
    const route = parsed.route as { provider?: unknown; model?: unknown };
    if (typeof route?.provider !== "string" || typeof route?.model !== "string") {
      throw new Error(`${filePath}: a JSON action's "route" needs string "provider" and "model"`);
    }
    return { provider: route.provider, model: route.model };
  }
  if (typeof parsed.provider === "string" && typeof parsed.model === "string") {
    return { provider: parsed.provider, model: parsed.model };
  }
  return undefined;
}

/**
 * Parse one action file's text into an {@link ActionSpec}. A Markdown file's
 * body (after the frontmatter, or the whole file without one) is the policy
 * text; a JSON file's `policy` is. An empty policy is an error.
 * @param filePath - the authoring file path, used for the stem and extension.
 * @param content - the file text.
 * @throws when the file has no usable policy text.
 */
export function parseAction(filePath: string, content: string): ActionSpec {
  const extension = extname(filePath).toLowerCase();
  const id = sanitizeId(basename(filePath, extension));
  let fields: ActionFields = {};
  let policy = "";

  if (extension === ".json") {
    const parsed = JSON.parse(content) as {
      name?: unknown;
      description?: unknown;
      tools?: unknown;
      provider?: unknown;
      model?: unknown;
      route?: unknown;
      policy?: unknown;
    };
    if (typeof parsed.policy !== "string")
      throw new Error(`${filePath}: a JSON action needs a string "policy"`);
    policy = parsed.policy;
    fields = {
      name: typeof parsed.name === "string" ? parsed.name : undefined,
      description: typeof parsed.description === "string" ? parsed.description : undefined,
      tools: jsonTools(parsed.tools, filePath),
      route: jsonRoute(parsed, filePath),
    };
  } else if (extension === ".md") {
    const { fields: parsed, body } = splitAuthoringMarkdown(content);
    fields = {
      name: parsed.name,
      description: parsed.description,
      tools: toolList(parsed.tools),
      route:
        parsed.provider !== undefined && parsed.model !== undefined
          ? { provider: parsed.provider, model: parsed.model }
          : undefined,
    };
    policy = body;
  } else {
    throw new Error(`${filePath}: unsupported action file type "${extension}" (use .md or .json)`);
  }

  const trimmed = policy.trim();
  // jscpd:ignore-start -- action/persona id-sanitizing logic mirrors agents/src/persona.ts's sanitizeId for a different authoring domain; kept independent so the two domains can diverge
  if (trimmed === "") throw new Error(`${filePath}: action policy must not be empty`);

  return {
    id,
    ...(fields.name !== undefined ? { name: fields.name } : {}),
    ...(fields.description !== undefined ? { description: fields.description } : {}),
    ...(fields.tools !== undefined ? { tools: fields.tools } : {}),
    // jscpd:ignore-end
    ...(fields.route !== undefined ? { route: fields.route } : {}),
    policy: trimmed,
    source: filePath,
  };
}
