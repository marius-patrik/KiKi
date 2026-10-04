/**
 * Fails when a duplication exemption carries no stated reason, or is left open.
 *
 * The duplicate gate runs jscpd at `--threshold 0`, so an exemption is the only
 * way past it. That makes `jscpd:ignore-start` the one marker in the tree that
 * can silence a verifier, and `.agents/rules/verification-standard.md` is
 * explicit that a verifier must never be weakened to make CI green.
 *
 * The distinction this enforces is between the two things the marker is used
 * for. Wrapping genuinely structural repetition -- per-package scaffolding,
 * per-provider wire shaping that only looks alike -- is legitimate. Wrapping
 * real copy-paste to avoid extracting it is weakening the gate. Neither is
 * distinguishable from the other without a reason written down, which is why
 * the reason is mandatory rather than encouraged.
 *
 * @module @dsh-stack/scripts/verify-jscpd-exemptions
 */
import { promises as fs } from "node:fs";
import { join, relative } from "node:path";
import { resolveRepoRoot } from "./lib/resolve-repo-root.mjs";
import { walkSourceTree } from "./lib/walk-source-tree.mjs";

const root = resolveRepoRoot(import.meta.url);

/** Trees carrying source that the duplicate gate scans. */
const ROOTS = ["plugins", "scripts", "publish/packs"];

/** Shortest reason accepted. Anything briefer restates the marker rather than justifying it. */
const MIN_REASON = 20;

const problems = [];
let exemptions = 0;

for (const rootName of ROOTS) {
  for await (const file of walkSourceTree(join(root, rootName), {
    extensions: ["ts", "tsx", "mjs", "js"],
  })) {
    let text;
    try {
      text = await fs.readFile(file, "utf8");
    } catch {
      continue;
    }
    // This file necessarily names the markers it checks for; scanning itself
    // would report its own documentation as malformed exemptions.
    if (file.endsWith("verify-jscpd-exemptions.mjs")) continue;
    if (!text.includes("jscpd:ignore")) continue;
    const rel = relative(root, file);
    const lines = text.split("\n");
    let openLine = 0;

    lines.forEach((line, index) => {
      if (line.includes("jscpd:ignore-start")) {
        exemptions += 1;
        if (openLine !== 0) {
          problems.push(
            `${rel}:${index + 1} opens an exemption while one is already open (line ${openLine})`,
          );
        }
        openLine = index + 1;
        const reason =
          line
            .split("jscpd:ignore-start")[1]
            ?.replace(/^\s*--\s*/, "")
            .trim() ?? "";
        if (reason.length < MIN_REASON) {
          problems.push(
            `${rel}:${index + 1} exemption has no stated reason -- write "jscpd:ignore-start -- <why this repetition is structural>"`,
          );
        }
      }
      if (line.includes("jscpd:ignore-end")) {
        if (openLine === 0)
          problems.push(`${rel}:${index + 1} closes an exemption that was never opened`);
        openLine = 0;
      }
    });

    if (openLine !== 0) {
      problems.push(
        `${rel}:${openLine} opens an exemption that is never closed -- it silences the rest of the file`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error(
    `verify-jscpd-exemptions: ${problems.length} problem(s).\n\n` +
      problems.map((problem) => `  - ${problem}`).join("\n") +
      "\n\nAn exemption is the only way past a zero-threshold duplicate gate, so it\n" +
      "must say why the repetition is structural rather than copy-paste. If the\n" +
      "honest answer is that the code should be extracted, extract it.\n",
  );
  process.exit(1);
}

console.log(`jscpd exemptions verified: ${exemptions} exemption(s), all justified and closed.`);
