import { traverse, t } from "../swc-utils";
import { parseSync } from "@swc/core";
import type { SwcProgram } from "../swc-utils";
import type { IntegrityTagOptions } from "../types";
import { genId } from "../genId";

/**
 * Pass: Symbol-based Integrity Tag
 *
 * Wraps every array (and optionally object) literal with a verify+tag pair:
 *
 *   _0xVerify(_0xTag([...], checksum, kind))
 *
 * Three checksum kinds:
 *   0 — length-based array  (mixed/non-literal elements)
 *   1 — content-based array (all elements are scalar literals)
 *   2 — property-count-based object
 *
 * At creation time _0xVerify checks that Object.defineProperty successfully
 * attached the Symbol, catching Symbol/defineProperty override attacks.
 * The emitted _0xVerify function is also available for explicit post-creation
 * verification elsewhere in the obfuscated output.
 */

/** Returns true when all array elements are scalar literals (no spreads). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isPureLiteralArray(elements: any[]): boolean {
  return elements.every((el: any) => {
    if (el === null) return true; // sparse hole
    if (el.spread) return false; // spread element
    const expr = el.expression ?? el;
    return (
      expr.type === "NumericLiteral" ||
      expr.type === "BooleanLiteral" ||
      expr.type === "StringLiteral" ||
      expr.type === "NullLiteral"
    );
  });
}

/**
 * Content checksum for pure-literal arrays.
 * Must stay in sync with the runtime formula emitted inside _0xVerify.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function contentChecksum(elements: any[], K1: number, K2: number): number {
  let acc = K1;
  for (const el of elements) {
    const expr = el?.expression ?? el ?? null;
    let val: number;
    if (!expr || expr.type === "NullLiteral") {
      val = 0;
    } else if (expr.type === "NumericLiteral") {
      val = (expr.value & 0xffff) >>> 0;
    } else if (expr.type === "BooleanLiteral") {
      val = expr.value ? 1 : 0;
    } else if (expr.type === "StringLiteral") {
      val = expr.value.charCodeAt(0) & 0xffff;
    } else {
      val = 0;
    }
    acc = (((acc ^ val) * K2) ^ (acc >>> 3)) >>> 0;
  }
  return (((acc ^ K1) * K2) ^ (K1 >>> 3)) >>> 0;
}

/** Length / property-count checksum for arrays and objects. */
function lengthChecksum(len: number, K1: number, K2: number): number {
  return (((len ^ K1) * K2) ^ (K1 >>> 3)) >>> 0;
}

export function applyIntegrityTag(ast: SwcProgram, options: IntegrityTagOptions = {}): void {
  const defaultDesc = Math.floor(Math.random() * 0xffffffff)
    .toString(36)
    .slice(0, 6);
  const description = options.tagDescription ?? defaultDesc;
  const tagObjects = options.tagObjects !== false; // default: true
  const symVar = genId();
  const tagFn = genId();
  const verifyFn = genId();

  const K1 = (Math.floor(Math.random() * 0xffff) | 1) >>> 0;
  const K2 = (Math.floor(Math.random() * 0xffff) | 1) >>> 0;

  let hasTaggable = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function isInsideTagFn(parent: any): boolean {
    return (
      t.isCallExpression(parent) &&
      t.isIdentifier((parent as any).callee) && // eslint-disable-line @typescript-eslint/no-explicit-any
      (parent as any).callee.value === tagFn // eslint-disable-line @typescript-eslint/no-explicit-any
    );
  }

  /** Emit _0xVerify(_0xTag(cloned, checksum, kind)) in place of path.node. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function emitTagged(path: any, checksum: number, kind: number): void {
    path.replaceWith(
      t.callExpression(t.identifier(verifyFn), [
        t.callExpression(t.identifier(tagFn), [
          t.cloneNode(path.node, true),
          t.numericLiteral(checksum),
          t.numericLiteral(kind),
        ]),
      ])
    );
    hasTaggable = true;
  }

  traverse(ast, {
    ArrayExpression(path) {
      if (isInsideTagFn(path.parent)) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const elements = path.node.elements as any[];
      const pure = isPureLiteralArray(elements);
      const checksum = pure
        ? contentChecksum(elements, K1, K2)
        : lengthChecksum(elements.length, K1, K2);
      emitTagged(path, checksum, pure ? 1 : 0);
    },

    ObjectExpression(path) {
      if (!tagObjects) return;
      if (isInsideTagFn(path.parent)) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const properties = (path.node as any).properties as any[];
      // Skip objects with spread elements — runtime key count would differ
      if (properties.some((p: any) => p.type === "SpreadElement")) return; // eslint-disable-line @typescript-eslint/no-explicit-any

      const checksum = lengthChecksum(properties.length, K1, K2);
      emitTagged(path, checksum, 2);
    },
  });

  if (!hasTaggable) return;

  // ── Emit helpers via source parse ─────────────────────────────────────────
  // Simpler and less error-prone than manual SWC AST construction.
  // K1, K2 are embedded as numeric literals; symVar/tagFn/verifyFn as identifiers.

  const symSrc = `const ${symVar} = Symbol(${JSON.stringify(description)});`;

  const tagSrc = `function ${tagFn}(v, checksum, kind) {
    Object.defineProperty(v, ${symVar}, {
      value: [checksum, kind],
      enumerable: false,
      configurable: false,
      writable: false
    });
    return v;
  }`;

  // _0xVerify recomputes the stored checksum from live state and corrupts the
  // structure if the tag is absent or the checksum mismatches.
  // kind 0 = length array, 1 = content array, 2 = property-count object.
  const verifySrc = `function ${verifyFn}(v) {
    var _tag = v[${symVar}];
    if (_tag === undefined || _tag === null) {
      if (Array.isArray(v)) {
        for (var _ci = 0; _ci < v.length; _ci++) v[_ci] = 0;
      } else {
        var _ck = Object.keys(v);
        for (var _cj = 0; _cj < _ck.length; _cj++) delete v[_ck[_cj]];
      }
      return v;
    }
    var _cs = _tag[0]; var _kind = _tag[1]; var _expected;
    if (_kind === 1) {
      var _acc = ${K1};
      for (var _vi = 0; _vi < v.length; _vi++) {
        var _el = v[_vi];
        var _val = typeof _el === 'number' ? (_el & 0xffff) >>> 0
          : typeof _el === 'boolean' ? (_el ? 1 : 0)
          : typeof _el === 'string' ? _el.charCodeAt(0) & 0xffff : 0;
        _acc = (((_acc ^ _val) * ${K2}) ^ (_acc >>> 3)) >>> 0;
      }
      _expected = (((_acc ^ ${K1}) * ${K2}) ^ (${K1} >>> 3)) >>> 0;
    } else if (_kind === 2) {
      var _len = Object.keys(v).length;
      _expected = (((_len ^ ${K1}) * ${K2}) ^ (${K1} >>> 3)) >>> 0;
    } else {
      _expected = (((v.length ^ ${K1}) * ${K2}) ^ (${K1} >>> 3)) >>> 0;
    }
    if (_cs !== _expected) {
      if (Array.isArray(v)) {
        for (var _di = 0; _di < v.length; _di++) v[_di] = 0;
      } else {
        var _dk = Object.keys(v);
        for (var _dj = 0; _dj < _dk.length; _dj++) delete v[_dk[_dj]];
      }
    }
    return v;
  }`;

  const symDecl = (parseSync(symSrc, { syntax: "ecmascript" }) as unknown as SwcProgram).body[0];
  const tagDecl = (parseSync(tagSrc, { syntax: "ecmascript" }) as unknown as SwcProgram).body[0];
  const verifyDecl = (parseSync(verifySrc, { syntax: "ecmascript" }) as unknown as SwcProgram)
    .body[0];

  // tagFn and verifyFn are function declarations (hoisted). symVar (const) is
  // placed at body[2] so it is initialized before any tagged value is created.
  (ast.body as any[]).unshift(tagDecl, verifyDecl, symDecl); // eslint-disable-line @typescript-eslint/no-explicit-any
}
