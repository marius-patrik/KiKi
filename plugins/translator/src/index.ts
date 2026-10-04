/**
 * Canonical Stack translator service for supported session/event formats.
 */
import { Service, type Context } from "@deepseek-ai/cordis";

export const name = "translator";
export const inject: string[] = [];

export type Format = "opencode" | "claude" | "dsh";

export interface OpenCodeMessage {
  role: "user" | "assistant" | "system";
  content: string | Array<{ type: string; text?: string; [key: string]: unknown }>;
  timestamp?: string;
  [key: string]: unknown;
}

export interface ClaudeEntry {
  type: "human" | "assistant" | "tool_use" | "tool_result";
  text?: string;
  content?: string;
  [key: string]: unknown;
}

export interface DshEvent {
  type: string;
  seq: number;
  role?: string;
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  timestamp?: string;
  [key: string]: unknown;
}

/**
 * Detects the format of the given data object.
 *
 * Guarantees: Returns the format name ("opencode", "claude", or "dsh") if the data matches the respective format.
 *             Returns null if the data is null, not an object, or doesn't match any known format.
 *
 * Throws: Throws an error if the data is not an object or doesn't have the required "events" array for "dsh" format.
 */
export function detectFormat(data: unknown): Format | null {
  if (data === null || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  if ("messages" in obj && Array.isArray(obj.messages)) return "opencode";
  if ("entries" in obj && Array.isArray(obj.entries)) return "claude";
  if ("events" in obj && Array.isArray(obj.events)) return "dsh";
  return null;
}

export type TranslateFn = (input: unknown) => unknown;

/** Narrow an unknown value to a dsh document, or throw if it isn't one. */
function asDshDocument(data: unknown): { events: DshEvent[] } {
  if (!data || typeof data !== "object" || !("events" in data) || !Array.isArray(data.events))
    throw new Error("invalid dsh document");
  return data as { events: DshEvent[] };
}

export class TranslatorRegistry {
  private readonly converters = new Map<string, TranslateFn>();

  /**
   * Register a translation function for converting data from one format to another.
   *
   * @param sourceFormat - The source format of the data.
   * @param targetFormat - The target format to which the data should be converted.
   * @param fn - The translation function that performs the conversion.
   *
   * @throws Will throw an error if no converter is registered for the given source and target formats.
   */
  register(sourceFormat: Format, targetFormat: Format, fn: TranslateFn): void {
    this.converters.set(`${sourceFormat}->${targetFormat}`, fn);
  }

  /**
   * Convert data from a source format to a target format using a registered translation function.
   *
   * @param data - The data to be translated.
   * @param sourceFormat - The current format of the data.
   * @param targetFormat - The desired format to convert the data into.
   *
   * @returns The translated data in the target format.
   *
   * @throws Will throw an error if no translation function is registered for the given formats or if the data is invalid.
   */
  translate(data: unknown, sourceFormat: Format, targetFormat: Format): unknown {
    if (sourceFormat === targetFormat) return data;
    const fn = this.converters.get(`${sourceFormat}->${targetFormat}`);
    if (fn === undefined) throw new Error(`no converter for ${sourceFormat} -> ${targetFormat}`);
    return fn(data);
  }

  /**
   * Translates data from a source format to a target format using a registered translation function.
   *
   * @param data - The data to be translated.
   * @param sourceFormat - The current format of the data.
   * @param targetFormat - The desired format to convert the data into.
   *
   * @returns The translated data in the target format.
   *
   * @throws Will throw an error if no translation function is registered for the given formats or if the data is invalid.
   */
  supportedConversions(): readonly string[] {
    return [...this.converters.keys()];
  }
}

/**
 * Converts data from a source format to a target format using a registered translation function.
 *
 * @param data - The data to be translated.
 * @param sourceFormat - The current format of the data.
 * @param targetFormat - The desired format to convert the data into.
 *
 * @returns The translated data in the target format.
 * @throws Will throw an error if no translation function is registered for the given formats or if the data is invalid.
 */
function opencodeToDsh(data: unknown): unknown {
  if (!data || typeof data !== "object" || !("messages" in data) || !Array.isArray(data.messages))
    throw new Error("invalid opencode document");
  const input = data as { messages: OpenCodeMessage[] };
  return {
    events: input.messages.map((msg, seq) => ({
      type:
        msg.role === "user"
          ? "user/message"
          : msg.role === "assistant"
            ? "assistant/message"
            : "system/message",
      seq,
      role: msg.role,
      content:
        typeof msg.content === "string" ? [{ type: "text", text: msg.content }] : msg.content,
      timestamp: msg.timestamp,
    })),
  };
}

/** dshToOpencode implementation. */
function dshToOpencode(data: unknown): unknown {
  const input = asDshDocument(data);
  return {
    messages: input.events
      .filter((event) => event.type.includes("/message"))
      .map((event) => ({
        role: event.role === "system" ? "system" : event.role === "user" ? "user" : "assistant",
        content: event.content ?? [],
        timestamp: event.timestamp,
      })),
  };
}

/** claudeToDsh implementation. */
function claudeToDsh(data: unknown): unknown {
  if (!data || typeof data !== "object" || !("entries" in data) || !Array.isArray(data.entries))
    throw new Error("invalid claude document");
  const input = data as { entries: ClaudeEntry[] };
  return {
    events: input.entries.map((entry, seq) => ({
      type:
        entry.type === "human"
          ? "user/message"
          : entry.type === "assistant"
            ? "assistant/message"
            : entry.type,
      seq,
      role: entry.type === "human" ? "user" : entry.type === "assistant" ? "assistant" : undefined,
      content: [{ type: "text", text: entry.text ?? entry.content ?? "" }],
    })),
  };
}

/**
 * Converts opencode data to DSH format.
 *
 * @param data - The opencode data to be converted.
 * @param sourceFormat - The current format of the data (not used in this function).
 * @param targetFormat - The desired format to convert the data into (not used in this function).
 *
 * @returns The translated data in the DSH format.
 * @throws Will throw an error if the data is invalid or no translation function is registered for the given formats.
 */
function dshToClaude(data: unknown): unknown {
  const input = asDshDocument(data);
  return {
    entries: input.events
      .filter((event) => event.type.includes("/message"))
      .map((event) => ({
        type: event.role === "user" ? "human" : "assistant",
        text: event.content?.map((chunk) => chunk.text ?? "").join("") ?? "",
      })),
  };
}

export interface Config {
  defaultFormat?: Format;
}

export class TranslatorService extends Service {
  static inject: string[] = [];
  readonly registry = new TranslatorRegistry();

  /** Constructs an instance. */
  constructor(ctx: Context, _config: Config = {}) {
    super(ctx, "translators");
    this.registry.register("opencode", "dsh", opencodeToDsh);
    this.registry.register("dsh", "opencode", dshToOpencode);
    this.registry.register("claude", "dsh", claudeToDsh);
    this.registry.register("dsh", "claude", dshToClaude);
    this.registry.register("opencode", "claude", (data) => dshToClaude(opencodeToDsh(data)));
    this.registry.register("claude", "opencode", (data) => dshToOpencode(claudeToDsh(data)));
  }

  /**
   * Converts a CLAUDE document to a DSH format.
   *
   * Guarantees: Returns an object with events, each containing a type, seq, role, and content.
   * Must receive a valid CLAUDE document with an 'entries' array.
   * Throws an error if the input is not a valid CLAUDE document.
   */
  register(sourceFormat: Format, targetFormat: Format, fn: TranslateFn): void {
    this.registry.register(sourceFormat, targetFormat, fn);
  }
  /**
   * Converts a CLUDE document to a DSH-compatible format.
   *
   * Guarantees a valid DSH document with events formatted as user or assistant messages.
   * Throws an error if the input is not a valid CLUDE document.
   */
  translate(data: unknown, sourceFormat: Format, targetFormat: Format): unknown {
    return this.registry.translate(data, sourceFormat, targetFormat);
  }
  /** supportedConversions implementation. */
  supportedConversions(): readonly string[] {
    return this.registry.supportedConversions();
  }
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    translators: TranslatorService;
  }
}

/** apply implementation. */
export function apply(ctx: Context, config: Config = {}): void {
  ctx.plugin(TranslatorService, config);
  ctx.logger.info(`translator loaded: 6 converters registered`);
}
