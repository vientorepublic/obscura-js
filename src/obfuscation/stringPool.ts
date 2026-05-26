import { traverse, t, type NodePath } from "../swc-utils";
import type { SwcProgram } from "../swc-utils";
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isRequireLikeCall(node: any): boolean {
  if (!t.isCallExpression(node)) return false;
  const callee = node.callee;
  // require("x")
  if (t.isIdentifier(callee) && (callee as any).value === "require") return true; // eslint-disable-line @typescript-eslint/no-explicit-any
  // require.resolve("x"), require.main.require("x"), etc. — check root object is `require`
  if (
    t.isMemberExpression(callee) &&
    t.isIdentifier((callee as any).object) && // eslint-disable-line @typescript-eslint/no-explicit-any
    (callee as any).object.value === "require" // eslint-disable-line @typescript-eslint/no-explicit-any
  )
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
 * After:   __obscura_sp(0, 5, <seed>)
 */
export function applyStringPool(ast: SwcProgram, options: StringPoolOptions = {}): void {
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
  let entryCount = 0; // shared counter for unique seeds across all encrypted strings

  /** Encrypt one string, append to the pool, and return its coordinates. */
  function allocateEntry(str: string): { start: number; len: number; entrySeed: number } {
    const entrySeed = (masterSeed + (entryCount + 1) * 40503) & 0xffff || 1;
    entryCount++;
    const { ciphertext } = encryptString(str, entrySeed);
    const start = allCiphertext.length;
    allCiphertext.push(...ciphertext);
    return { start, len: str.length, entrySeed };
  }

  const replacements: Array<{
    path: NodePath<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    start: number;
    len: number;
    entrySeed: number;
    /** How to inject the replacement call expression into the parent node. */
    kind: "normal" | "computed-key" | "jsx-attr";
  }> = [];

  // Each entry: the TemplateLiteral path + per-quasi pool call info.
  // null means "skip this quasi" (empty string or null cooked value).
  const templateReplacements: Array<{
    path: NodePath<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    quasiCalls: Array<{ start: number; len: number; entrySeed: number } | null>;
  }> = [];

  traverse(ast, {
    StringLiteral(path) {
      // ── must-skip: module specifier strings ───────────────────────────────
      if (
        t.isImportDeclaration(path.parent) || // import ... from "module"
        t.isExportNamedDeclaration(path.parent) || // export { x } from "module" (source)
        t.isExportAllDeclaration(path.parent) || // export * from "module" (source)
        t.isImportSpecifier(path.parent) || // import { "name" as x }  (ES2022)
        t.isExportSpecifier(path.parent) || // export { x as "name" }  (ES2022)
        // dynamic import('./path') — parsed as CallExpression { callee: Import }
        (t.isCallExpression(path.parent) && t.isImport((path.parent as any).callee)) || // eslint-disable-line @typescript-eslint/no-explicit-any
        isRequireLikeCall(path.parent)
      ) {
        return;
      }
      // ── skip empty strings (no ciphertext, no obfuscation value) ──────────
      if (path.node.value === "") return;

      // ── determine replacement context ─────────────────────────────────────
      // Non-computed property/method keys must be flipped to computed before a
      // CallExpression can occupy the key slot without breaking AST validation.
      // JSX attribute values require a JSXExpressionContainer wrapper.
      let kind: "normal" | "computed-key" | "jsx-attr" = "normal";
      if (
        path.key === "key" &&
        !((path.parent as any).key?.type === "Computed") && // eslint-disable-line @typescript-eslint/no-explicit-any
        (t.isObjectProperty(path.parent) ||
          t.isObjectMethod(path.parent) ||
          t.isClassProperty(path.parent) ||
          t.isClassMethod(path.parent) ||
          (path.parent as any).type === "ClassAccessorProperty") // eslint-disable-line @typescript-eslint/no-explicit-any
      ) {
        kind = "computed-key";
      } else if (t.isJSXAttribute(path.parent) && path.key === "value") {
        kind = "jsx-attr";
      }

      const entry = allocateEntry(path.node.value);
      replacements.push({ path, ...entry, kind });
    },

    TemplateLiteral(path) {
      // Tagged templates pass a TemplateStringsArray to the tag function — the
      // quasis must stay intact, so we must not transform them.
      if (t.isTaggedTemplateExpression(path.parent)) return;

      const quasiCalls: Array<{ start: number; len: number; entrySeed: number } | null> = [];
      let hasEncryptedQuasi = false;

      for (const quasi of path.node.quasis) {
        // In SWC, TemplateElement uses .cooked directly (not .value.cooked)
        const cooked = (quasi as any).cooked ?? null; // eslint-disable-line @typescript-eslint/no-explicit-any
        // Skip empty quasis (e.g. the edges of `${x}`) and null cooked values
        if (cooked == null || cooked === "") {
          quasiCalls.push(null);
          continue;
        }
        quasiCalls.push(allocateEntry(cooked));
        hasEncryptedQuasi = true;
      }

      if (!hasEncryptedQuasi) return; // nothing to encrypt in this template
      templateReplacements.push({ path, quasiCalls });
    },
  });

  if (replacements.length === 0 && templateReplacements.length === 0) return;

  // ── Replace StringLiterals with pool decryption calls ────────────────────
  for (const { path, start, len, entrySeed, kind } of replacements) {
    const callExpr = t.callExpression(t.identifier(POOL_FN), [
      t.numericLiteral(start),
      t.numericLiteral(len),
      t.numericLiteral(entrySeed),
    ]);
    if (kind === "computed-key") {
      // Flip to computed: in SWC, set the key to a Computed node
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (path.parent as any).key = {
        type: "Computed",
        expression: callExpr,
        span: { start: 0, end: 0, ctxt: 0 },
      };
    } else if (kind === "jsx-attr") {
      // JSXAttribute.value only accepts StringLiteral | JSXExpressionContainer
      path.replaceWith(t.jsxExpressionContainer(callExpr));
    } else {
      path.replaceWith(callExpr);
    }
  }

  // ── Replace TemplateLiterals with string concatenation ───────────────────
  // `hello ${x} world` → _0xSP(0, 5, s1) + x + _0xSP(5, 6, s2)
  for (const { path, quasiCalls } of templateReplacements) {
    const expressions: any[] = path.node.expressions ?? []; // eslint-disable-line @typescript-eslint/no-explicit-any
    const parts: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any

    // Interleave quasis and expressions: q[0] e[0] q[1] e[1] ... q[n]
    for (let i = 0; i < quasiCalls.length; i++) {
      const call = quasiCalls[i];
      if (call !== null) {
        parts.push(
          t.callExpression(t.identifier(POOL_FN), [
            t.numericLiteral(call.start),
            t.numericLiteral(call.len),
            t.numericLiteral(call.entrySeed),
          ])
        );
      }
      if (i < expressions.length) {
        const expr = expressions[i];
        if (t.isExpression(expr)) parts.push(expr);
      }
    }

    if (parts.length === 0) {
      // Degenerate: all quasis empty and no expressions (e.g. `${}`)
      path.replaceWith(t.stringLiteral(""));
    } else if (parts.length === 1) {
      path.replaceWith(parts[0]);
    } else {
      // Build left-associative binary chain: ((a + b) + c) + d
      let result: any = t.binaryExpression("+", parts[0], parts[1]); // eslint-disable-line @typescript-eslint/no-explicit-any
      for (let k = 2; k < parts.length; k++) {
        result = t.binaryExpression("+", result, parts[k]);
      }
      path.replaceWith(result);
    }
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

  (ast.body as any[]).unshift(decryptFn, poolArray); // eslint-disable-line @typescript-eslint/no-explicit-any
}
