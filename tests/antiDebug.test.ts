import { parse } from "@babel/parser";
import generate from "@babel/generator";
import { applyIntegrityTag } from "../src/antiDebug/integrityTag";
import { applyNativeBinding } from "../src/antiDebug/nativeBinding";

type ParseResult = ReturnType<typeof parse>;

function parseAndApply(source: string, fn: (ast: ParseResult) => void): string {
  const ast = parse(source, { sourceType: "script" });
  fn(ast);
  return generate(ast).code;
}

// ─── integrityTag ─────────────────────────────────────────────────────────────

describe("integrityTag", () => {
  it("wraps array literals with __haze_tag", () => {
    const code = parseAndApply("const a = [1, 2, 3];", (ast) => applyIntegrityTag(ast));
    expect(code).toContain("__haze_tag");
    expect(code).toContain("__haze_sym");
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

  it("wraps an empty array with checksum 0 ^ 0xdeadbeef", () => {
    const code = parseAndApply("const a = [];", (ast) => applyIntegrityTag(ast));
    // 0 elements ^ 0xdeadbeef = 3735928559
    expect(code).toContain("3735928559");
  });

  it("tags multiple arrays in the same source independently", () => {
    const code = parseAndApply("const a = [1]; const b = [2, 3];", (ast) => applyIntegrityTag(ast));
    // At least one __haze_tag call per user array; the injected helper may add more
    const tagCalls = [...code.matchAll(/__haze_tag\(/g)];
    expect(tagCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("does not inject helpers when there are no array literals", () => {
    const code = parseAndApply("const x = 1;", (ast) => applyIntegrityTag(ast));
    expect(code).not.toContain("__haze_tag");
    expect(code).not.toContain("__haze_sym");
  });

  it("output remains parseable after transformation", () => {
    const code = parseAndApply("const a = [1, 2]; const b = [];", (ast) => applyIntegrityTag(ast));
    expect(() => parse(code, { sourceType: "script" })).not.toThrow();
  });

  it("integrity tag is non-enumerable at runtime", () => {
    const vm = require("vm") as typeof import("vm");
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
});

// ─── nativeBinding ────────────────────────────────────────────────────────────

describe("nativeBinding", () => {
  it("prepends a pre-bound constant for a single method", () => {
    const code = parseAndApply("const x = 1;", (ast) =>
      applyNativeBinding(ast, { methods: ["Math.floor"] })
    );
    expect(code).toContain("__haze_Math_floor");
    expect(code).toContain("Math.floor.bind(Math)");
  });

  it("prepends all default methods when no options are given", () => {
    const code = parseAndApply("const x = 1;", (ast) => applyNativeBinding(ast));
    expect(code).toContain("__haze_Math_floor");
    expect(code).toContain("__haze_Math_random");
    expect(code).toContain("__haze_Object_defineProperty");
  });

  it("handles multi-segment paths like Array.prototype.slice", () => {
    const code = parseAndApply("const x = 1;", (ast) =>
      applyNativeBinding(ast, { methods: ["Array.prototype.slice"] })
    );
    expect(code).toContain("__haze_Array_prototype_slice");
    expect(code).toContain("Array.prototype.slice.bind(Array.prototype)");
  });

  it("empty methods array injects no declarations", () => {
    const ast = parse("const x = 1;", { sourceType: "script" });
    const before = ast.program.body.length;
    applyNativeBinding(ast, { methods: [] });
    expect(ast.program.body.length).toBe(before);
  });

  it("bound constants are const declarations", () => {
    const code = parseAndApply("const x = 1;", (ast) =>
      applyNativeBinding(ast, { methods: ["Math.ceil"] })
    );
    expect(code).toMatch(/const __haze_Math_ceil/);
  });

  it("output remains parseable after transformation", () => {
    const code = parseAndApply("const x = 1;", (ast) =>
      applyNativeBinding(ast, { methods: ["Math.floor", "Object.keys"] })
    );
    expect(() => parse(code, { sourceType: "script" })).not.toThrow();
  });
});
