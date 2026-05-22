import traverse from "@babel/traverse";
import * as t from "@babel/types";
import type { MbaOptions } from "../types";

/**
 * Pass: Mixed Boolean Arithmetic (MBA)
 *
 * Replaces simple numeric literals and binary expressions with equivalent
 * MBA expressions, making static analysis significantly harder.
 *
 * Example: `x + y`  →  `(x ^ y) + 2 * (x & y)`
 */
export function applyMba(ast: t.File, options: MbaOptions = {}): void {
  const rounds = options.rounds ?? 1;

  for (let r = 0; r < rounds; r++) {
    traverse(ast, {
      BinaryExpression: {
        exit(path) {
          const { operator, left, right } = path.node;

          if (!t.isExpression(left) || !t.isExpression(right)) return;
          // Skip non-numeric-context operators
          if (operator !== "+" && operator !== "-") return;

          // Prevent infinite expansion
          if (path.node.extra?.["mbaExpanded"]) return;

          let replacement: t.Expression;

          if (operator === "+") {
            // x + y  ≡  (x ^ y) + 2 * (x & y)
            replacement = t.binaryExpression(
              "+",
              t.binaryExpression("^", t.cloneNode(left), t.cloneNode(right)),
              t.binaryExpression("*", t.numericLiteral(2), t.binaryExpression("&", t.cloneNode(left), t.cloneNode(right))),
            );
          } else {
            // x - y  ≡  (x ^ y) - 2 * (~x & y)
            replacement = t.binaryExpression(
              "-",
              t.binaryExpression("^", t.cloneNode(left), t.cloneNode(right)),
              t.binaryExpression("*", t.numericLiteral(2), t.binaryExpression("&", t.unaryExpression("~", t.cloneNode(left)), t.cloneNode(right))),
            );
          }

          if (!replacement.extra) replacement.extra = {};
          replacement.extra["mbaExpanded"] = true;

          path.replaceWith(replacement);
          path.skip();
        },
      },
    });
  }
}
