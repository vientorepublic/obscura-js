import traverse, { type NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import type { StringPoolOptions } from "../types";

const POOL_FN = "__haze_sp";
const POOL_VAR = "__haze_pool";

/**
 * XOR-based LCG string encryption matching reCAPTCHA's encrypted string pool.
 * Each character depends on all previous characters (running key accumulation).
 */
function encryptString(str: string, seed: number): { ciphertext: number[]; seed: number } {
  let key = seed;
  const ciphertext: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const cp = str.codePointAt(i) ?? 0;
    const encrypted = (cp ^ key) & 0x7f;
    ciphertext.push(encrypted);
    key = (key + encrypted) & 0x7f;
  }
  return { ciphertext, seed };
}

/**
 * Pass: Encrypted String Pool
 *
 * Moves all string literals into an encrypted pool and replaces each
 * occurrence with a runtime decryption call, mirroring the LCG-XOR approach
 * used in Google reCAPTCHA's string obfuscation.
 *
 * Before:  "hello"
 * After:   __haze_sp(0, 4, <seed>)
 */
export function applyStringPool(ast: t.File, options: StringPoolOptions = {}): void {
  const seed = options.seed ?? 42;

  const entries: { start: number; len: number; seed: number }[] = [];
  const allCiphertext: number[] = [];
  const literalToIndex = new Map<string, number>();

  function getOrAdd(str: string): { start: number; len: number } {
    if (literalToIndex.has(str)) {
      return entries[literalToIndex.get(str)!];
    }
    const { ciphertext } = encryptString(str, seed);
    const start = allCiphertext.length;
    allCiphertext.push(...ciphertext);
    const entry = { start, len: str.length, seed };
    literalToIndex.set(str, entries.length);
    entries.push(entry);
    return entry;
  }

  const replacements: Array<{
    path: NodePath<t.StringLiteral>;
    entry: { start: number; len: number };
  }> = [];

  traverse(ast, {
    StringLiteral(path) {
      // Skip import/export specifiers and require calls
      if (
        t.isImportDeclaration(path.parent) ||
        t.isExportDeclaration(path.parent) ||
        (t.isCallExpression(path.parent) &&
          t.isIdentifier((path.parent as t.CallExpression).callee, { name: "require" }))
      ) {
        return;
      }
      const entry = getOrAdd(path.node.value);
      replacements.push({ path, entry });
    },
  });

  if (entries.length === 0) return;

  // Replace string literals with __haze_sp(start, len, seed) calls
  for (const { path, entry } of replacements) {
    path.replaceWith(
      t.callExpression(t.identifier(POOL_FN), [
        t.numericLiteral(entry.start),
        t.numericLiteral(entry.len),
        t.numericLiteral(seed),
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

  // Decryption function:
  // function __haze_sp(start, len, seed) {
  //   let key = seed, out = '';
  //   for (let i = 0; i < len; i++) {
  //     const b = (__haze_pool[start + i] ^ key) & 0x7f;
  //     out += String.fromCodePoint(b);
  //     key = (key + b) & 0x7f;
  //   }
  //   return out;
  // }
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
                t.numericLiteral(0x7f)
              )
            ),
          ]),
          t.expressionStatement(
            t.assignmentExpression(
              "+=",
              t.identifier("out"),
              t.callExpression(
                t.memberExpression(t.identifier("String"), t.identifier("fromCodePoint")),
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
                t.numericLiteral(0x7f)
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
