import traverse from "@babel/traverse";
import * as t from "@babel/types";
import type { DeadCodeOptions } from "../types";

/** Generate a random hex identifier that looks like obfuscated code */
function randHexId(): string {
  const a = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, "0");
  const b = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, "0");
  return `_0x${a}${b}`;
}

/** Realistic-looking internal variable name (looks like real utility code) */
const INTERNAL_PREFIXES = [
  "_mask",
  "_shift",
  "_val",
  "_buf",
  "_idx",
  "_key",
  "_hash",
  "_state",
  "_tmp",
  "_acc",
  "_crc",
  "_flag",
];
function randInternalId(): string {
  const p = INTERNAL_PREFIXES[Math.floor(Math.random() * INTERNAL_PREFIXES.length)];
  const n = Math.floor(Math.random() * 0xfff)
    .toString(16)
    .padStart(3, "0");
  return `${p}_${n}`;
}

/** Well-known hash/mixing constants — makes computations look purposeful */
const MIX_CONSTS = [0x9e3779b9, 0x85ebca6b, 0xc2b2ae35, 0xbf58476d, 0x6b3a4ba9];
function pickConst(): number {
  return MIX_CONSTS[Math.floor(Math.random() * MIX_CONSTS.length)];
}

/**
 * Dead code statement templates.
 *
 * Each template produces a block that looks like real processing logic but
 * is provably unreachable. Conditions require multi-step static analysis to
 * verify — they cannot be detected by naive pattern matching alone.
 */
const DEAD_TEMPLATES: (() => t.Statement)[] = [
  // T1: Bitmask computation — condition checks for a value that was never produced
  // { var _mask_XXX = (A & B) ^ C;  if (_mask_XXX === computed+0x1337) { ... } }
  () => {
    const a = Math.floor(Math.random() * 0xffff);
    const b = Math.floor(Math.random() * 0xffff);
    const c = Math.floor(Math.random() * 0xffff);
    const actual = ((a & b) ^ c) | 0;
    const falseTarget = (actual + 0x1337) | 0; // always different from actual
    const id1 = randInternalId();
    const id2 = randInternalId();
    return t.blockStatement([
      t.variableDeclaration("var", [
        t.variableDeclarator(
          t.identifier(id1),
          t.binaryExpression(
            "^",
            t.binaryExpression("&", t.numericLiteral(a), t.numericLiteral(b)),
            t.numericLiteral(c)
          )
        ),
      ]),
      t.ifStatement(
        t.binaryExpression("===", t.identifier(id1), t.numericLiteral(falseTarget)),
        t.blockStatement([
          t.variableDeclaration("var", [
            t.variableDeclarator(
              t.identifier(id2),
              t.binaryExpression(
                "|",
                t.binaryExpression(">>>", t.identifier(id1), t.numericLiteral(16)),
                t.binaryExpression("&", t.identifier(id1), t.numericLiteral(0xffff))
              )
            ),
          ]),
          t.expressionStatement(
            t.assignmentExpression(
              "=",
              t.identifier(id1),
              t.binaryExpression("^", t.identifier(id2), t.numericLiteral(pickConst() & 0xffff))
            )
          ),
        ])
      ),
    ]);
  },

  // T2: Accumulator loop over empty range — stays 0, then guarded as non-zero
  // { var _acc = 0, _i = 0; for (; _i < 0; _i++) { _acc = _acc ^ _i * K; }
  //   if (_acc !== 0) { _acc ^= K2; } }
  () => {
    const k = pickConst();
    const accId = randInternalId();
    const iId = randHexId();
    return t.blockStatement([
      t.variableDeclaration("var", [
        t.variableDeclarator(t.identifier(accId), t.numericLiteral(0)),
        t.variableDeclarator(t.identifier(iId), t.numericLiteral(0)),
      ]),
      t.forStatement(
        null,
        t.binaryExpression("<", t.identifier(iId), t.numericLiteral(0)),
        t.updateExpression("++", t.identifier(iId)),
        t.blockStatement([
          t.expressionStatement(
            t.assignmentExpression(
              "=",
              t.identifier(accId),
              t.binaryExpression(
                ">>>",
                t.binaryExpression(
                  "^",
                  t.identifier(accId),
                  t.binaryExpression("*", t.identifier(iId), t.numericLiteral(k >>> 0))
                ),
                t.numericLiteral(0)
              )
            )
          ),
        ])
      ),
      t.ifStatement(
        t.binaryExpression("!==", t.identifier(accId), t.numericLiteral(0)),
        t.blockStatement([
          t.expressionStatement(
            t.assignmentExpression("^=", t.identifier(accId), t.numericLiteral(k & 0xffff))
          ),
        ])
      ),
    ]);
  },

  // T3: Unsigned shift result checked as negative — (x >>> 0) is always >= 0
  // { var _hash = seed ^ K; _hash ^= _hash >>> 16;
  //   var _u32 = _hash >>> 0; if (_u32 < 0) { ... } }
  () => {
    const seed = Math.floor(Math.random() * 0xffff);
    const kc = pickConst();
    const id1 = randInternalId();
    const id2 = randInternalId();
    const bodyConst = Math.floor(Math.random() * 0xffff);
    return t.blockStatement([
      t.variableDeclaration("var", [
        t.variableDeclarator(
          t.identifier(id1),
          t.binaryExpression("^", t.numericLiteral(seed), t.numericLiteral(kc >>> 0))
        ),
      ]),
      t.expressionStatement(
        t.assignmentExpression(
          "=",
          t.identifier(id1),
          t.binaryExpression(
            "^",
            t.identifier(id1),
            t.binaryExpression(">>>", t.identifier(id1), t.numericLiteral(16))
          )
        )
      ),
      t.variableDeclaration("var", [
        t.variableDeclarator(
          t.identifier(id2),
          t.binaryExpression(">>>", t.identifier(id1), t.numericLiteral(0))
        ),
      ]),
      // (>>> 0) converts to uint32 — result is NEVER < 0
      t.ifStatement(
        t.binaryExpression("<", t.identifier(id2), t.numericLiteral(0)),
        t.blockStatement([
          t.expressionStatement(
            t.assignmentExpression(
              "=",
              t.identifier(id1),
              t.binaryExpression("^", t.identifier(id2), t.numericLiteral(bodyConst))
            )
          ),
        ])
      ),
    ]);
  },

  // T4: n ^ n is always 0 — threshold check never reached
  // { var _flag = (n ^ n) | 0; if ((_flag >>> 1) >= 0x40000000) { ... } }
  () => {
    const n = Math.floor(Math.random() * 0xffff);
    const id = randInternalId();
    return t.blockStatement([
      t.variableDeclaration("var", [
        t.variableDeclarator(
          t.identifier(id),
          t.binaryExpression(
            "|",
            t.binaryExpression("^", t.numericLiteral(n), t.numericLiteral(n)),
            t.numericLiteral(0)
          )
        ),
      ]),
      // 0 >>> 1 = 0, which is never >= 0x40000000
      t.ifStatement(
        t.binaryExpression(
          ">=",
          t.binaryExpression(">>>", t.identifier(id), t.numericLiteral(1)),
          t.numericLiteral(0x40000000)
        ),
        t.blockStatement([
          t.expressionStatement(
            t.assignmentExpression("+=", t.identifier(id), t.numericLiteral(pickConst() & 0xffff))
          ),
        ])
      ),
    ]);
  },

  // T5: try/catch with dead while — ptr (0x7fffffff) is never less than end (0x1fffffff)
  () => {
    const ptrId = randInternalId();
    const endId = randInternalId();
    const k = pickConst() & 0xffff;
    return t.tryStatement(
      t.blockStatement([
        t.variableDeclaration("var", [
          t.variableDeclarator(t.identifier(ptrId), t.numericLiteral(0x7fffffff)),
          t.variableDeclarator(
            t.identifier(endId),
            // 0x7fffffff >>> 2 = 0x1fffffff
            t.binaryExpression(">>>", t.numericLiteral(0x7fffffff), t.numericLiteral(2))
          ),
        ]),
        // 0x7fffffff < 0x1fffffff is always false
        t.whileStatement(
          t.binaryExpression("<", t.identifier(ptrId), t.identifier(endId)),
          t.blockStatement([
            t.expressionStatement(
              t.assignmentExpression(
                "=",
                t.identifier(ptrId),
                t.binaryExpression(
                  "^",
                  t.binaryExpression(">>>", t.identifier(ptrId), t.numericLiteral(1)),
                  t.numericLiteral(k)
                )
              )
            ),
          ])
        ),
      ]),
      t.catchClause(t.identifier("_e"), t.blockStatement([]))
    );
  },

  // T6: switch — value is (base >> shift), cases are base >> shift + 0x100 / 0x200
  // so neither case is ever matched
  () => {
    const base = Math.floor(Math.random() * 0xfe) + 1;
    const shift = (Math.floor(Math.random() * 4) + 4) as 4 | 5 | 6 | 7; // 4-7
    const computed = base >> shift; // small value (0-15)
    const case1 = computed + 0x100;
    const case2 = computed + 0x200;
    const varId = randInternalId();
    const tmpId = randHexId();
    return t.blockStatement([
      t.variableDeclaration("var", [
        t.variableDeclarator(
          t.identifier(varId),
          t.binaryExpression(">>", t.numericLiteral(base), t.numericLiteral(shift))
        ),
      ]),
      t.switchStatement(t.identifier(varId), [
        t.switchCase(t.numericLiteral(case1), [
          t.variableDeclaration("var", [
            t.variableDeclarator(
              t.identifier(tmpId),
              t.binaryExpression("^", t.identifier(varId), t.numericLiteral(pickConst() & 0xffff))
            ),
          ]),
          t.breakStatement(),
        ]),
        t.switchCase(t.numericLiteral(case2), [
          t.expressionStatement(
            t.assignmentExpression("=", t.identifier(varId), t.numericLiteral(0))
          ),
          t.breakStatement(),
        ]),
      ]),
    ]);
  },

  // T7: Named IIFE performing FNV-like hash — result immediately discarded
  // (function _0xXXXX() { var _hash = seed; _hash ^= _hash >>> 16; _hash = (_hash * K) >>> 0; return _hash; })()
  () => {
    const seed = (Math.floor(Math.random() * 0xffffffff) >>> 0) + 1;
    const fnId = randHexId();
    const resId = randInternalId();
    const k = pickConst() >>> 0;
    return t.expressionStatement(
      t.callExpression(
        t.functionExpression(
          t.identifier(fnId),
          [],
          t.blockStatement([
            t.variableDeclaration("var", [
              t.variableDeclarator(t.identifier(resId), t.numericLiteral(seed)),
            ]),
            t.expressionStatement(
              t.assignmentExpression(
                "^=",
                t.identifier(resId),
                t.binaryExpression(">>>", t.identifier(resId), t.numericLiteral(16))
              )
            ),
            t.expressionStatement(
              t.assignmentExpression(
                "=",
                t.identifier(resId),
                t.binaryExpression(
                  ">>>",
                  t.binaryExpression("*", t.identifier(resId), t.numericLiteral(k)),
                  t.numericLiteral(0)
                )
              )
            ),
            t.returnStatement(t.identifier(resId)),
          ])
        ),
        []
      )
    );
  },
];

/**
 * Pass: Dead Code Injection
 *
 * Inserts unreachable/useless code blocks throughout the program body AND
 * inside function bodies to inflate file size and confuse static analysis.
 * Templates use opaque predicates requiring multi-step analysis to refute.
 */
export function applyDeadCode(ast: t.File, options: DeadCodeOptions = {}): void {
  const targetLines = options.targetLines ?? 50;
  const body = ast.program.body as t.Statement[];

  // Phase 1: inject into the top-level program body
  let injected = 0;
  let insertAt = 0;
  while (injected < targetLines && insertAt <= body.length) {
    const template = DEAD_TEMPLATES[Math.floor(Math.random() * DEAD_TEMPLATES.length)];
    body.splice(insertAt, 0, template());
    injected++;
    insertAt += 2; // skip one real statement between injections
  }

  // Phase 2: inject 1-2 dead statements inside each eligible function body
  // This makes dead code appear nested in real logic, not just top-level noise.
  traverse(ast, {
    Function(path) {
      if (!t.isBlockStatement(path.node.body)) return;
      const fnBody = path.node.body.body;
      // Only inject into non-trivial functions
      if (fnBody.length < 2) return;

      const count = Math.floor(Math.random() * 2) + 1; // 1 or 2
      for (let i = 0; i < count; i++) {
        const template = DEAD_TEMPLATES[Math.floor(Math.random() * DEAD_TEMPLATES.length)];
        // Insert near the start (positions 0–2) so it blends with initialization code
        const pos = Math.min(Math.floor(Math.random() * 3), fnBody.length);
        fnBody.splice(pos, 0, template());
      }

      path.skip(); // avoid double-visiting nested functions
    },
  });
}
