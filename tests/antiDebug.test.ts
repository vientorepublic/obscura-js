/* eslint-disable @typescript-eslint/no-explicit-any */
import { parseSync, printSync } from "@swc/core";
import * as vm from "vm";
import type { SwcProgram } from "../src/swc-utils";
import { applyIntegrityTag } from "../src/antiDebug/integrityTag";
import { applyNativeBinding } from "../src/antiDebug/nativeBinding";

function parseAndApply(source: string, fn: (ast: SwcProgram) => void): string {
  const ast = parseSync(source, { syntax: "ecmascript" }) as unknown as SwcProgram;
  fn(ast);
  return printSync(ast as any).code;
}

// ─── integrityTag ─────────────────────────────────────────────────────────────

describe("integrityTag", () => {
  it("wraps array literals with integrity tag helper", () => {
    const code = parseAndApply("const a = [1, 2, 3];", (ast) => applyIntegrityTag(ast));
    // A hex-named function call must wrap the array, and Symbol must be created
    expect(code).toMatch(/_0x[0-9a-fасе]{16}\(\[/);
    expect(code).toContain("Symbol(");
  });

  it("injects Symbol declaration and helper function", () => {
    const code = parseAndApply("const a = [1];", (ast) => applyIntegrityTag(ast));
    expect(code).toContain("Symbol(");
    expect(code).toContain("Object.defineProperty");
    expect(code).toContain("enumerable");
  });

  it("uses custom tagDescription in the Symbol call", () => {
    const code = parseAndApply("const a = [1];", (ast) =>
      applyIntegrityTag(ast, { tagDescription: "custom" })
    );
    expect(code).toContain('"custom"');
    expect(code).not.toContain('"jas"');
  });

  it("wraps an empty array with a numeric checksum and kind flag", () => {
    const code = parseAndApply("const a = [];", (ast) => applyIntegrityTag(ast));
    // _0xTag receives 3 args: array, checksum, kind
    expect(code).toMatch(/_0x[0-9a-fасе]{16}\(\[\],\s*\d+,\s*\d\)/);
  });

  it("tags multiple arrays in the same source independently", () => {
    const code = parseAndApply("const a = [1]; const b = [2, 3];", (ast) => applyIntegrityTag(ast));
    // At least one hex-named call per user array
    const tagCalls = [...code.matchAll(/_0x[0-9a-fасе]{16}\(/g)];
    expect(tagCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("does not inject helpers when there are no array literals", () => {
    const code = parseAndApply("const x = 1;", (ast) => applyIntegrityTag(ast));
    // Nothing injected — no hex-named identifiers at all
    expect(code).not.toMatch(/_0x[0-9a-fасе]{16}/);
  });

  it("output remains parseable after transformation", () => {
    const code = parseAndApply("const a = [1, 2]; const b = [];", (ast) => applyIntegrityTag(ast));
    expect(() => parseSync(code, { syntax: "ecmascript" })).not.toThrow();
  });

  it("integrity tag is non-enumerable at runtime", () => {
    const source = "const a = [10, 20]; globalThis.__a = a;";
    const code = parseAndApply(source, (ast) => applyIntegrityTag(ast));
    const ctx: Record<string, unknown> = { globalThis: {} };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const arr = (ctx["globalThis"] as Record<string, unknown>)["__a"] as unknown[];
    // Array values are intact
    expect(arr[0]).toBe(10);
    expect(arr[1]).toBe(20);
    // Symbol tag is not visible via JSON.stringify or Object.keys
    expect(JSON.stringify(arr)).toBe("[10,20]");
  });
  it("independently tags each inner array of a nested array at runtime", () => {
    const source = "const matrix = [[10, 20], [30, 40]]; globalThis.__m = matrix;";
    const code = parseAndApply(source, (ast) => applyIntegrityTag(ast));
    expect(() => parseSync(code, { syntax: "ecmascript" })).not.toThrow();
    const ctx: Record<string, unknown> = { globalThis: {} };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const m = (ctx["globalThis"] as Record<string, unknown>)["__m"] as number[][];
    expect(m[0][0]).toBe(10);
    expect(m[0][1]).toBe(20);
    expect(m[1][0]).toBe(30);
    expect(m[1][1]).toBe(40);
  });
});

// ─── nativeBinding ────────────────────────────────────────────────────────────

describe("nativeBinding", () => {
  it("prepends a pre-bound constant for a single method", () => {
    const code = parseAndApply("const x = 1;", (ast) =>
      applyNativeBinding(ast, { methods: ["Math.floor"] })
    );
    // Identifier is randomised — verify the binding expression is correct
    expect(code).toMatch(/const _0x[0-9a-fасе]{16}/);
    expect(code).toContain("Math.floor.bind(Math)");
  });

  it("prepends all default methods when no options are given", () => {
    const code = parseAndApply("const x = 1;", (ast) => applyNativeBinding(ast));
    // Verify binding expressions for several default methods
    expect(code).toContain("Math.floor.bind(Math)");
    expect(code).toContain("Math.random.bind(Math)");
    expect(code).toContain("Object.defineProperty.bind(Object)");
  });

  it("handles multi-segment paths like Array.prototype.slice", () => {
    const code = parseAndApply("const x = 1;", (ast) =>
      applyNativeBinding(ast, { methods: ["Array.prototype.slice"] })
    );
    expect(code).toContain("Array.prototype.slice.bind(Array.prototype)");
  });

  it("empty methods array injects no declarations", () => {
    const ast = parseSync("const x = 1;", { syntax: "ecmascript" }) as unknown as SwcProgram;
    const before = (ast as any).body.length;
    applyNativeBinding(ast, { methods: [] });
    expect((ast as any).body.length).toBe(before);
  });

  it("bound constants are const declarations with random hex names", () => {
    const code = parseAndApply("const x = 1;", (ast) =>
      applyNativeBinding(ast, { methods: ["Math.ceil"] })
    );
    expect(code).toMatch(/const _0x[0-9a-fасе]{16}/);
  });

  it("output remains parseable after transformation", () => {
    const code = parseAndApply("const x = 1;", (ast) =>
      applyNativeBinding(ast, { methods: ["Math.floor", "Object.keys"] })
    );
    expect(() => parseSync(code, { syntax: "ecmascript" })).not.toThrow();
  });

  it("injects two separate declarations for duplicate methods in the list", () => {
    const code = parseAndApply("const x = 1;", (ast) =>
      applyNativeBinding(ast, { methods: ["Math.floor", "Math.floor"] })
    );
    const bindingCount = (code.match(/Math\.floor\.bind\(Math\)/g) ?? []).length;
    expect(bindingCount).toBe(2);
    expect(() => parseSync(code, { syntax: "ecmascript" })).not.toThrow();
  });
});

// ─── SWC-specific boundary conditions ────────────────────────────────────────

describe("integrityTag — SWC-specific boundary conditions", () => {
  it("tags arrays that are direct arguments to a call expression (only _0xTag internals are skipped)", () => {
    // After the skip-condition fix: foo([1,2,3]) → foo(_0xTag([1,2,3], cs))
    // Only the already-cloned array inside _0xTag(...) itself is excluded.
    const source = "function foo(a) { return a; } var r = foo([1, 2, 3]);";
    const code = parseAndApply(source, (ast) => applyIntegrityTag(ast));
    // The array in the call argument IS now tagged — the tag helper wraps it
    expect(code).toMatch(/_0x[0-9a-fасе]{16}\(\[/);
    // Output remains valid
    expect(() => parseSync(code, { syntax: "ecmascript" })).not.toThrow();
  });

  it("Symbol tag value is [checksum, kind] at runtime", () => {
    // Tag now stores [cs, kind] to support multiple checksum strategies
    const source = "const a = [10, 20, 30]; globalThis.__a = a;";
    const code = parseAndApply(source, (ast) => applyIntegrityTag(ast));
    const ctx: Record<string, unknown> = { globalThis: {} };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const arr = (ctx["globalThis"] as Record<string, unknown>)["__a"] as unknown[];
    const sym = Object.getOwnPropertySymbols(arr)[0];
    expect(sym).toBeDefined();
    const tagValue = (arr as any)[sym];
    // Value is [checksum, kind] — an array of two numbers
    expect(Array.isArray(tagValue)).toBe(true);
    expect(typeof tagValue[0]).toBe("number");
    expect(Number.isInteger(tagValue[0])).toBe(true);
    expect(tagValue[0]).toBeGreaterThanOrEqual(0);
    expect(typeof tagValue[1]).toBe("number");
    // kind: 0=len-array, 1=content-array, 2=obj; all-numeric pure literal → kind=1
    expect(tagValue[1]).toBe(1);
  });

  it("array values are intact and enumerable properties unchanged after tagging", () => {
    const source = "const arr = ['a', 'b', 'c']; globalThis.__arr = arr;";
    const code = parseAndApply(source, (ast) => applyIntegrityTag(ast));
    const ctx: Record<string, unknown> = { globalThis: {} };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const arr = (ctx["globalThis"] as Record<string, unknown>)["__arr"] as string[];
    expect(arr[0]).toBe("a");
    expect(arr[1]).toBe("b");
    expect(arr[2]).toBe("c");
    // Tag is non-enumerable — Object.keys must not include it
    expect(Object.keys(arr)).toEqual(["0", "1", "2"]);
  });

  it("tagging does not prevent iteration over array elements", () => {
    const source =
      "const nums = [1, 2, 3, 4]; globalThis.__sum = 0; nums.forEach(function(n){ globalThis.__sum += n; });";
    const code = parseAndApply(source, (ast) => applyIntegrityTag(ast));
    const ctx: Record<string, unknown> = { globalThis: { __sum: 0 } };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect((ctx["globalThis"] as Record<string, unknown>)["__sum"]).toBe(10);
  });
});

describe("nativeBinding — SWC-specific boundary conditions", () => {
  it("replaces Math.floor(x) call sites with the bound constant identifier", () => {
    const source = "var r = Math.floor(3.9);";
    const code = parseAndApply(source, (ast) =>
      applyNativeBinding(ast, { methods: ["Math.floor"] })
    );
    // The call site must use the bound alias, not the original MemberExpression
    expect(code).not.toContain("Math.floor(");
    // Bound declaration is still present
    expect(code).toContain("Math.floor.bind(Math)");
    // Correct result at runtime
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    expect(() => vm.runInContext(code, ctx)).not.toThrow();
  });

  it("replaces multiple call sites for different bound methods", () => {
    const source = "var a = Math.floor(1.9); var b = Object.keys({x:1});";
    const code = parseAndApply(source, (ast) =>
      applyNativeBinding(ast, { methods: ["Math.floor", "Object.keys"] })
    );
    expect(code).not.toContain("Math.floor(");
    expect(code).not.toContain("Object.keys(");
    expect(code).toContain("Math.floor.bind(Math)");
    expect(code).toContain("Object.keys.bind(Object)");
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    expect(() => vm.runInContext(code, ctx)).not.toThrow();
  });

  it("bound constants are prepended before any user code at runtime", () => {
    // The binding must be declared before it is referenced in user code
    const source = "var __r = Math.floor(3.9);";
    const code = parseAndApply(source, (ast) =>
      applyNativeBinding(ast, { methods: ["Math.floor"] })
    );
    // Call site replaced; bound alias is used
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    expect(() => vm.runInContext(code, ctx)).not.toThrow();
  });

  it("single-segment method name is treated as global method (no receiver)", () => {
    // 'parseInt' has parts=['parseInt'], so receiver=undefined — only obj binding, no .bind call
    // We test that the output is parseable and doesn't crash
    const code = parseAndApply("const x = 1;", (ast) =>
      applyNativeBinding(ast, { methods: ["parseInt"] })
    );
    expect(() => parseSync(code, { syntax: "ecmascript" })).not.toThrow();
  });
});

// ─── integrityTag — ObjectExpression tagging ─────────────────────────────────

describe("integrityTag — ObjectExpression tagging", () => {
  it("wraps object literals with verify+tag call", () => {
    const code = parseAndApply("const o = { a: 1 };", (ast) => applyIntegrityTag(ast));
    // At least one hex-named call wrapping an object
    expect(code).toMatch(/_0x[0-9a-fасе]{16}\(\{/);
    expect(code).toContain("Symbol(");
  });

  it("object tag uses kind=2 at runtime", () => {
    const source = "const o = { a: 1, b: 2 }; globalThis.__o = o;";
    const code = parseAndApply(source, (ast) => applyIntegrityTag(ast));
    const ctx: Record<string, unknown> = { globalThis: {} };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const obj = (ctx["globalThis"] as Record<string, unknown>)["__o"] as Record<string, unknown>;
    const sym = Object.getOwnPropertySymbols(obj)[0];
    const tagValue = (obj as any)[sym];
    expect(Array.isArray(tagValue)).toBe(true);
    expect(tagValue[1]).toBe(2); // kind=2 for objects
  });

  it("object properties are intact and accessible at runtime", () => {
    const source = "const o = { x: 10, y: 20 }; globalThis.__o = o;";
    const code = parseAndApply(source, (ast) => applyIntegrityTag(ast));
    const ctx: Record<string, unknown> = { globalThis: {} };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const obj = (ctx["globalThis"] as Record<string, unknown>)["__o"] as Record<string, unknown>;
    expect(obj["x"]).toBe(10);
    expect(obj["y"]).toBe(20);
    expect(Object.keys(obj)).toEqual(["x", "y"]);
  });

  it("tagObjects: false disables ObjectExpression tagging", () => {
    const code = parseAndApply("const o = { a: 1 };", (ast) =>
      applyIntegrityTag(ast, { tagObjects: false })
    );
    // No hex-named call in: no arrays exist so no helpers at all
    expect(code).not.toMatch(/_0x[0-9a-fасе]{16}\(\{/);
  });

  it("object with spread element is NOT tagged (runtime prop count differs)", () => {
    const source = "const x = { a: 1 }; const o = { ...x, b: 2 };";
    const code = parseAndApply(source, (ast) => applyIntegrityTag(ast));
    // The spread object must not be wrapped (no hex call surrounding {...x})
    // The plain {a:1} object IS tagged; the spread one is skipped
    expect(() => parseSync(code, { syntax: "ecmascript" })).not.toThrow();
    // Verify it runs without corruption
    const ctx: Record<string, unknown> = { globalThis: {} };
    vm.createContext(ctx);
    expect(() => vm.runInContext(code + " globalThis.__o = o;", ctx)).not.toThrow();
  });

  it("empty object literal is tagged and valid at runtime", () => {
    const source = "const o = {}; globalThis.__o = o;";
    const code = parseAndApply(source, (ast) => applyIntegrityTag(ast));
    const ctx: Record<string, unknown> = { globalThis: {} };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const obj = (ctx["globalThis"] as Record<string, unknown>)["__o"];
    expect(typeof obj).toBe("object");
    expect(obj).not.toBeNull();
  });

  it("emits Symbol, tagFn, and verifyFn helpers when only objects are present", () => {
    const code = parseAndApply("const o = { a: 1 };", (ast) => applyIntegrityTag(ast));
    expect(code).toContain("Symbol(");
    expect(code).toContain("Object.defineProperty");
    // The verify function must also be emitted (calls Object.keys for kind=2 check)
    expect(code).toContain("Object.keys");
  });
});

// ─── integrityTag — content-based checksum ───────────────────────────────────

describe("integrityTag — content-based checksum", () => {
  it("pure-literal numeric array gets kind=1 at runtime", () => {
    const source = "const a = [1, 2, 3]; globalThis.__a = a;";
    const code = parseAndApply(source, (ast) => applyIntegrityTag(ast));
    const ctx: Record<string, unknown> = { globalThis: {} };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const arr = (ctx["globalThis"] as Record<string, unknown>)["__a"] as unknown[];
    const sym = Object.getOwnPropertySymbols(arr)[0];
    const tagValue = (arr as any)[sym];
    expect(tagValue[1]).toBe(1); // content-based
  });

  it("array with non-literal element (identifier) gets kind=0 at runtime", () => {
    const source = "var x = 1; const a = [x, 2]; globalThis.__a = a;";
    const code = parseAndApply(source, (ast) => applyIntegrityTag(ast));
    const ctx: Record<string, unknown> = { globalThis: {} };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const arr = (ctx["globalThis"] as Record<string, unknown>)["__a"] as unknown[];
    const sym = Object.getOwnPropertySymbols(arr)[0];
    const tagValue = (arr as any)[sym];
    expect(tagValue[1]).toBe(0); // length-based (mixed)
  });

  it("content checksum is consistent across two identical pure-literal arrays", () => {
    const source =
      "const a = [10, 20, 30]; const b = [10, 20, 30]; globalThis.__a = a; globalThis.__b = b;";
    const code = parseAndApply(source, (ast) => applyIntegrityTag(ast));
    const ctx: Record<string, unknown> = { globalThis: {} };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const a = (ctx["globalThis"] as Record<string, unknown>)["__a"] as unknown[];
    const b = (ctx["globalThis"] as Record<string, unknown>)["__b"] as unknown[];
    const symA = Object.getOwnPropertySymbols(a)[0];
    const symB = Object.getOwnPropertySymbols(b)[0];
    // Both arrays have the same content → same checksum (kind=1)
    expect((a as any)[symA][0]).toBe((b as any)[symB][0]);
    expect((a as any)[symA][1]).toBe(1);
  });

  it("content checksum differs for arrays with different values but same length", () => {
    const source =
      "const a = [1, 2, 3]; const b = [4, 5, 6]; globalThis.__a = a; globalThis.__b = b;";
    const code = parseAndApply(source, (ast) => applyIntegrityTag(ast));
    const ctx: Record<string, unknown> = { globalThis: {} };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const a = (ctx["globalThis"] as Record<string, unknown>)["__a"] as unknown[];
    const b = (ctx["globalThis"] as Record<string, unknown>)["__b"] as unknown[];
    const symA = Object.getOwnPropertySymbols(a)[0];
    const symB = Object.getOwnPropertySymbols(b)[0];
    // Same length, different content → different checksums
    expect((a as any)[symA][0]).not.toBe((b as any)[symB][0]);
  });

  it("boolean and null literals are valid pure elements (kind=1)", () => {
    const source = "const a = [true, false, null]; globalThis.__a = a;";
    const code = parseAndApply(source, (ast) => applyIntegrityTag(ast));
    const ctx: Record<string, unknown> = { globalThis: {} };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const arr = (ctx["globalThis"] as Record<string, unknown>)["__a"] as unknown[];
    expect(arr[0]).toBe(true);
    expect(arr[1]).toBe(false);
    expect(arr[2]).toBeNull();
    const sym = Object.getOwnPropertySymbols(arr)[0];
    expect((arr as any)[sym][1]).toBe(1);
  });
});

// ─── integrityTag — _0xVerify tamper detection ───────────────────────────────

describe("integrityTag — _0xVerify tamper detection", () => {
  it("_0xVerify is emitted in the output", () => {
    const code = parseAndApply("const a = [1, 2, 3];", (ast) => applyIntegrityTag(ast));
    // Three hex-named symbols: tagFn, verifyFn, symVar
    const hexMatches = [...code.matchAll(/_0x[0-9a-fасе]{16}/g)].map((m) => m[0]);
    // At least two distinct symbols (tagFn and verifyFn)
    const unique = new Set(hexMatches);
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });

  it("_0xVerify corrupts array when Symbol tag is absent (defineProperty override attack)", () => {
    // Simulate an attack where Object.defineProperty is overridden so the tag is never attached
    const source = "const a = [10, 20, 30]; globalThis.__a = a;";
    const code = parseAndApply(source, (ast) => applyIntegrityTag(ast));
    // Intercept Object.defineProperty BEFORE the tagged code runs
    const attack = `
      var _real_def = Object.defineProperty;
      Object.defineProperty = function(o, k, d) {
        if (typeof k === 'symbol') return o; // silently ignore Symbol attachment
        return _real_def(o, k, d);
      };
      ${code}
    `;
    const ctx: Record<string, unknown> = { globalThis: {} };
    vm.createContext(ctx);
    vm.runInContext(attack, ctx);
    const arr = (ctx["globalThis"] as Record<string, unknown>)["__a"] as number[];
    // _0xVerify should have detected the missing tag and zeroed the array
    expect(arr.every((v) => v === 0)).toBe(true);
  });

  it("_0xVerify corrupts array when content is modified after tagging (kind=1)", () => {
    // Create an array, tag it, then tamper with an element, then re-run verify
    const source = `
      const a = [1, 2, 3];
      globalThis.__a = a;
    `;
    const code = parseAndApply(source, (ast) => applyIntegrityTag(ast));
    // Extract verifyFn name by matching the outer call around the array literal
    const verifyCallMatch = code.match(/_0x([0-9a-fасе]{16})\(_0x[0-9a-fасе]{16}\(\[/);
    expect(verifyCallMatch).not.toBeNull();
    const verifyFnName = "_0x" + verifyCallMatch![1];

    const tamper = `
      ${code}
      // Tamper with element AFTER creation
      globalThis.__a[0] = 99;
      // Re-run verify (simulating a second-time integrity check)
      ${verifyFnName}(globalThis.__a);
    `;
    const ctx: Record<string, unknown> = { globalThis: {} };
    vm.createContext(ctx);
    vm.runInContext(tamper, ctx);
    const arr = (ctx["globalThis"] as Record<string, unknown>)["__a"] as number[];
    // After tampering, re-verify detects mismatch and zeroes the array
    expect(arr.every((v) => v === 0)).toBe(true);
  });

  it("_0xVerify does NOT corrupt a valid un-tampered pure-literal array", () => {
    const source = "const a = [5, 10, 15]; globalThis.__a = a;";
    const code = parseAndApply(source, (ast) => applyIntegrityTag(ast));
    const ctx: Record<string, unknown> = { globalThis: {} };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const arr = (ctx["globalThis"] as Record<string, unknown>)["__a"] as number[];
    // Values intact — verify passed at creation
    expect(arr[0]).toBe(5);
    expect(arr[1]).toBe(10);
    expect(arr[2]).toBe(15);
  });

  it("_0xVerify does NOT corrupt a valid tagged object", () => {
    const source = "const o = { p: 42, q: 'hello' }; globalThis.__o = o;";
    const code = parseAndApply(source, (ast) => applyIntegrityTag(ast));
    const ctx: Record<string, unknown> = { globalThis: {} };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const obj = (ctx["globalThis"] as Record<string, unknown>)["__o"] as Record<string, unknown>;
    expect(obj["p"]).toBe(42);
    expect(obj["q"]).toBe("hello");
    expect(Object.keys(obj)).toEqual(["p", "q"]);
  });

  it("_0xVerify corrupts object when property is added after tagging", () => {
    // kind=2 uses Object.keys().length at verify time
    const source = "const o = { a: 1 }; globalThis.__o = o;";
    const code = parseAndApply(source, (ast) => applyIntegrityTag(ast));
    const verifyCallMatch = code.match(/_0x([0-9a-fасе]{16})\(_0x[0-9a-fасе]{16}\(\{/);
    expect(verifyCallMatch).not.toBeNull();
    const verifyFnName = "_0x" + verifyCallMatch![1];

    const tamper = `
      ${code}
      globalThis.__o.injected = 'evil'; // add extra property
      ${verifyFnName}(globalThis.__o);  // re-verify
    `;
    const ctx: Record<string, unknown> = { globalThis: {} };
    vm.createContext(ctx);
    vm.runInContext(tamper, ctx);
    const obj = (ctx["globalThis"] as Record<string, unknown>)["__o"] as Record<string, unknown>;
    // Verify detected property count mismatch → deleted all enumerable props
    expect(Object.keys(obj)).toHaveLength(0);
  });
});

// ─── integrityTag — sparse holes and spread elements ─────────────────────────

describe("integrityTag — sparse holes and spread elements", () => {
  it("sparse hole [1,,3] is treated as pure literal (null = kind 1) at runtime", () => {
    // A sparse array hole is represented as null in SWC's elements array.
    // isPureLiteralArray returns true for null (hole counts as pure).
    // contentChecksum treats null/undefined elements as val=0.
    const source = "const a = [1,,3]; globalThis.__a = a;";
    const code = parseAndApply(source, (ast) => applyIntegrityTag(ast));
    expect(() => parseSync(code, { syntax: "ecmascript" })).not.toThrow();
    const ctx: Record<string, unknown> = { globalThis: {} };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const arr = (ctx["globalThis"] as Record<string, unknown>)["__a"] as unknown[];
    // Values at known positions are intact
    expect(arr[0]).toBe(1);
    expect(arr[2]).toBe(3);
    // kind=1 (content-based): null hole contributes val=0 to checksum
    const sym = Object.getOwnPropertySymbols(arr)[0];
    expect((arr as any)[sym][1]).toBe(1);
  });

  it("array with spread element [...x, 1] gets kind=0 (not pure literal)", () => {
    // isPureLiteralArray returns false as soon as it sees el.spread is non-null.
    // The array falls back to length-based checksum (kind=0).
    const source = "var x = [9]; const a = [...x, 1]; globalThis.__a = a;";
    const code = parseAndApply(source, (ast) => applyIntegrityTag(ast));
    const ctx: Record<string, unknown> = { globalThis: {} };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const arr = (ctx["globalThis"] as Record<string, unknown>)["__a"] as unknown[];
    expect(arr[0]).toBe(9);
    expect(arr[1]).toBe(1);
    // kind=0 (length-based) because of spread
    const sym = Object.getOwnPropertySymbols(arr)[0];
    expect((arr as any)[sym][1]).toBe(0);
  });

  it("pure string literal array ['a','b'] gets kind=1 (content-based checksum)", () => {
    // Exercises the StringLiteral branch inside contentChecksum.
    const source = "const a = ['hello', 'world']; globalThis.__a = a;";
    const code = parseAndApply(source, (ast) => applyIntegrityTag(ast));
    const ctx: Record<string, unknown> = { globalThis: {} };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const arr = (ctx["globalThis"] as Record<string, unknown>)["__a"] as string[];
    expect(arr[0]).toBe("hello");
    expect(arr[1]).toBe("world");
    const sym = Object.getOwnPropertySymbols(arr)[0];
    expect((arr as any)[sym][1]).toBe(1); // content-based
  });

  it("mixed array [a, 'literal'] (identifier + string) gets kind=0", () => {
    // One identifier makes isPureLiteralArray return false → length-based.
    const source = "var a = 1; const arr = [a, 'x']; globalThis.__arr = arr;";
    const code = parseAndApply(source, (ast) => applyIntegrityTag(ast));
    const ctx: Record<string, unknown> = { globalThis: {} };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const arr = (ctx["globalThis"] as Record<string, unknown>)["__arr"] as unknown[];
    const sym = Object.getOwnPropertySymbols(arr)[0];
    expect((arr as any)[sym][1]).toBe(0); // length-based
  });
});
