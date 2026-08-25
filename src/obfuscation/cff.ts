import { traverse, t } from "../swc-utils";
import type { SwcProgram } from "../swc-utils";
import type { ControlFlowFlatteningOptions } from "../types";
import { genId } from "../genId";

/**
 * Pass: Control Flow Flattening (CFF)
 *
 * Transforms a function body into a flat state machine with a central
 * dispatcher loop, hiding the original execution order.
 *
 * Before:
 *   function f() { stmt0; stmt1; stmt2; }
 *
 * After (case numbers and initial state are randomly shuffled):
 *   function f() {
 *     let __s = <rand>;          // initial state = stateNums[0] after Fisher-Yates shuffle
 *     while (true) {
 *       switch (__s) {
 *         case <r0>: stmt0; __s = <r1>; break;
 *         case <r1>: stmt1; __s = <r2>; break;
 *         case <r2>: stmt2; __s = -1;  break;
 *         default: return;
 *       }
 *     }
 *   }
 */
export function applyControlFlowFlattening(
  ast: SwcProgram,
  options: ControlFlowFlatteningOptions = {}
): void {
  const passes = options.passes ?? 1;

  /**
   * If `stmt` is a let/const VariableDeclaration, extract the declarators into
   * `hoisted` (as var-declared names only) and return ExpressionStatements for
   * the assignments, so variables are function-scoped and accessible across cases.
   * Returns an EmptyStatement for declarations that have no initializer.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function extractHoisted(stmt: any, hoisted: any[]): any {
    if (!t.isVariableDeclaration(stmt) || (stmt.kind !== "let" && stmt.kind !== "const")) {
      return t.cloneNode(stmt, true);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assignments: any[] = [];
    for (const decl of stmt.declarations) {
      // Hoist: var name; (or var { a, b };)
      hoisted.push(t.variableDeclarator(t.cloneNode(decl.id, true)));
      if (decl.init) {
        assignments.push(
          t.assignmentExpression("=", t.cloneNode(decl.id, true), t.cloneNode(decl.init, true))
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

        // SWC BlockStatement uses .stmts (not .body)
        const body: any[] = path.node.body.stmts; // eslint-disable-line @typescript-eslint/no-explicit-any

        // Skip trivial or already-flattened bodies
        if (body.length <= 1) return;
        if (body.some((s: any) => t.isSwitchStatement(s))) return; // eslint-disable-line @typescript-eslint/no-explicit-any

        // Fresh ID per function per pass — avoids collisions when passes>1
        const stateVar = genId();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hoisted: any[] = [];

        // Fisher-Yates shuffle to assign random case numbers (not sequential)
        const stateNums = Array.from({ length: body.length }, (_, i) => i);
        for (let i = stateNums.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [stateNums[i], stateNums[j]] = [stateNums[j], stateNums[i]];
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cases = body.map((stmt: any, stepIdx: number) => {
          const actualState = stateNums[stepIdx];
          const nextActual = stepIdx === body.length - 1 ? -1 : stateNums[stepIdx + 1];
          const nextState = t.numericLiteral(nextActual);
          const converted = extractHoisted(stmt, hoisted);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const caseBody: any[] = [];
          if (!t.isEmptyStatement(converted)) caseBody.push(converted);
          caseBody.push(
            t.expressionStatement(t.assignmentExpression("=", t.identifier(stateVar), nextState)),
            t.breakStatement()
          );
          return t.switchCase(t.numericLiteral(actualState), caseBody);
        });

        // default: return;
        cases.push(t.switchCase(null, [t.returnStatement()]));

        const dispatcher = t.whileStatement(
          t.booleanLiteral(true),
          t.blockStatement([t.switchStatement(t.identifier(stateVar), cases)])
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prelude: any[] = [
          t.variableDeclaration("let", [
            t.variableDeclarator(t.identifier(stateVar), t.numericLiteral(stateNums[0])),
          ]),
        ];
        if (hoisted.length > 0) {
          prelude.push(t.variableDeclaration("var", hoisted));
        }

        path.node.body = t.functionBody([...prelude, dispatcher]);

        path.skip();
      },
    });
  }
}
