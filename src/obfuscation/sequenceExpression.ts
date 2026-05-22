import traverse from "@babel/traverse";
import * as t from "@babel/types";
import type { SequenceExpressionOptions } from "../types";

/**
 * Pass: Sequence Expression Flattening
 *
 * Converts block statements inside `if` / `else` branches into comma-separated
 * sequence expressions, mirroring reCAPTCHA's code-flattening technique.
 *
 * Before:
 *   if (cond) { a = 1; b = 2; }
 *
 * After:
 *   cond && ((a = 1), (b = 2));
 */
export function applySequenceExpression(ast: t.File, options: SequenceExpressionOptions = {}): void {
  const probability = options.probability ?? 1.0;

  traverse(ast, {
    IfStatement(path) {
      if (Math.random() > probability) return;

      const { test, consequent, alternate } = path.node;

      // Only flatten simple BlockStatement bodies (no declarations)
      const canFlatten = (node: t.Statement): node is t.BlockStatement =>
        t.isBlockStatement(node) && node.body.every((s): s is t.ExpressionStatement => t.isExpressionStatement(s));

      if (!canFlatten(consequent)) return;
      if (alternate !== null && alternate !== undefined && !canFlatten(alternate)) return;

      const toSeq = (block: t.BlockStatement): t.Expression => {
        const exprs = (block.body as t.ExpressionStatement[]).map((s) => s.expression);
        return exprs.length === 1 ? exprs[0] : t.sequenceExpression(exprs);
      };

      let replacement: t.Expression;
      if (alternate === null || alternate === undefined) {
        // if (cond) { ... }  →  cond && (...)
        replacement = t.logicalExpression("&&", test, toSeq(consequent as t.BlockStatement));
      } else {
        // if (cond) { ... } else { ... }  →  cond ? (...) : (...)
        replacement = t.conditionalExpression(test, toSeq(consequent as t.BlockStatement), toSeq(alternate as t.BlockStatement));
      }

      path.replaceWith(t.expressionStatement(replacement));
    },
  });
}
