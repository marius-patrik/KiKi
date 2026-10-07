/**
 * The `automations` contract: the shape every repository automation extension
 * implements in order to plug into {@link AutomationsRegistry}. This module is
 * types only — it declares the extension point, never a concrete automation.
 * @module automations/automation
 */

/**
 * What causes an automation to be considered for a run. An automation declares
 * every trigger it answers to; the registry uses them to narrow the candidate
 * set before anything is executed.
 */
export type AutomationTrigger =
  | "pull-request"
  | "push"
  | "issue"
  | "review-comment"
  | "schedule"
  | "manual";

/** One invocation handed to {@link Automation.run}. */
export interface AutomationRunRequest {
  /** The trigger that selected this automation for the run. */
  readonly trigger: AutomationTrigger;
  /** Absolute path of the repository working tree the run operates on. */
  readonly repositoryPath: string;
  /** Trigger-specific detail (pull request number, ref name, issue id, ...). */
  readonly subject: Readonly<Record<string, string>>;
}

/** How a single {@link Automation.run} ended. */
export interface AutomationOutcome {
  /** `"changed"` when the run altered repository or forge state. */
  readonly status: "changed" | "unchanged" | "failed";
  /** One human-readable line describing what the run did. */
  readonly summary: string;
}

/**
 * One repository automation, contributed by its own extension package. The
 * registry owns discovery and lifecycle; the automation owns only its own
 * identity, its triggers, and what a run does.
 */
export interface Automation {
  /** Globally unique automation id, e.g. `"autoreview"`. */
  readonly id: string;
  /** Short label shown wherever automations are listed. */
  readonly displayName: string;
  /** One sentence describing the automation's responsibility. */
  readonly description: string;
  /** Every trigger this automation answers to; must be non-empty. */
  readonly triggers: readonly AutomationTrigger[];
  /** Execute the automation for one request. */
  run(request: AutomationRunRequest): Promise<AutomationOutcome>;
}
