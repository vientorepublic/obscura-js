import { traverse, t } from "../swc-utils";
import type { SwcProgram } from "../swc-utils";
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
 *   cond && (a = 1, b = 2);
 */
export function applySequenceExpression(
  ast: SwcProgram,
  options: SequenceExpressionOptions = {}
): void {
  const probability = options.probability ?? 1.0;

  traverse(ast, {
    IfStatement(path) {
      if (Math.random() > probability) return;

      const { test, consequent, alternate } = path.node;

      // Only flatten simple BlockStatement bodies (no declarations)
      // In SWC, BlockStatement uses .stmts (not .body)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const canFlatten = (node: any): boolean =>
        t.isBlockStatement(node) &&
        node.stmts.length > 0 &&
        node.stmts.every((s: any) => t.isExpressionStatement(s)); // eslint-disable-line @typescript-eslint/no-explicit-any

      if (!canFlatten(consequent)) return;
      if (alternate !== null && alternate !== undefined && !canFlatten(alternate)) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toSeq = (block: any): any => {
        const exprs = block.stmts.map((s: any) => s.expression); // eslint-disable-line @typescript-eslint/no-explicit-any
        return exprs.length === 1 ? exprs[0] : t.sequenceExpression(exprs);
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let replacement: any;
      if (alternate === null || alternate === undefined) {
        // if (cond) { ... }  →  cond && (...)
        replacement = t.logicalExpression("&&", test, toSeq(consequent));
      } else {
        // if (cond) { ... } else { ... }  →  cond ? (...) : (...)
        replacement = t.conditionalExpression(test, toSeq(consequent), toSeq(alternate));
      }

      path.replaceWith(t.expressionStatement(replacement));
    },
  });
}
