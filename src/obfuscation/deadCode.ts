import * as t from "@babel/types";
import type { DeadCodeOptions } from "../types";

/** Dead code expression templates */
const DEAD_TEMPLATES: (() => t.Statement)[] = [
  () =>
    t.ifStatement(
      t.binaryExpression("===", t.numericLiteral(0), t.numericLiteral(1)),
      t.blockStatement([
        t.expressionStatement(t.callExpression(t.memberExpression(t.identifier("console"), t.identifier("log")), [t.stringLiteral("unreachable")])),
      ]),
    ),
  () => t.whileStatement(t.booleanLiteral(false), t.blockStatement([t.expressionStatement(t.numericLiteral(Math.floor(Math.random() * 0xffff)))])),
  () =>
    t.variableDeclaration("var", [
      t.variableDeclarator(
        t.identifier(`__dead_${Math.floor(Math.random() * 0xffff).toString(16)}`),
        t.binaryExpression("&", t.numericLiteral(Math.floor(Math.random() * 0xff)), t.numericLiteral(0)),
      ),
    ]),
];

/**
 * Pass: Dead Code Injection
 *
 * Inserts unreachable/useless code blocks throughout the program body to
 * inflate file size and confuse static analysis tools.
 */
export function applyDeadCode(ast: t.File, options: DeadCodeOptions = {}): void {
  const targetLines = options.targetLines ?? 50;
  const body = ast.program.body as t.Statement[];

  let injected = 0;
  let insertAt = 0;

  while (injected < targetLines && insertAt <= body.length) {
    const template = DEAD_TEMPLATES[injected % DEAD_TEMPLATES.length];
    body.splice(insertAt, 0, template());
    injected++;
    insertAt += 2; // skip one real statement between injections
  }
}
