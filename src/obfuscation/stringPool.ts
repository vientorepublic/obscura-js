import traverse, { type NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import type { StringPoolOptions } from "../types";
import { genId } from "../genId";

/**
 * XOR-based LCG string encryption matching reCAPTCHA's encrypted string pool.
 * Each character depends on all previous characters (running key accumulation).
 */
function encryptString(str: string, seed: number): { ciphertext: number[]; seed: number } {
  let key = seed;
  const ciphertext: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const cp = str.charCodeAt(i); // UTF-16 code unit — correct for surrogate pairs
    const encrypted = (cp ^ key) & 0xffff;
    ciphertext.push(encrypted);
    key = (key + encrypted) & 0xffff;
  }
  return { ciphertext, seed };
}

/**
 * Returns true for require("x"), require.resolve("x"), require.main.require("x"), etc.
 * These strings must be preserved for static analysis tools and bundlers.
 */
function isRequireLikeCall(node: t.Node): boolean {
  if (!t.isCallExpression(node)) return false;
  const callee = node.callee;
  // require("x")
  if (t.isIdentifier(callee, { name: "require" })) return true;
  // require.resolve("x"), require.main.require("x"), etc. — check root object is `require`
  if (t.isMemberExpression(callee) && t.isIdentifier(callee.object, { name: "require" }))
    return true;
  return false;
}

/**
 * Pass: Encrypted String Pool
 *
 * Moves all string literals into an encrypted pool and replaces each
 * occurrence with a runtime decryption call, mirroring the LCG-XOR approach
 * used in Google reCAPTCHA's string obfuscation.
 *
 * Before:  "hello"
 * After:   __obscura_sp(0, 4, <seed>)
 */
export function applyStringPool(ast: t.File, options: StringPoolOptions = {}): void {
  // Per-call random identifiers — indistinguishable from dead-code variables.
  const POOL_FN = genId();
  const POOL_VAR = genId();

  // Normalize to 1..0xffff — the effective XOR key must never be zero,
  // and seeds above 0xffff carry no extra entropy (only lower 16 bits matter).
  const masterSeed =
    options.seed !== undefined
      ? options.seed & 0xffff || 1
      : Math.floor(Math.random() * 0xffff) + 1;

  const allCiphertext: number[] = [];

  const replacements: Array<{
    path: NodePath<t.StringLiteral>;
    start: number;
    len: number;
    entrySeed: number;
  }> = [];

  traverse(ast, {
    StringLiteral(path) {
      // Skip import/export specifiers and all require-family calls
      if (
        t.isImportDeclaration(path.parent) ||
        t.isExportDeclaration(path.parent) ||
        isRequireLikeCall(path.parent)
      ) {
        return;
      }
      // Derive a unique per-entry seed so that identical strings at different
      // call sites produce distinct ciphertext, hiding their equality.
      const entryIndex = replacements.length;
      const entrySeed = (masterSeed + (entryIndex + 1) * 40503) & 0xffff || 1;

      const { ciphertext } = encryptString(path.node.value, entrySeed);
      const start = allCiphertext.length;
      allCiphertext.push(...ciphertext);
      replacements.push({ path, start, len: path.node.value.length, entrySeed });
    },
  });

  if (replacements.length === 0) return;

  // Replace string literals with __obscura_sp(start, len, entrySeed) calls
  for (const { path, start, len, entrySeed } of replacements) {
    path.replaceWith(
      t.callExpression(t.identifier(POOL_FN), [
        t.numericLiteral(start),
        t.numericLiteral(len),
        t.numericLiteral(entrySeed),
      ])
    );
  }

  // Prepend the pool array and decryption function
  const poolArray = t.variableDeclaration("const", [
    t.variableDeclarator(
      t.identifier(POOL_VAR),
      t.arrayExpression(allCiphertext.map((b) => t.numericLiteral(b)))
    ),
  ]);

  // Decryption function (name is randomised per call):
  const decryptFn = t.functionDeclaration(
    t.identifier(POOL_FN),
    [t.identifier("start"), t.identifier("len"), t.identifier("seed")],
    t.blockStatement([
      t.variableDeclaration("let", [
        t.variableDeclarator(t.identifier("key"), t.identifier("seed")),
        t.variableDeclarator(t.identifier("out"), t.stringLiteral("")),
      ]),
      t.forStatement(
        t.variableDeclaration("let", [
          t.variableDeclarator(t.identifier("i"), t.numericLiteral(0)),
        ]),
        t.binaryExpression("<", t.identifier("i"), t.identifier("len")),
        t.updateExpression("++", t.identifier("i")),
        t.blockStatement([
          t.variableDeclaration("const", [
            t.variableDeclarator(
              t.identifier("b"),
              t.binaryExpression(
                "&",
                t.binaryExpression(
                  "^",
                  t.memberExpression(
                    t.identifier(POOL_VAR),
                    t.binaryExpression("+", t.identifier("start"), t.identifier("i")),
                    true
                  ),
                  t.identifier("key")
                ),
                t.numericLiteral(0xffff)
              )
            ),
          ]),
          t.expressionStatement(
            t.assignmentExpression(
              "+=",
              t.identifier("out"),
              t.callExpression(
                t.memberExpression(t.identifier("String"), t.identifier("fromCharCode")),
                [t.identifier("b")]
              )
            )
          ),
          t.expressionStatement(
            t.assignmentExpression(
              "=",
              t.identifier("key"),
              t.binaryExpression(
                "&",
                t.binaryExpression(
                  "+",
                  t.identifier("key"),
                  t.memberExpression(
                    t.identifier(POOL_VAR),
                    t.binaryExpression("+", t.identifier("start"), t.identifier("i")),
                    true
                  )
                ),
                t.numericLiteral(0xffff)
              )
            )
          ),
        ])
      ),
      t.returnStatement(t.identifier("out")),
    ])
  );

  (ast.program.body as t.Statement[]).unshift(decryptFn, poolArray);
}
