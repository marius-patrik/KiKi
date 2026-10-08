import { Service, type Context } from "@deepseek-ai/cordis";
import Schema from "@deepseek-ai/schemastery";

export const name = "personas";
export const inject = ["llm", "sessions", "slots"];
export const optional = ["icons"];

export interface AgentPersona {
  id: string;
  name: string;
  role: string;
  systemPrompt: string;
  model?: string;
  tools?: string[];
}

export class PersonasService extends Service {
  static inject = ["llm", "sessions", "slots"];
  static optional = ["icons"];
  private roster = new Map<string, AgentPersona>();

  /** Constructs an instance. */
  constructor(ctx: Context) {
    super(ctx, "personas");
  }

  /** register implementation. */
  register(persona: AgentPersona): void {
    this.roster.set(persona.id, persona);
  }

  /** get implementation. */
  get(id: string): AgentPersona | undefined {
    return this.roster.get(id);
  }

  /**
   * Returns a list of all agent personas currently in the roster.
   *
   * @returns An array of AgentPersona objects representing the personas.
   */
  list(): AgentPersona[] {
    return Array.from(this.roster.values());
  }
}

export const Config = Schema.object({});

/** apply implementation. */
export function apply(ctx: Context): void {
  new PersonasService(ctx);
}
