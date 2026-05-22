import traverse from "@babel/traverse";
import * as t from "@babel/types";
import type { ControlFlowFlatteningOptions } from "../types";

/**
 * Pass: Control Flow Flattening (CFF)
 *
 * Transforms a function body into a flat state machine with a central
 * dispatcher loop, hiding the original execution order.
 *
 * Before:
 *   function f() { stmt0; stmt1; stmt2; }
 *
 * After:
 *   function f() {
 *     let __s = 0;
 *     while (true) {
 *       switch (__s) {
 *         case 0: stmt0; __s = 1; break;
 *         case 1: stmt1; __s = 2; break;
 *         case 2: stmt2; __s = -1; break;
 *         default: return;
 *       }
 *     }
 *   }
 */
export function applyControlFlowFlattening(
  ast: t.File,
  options: ControlFlowFlatteningOptions = {}
): void {
  const passes = options.passes ?? 1;
  const stateVar = "__haze_s";

  /**
   * If `stmt` is a let/const VariableDeclaration, extract the declarators into
   * `hoisted` (as var-declared names only) and return ExpressionStatements for
   * the assignments, so variables are function-scoped and accessible across cases.
   * Returns null for declarators that have no initializer.
   */
  function extractHoisted(stmt: t.Statement, hoisted: t.VariableDeclarator[]): t.Statement {
    if (!t.isVariableDeclaration(stmt) || (stmt.kind !== "let" && stmt.kind !== "const")) {
      return t.cloneNode(stmt, true);
    }
    const assignments: t.Expression[] = [];
    for (const decl of stmt.declarations) {
      // Hoist: var name; (or var { a, b };)
      hoisted.push(t.variableDeclarator(t.cloneNode(decl.id, true)));
      if (decl.init) {
        assignments.push(
          t.assignmentExpression(
            "=",
            t.cloneNode(decl.id, true) as t.LVal,
            t.cloneNode(decl.init, true)
          )
        );
      }
    }
    if (assignments.length === 0) return t.emptyStatement();
    if (assignments.length === 1) return t.expressionStatement(assignments[0]);
    return t.expressionStatement(t.sequenceExpression(assignments));
  }

  for (let pass = 0; pass < passes; pass++) {
    traverse(ast, {
      Function(path) {
        if (!t.isBlockStatement(path.node.body)) return;

        const body = path.node.body.body;

        // Skip trivial or already-flattened bodies
        if (body.length <= 1) return;
        if (body.some((s) => t.isSwitchStatement(s))) return;

        const hoisted: t.VariableDeclarator[] = [];

        const cases = body.map((stmt, idx) => {
          const nextState =
            idx === body.length - 1 ? t.numericLiteral(-1) : t.numericLiteral(idx + 1);
          const converted = extractHoisted(stmt, hoisted);

          const caseBody: t.Statement[] = [];
          if (!t.isEmptyStatement(converted)) caseBody.push(converted);
          caseBody.push(
            t.expressionStatement(t.assignmentExpression("=", t.identifier(stateVar), nextState)),
            t.breakStatement()
          );
          return t.switchCase(t.numericLiteral(idx), caseBody);
        });

        // default: return;
        cases.push(t.switchCase(null, [t.returnStatement()]));

        const dispatcher = t.whileStatement(
          t.booleanLiteral(true),
          t.blockStatement([t.switchStatement(t.identifier(stateVar), cases)])
        );

        const prelude: t.Statement[] = [
          t.variableDeclaration("let", [
            t.variableDeclarator(t.identifier(stateVar), t.numericLiteral(0)),
          ]),
        ];
        if (hoisted.length > 0) {
          prelude.push(t.variableDeclaration("var", hoisted));
        }

        path.node.body = t.blockStatement([...prelude, dispatcher]);

        path.skip();
      },
    });
  }
}
