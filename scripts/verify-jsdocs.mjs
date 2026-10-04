import { promises as fs } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const root = process.cwd();
const sourceRoots = ["plugins", "publish/packs", "scripts"];
const ignoredDirectories = new Set(["node_modules", "lib", "dist", ".next", ".turbo"]);

/** Recursively collect source files that are part of the repository implementation. */
async function collectFiles(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
    } else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

/** Return true when a declaration has a JSDoc comment attached to it. */
function hasJsDoc(sourceFile, node) {
  return ts
    .getJSDocCommentsAndTags(node)
    .some((comment) => comment.getFullText(sourceFile).trimStart().startsWith("/**"));
}

/** Report every named or declarative function without a JSDoc block. */
function checkFile(path, source) {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx")
      ? ts.ScriptKind.TSX
      : path.endsWith(".jsx")
        ? ts.ScriptKind.JSX
        : path.endsWith(".ts")
          ? ts.ScriptKind.TS
          : path.endsWith(".mts")
            ? ts.ScriptKind.MTS
            : path.endsWith(".cts")
              ? ts.ScriptKind.CTS
              : ts.ScriptKind.JS,
  );
  const missing = [];

  /** Walk the AST and collect function declarations that lack JSDoc. */
  function visit(node) {
    let declaration = null;
    let name = "<anonymous>";

    if (ts.isFunctionDeclaration(node)) {
      declaration = node;
      name = node.name?.text ?? name;
    } else if (ts.isMethodDeclaration(node)) {
      declaration = node;
      name = node.name.getText(sourceFile);
    } else if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
      declaration = node;
      name = node.name.getText(sourceFile);
    } else if (ts.isConstructorDeclaration(node)) {
      declaration = node;
      name = "constructor";
    } else if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
        declaration = node;
        name = node.name.getText(sourceFile);
      }
    }

    if (declaration !== null && !hasJsDoc(sourceFile, declaration)) {
      const position = sourceFile.getLineAndCharacterOfPosition(declaration.getStart(sourceFile));
      missing.push(
        `${relative(root, path)}:${position.line + 1}:${position.character + 1} ${name}`,
      );
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return missing;
}

/** Verify that all declared functions in the implementation have JSDoc. */
async function main() {
  const files = (
    await Promise.all(sourceRoots.map((rootName) => collectFiles(join(root, rootName))))
  ).flat();
  const missing = [];
  for (const path of files.sort()) {
    missing.push(...checkFile(path, await fs.readFile(path, "utf8")));
  }
  if (missing.length > 0) {
    console.error(`Missing JSDoc on ${missing.length} function declaration(s):`);
    for (const entry of missing) console.error(`- ${entry}`);
    process.exit(1);
  }
  console.log(`JSDoc verification passed for ${files.length} source file(s).`);
}

await main();
