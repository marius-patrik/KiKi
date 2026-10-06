/**
 * tweak-plan-toggle: registers `/build`, delegating to the harness plan-mode
 * controller (`ctx.planMode.set(agent, false)`), so it complements the
 * existing `/plan` command instead of colliding with it.
 * @module tweak-plan-toggle/plan-toggle
 */

import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-commands";
import type {} from "@deepseek-ai/dsh-plan-mode";

/** Register the Build (leave-plan-mode) toggle command. Returns the inject fiber. */
export function installPlanToggle(ctx: Context): unknown {
  return ctx.inject(["commands", "planMode"], (commandCtx) => {
    return commandCtx.commands.register({
      name: "build",
      description: "Leave plan mode and continue in the default mode",
      handler: ({ agent }) => {
        switch (commandCtx.planMode.set(agent, false)) {
          case "committed":
            return { kind: "success", text: "Plan mode off. Continue building." };
          case "queued":
            return { kind: "success", text: "Leaving plan mode (applies from the next step)." };
          case "cancelled":
            return { kind: "success", text: "Plan mode is already inactive." };
          case "noop":
            return { kind: "success", text: "Plan mode is already inactive." };
        }
      },
    });
  });
}
