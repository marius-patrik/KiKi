/**
 * Shared parsing helpers for "authoring files" — the Markdown/JSON files a
 * plugin's catalog is built from (agent-actions' action files, agents'
 * persona files, and similar). Both formats share the same id-sanitizing and
 * `---` frontmatter conventions; this module is the one place that logic
 * lives.
 * @module plugin-kit/authoring-file
 */

/**
 * Sanitize a file stem into a catalog id: lowercase, map disallowed
 * characters to `-`, collapse runs, and guarantee a leading alphanumeric.
 * Unusable input (empty after cleanup) falls back to `fallback`.
 */
export function sanitizeAuthoringId(stem: string, fallback: string): string {
  const cleaned = stem
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[^a-z0-9]+/, "");
  return cleaned === "" ? fallback : cleaned;
}

/** A scalar value from an authoring file, trimmed and unquoted. */
export function authoringScalar(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const quoted = trimmed.match(/^(['"])([\s\S]*)\1$/);
  return quoted !== null ? quoted[2] : trimmed;
}

/** Parse the `key: value` lines of a YAML-ish frontmatter block. */
export function parseAuthoringFrontmatter(text: string): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const line of text.split("\n")) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (match !== null) {
      const key = match[1];
      if (key !== undefined) out[key] = authoringScalar(match[2]);
    }
  }
  return out;
}

/** The `---` frontmatter block of a Markdown authoring file, split from its body. */
export function splitAuthoringMarkdown(content: string): {
  fields: Record<string, string | undefined>;
  body: string;
} {
  const fenced = content.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (fenced === null || fenced[1] === undefined || fenced[0] === undefined)
    return { fields: {}, body: content };
  return { fields: parseAuthoringFrontmatter(fenced[1]), body: content.slice(fenced[0].length) };
}
