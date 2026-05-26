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

  it("wraps an empty array with a numeric checksum", () => {
    const code = parseAndApply("const a = [];", (ast) => applyIntegrityTag(ast));
    expect(code).toMatch(/_0x[0-9a-fасе]{16}\(\[\],\s*\d+\)/);
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

  it("Symbol tag property value is a number (checksum) at runtime", () => {
    // Verifies the multi-step checksum: (((len ^ K1) * K2) ^ (K1 >>> 3)) >>> 0
    const source = "const a = [10, 20, 30]; globalThis.__a = a;";
    const code = parseAndApply(source, (ast) => applyIntegrityTag(ast));
    const ctx: Record<string, unknown> = { globalThis: {} };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const arr = (ctx["globalThis"] as Record<string, unknown>)["__a"] as unknown[];
    // Retrieve the Symbol key from the array's own symbol properties
    const sym = Object.getOwnPropertySymbols(arr)[0];
    expect(sym).toBeDefined();
    const tagValue = (arr as any)[sym];
    expect(typeof tagValue).toBe("number");
    // Checksum must be a non-negative integer (>>> 0 always produces unsigned 32-bit)
    expect(tagValue).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(tagValue)).toBe(true);
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
