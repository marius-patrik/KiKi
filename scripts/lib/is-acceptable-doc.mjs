/**
 * Validates whether a model-generated JSDoc reply is safe, accurate, and free
 * of neighbouring function bleed.
 *
 * Enforces mechanical checks:
 * 1. Checks that the model echoed the exact target function name on the first line (@function <name>).
 * 2. Verifies that any @param tag references an actual formal parameter of the target function.
 * 3. Rejects @param tags when the target function has zero parameters.
 * 4. Rejects @throws when the target function body does not throw or reject.
 * 5. Rejects TypeScript type annotations in JSDoc within TypeScript files.
 * 6. Rejects placeholder markers (todo, fixme, not implemented).
 * 7. Rejects restatements of the identifier ("foo implementation").
 * 8. Deduplicates identical descriptions across different functions.
 *
 * @param text - The raw reply text from the model.
 * @param target - Object containing { name, params, code }, or string of the function name for backwards compatibility.
 * @param isTypeScript - Whether the file is TypeScript.
 * @param seen - Set of seen description keys for deduping.
 * @returns The cleaned, normalised comment block, or null if rejected.
 */
export function isAcceptableDoc(text, target, isTypeScript = false, seen = null) {
  if (!text) return null;

  const targetName = typeof target === "string" ? target : target?.name;
  const targetParams = typeof target === "object" && Array.isArray(target?.params) ? target.params : null;
  const targetCode = typeof target === "object" && typeof target?.code === "string" ? target.code : "";

  const start = text.indexOf("/**");
  const end = text.indexOf("*/", start + 3);
  if (start === -1 || end === -1) return null;

  let block = text.slice(start, end + 2);
  // More than one comment means the model answered with multiple blocks or a whole file.
  if (block.slice(3).includes("/**")) return null;

  let lines = block
    .slice(3, -2)
    .split("\n")
    .map((line) => line.replace(/^\s*\*?\s?/, "").trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  // 1. Check for @function <name> echo on the first line.
  //    This catches the case where the model intended to document a different function.
  const fnTagMatch = lines[0].match(/^@function\s+([A-Za-z0-9_$]+)/i);
  if (fnTagMatch) {
    if (targetName && fnTagMatch[1] !== targetName) return null;
    lines = lines.slice(1);
    if (lines.length === 0) return null;
  }

  // Build the normalised block without the @function tag.
  block = `/**\n${lines.map((line) => ` * ${line}`).join("\n")}\n */`;

  const prose = lines.filter((line) => !line.startsWith("@")).join(" ");
  if (prose.length < 20) return null;

  // 2. Reject restatements of the identifier.
  if (targetName && new RegExp(`^${targetName}\\b.{0,30}implementation`, "i").test(prose)) {
    return null;
  }
  if (/\bimplementation\.?$/i.test(prose.trim())) return null;

  // 3. Reject placeholder markers.
  if (/\b(todo|fixme|not implemented)\b/i.test(block)) return null;

  // 4. Parameter validation: verify documented params match actual function params.
  const paramTags = lines.filter((line) => line.startsWith("@param"));
  if (targetParams !== null) {
    if (targetParams.length === 0 && paramTags.length > 0) {
      // Documented params on a zero-parameter function is a hallucination or bleed.
      return null;
    }
    for (const tag of paramTags) {
      // Matches '@param {type} name' or '@param name' or '@param [name]'
      const match = tag.match(/^@param(?:\s*\{[^}]*\})?\s+\[?([A-Za-z0-9_$]+)\]?/);
      if (match) {
        const documentedParam = match[1];
        if (!targetParams.includes(documentedParam)) {
          // Documented parameter not in formal parameter list -> bleed from neighbour function.
          return null;
        }
      }
    }
  }

  // 5. Reject @throws when the target function code has no throw/reject/assert.
  if (/@throws/.test(block)) {
    const throwsInCode = /\b(throw\b|reject\(|assert\b|assertLoaderShape)/.test(targetCode);
    if (!throwsInCode) return null;
  }

  // 6. Reject JSDoc type annotations in TypeScript.
  if (isTypeScript && /@(param|returns?)\s*\{/.test(block)) return null;

  // 7. Duplicate description dedup check across different functions.
  if (seen) {
    const key = prose.toLowerCase().replace(/\s+/g, " ").slice(0, 120);
    if (seen.has(key)) return null;
    seen.add(key);
  }

  return block;
}
