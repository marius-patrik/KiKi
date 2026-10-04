import ts from "typescript";

/** Returns the TypeScript ScriptKind based on file extension. */
function getScriptKind(filePath) {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (filePath.endsWith(".ts")) return ts.ScriptKind.TS;
  if (filePath.endsWith(".mts")) return ts.ScriptKind.MTS;
  if (filePath.endsWith(".cts")) return ts.ScriptKind.CTS;
  return ts.ScriptKind.JS;
}

/**
 * Extracts parameter names from parameter declarations.
 * Handles identifiers and destructuring bindings.
 */
function extractParamNames(parameters, sourceFile) {
  const names = [];
  for (const param of parameters) {
    if (ts.isIdentifier(param.name)) {
      names.push(param.name.text);
    } else if (ts.isObjectBindingPattern(param.name) || ts.isArrayBindingPattern(param.name)) {
      for (const element of param.name.elements) {
        if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
          names.push(element.name.text);
        }
      }
    } else {
      names.push(param.name.getText(sourceFile));
    }
  }
  return names;
}

/**
 * Extracts the exact AST node and metadata for a function immediately
 * following or wrapping a filler comment.
 *
 * Guarantees that only the target function's code is returned, isolating it
 * from neighbour functions and preventing cross-function attention drift.
 *
 * @param source - The complete source text of the file.
 * @param fillerMatchIndex - The start index of the filler comment in `source`.
 * @param fillerLength - The length of the filler comment match.
 * @param filePath - The file path (used to determine TS/JS parsing mode).
 * @returns An object containing the target function's `name`, `params`, `code`,
 *          and flags, or null if no declaration could be uniquely resolved.
 */
export function extractFunctionContext(source, fillerMatchIndex, fillerLength, filePath = "file.js") {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(filePath)
  );

  const targetOffset = fillerMatchIndex + fillerLength;
  let targetNode = null;
  let targetName = null;
  let targetParams = [];
  let isAsync = false;
  let isGenerator = false;

  function visit(node) {
    let decl = null;
    let name = null;
    let params = [];
    let fnNode = null;

    if (ts.isFunctionDeclaration(node)) {
      decl = node;
      fnNode = node;
      name = node.name?.text;
      params = extractParamNames(node.parameters, sourceFile);
      isAsync = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
      isGenerator = Boolean(node.asteriskToken);
    } else if (ts.isMethodDeclaration(node)) {
      decl = node;
      fnNode = node;
      name = node.name.getText(sourceFile);
      params = extractParamNames(node.parameters, sourceFile);
      isAsync = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
      isGenerator = Boolean(node.asteriskToken);
    } else if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
      decl = node;
      fnNode = node;
      name = node.name.getText(sourceFile);
      params = extractParamNames(node.parameters, sourceFile);
    } else if (ts.isVariableDeclaration(node) && node.initializer) {
      const init = node.initializer;
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
        decl = node.parent?.parent && ts.isVariableStatement(node.parent.parent)
          ? node.parent.parent
          : node;
        fnNode = init;
        name = node.name.getText(sourceFile);
        params = extractParamNames(init.parameters, sourceFile);
        isAsync = init.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
        isGenerator = Boolean(init.asteriskToken);
      }
    }

    if (decl && fnNode) {
      const start = decl.getStart(sourceFile);
      // Match if the declaration starts right near the filler comment
      if (start >= fillerMatchIndex - 50 && start <= targetOffset + 50) {
        targetNode = decl;
        targetName = name;
        targetParams = params;
        return;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (!targetNode) return null;

  return {
    name: targetName,
    params: targetParams,
    code: targetNode.getText(sourceFile),
    isAsync,
    isGenerator,
    start: targetNode.getStart(sourceFile),
    end: targetNode.getEnd(),
  };
}
