import traverse, { type NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import type { FunctionTableOptions } from "../types";
import { genId } from "../genId";

/**
 * Pass: Indirect Function Table
 *
 * Collects named function declarations, moves them into a single array, and
 * replaces each call site with a dynamic index lookup.
 *
 * Before:
 *   function foo(x) { return x; }
 *   foo(1);
 *
 * After:
 *   const __obscura_ft = [function foo(x) { return x; }];
 *   __obscura_ft[0](1);
 */
export function applyFunctionTable(ast: t.File, options: FunctionTableOptions = {}): void {
  const minFunctions = options.minFunctions ?? 2;
  const tableId = genId();

  // ── Step 1: collect names that "leak" out of this module ──────────────────
  // Removing the declaration of a leaked function would silently break callers
  // outside the module (ESM consumers) or property accesses (CJS consumers).
  const leakedNames = new Set<string>();

  traverse(ast, {
    // ESM: export { foo }, export { foo as bar }
    ExportNamedDeclaration(path) {
      if (path.node.source) return; // re-export from another file — no local binding
      for (const spec of path.node.specifiers) {
        if (t.isExportSpecifier(spec) && t.isIdentifier(spec.local)) {
          leakedNames.add(spec.local.name);
        }
      }
    },
    // ESM: export default foo  (identifier, not an inline declaration)
    ExportDefaultDeclaration(path) {
      if (t.isIdentifier(path.node.declaration)) {
        leakedNames.add((path.node.declaration as t.Identifier).name);
      }
    },
    // CJS: module.exports = foo | module.exports.x = foo | exports.x = foo
    //       module.exports = { foo } | module.exports = { x: foo }
    AssignmentExpression(path) {
      const { left, right } = path.node;
      if (!isExportsTarget(left)) return;
      if (t.isIdentifier(right)) {
        leakedNames.add(right.name);
      } else if (t.isObjectExpression(right)) {
        for (const prop of right.properties) {
          if (t.isObjectProperty(prop) && t.isIdentifier(prop.value)) {
            leakedNames.add((prop.value as t.Identifier).name);
          }
        }
      }
    },
  });

  // Collect top-level named function declarations first, then remove only if threshold is met
  const functions: { id: string; fn: t.FunctionExpression }[] = [];
  const nameToIndex = new Map<string, number>();
  const functionPaths: NodePath<t.FunctionDeclaration>[] = [];

  traverse(ast, {
    FunctionDeclaration(path) {
      if (!path.node.id) return;
      if (!t.isProgram(path.parent) && !t.isBlockStatement(path.parent)) return;
      if (leakedNames.has(path.node.id.name)) return; // preserve exported/leaked functions
      functionPaths.push(path);
    },
  });

  if (functionPaths.length < minFunctions) return;

  // Build the index map before touching the AST
  for (let i = 0; i < functionPaths.length; i++) {
    nameToIndex.set(functionPaths[i].node.id!.name, i);
  }

  // Replace call sites FIRST (while function bodies are still in the AST)
  // so calls inside one function to another are also rewritten.
  traverse(ast, {
    CallExpression(path) {
      if (!t.isIdentifier(path.node.callee)) return;
      const idx = nameToIndex.get(path.node.callee.name);
      if (idx === undefined) return;

      path.node.callee = t.memberExpression(
        t.identifier(tableId),
        t.numericLiteral(idx),
        true // computed
      );
    },
  });

  // Now extract function expressions and remove declarations from the AST
  for (const path of functionPaths) {
    functions.push({
      id: path.node.id!.name,
      fn: t.functionExpression(
        null,
        path.node.params,
        path.node.body,
        path.node.generator,
        path.node.async
      ),
    });
    path.remove();
  }

  // Prepend: const <tableId> = [fn0, fn1, ...]
  const tableDeclaration = t.variableDeclaration("const", [
    t.variableDeclarator(t.identifier(tableId), t.arrayExpression(functions.map((f) => f.fn))),
  ]);

  (ast.program.body as t.Statement[]).unshift(tableDeclaration);
}

/**
 * Returns true if `node` is an assignment target that exposes a value as a
 * CJS export: `exports`, `module.exports`, or any member of `module.exports`.
 */
function isExportsTarget(node: t.LVal | t.Expression): boolean {
  // bare `exports`
  if (t.isIdentifier(node, { name: "exports" })) return true;
  if (!t.isMemberExpression(node) || node.computed) return false;
  // `exports.foo`
  if (t.isIdentifier(node.object, { name: "exports" })) return true;
  // `module.exports`
  if (
    t.isIdentifier(node.object, { name: "module" }) &&
    t.isIdentifier(node.property, { name: "exports" })
  )
    return true;
  // `module.exports.foo`
  if (
    t.isMemberExpression(node.object) &&
    !node.object.computed &&
    t.isIdentifier(node.object.object, { name: "module" }) &&
    t.isIdentifier(node.object.property, { name: "exports" })
  )
    return true;
  return false;
}
