import traverse from "@babel/traverse";
import * as t from "@babel/types";
import type { IntegrityTagOptions } from "../types";

/**
 * Pass: Symbol-based Integrity Tag
 *
 * Attaches a `Symbol(<description>)` integrity check value to every
 * array/object literal in the AST.  At runtime, code can verify the
 * symbol is present to detect tampering (cloning, serialisation, etc.).
 *
 * The runtime helper `__haze_tag` is prepended to the output:
 *
 *   const __haze_sym = Symbol('jas');
 *   function __haze_tag(v, checksum) {
 *     Object.defineProperty(v, __haze_sym, { value: checksum, enumerable: false });
 *     return v;
 *   }
 *
 * Arrays are replaced by:  __haze_tag([...], <checksum>)
 */
export function applyIntegrityTag(ast: t.File, options: IntegrityTagOptions = {}): void {
  const description = options.tagDescription ?? "jas";
  const symVar = "__haze_sym";
  const tagFn = "__haze_tag";

  let hasArrays = false;

  traverse(ast, {
    ArrayExpression(path) {
      // Skip if already tagged or inside the helper declarations
      if (t.isCallExpression(path.parent)) return;

      const checksum = path.node.elements.length ^ 0xdeadbeef;
      path.replaceWith(
        t.callExpression(t.identifier(tagFn), [
          t.cloneNode(path.node, true),
          t.numericLiteral(checksum >>> 0),
        ])
      );
      hasArrays = true;
    },
  });

  if (!hasArrays) return;

  // const __haze_sym = Symbol('jas');
  const symDecl = t.variableDeclaration("const", [
    t.variableDeclarator(
      t.identifier(symVar),
      t.callExpression(t.identifier("Symbol"), [t.stringLiteral(description)])
    ),
  ]);

  // function __haze_tag(v, checksum) {
  //   Object.defineProperty(v, __haze_sym, { value: checksum, enumerable: false });
  //   return v;
  // }
  const tagDecl = t.functionDeclaration(
    t.identifier(tagFn),
    [t.identifier("v"), t.identifier("checksum")],
    t.blockStatement([
      t.expressionStatement(
        t.callExpression(
          t.memberExpression(t.identifier("Object"), t.identifier("defineProperty")),
          [
            t.identifier("v"),
            t.identifier(symVar),
            t.objectExpression([
              t.objectProperty(t.identifier("value"), t.identifier("checksum")),
              t.objectProperty(t.identifier("enumerable"), t.booleanLiteral(false)),
            ]),
          ]
        )
      ),
      t.returnStatement(t.identifier("v")),
    ])
  );

  (ast.program.body as t.Statement[]).unshift(tagDecl, symDecl);
}
