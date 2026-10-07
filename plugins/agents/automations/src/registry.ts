/**
 * The automations registry: a pure registration/discovery service that
 * concrete automation extensions plug their {@link Automation} into. The
 * `automations` plugin ships no automation of its own — autoreview, autofix,
 * auto-doc, and the GitHub agent (#52) each become their own extension package
 * calling `ctx.automations.register(...)` from that extension's `apply(ctx)`.
 * This mirrors `ProviderRegistry` in `@dsh-stack/providers`, applied to
 * repository automations instead of provider routes.
 * @module automations/registry
 */

import type { Context } from "@deepseek-ai/cordis";
import { Service } from "@deepseek-ai/cordis";
import type { Automation, AutomationTrigger } from "./automation.js";

/**
 * The live catalog of registered automations, keyed by automation id and
 * queryable by trigger. Registration returns a withdrawal function, so an
 * extension whose fiber is disposed takes its automation out of discovery
 * with it rather than leaving a dangling entry behind.
 */
export class AutomationsRegistry extends Service {
  private readonly catalog = new Map<string, Automation>();
  private readonly observers = new Set<() => void>();

  /** Constructs an instance. */
  constructor(ctx: Context) {
    super(ctx, "automations");
  }

  /**
   * Register one automation. A second registration under an id that is
   * already taken is rejected, so two extensions claiming the same automation
   * fails loudly at boot instead of silently replacing one with the other. An
   * automation declaring no trigger is rejected for the same reason: it could
   * never be selected, and a silently unreachable automation reads as a
   * working one.
   * @returns a function that withdraws this automation from the catalog.
   */
  register(automation: Automation): () => void {
    if (this.catalog.has(automation.id)) {
      throw new Error(`automations: "${automation.id}" is already registered`);
    }
    if (automation.triggers.length === 0) {
      throw new Error(`automations: "${automation.id}" declares no trigger`);
    }
    this.catalog.set(automation.id, automation);
    this.announce();
    return this.withdrawal(automation.id);
  }

  /** Look up one registered automation by id; throws on an unknown id. */
  resolve(id: string): Automation {
    const automation = this.catalog.get(id);
    if (automation === undefined) {
      throw new Error(`automations: no automation registered as "${id}"`);
    }
    return automation;
  }

  /** Whether an automation is currently registered under this id. */
  registered(id: string): boolean {
    return this.catalog.has(id);
  }

  /** Every registered automation, in registration order. */
  all(): readonly Automation[] {
    return [...this.catalog.values()];
  }

  /** Every registered automation id, in registration order. */
  ids(): readonly string[] {
    return [...this.catalog.keys()];
  }

  /**
   * The registered automations that answer to one trigger, in registration
   * order. This is the selection step a dispatcher runs before executing
   * anything: the registry decides *which* automations are candidates, never
   * what a run does.
   */
  forTrigger(trigger: AutomationTrigger): readonly Automation[] {
    return this.all().filter((automation) => automation.triggers.includes(trigger));
  }

  /**
   * Observe catalog changes — an automation registered or withdrawn.
   * @returns a function that stops the observation.
   */
  observe(observer: () => void): () => void {
    this.observers.add(observer);
    return () => {
      this.observers.delete(observer);
    };
  }

  /** Build the idempotent withdrawal function handed back by {@link register}. */
  private withdrawal(id: string): () => void {
    let withdrawn = false;
    return () => {
      if (withdrawn) return;
      withdrawn = true;
      this.catalog.delete(id);
      this.announce();
    };
  }

  /** Notify every observer that the catalog changed. */
  private announce(): void {
    for (const observer of this.observers) observer();
  }
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    automations: AutomationsRegistry;
  }
}
