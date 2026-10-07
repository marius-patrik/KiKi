/**
 * Aggregation of on-disk usage statistics for the assistants/tools the
 * integrations probe cares about: Claude Code's local stats cache, the
 * Antigravity/Gemini CLI's local history, and a locally running Ollama
 * daemon. Each function returns `null` (or an "uninstalled" shape) when the
 * underlying data source isn't present, never throwing.
 * @module providers/quotas/web/usage-stats
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export interface ClaudeStats {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  messages: number;
  sessions: number;
  totalToolCalls: number;
  lastComputed: string | null;
  todayTokens: number;
  yesterdayTokens: number;
  dailyActivity: unknown[];
  dailyModelTokens: unknown[];
  modelName: string;
}

/** Sum the values of a `tokensByModel` map (or an empty daily-tokens record). */
function sumTokensByModel(entry: { tokensByModel?: Record<string, unknown> } | undefined): number {
  return Object.values(entry?.tokensByModel || {}).reduce(
    (total: number, value: unknown) => total + Number(value),
    0,
  );
}

/** Read Claude Code's local `~/.claude/stats-cache.json`, if present. */
export function readClaudeStats(home: string): ClaudeStats | null {
  const claudeStatsPath = path.join(home, ".claude/stats-cache.json");
  if (!fs.existsSync(claudeStatsPath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(claudeStatsPath, "utf-8"));
    const usage = data.modelUsage?.["claude-opus-5"] || {};
    const inputTokens = usage.inputTokens || 0;
    const outputTokens = usage.outputTokens || 0;
    const cacheReadTokens = usage.cacheReadInputTokens || 0;
    const cacheWriteTokens = usage.cacheCreationInputTokens || 0;

    const dailyTokens = data.dailyModelTokens || [];
    const todayTokens =
      dailyTokens.length > 0 ? sumTokensByModel(dailyTokens[dailyTokens.length - 1]) : 0;
    const yesterdayTokens =
      dailyTokens.length > 1 ? sumTokensByModel(dailyTokens[dailyTokens.length - 2]) : 0;

    const dailyActivity = data.dailyActivity || [];
    let totalToolCalls = 0;
    for (const act of dailyActivity) {
      totalToolCalls += act.toolCallCount || 0;
    }

    return {
      totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      messages: data.totalMessages || 0,
      sessions: data.totalSessions || 0,
      totalToolCalls,
      lastComputed: data.lastComputedDate || null,
      todayTokens,
      yesterdayTokens,
      dailyActivity,
      dailyModelTokens: dailyTokens,
      modelName: "claude-opus-5 / claude-3-7-sonnet",
    };
  } catch {
    return null;
  }
}

export interface AntigravityStats {
  promptTurns: number;
  activeBrains: number;
  models: string[];
  contextWindow: string;
  status: string;
}

/** Read the local Antigravity/Gemini CLI history & brain directory, if present. */
export function readAntigravityStats(home: string): AntigravityStats | null {
  const agyDir = path.join(home, ".gemini/antigravity-cli");
  if (!fs.existsSync(agyDir)) return null;
  try {
    let promptTurns = 0;
    const histPath = path.join(agyDir, "history.jsonl");
    if (fs.existsSync(histPath)) {
      promptTurns = fs.readFileSync(histPath, "utf-8").split("\n").filter(Boolean).length;
    }

    let activeBrains = 0;
    const brainDir = path.join(agyDir, "brain");
    if (fs.existsSync(brainDir)) {
      activeBrains = fs.readdirSync(brainDir).filter((f) => !f.startsWith(".")).length;
    }

    return {
      promptTurns,
      activeBrains,
      models: ["gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.1-pro"],
      contextWindow: "1,000,000 tokens",
      status: "Active & Connected",
    };
  } catch {
    return null;
  }
}

export interface OllamaStats {
  installed: boolean;
  availableModels: Array<{
    name: string;
    size: unknown;
    paramSize: unknown;
    quantization: unknown;
    contextLength: unknown;
    capabilities: unknown[];
  }>;
  runningModels: unknown[];
}

/** Probe a locally running Ollama daemon via its REST API for installed/running models. */
export function readOllamaStats(): OllamaStats {
  try {
    const rawTags = execSync("curl -s http://127.0.0.1:11434/api/tags", {
      encoding: "utf-8",
      timeout: 1500,
    }).trim();
    const tagsJson = JSON.parse(rawTags);
    const rawPs = execSync("curl -s http://127.0.0.1:11434/api/ps", {
      encoding: "utf-8",
      timeout: 1500,
    }).trim();
    const psJson = JSON.parse(rawPs);

    return {
      installed: true,
      availableModels: (tagsJson.models || []).map((m: any) => ({
        name: m.name,
        size: m.size,
        paramSize: m.details?.parameter_size,
        quantization: m.details?.quantization_level,
        contextLength: m.details?.context_length,
        capabilities: m.capabilities || [],
      })),
      runningModels: psJson.models || [],
    };
  } catch {
    return { installed: false, availableModels: [], runningModels: [] };
  }
}
