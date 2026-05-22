import { protect } from "../src/index";

describe("protect()", () => {
  it("throws on non-string input", () => {
    // @ts-expect-error intentional bad input
    expect(() => protect(123)).toThrow(TypeError);
  });

  it("returns protected code and applied passes", () => {
    const source = "const x = 1 + 2;";
    const result = protect(source, {
      obfuscation: {
        sequenceExpression: {},
        mba: {},
        functionTable: {},
        stringPool: false,
        controlFlowFlattening: false,
        deadCode: false,
      },
      antiDebug: {
        nativeBinding: false,
        integrityTag: false,
      },
    });

    expect(typeof result.code).toBe("string");
    expect(result.code.length).toBeGreaterThan(0);
    expect(result.appliedPasses).toContain("mba");
    expect(result.appliedPasses).toContain("sequenceExpression");
  });
});
