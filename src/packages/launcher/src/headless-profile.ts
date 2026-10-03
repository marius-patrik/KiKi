/**
 * Headless profile configuration manager.
 * Composes the profile's Stack bundle through the shared provisioning step and
 * populates cordis.patch.yml with base config for llm-pi-ai from settings.yaml
 * providers.custom.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { ensureProfileComposition, HEADLESS_PROFILE_BUNDLE } from "./profile-composition.js";

/**
 * Options for configuring and ensuring the headless profile.
 */
export interface HeadlessProfileOptions {
  /** The DSH_HOME root path. */
  home: string;
  /** Root directory of the @dsh-stack/launcher package. */
  pkgDir: string;
}

/** Pack bundle the headless profile composes. */
const HEADLESS_BUNDLE = HEADLESS_PROFILE_BUNDLE;

/**
 * Normalizes custom provider configurations to conform to the upstream harness schema.
 * Aligns non-standard API protocols (e.g. mistral-conversations, google-generative-ai)
 * to openai-completions with appropriate base URLs.
 *
 * @param providers - Raw provider configurations parsed from settings.yaml.
 * @returns Array of normalized provider configurations safe for harness validation.
 */
export function normalizeCustomProviders(providers: unknown[]): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  for (const item of providers) {
    if (!item || typeof item !== "object") continue;
    const provider = { ...(item as Record<string, unknown>) };
    if (provider.api === "mistral-conversations") {
      provider.api = "openai-completions";
      if (!provider.baseURL) {
        provider.baseURL = "https://api.mistral.ai/v1";
      }
    } else if (provider.api === "google-generative-ai") {
      provider.api = "openai-completions";
      if (!provider.baseURL) {
        provider.baseURL = "https://generativelanguage.googleapis.com/v1beta/openai/";
      }
    }
    result.push(provider);
  }
  return result;
}

/**
 * Ensure cordis.patch.yml in the headless profile directory supplies base config
 * for llm-pi-ai with custom providers from settings.yaml.
 *
 * @param profileDir - the headless profile directory.
 * @param settingsPath - path to settings.yaml.
 */
function ensureHeadlessCordisPatch(profileDir: string, settingsPath: string): void {
  if (!existsSync(settingsPath)) return;
  let customProviders: Record<string, unknown>[] = [];
  try {
    const rawSettings = readFileSync(settingsPath, "utf8");
    const settingsDoc = YAML.parse(rawSettings) as { providers?: { custom?: unknown[] } };
    if (settingsDoc && typeof settingsDoc === "object") {
      const providersSection = settingsDoc.providers;
      if (providersSection && Array.isArray(providersSection.custom)) {
        customProviders = normalizeCustomProviders(providersSection.custom);
      }
    }
  } catch {
    return;
  }

  if (customProviders.length === 0) return;

  const patchPath = join(profileDir, "cordis.patch.yml");
  let patchDoc: Record<string, unknown>[] = [];
  if (existsSync(patchPath)) {
    try {
      const rawPatch = readFileSync(patchPath, "utf8");
      const parsed = YAML.parse(rawPatch);
      if (Array.isArray(parsed)) {
        patchDoc = parsed as Record<string, unknown>[];
      }
    } catch {
      patchDoc = [];
    }
  }

  const existingIndex = patchDoc.findIndex(
    (item) => item && typeof item === "object" && item.id === "llm-pi-ai",
  );

  if (existingIndex >= 0) {
    const existing = { ...patchDoc[existingIndex] };
    const cfg =
      existing.config && typeof existing.config === "object"
        ? { ...(existing.config as Record<string, unknown>) }
        : {};
    cfg.providers = customProviders;
    existing.config = cfg;
    patchDoc[existingIndex] = existing;
  } else {
    patchDoc.push({
      id: "llm-pi-ai",
      config: {
        providers: customProviders,
      },
    });
  }

  writeFileSync(patchPath, YAML.stringify(patchDoc), "utf8");
}

/**
 * Ensures that the headless profile's bundle declaration, stack package symlinks,
 * and llm-pi-ai provider base config are all properly configured and synchronized
 * from settings.yaml.
 *
 * @param options - Configuration options specifying home and pkgDir.
 */
export function ensureHeadlessProfile(options: HeadlessProfileOptions): void {
  const { home, pkgDir } = options;
  const profileDir = join(home, "profiles", "headless");
  mkdirSync(profileDir, { recursive: true });
  ensureProfileComposition({ home, pkgDir, profile: "headless", bundle: HEADLESS_BUNDLE });
  ensureHeadlessCordisPatch(profileDir, join(home, "settings.yaml"));
}