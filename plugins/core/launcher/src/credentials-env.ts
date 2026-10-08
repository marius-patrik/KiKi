/**
 * Credential environment variable loader for the dsh launcher.
 * Reads `.credentials.yaml` from the active DSH_HOME and populates
 * referenced environment variables so child processes and the headless
 * agent runner can authenticate against configured provider routes.
 */

import { existsSync, readFileSync } from "node:fs";
import YAML from "yaml";

/**
 * Load credential environment variable references from a `.credentials.yaml`
 * file into the target environment object.
 *
 * Keys already set in the environment take precedence and are not overwritten.
 *
 * @param credentialsPath - Path to the `.credentials.yaml` file.
 * @param env - The target environment dictionary to populate (defaults to `process.env`).
 */
export function loadCredentialEnv(
  credentialsPath: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!existsSync(credentialsPath)) return;
  try {
    const raw = readFileSync(credentialsPath, "utf8");
    const doc = YAML.parse(raw);
    if (!doc || typeof doc !== "object") return;
    const refs = (doc as { refs?: Record<string, unknown> }).refs;
    if (!refs || typeof refs !== "object") return;
    for (const [key, value] of Object.entries(refs)) {
      if (typeof value === "string" && env[key] === undefined) {
        env[key] = value;
      }
    }
  } catch {
    // Tolerant on parse or read errors
  }
}
