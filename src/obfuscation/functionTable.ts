/* eslint-disable @typescript-eslint/no-explicit-any */
import { traverse, t, type NodePath } from "../swc-utils";
import type { SwcProgram } from "../swc-utils";
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
export function applyFunctionTable(ast: SwcProgram, options: FunctionTableOptions = {}): void {
  const minFunctions = options.minFunctions ?? 2;
  const tableId = genId();

  // ── Step 1: collect names that "leak" out of this module ──────────────────
  // Removing the declaration of a leaked function would silently break callers
  // outside the module (ESM consumers) or property accesses (CJS consumers).
  const leakedNames = new Set<string>();

  traverse(ast, {
    // ESM: export { foo }, export { foo as bar }
    ExportNamedDeclaration(path) {
      if ((path.node as any).source) return; // re-export from another file — no local binding // eslint-disable-line @typescript-eslint/no-explicit-any
      for (const spec of (path.node as any).specifiers ?? []) {
        if (t.isExportSpecifier(spec)) {
          // SWC ExportSpecifier uses .orig (not .local)
          const orig = (spec as any).orig;
          if (orig && orig.type === "Identifier") {
            leakedNames.add(orig.value);
          }
        }
      }
    },
    // ESM: export default foo  (identifier, not an inline declaration)
    ExportDefaultExpression(path) {
      // SWC uses ExportDefaultExpression.expression for identifier exports
      const expr = (path.node as any).expression ?? (path.node as any).decl;
      if (expr && expr.type === "Identifier") {
        leakedNames.add(expr.value);
      }
    },
    // CJS: module.exports = foo | module.exports.x = foo | exports.x = foo
    //       module.exports = { foo } | module.exports = { x: foo }
    AssignmentExpression(path) {
      const { left, right } = path.node;
      if (!isExportsTarget(left)) return;
      if (t.isIdentifier(right)) {
        leakedNames.add((right as any).value);
      } else if (t.isObjectExpression(right)) {
        for (const prop of (right as any).properties ?? []) {
          // SWC shorthand { foo } → Identifier node directly in properties[]
          if (t.isIdentifier(prop)) {
            leakedNames.add((prop as any).value);
          } else if (t.isObjectProperty(prop) && t.isIdentifier((prop as any).value)) {
            leakedNames.add((prop as any).value.value);
          }
        }
      }
    },
  });

  // Collect top-level named function declarations first, then remove only if threshold is met

  const functions: { id: string; fn: any }[] = [];
  const nameToIndex = new Map<string, number>();

  const functionPaths: NodePath<any>[] = [];

  traverse(ast, {
    FunctionDeclaration(path) {
      const node = path.node as any;
      // SWC FunctionDeclaration uses .identifier (not .id)
      if (!node.identifier) return;
      if (!t.isProgram(path.parent) && !t.isBlockStatement(path.parent)) return;
      if (leakedNames.has(node.identifier.value)) return; // preserve exported/leaked functions
      functionPaths.push(path);
    },
  });

  if (functionPaths.length < minFunctions) return;

  // Build the index map before touching the AST
  for (let i = 0; i < functionPaths.length; i++) {
    nameToIndex.set((functionPaths[i].node as any).identifier.value, i);
  }

  // Replace call sites FIRST (while function bodies are still in the AST)
  // so calls inside one function to another are also rewritten.
  traverse(ast, {
    CallExpression(path) {
      if (!t.isIdentifier(path.node.callee)) return;
      const idx = nameToIndex.get((path.node.callee as any).value);
      if (idx === undefined) return;

      path.node.callee = t.memberExpression(
        t.identifier(tableId),
        t.numericLiteral(idx),
        true // computed
      );
    },
  });

  // Now extract function expressions and remove declarations from the AST
  // Extract in original order first, then remove in reverse order to preserve indices
  for (const path of functionPaths) {
    const node = path.node as any;
    functions.push({
      id: node.identifier.value,
      fn: t.functionExpression(
        null,
        node.params, // already Parameter[] in SWC
        node.body,
        node.generator,
        node.async
      ),
    });
  }
  // Remove in reverse order so earlier removals don't shift later indices
  for (const path of [...functionPaths].reverse()) {
    path.remove();
  }

  // Prepend: const <tableId> = [fn0, fn1, ...]
  const tableDeclaration = t.variableDeclaration("const", [
    t.variableDeclarator(t.identifier(tableId), t.arrayExpression(functions.map((f) => f.fn))),
  ]);

  ast.body.unshift(tableDeclaration as any);
}

/**
 * Returns true if `node` is an assignment target that exposes a value as a
 * CJS export: `exports`, `module.exports`, or any member of `module.exports`.
 */

function isExportsTarget(node: any): boolean {
  // bare `exports`
  if (t.isIdentifier(node) && (node as any).value === "exports") return true;
  // must be a MemberExpression and not computed
  if (!t.isMemberExpression(node) || (node as any).property?.type === "Computed") return false;
  const obj = (node as any).object;
  const prop = (node as any).property;
  // `exports.foo`
  if (t.isIdentifier(obj) && obj.value === "exports") return true;
  // `module.exports`
  if (
    t.isIdentifier(obj) &&
    obj.value === "module" &&
    t.isIdentifier(prop) &&
    prop.value === "exports"
  )
    return true;
  // `module.exports.foo`
  if (
    t.isMemberExpression(obj) &&
    (obj as any).property?.type !== "Computed" &&
    t.isIdentifier((obj as any).object) &&
    (obj as any).object.value === "module" &&
    t.isIdentifier((obj as any).property) &&
    (obj as any).property.value === "exports"
  )
    return true;
  return false;
}
