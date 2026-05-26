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
        // Always wrap in ParenthesisExpression so the comma-operator sequence
        // and single assignment expressions are always syntactically valid
        // regardless of the enclosing context (ternary branch or && right-hand
        // side). Without parens, `cond && x = v` is parsed as `(cond && x) = v`
        // which is a SyntaxError because the LHS is not assignable.
        if (exprs.length === 1) return t.parenthesisExpression(exprs[0]);
        return t.parenthesisExpression(t.sequenceExpression(exprs));
      };

      // SWC's printer does NOT automatically parenthesise lower-precedence
      // operators on the left-hand side of && or as the condition of ?:.
      // We must do it explicitly when the test node has lower precedence
      // than the operator we are generating.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wrapTest = (node: any, context: "&&" | "?:"): any => {
        const type: string = node?.type;
        const op: string = node?.operator;
        if (context === "&&") {
          // Lower precedence than &&: || ?? ?: = , (sequence)
          if (
            (type === "BinaryExpression" && (op === "||" || op === "??")) ||
            type === "ConditionalExpression" ||
            type === "AssignmentExpression" ||
            type === "SequenceExpression"
          ) {
            return t.parenthesisExpression(node);
          }
        } else {
          // Lower precedence than ?:: = , (sequence)
          // (|| / ?? / && all bind tighter than ?: so they never need wrapping here)
          if (type === "AssignmentExpression" || type === "SequenceExpression") {
            return t.parenthesisExpression(node);
          }
        }
        return node;
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let replacement: any;
      if (alternate === null || alternate === undefined) {
        // if (cond) { ... }  →  cond && (...)
        replacement = t.logicalExpression("&&", wrapTest(test, "&&"), toSeq(consequent));
      } else {
        // if (cond) { ... } else { ... }  →  cond ? (...) : (...)
        replacement = t.conditionalExpression(
          wrapTest(test, "?:"),
          toSeq(consequent),
          toSeq(alternate)
        );
      }

      path.replaceWith(t.expressionStatement(replacement));
    },
  });
}
