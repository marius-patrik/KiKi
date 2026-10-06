import { readFileSync, writeFileSync } from "node:fs";
import { Document, parseDocument } from "yaml";

/** The `tweaks` settings section the launcher consumes. */
export interface DshTweaks {
  homeRoot?: string;
  command?: string;
}

/** The canonical top-level key, which is also the tweaks entry's Loader id. */
const SECTION_KEY = "tweaks";

/**
 * The key earlier documents used. It predates 0.2.0, when the settings namespace
 * was chosen independently of the entry id and the launcher and the plugin could
 * disagree. They did: the launcher read `dsh-tweaks` while the plugin's namespace
 * was `tweaks`, so the section the plugin owned was absent from the document the
 * launcher read, and a settings write added a second key instead of updating the
 * one in force.
 */
const LEGACY_SECTION_KEY = "dsh-tweaks";

/** Read a section as `{ homeRoot?, command? }`, ignoring every other field. */
function toTweaks(value: unknown): DshTweaks {
  if (typeof value !== "object" || value === null) return {};
  const section = value as Record<string, unknown>;
  const out: DshTweaks = {};
  for (const key of ["homeRoot", "command"] as const) {
    const raw = section[key];
    if (typeof raw === "string") out[key] = raw;
  }
  return out;
}

/**
 * Rename a legacy `dsh-tweaks` section to the canonical `tweaks` key, in place.
 *
 * This runs before the home is resolved, which is the only reason it lives here
 * rather than in the plugin's mirror: `homeRoot` is read out of the document
 * before any plugin exists, so a home written under the legacy key would be lost
 * by the time a plugin could migrate it. Rewriting the key removes the legacy
 * spelling from the document, so this is a completed migration rather than a
 * standing dual read -- a document already on `tweaks` is left untouched.
 *
 * @param doc - the parsed settings document.
 * @param section - the legacy section's value, already lifted out of the document.
 * @returns whether the document was rewritten.
 */
function migrateLegacyKey(doc: Document, section: unknown): boolean {
  doc.set(SECTION_KEY, doc.createNode(section));
  doc.delete(LEGACY_SECTION_KEY);
  return true;
}

/**
 * Read the `tweaks` section (`homeRoot`, `command`) of a settings.yaml document.
 *
 * Tolerant by design: a missing, empty, or unparsable document yields no tweaks,
 * so a home still resolves to its default rather than failing the launch.
 */
export function readTweaks(settingsPath: string): DshTweaks {
  let text: string;
  try {
    text = readFileSync(settingsPath, "utf8");
  } catch {
    return {};
  }
  if (text.trim().length === 0) return {};
  let doc: Document;
  try {
    doc = parseDocument(text);
  } catch {
    return {};
  }
  if (doc.errors.length > 0) return {};
  const root = doc.toJS() as Record<string, unknown> | null;
  if (typeof root !== "object" || root === null) return {};
  const section = root[SECTION_KEY];
  if (section !== undefined || !Object.hasOwn(root, LEGACY_SECTION_KEY)) {
    return toTweaks(section);
  }
  const legacy = root[LEGACY_SECTION_KEY];
  migrateLegacyKey(doc, legacy);
  try {
    writeFileSync(settingsPath, doc.toString(), "utf8");
  } catch {
    // A read-only document still yields its tweaks for this launch.
  }
  return toTweaks(legacy);
}
