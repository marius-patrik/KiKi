/**
 * The `default` agent preset: a concrete preset resource plugging into the
 * `agents` preset abstraction.
 * @module agent-preset-default
 */

import type { AgentPresetResource } from "@dsh-stack/agents";

/** The `default` preset resource. */
export const defaultPreset: AgentPresetResource = {
  id: "default",
  composition: `# Stack default preset
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: You are a general-purpose Stack agent.
`,
};
