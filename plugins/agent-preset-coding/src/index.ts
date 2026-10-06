/**
 * The `coding` agent preset: a concrete preset resource plugging into the
 * `agents` preset abstraction.
 * @module agent-preset-coding
 */

import type { AgentPresetResource } from "@dsh-stack/agents";

/** The `coding` preset resource. */
export const codingPreset: AgentPresetResource = {
  id: "coding",
  composition: `# Stack coding preset
# DSH mounts this composition per agent scope.
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: You are a software engineering agent working in the current Stack workspace.
`,
};
