import { traverse, t } from "../swc-utils";
import type { SwcProgram } from "../swc-utils";
import type { MbaOptions } from "../types";

/**
 * Pass: Mixed Boolean Arithmetic (MBA)
 *
 * Replaces simple numeric literals and binary expressions with equivalent
 * MBA expressions, making static analysis significantly harder.
 *
 * Identities applied:
 *   x + y  →  (x ^ y) + 2*(x & y)
 *   x - y  →  (x ^ y) - 2*(~x & y)
 *   x | y  →  (x ^ y) + (x & y)        [bit-disjoint: no carry]
 *   x ^ y  →  (x | y) - (x & y)
 */
export function applyMba(ast: SwcProgram, options: MbaOptions = {}): void {
  const rounds = options.rounds ?? 1;

  for (let r = 0; r < rounds; r++) {
    traverse(ast, {
      BinaryExpression: {
        exit(path) {
          const { operator, left, right } = path.node;

          if (!t.isExpression(left) || !t.isExpression(right)) return;
          if (operator !== "+" && operator !== "-" && operator !== "|" && operator !== "^") return;

          // Skip string concatenation — MBA identities only hold for integers
          if (
            operator === "+" &&
            (t.isStringLiteral(left) ||
              t.isStringLiteral(right) ||
              t.isTemplateLiteral(left) ||
              t.isTemplateLiteral(right))
          )
            return;

          // Prevent infinite expansion — SWC nodes have no .extra, so we use a custom flag
          if ((path.node as any)._mbaExpanded) return; // eslint-disable-line @typescript-eslint/no-explicit-any

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let replacement: any;

          if (operator === "+") {
            // x + y  ≡  (x ^ y) + 2 * (x & y)
            replacement = t.binaryExpression(
              "+",
              t.parenthesizedExpression(
                t.binaryExpression("^", t.cloneNode(left), t.cloneNode(right))
              ),
              t.binaryExpression(
                "*",
                t.numericLiteral(2),
                t.parenthesizedExpression(
                  t.binaryExpression("&", t.cloneNode(left), t.cloneNode(right))
                )
              )
            );
          } else if (operator === "-") {
            // x - y  ≡  (x ^ y) - 2 * (~x & y)
            replacement = t.binaryExpression(
              "-",
              t.parenthesizedExpression(
                t.binaryExpression("^", t.cloneNode(left), t.cloneNode(right))
              ),
              t.binaryExpression(
                "*",
                t.numericLiteral(2),
                t.parenthesizedExpression(
                  t.binaryExpression(
                    "&",
                    t.unaryExpression("~", t.cloneNode(left)),
                    t.cloneNode(right)
                  )
                )
              )
            );
          } else if (operator === "|") {
            // x | y  ≡  (x ^ y) + (x & y)
            replacement = t.binaryExpression(
              "+",
              t.parenthesizedExpression(
                t.binaryExpression("^", t.cloneNode(left), t.cloneNode(right))
              ),
              t.parenthesizedExpression(
                t.binaryExpression("&", t.cloneNode(left), t.cloneNode(right))
              )
            );
          } else {
            // x ^ y  ≡  (x | y) - (x & y)
            replacement = t.binaryExpression(
              "-",
              t.parenthesizedExpression(
                t.binaryExpression("|", t.cloneNode(left), t.cloneNode(right))
              ),
              t.parenthesizedExpression(
                t.binaryExpression("&", t.cloneNode(left), t.cloneNode(right))
              )
            );
          }

          (replacement as any)._mbaExpanded = true; // eslint-disable-line @typescript-eslint/no-explicit-any

          path.replaceWith(replacement);
          path.skip();
        },
      },
    });
  }
}
