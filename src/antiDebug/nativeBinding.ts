import { t } from "../swc-utils";
import type { SwcProgram } from "../swc-utils";
import type { NativeBindingOptions } from "../types";
import { genId } from "../genId";

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
 *   const __obscura_Math_floor = Math.floor.bind(Math);
 *   const __obscura_Math_random = Math.random.bind(Math);
 */
export function applyNativeBinding(ast: SwcProgram, options: NativeBindingOptions = {}): void {
  const methods = options.methods ?? DEFAULT_METHODS;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const declarations: any[] = methods.map((methodPath) => {
    const parts = methodPath.split(".");
    // receiver is the object before the last segment (e.g. Math for Math.floor)
    const receiverPath = parts.slice(0, -1).join(".");
    const constName = genId();

    // Build member expression: Math.floor
    let obj: any = t.identifier(parts[0]); // eslint-disable-line @typescript-eslint/no-explicit-any
    for (let i = 1; i < parts.length; i++) {
      obj = t.memberExpression(obj, t.identifier(parts[i]));
    }

    // receiver expression (e.g. Math, Array.prototype)
    let receiver: any = t.identifier(parts[0]); // eslint-disable-line @typescript-eslint/no-explicit-any
    for (let i = 1; i < parts.length - 1; i++) {
      receiver = t.memberExpression(receiver, t.identifier(parts[i]));
    }

    void receiverPath;

    // <method>.bind(<receiver>)
    const bindCall = t.callExpression(t.memberExpression(obj, t.identifier("bind")), [receiver]);

    return t.variableDeclaration("const", [
      t.variableDeclarator(t.identifier(constName), bindCall),
    ]);
  });

  (ast.body as any[]).unshift(...declarations); // eslint-disable-line @typescript-eslint/no-explicit-any
}
