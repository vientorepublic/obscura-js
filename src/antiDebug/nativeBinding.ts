import * as t from "@babel/types";
import type { NativeBindingOptions } from "../types";

/** Default set of native methods to pre-bind */
const DEFAULT_METHODS = [
  "Math.floor",
  "Math.random",
  "Math.ceil",
  "Math.round",
  "Object.defineProperty",
  "Object.keys",
  "Array.prototype.slice",
  "Array.prototype.forEach",
];

/**
 * Pass: Native Method Binding
 *
 * Pre-binds native browser/Node.js methods to their original receivers and
 * stores them as constants.  External scripts that monkey-patch prototypes
 * cannot affect these captured references.
 *
 * Example output:
 *   const __haze_Math_floor = Math.floor.bind(Math);
 *   const __haze_Math_random = Math.random.bind(Math);
 */
export function applyNativeBinding(ast: t.File, options: NativeBindingOptions = {}): void {
  const methods = options.methods ?? DEFAULT_METHODS;

  const declarations: t.VariableDeclaration[] = methods.map((methodPath) => {
    const parts = methodPath.split(".");
    // receiver is the object before the last segment (e.g. Math for Math.floor)
    const receiverPath = parts.slice(0, -1).join(".");
    const constName = `__haze_${parts.join("_")}`;

    // Build member expression: Math.floor
    const memberExpr = parts.reduce<t.Expression>((acc, part) => t.memberExpression(acc, t.identifier(part)), t.identifier(parts[0]));
    // Actually rebuild correctly:
    let obj: t.Expression = t.identifier(parts[0]);
    for (let i = 1; i < parts.length; i++) {
      obj = t.memberExpression(obj, t.identifier(parts[i]));
    }

    // receiver expression (e.g. Math, Array.prototype)
    let receiver: t.Expression = t.identifier(parts[0]);
    for (let i = 1; i < parts.length - 1; i++) {
      receiver = t.memberExpression(receiver, t.identifier(parts[i]));
    }

    void memberExpr; // suppress unused warning — we use `obj` instead
    void receiverPath;

    // <method>.bind(<receiver>)
    const bindCall = t.callExpression(t.memberExpression(obj, t.identifier("bind")), [receiver]);

    return t.variableDeclaration("const", [t.variableDeclarator(t.identifier(constName), bindCall)]);
  });

  (ast.program.body as t.Statement[]).unshift(...declarations);
}
