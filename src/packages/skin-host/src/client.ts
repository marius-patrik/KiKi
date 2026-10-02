import { createElement, type ComponentType } from "react";
import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import type {} from "@dsh-stack/skin-runtime/client";
import { CodexBrandMark, CodexBrandName } from "@dsh-stack/skin-codex/client";
import { ClaudeBrandMark, ClaudeBrandName } from "@dsh-stack/skin-claude/client";
import { DeepSeekBrandMark, DeepSeekBrandName } from "@dsh-stack/skin-deepseek/client";

export const inject = ["slots", "skin"];

interface SkinComponents {
  readonly mark: ComponentType<{ size?: number }>;
  readonly name: ComponentType;
}

const components: Record<string, SkinComponents> = {
  deepseek: { mark: DeepSeekBrandMark, name: DeepSeekBrandName },
  claude: { mark: ClaudeBrandMark, name: ClaudeBrandName },
  codex: { mark: CodexBrandMark, name: CodexBrandName },
};

/** Register the active skin's branding components in the declared UI slots. */
export function apply(ctx: ClientContext): void {
  const active = ctx.skin.getActive();
  const selected = components[active] ?? components.deepseek!;
  const /** Mark implementation. */
    Mark = (props: { size?: number }) => createElement(selected.mark, props);
  const /** Name implementation. */ Name = () => createElement(selected.name);

  ctx.slots.inject("sidebar.brand.mark", function* () {
    yield ctx.slots.register({ name: "sidebar.brand.mark", inject: () => ({ size: 24 }) }, Mark);
  });

  ctx.slots.inject("sidebar.brand.name", function* () {
    yield ctx.slots.register({ name: "sidebar.brand.name", inject: () => ({}) }, Name);
  });

  ctx.slots.inject("conversation.hero.brand.mark", function* () {
    yield ctx.slots.register(
      { name: "conversation.hero.brand.mark", inject: () => ({ size: 24 }) },
      Mark,
    );
  });
}
