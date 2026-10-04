/**
 * Replace auto-generated filler doc comments with real contract documentation,
 * using the local inference server rather than a frontier model.
 *
 * The tree carries hundreds of comments of the form `/** foo implementation. *\/`
 * -- mechanically complete, semantically empty. A comment that restates the
 * identifier carries no information but reads as though the function is
 * documented, which suppresses ever writing a real one (#117).
 *
 * This is exactly the shape of work worth sending to a local model: high
 * volume, low judgement, and every result is independently checkable. Nothing
 * here trusts the model -- each reply must survive `isAcceptableDoc` before it
 * is written, and anything rejected leaves the original comment untouched for a
 * human to handle.
 *
 * Usage:
 *   node src/scripts/rewrite-filler-jsdoc.mjs --dry-run
 *   node src/scripts/rewrite-filler-jsdoc.mjs --package providers --limit 20
 *   node src/scripts/rewrite-filler-jsdoc.mjs --root plugins
 *
 * @module @dsh-stack/scripts/rewrite-filler-jsdoc
 */
import { promises as fs } from "node:fs";
import { join, relative } from "node:path";
import { completeLocally, LOCAL_MODEL, listLocalModels } from "./local-model-client.mjs";
import { resolveRepoRoot } from "./lib/resolve-repo-root.mjs";
import { walkSourceTree } from "./lib/walk-source-tree.mjs";
import { extractFunctionContext } from "./lib/extract-function-context.mjs";
import { isAcceptableDoc } from "./lib/is-acceptable-doc.mjs";

export { isAcceptableDoc };

const root = resolveRepoRoot(import.meta.url);

/** Matches the generated filler form, capturing the name it restates. */
const FILLER = /\/\*\* ([A-Za-z0-9_$]+) implementation\. \*\//g;

/** Instruction fixed for every call: the transformation and the output shape. */
const SYSTEM = [
  "You write JSDoc for TypeScript and JavaScript.",
  "Given a function and its surrounding code, write ONE JSDoc comment describing its contract:",
  "what the caller must guarantee, what it returns or guarantees back, and what it does on the failure path.",
  "Rules:",
  "- Output ONLY the comment block, starting with /** and ending with */. No code, no prose around it.",
  "- The FIRST line inside the comment must be exactly `@function <name>` naming the function you were asked to document.",
  "- Never restate the function name as the description. 'clonePanes clones panes' is worthless.",
  "- Describe observable behaviour, not implementation steps.",
  "- Keep it under 4 lines unless parameters genuinely need documenting.",
  "- Do not invent parameters or behaviour that the code does not show.",
].join("\n");

/** Re-indents a comment block so every line sits at `indent`. */
function reindent(block, indent) {
  const [first, ...rest] = block.split("\n");
  return [
    first,
    ...rest.map((line) => `${indent}${line.trim().replace(/^\*/, "*").replace(/^/, " ")}`),
  ].join("\n");
}

/**
 * Replace one filler comment, hoisting it out of a declaration when the
 * generator wedged it there.
 *
 * 34 of these sit between `const` and the identifier -- `const /** x *\/ name =`
 * -- which is a syntax-level defect in its own right. Substituting a longer
 * comment in place makes that materially worse, so those are rewritten as a
 * comment above the declaration instead of inside it.
 *
 * @returns the updated source, or null when the occurrence could not be placed
 *   safely and should be left alone.
 */
export function applyDoc(text, filler, block) {
  const at = text.indexOf(filler);
  if (at === -1) return null;

  const lineStart = text.lastIndexOf("\n", at) + 1;
  const before = text.slice(lineStart, at);
  const indent = (before.match(/^\s*/) ?? [""])[0];

  // The wedged form: `const /** x */\n  name = ...`. Substituting a longer
  // comment in place would deepen a defect that is already syntactic, so the
  // declaration keyword is rejoined to its identifier and the comment moves
  // above the whole declaration.
  const keyword = before.trim().match(/^(const|let|var)$/)?.[1];
  if (keyword) {
    const after = text.slice(at + filler.length);
    const rejoined = after.replace(/^\s*\n\s*/, " ");
    if (rejoined === after) return null;
    return `${text.slice(0, lineStart)}${indent}${reindent(block, indent)}\n${indent}${keyword}${rejoined}`;
  }

  return `${text.slice(0, at)}${reindent(block, indent).trimStart()}${text.slice(at + filler.length)}`;
}

/** Reads the value following `flag` in `args`, or undefined when `flag` is absent. */
function flagValue(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const pkgArg = flagValue(args, "--package");
const rootArg = flagValue(args, "--root");
const limitArg = Number(flagValue(args, "--limit"));
const limit = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : Infinity;

const served = await listLocalModels();
if (served === null) {
  console.error(
    "rewrite-filler-jsdoc: no local inference server reachable.\n" +
      "Start one (e.g. mlx_lm.server) or set DSH_LOCAL_MODEL_URL.",
  );
  process.exit(1);
}
console.log(`local server: ${served.length} model(s); using ${LOCAL_MODEL}`);

const searchRoot = pkgArg
  ? join(root, "plugins", pkgArg)
  : join(root, rootArg ?? join("src", "packages"));
/** Descriptions already accepted, so one function's contract is not reused for another. */
const seenDescriptions = new Set();
let examined = 0;
let rewritten = 0;
let rejected = 0;

for await (const file of walkSourceTree(searchRoot, { extensions: ["ts", "tsx", "mjs", "js"] })) {
  let text = await fs.readFile(file, "utf8");
  const matches = [...text.matchAll(FILLER)];
  if (matches.length === 0) continue;

  for (const match of matches) {
    if (examined >= limit) break;
    examined += 1;
    const [full, name] = match;
    const lineIndex = text.slice(0, match.index).split("\n").length - 1;

    const target = extractFunctionContext(text, match.index, full.length, file);
    if (!target) {
      rejected += 1;
      console.log(
        `  reject ${relative(root, file)}:${lineIndex + 1} ${name} (could not extract function context)`,
      );
      continue;
    }

    const reply = await completeLocally(
      SYSTEM,
      `Write the JSDoc for \`${target.name}\`.\n\n\`\`\`\n${target.code}\n\`\`\``,
      { maxTokens: 220 },
    );
    const block = isAcceptableDoc(reply, target, /\.tsx?$/.test(file), seenDescriptions);
    if (!block) {
      rejected += 1;
      console.log(`  reject ${relative(root, file)}:${lineIndex + 1} ${name}`);
      continue;
    }
    if (!dryRun) {
      const next = applyDoc(text, full, block);
      if (next === null || next === text) {
        rejected += 1;
        console.log(
          `  reject ${relative(root, file)}:${lineIndex + 1} ${name} (could not place safely)`,
        );
        continue;
      }
      text = next;
      await fs.writeFile(file, text);
    }
    rewritten += 1;
    console.log(
      `  ${dryRun ? "would write" : "wrote"} ${relative(root, file)}:${lineIndex + 1} ${name}`,
    );
  }
  if (examined >= limit) break;
}

console.log(
  `\nexamined ${examined}, ${dryRun ? "would rewrite" : "rewrote"} ${rewritten}, rejected ${rejected}`,
);
console.log(
  "Run bun run typecheck and bun run verify before committing: nothing here is trusted unverified.",
);
