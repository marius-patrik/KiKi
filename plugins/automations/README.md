# automations

`@dsh-stack/automations` is the **abstraction/extension-point plugin** for
repository automations. It contributes exactly one thing — the
`AutomationsRegistry` cordis service — and deliberately ships no automation of
its own.

Per the plugin/extension/pack model in `.agents/rules/plugin-extension-and-pack-model.md`,
a plugin defines the contract that concrete implementations plug into, and every
individual concrete implementation is its own extension. So each repository
automation — autoreview, autofix, autodoc, and the GitHub agent from #52 — lands
as its own extension package registering into this plugin, never as another
feature bundled inside it.

## The contract

An automation extension implements `Automation` and registers it from its own
`apply(ctx)`:

```ts
import type { Automation } from "@dsh-stack/automations";

export const name = "automation-autoreview";
export const inject = ["automations"];

const autoreview: Automation = {
  id: "autoreview",
  displayName: "Autoreview",
  description: "Reviews the diff of an open pull request.",
  triggers: ["pull-request"],
  async run(request) {
    return { status: "unchanged", summary: `reviewed ${request.subject.pullRequest}` };
  },
};

/** Register the autoreview automation. */
export function apply(ctx) {
  ctx.effect(() => ctx.automations.register(autoreview));
}
```

`register` returns a withdrawal function, so an extension whose fiber is
disposed takes its automation out of discovery with it.

## Registry surface

| Member | Purpose |
| --- | --- |
| `register(automation)` | Add one automation; returns its withdrawal function. Rejects a duplicate id or an automation with no trigger. |
| `resolve(id)` | The automation registered under `id`; throws when there is none. |
| `registered(id)` | Whether an automation is currently registered under `id`. |
| `all()` | Every registered automation, in registration order. |
| `ids()` | Every registered automation id, in registration order. |
| `forTrigger(trigger)` | The automations that answer to one trigger — the selection step a dispatcher runs before executing anything. |
| `observe(listener)` | Observe registrations and withdrawals; returns a stop function. |

The registry decides *which* automations are candidates for a trigger. It never
decides what a run does — that stays with the extension.

## Scripts

```bash
bun run build      # tsc
bun run typecheck  # tsc --noEmit
bun run test       # node check-plugin.mjs
bun run verify     # node check-plugin.mjs
```
