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
 * The runtime helper `__obscura_tag` is prepended to the output:
 *
 *   const __obscura_sym = Symbol('jas');
 *   function __obscura_tag(v, checksum) {
 *     Object.defineProperty(v, __obscura_sym, { value: checksum, enumerable: false });
 *     return v;
 *   }
 *
 * Arrays are replaced by:  __obscura_tag([...], <checksum>)
 */
export function applyIntegrityTag(ast: t.File, options: IntegrityTagOptions = {}): void {
  // Randomize Symbol description when not explicitly provided — avoids a fixed "jas" fingerprint
  const defaultDesc = Math.floor(Math.random() * 0xffffffff)
    .toString(36)
    .slice(0, 6);
  const description = options.tagDescription ?? defaultDesc;
  const symVar = "__obscura_sym";
  const tagFn = "__obscura_tag";

  // Randomized mixing constants for checksum computation
  const K1 = (Math.floor(Math.random() * 0xffff) | 1) >>> 0; // odd, non-zero
  const K2 = (Math.floor(Math.random() * 0xffff) | 1) >>> 0;

  let hasArrays = false;

  traverse(ast, {
    ArrayExpression(path) {
      // Skip if already tagged or inside the helper declarations
      if (t.isCallExpression(path.parent)) return;

      // Multi-step checksum: mix element count with two random constants
      const len = path.node.elements.length;
      const checksum = (((len ^ K1) * K2) ^ (K1 >>> 3)) >>> 0;
      path.replaceWith(
        t.callExpression(t.identifier(tagFn), [
          t.cloneNode(path.node, true),
          t.numericLiteral(checksum),
        ])
      );
      hasArrays = true;
    },
  });

  if (!hasArrays) return;

  // const __obscura_sym = Symbol('jas');
  const symDecl = t.variableDeclaration("const", [
    t.variableDeclarator(
      t.identifier(symVar),
      t.callExpression(t.identifier("Symbol"), [t.stringLiteral(description)])
    ),
  ]);

  // function __obscura_tag(v, checksum) {
  //   Object.defineProperty(v, __obscura_sym, { value: checksum, enumerable: false });
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
