import { parse } from "@babel/parser";
import { protect } from "../src/index";

// ─── Input validation ────────────────────────────────────────────────────────

describe("protect() — input validation", () => {
  it("throws TypeError on non-string input", () => {
    // @ts-expect-error intentional bad input
    expect(() => protect(123)).toThrow(TypeError);
  });

  it("throws TypeError on null input", () => {
    // @ts-expect-error intentional bad input
    expect(() => protect(null)).toThrow(TypeError);
  });

  it("accepts an empty string without throwing", () => {
    expect(() => protect("")).not.toThrow();
  });
});

// ─── Pass tracking ───────────────────────────────────────────────────────────

describe("protect() — appliedPasses", () => {
  it("reports all enabled passes in order", () => {
    const { appliedPasses } = protect("const x = 1;", {
      obfuscation: {
        sequenceExpression: {},
        mba: {},
        functionTable: {},
        stringPool: false,
        controlFlowFlattening: false,
        deadCode: false,
      },
      antiDebug: { nativeBinding: false, integrityTag: false },
    });
    expect(appliedPasses).toEqual(["sequenceExpression", "mba", "functionTable"]);
  });

  it("reports no passes when all are disabled", () => {
    const { appliedPasses } = protect("const x = 1;", {
      obfuscation: {
        sequenceExpression: false,
        mba: false,
        functionTable: false,
        stringPool: false,
        controlFlowFlattening: false,
        deadCode: false,
      },
      antiDebug: { nativeBinding: false, integrityTag: false },
    });
    expect(appliedPasses).toHaveLength(0);
  });

  it("reports anti-debug passes after obfuscation passes", () => {
    const { appliedPasses } = protect("const x = 1;", {
      obfuscation: {
        mba: {},
        deadCode: false,
        sequenceExpression: false,
        functionTable: false,
        stringPool: false,
        controlFlowFlattening: false,
      },
      antiDebug: { nativeBinding: {}, integrityTag: false },
    });
    expect(appliedPasses.indexOf("mba")).toBeLessThan(appliedPasses.indexOf("nativeBinding"));
  });

  it("returns a non-empty code string for any valid source", () => {
    const { code } = protect("const x = 42;");
    expect(typeof code).toBe("string");
    expect(code.length).toBeGreaterThan(0);
  });
});

// ─── Output validity ─────────────────────────────────────────────────────────

describe("protect() — output validity", () => {
  it("output is parseable JavaScript with all default passes", () => {
    const source = `
      function greet(name) { return "Hello, " + name; }
      const result = greet("world");
    `;
    const { code } = protect(source);
    expect(() => parse(code, { sourceType: "script" })).not.toThrow();
  });

  it("output is parseable with every pass explicitly enabled", () => {
    const source = `
      function add(a, b) { return a + b; }
      function mul(a, b) { return a * b; }
      const x = add(1, 2);
    `;
    const { code } = protect(source, {
      obfuscation: {
        sequenceExpression: { probability: 1 },
        mba: { rounds: 1 },
        functionTable: { minFunctions: 2 },
        stringPool: { seed: 7 },
        controlFlowFlattening: { passes: 1 },
        deadCode: { targetLines: 10 },
      },
      antiDebug: {
        nativeBinding: { methods: ["Math.floor"] },
        integrityTag: { tagDescription: "jas" },
      },
    });
    expect(() => parse(code, { sourceType: "script" })).not.toThrow();
  });
});
