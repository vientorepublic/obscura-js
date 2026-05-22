import traverse, { type NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import type { FunctionTableOptions } from "../types";

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
 *   const __haze_ft = [function foo(x) { return x; }];
 *   __haze_ft[0](1);
 */
export function applyFunctionTable(ast: t.File, options: FunctionTableOptions = {}): void {
  const minFunctions = options.minFunctions ?? 2;
  const tableId = "__haze_ft";

  // Collect top-level named function declarations first, then remove only if threshold is met
  const functions: { id: string; fn: t.FunctionExpression }[] = [];
  const nameToIndex = new Map<string, number>();
  const functionPaths: NodePath<t.FunctionDeclaration>[] = [];

  traverse(ast, {
    FunctionDeclaration(path) {
      if (!path.node.id) return;
      if (!t.isProgram(path.parent) && !t.isBlockStatement(path.parent)) return;
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

  // Prepend: const __haze_ft = [fn0, fn1, ...]
  const tableDeclaration = t.variableDeclaration("const", [
    t.variableDeclarator(t.identifier(tableId), t.arrayExpression(functions.map((f) => f.fn))),
  ]);

  (ast.program.body as t.Statement[]).unshift(tableDeclaration);
}
