/**
 * E2E runtime correctness tests.
 * Each test obfuscates a snippet, runs the output through Node.js `vm`,
 * and asserts that observable behaviour is identical to the original code.
 */
import * as vm from "vm";
import { parse } from "@babel/parser";
import { protect } from "../src/index";

// Helpers ────────────────────────────────────────────────────────────────────

/** Run code in a fresh sandbox and return the sandbox context. */
function run(code: string): Record<string, unknown> {
  const ctx: Record<string, unknown> = { module: { exports: {} }, exports: {} };
  vm.createContext(ctx);
  vm.runInContext(`(function(module,exports){ ${code} })(module, exports)`, ctx);
  return ctx;
}

function exports_(ctx: Record<string, unknown>): unknown {
  return (ctx["module"] as { exports: unknown })["exports"];
}

// ─── MBA ─────────────────────────────────────────────────────────────────────

describe("E2E — MBA arithmetic", () => {
  it("addition semantics are preserved", () => {
    const source = `
      const a = 7, b = 5;
      module.exports = a + b;
    `;
    const { code } = protect(source, {
      obfuscation: {
        mba: { rounds: 2 },
        sequenceExpression: false,
        functionTable: false,
        stringPool: false,
        controlFlowFlattening: false,
        deadCode: false,
      },
      antiDebug: { nativeBinding: false, integrityTag: false },
    });
    expect(exports_(run(code))).toBe(12);
  });

  it("subtraction semantics are preserved", () => {
    const source = `
      const a = 10, b = 3;
      module.exports = a - b;
    `;
    const { code } = protect(source, {
      obfuscation: {
        mba: { rounds: 1 },
        sequenceExpression: false,
        functionTable: false,
        stringPool: false,
        controlFlowFlattening: false,
        deadCode: false,
      },
      antiDebug: { nativeBinding: false, integrityTag: false },
    });
    expect(exports_(run(code))).toBe(7);
  });

  it("bitwise OR semantics are preserved", () => {
    const source = `
      const a = 0b1010, b = 0b1100;
      module.exports = a | b;
    `;
    const { code } = protect(source, {
      obfuscation: {
        mba: { rounds: 1 },
        sequenceExpression: false,
        functionTable: false,
        stringPool: false,
        controlFlowFlattening: false,
        deadCode: false,
      },
      antiDebug: { nativeBinding: false, integrityTag: false },
    });
    expect(exports_(run(code))).toBe(0b1110); // 14
  });

  it("bitwise XOR semantics are preserved", () => {
    const source = `
      const a = 0b1010, b = 0b1100;
      module.exports = a ^ b;
    `;
    const { code } = protect(source, {
      obfuscation: {
        mba: { rounds: 1 },
        sequenceExpression: false,
        functionTable: false,
        stringPool: false,
        controlFlowFlattening: false,
        deadCode: false,
      },
      antiDebug: { nativeBinding: false, integrityTag: false },
    });
    expect(exports_(run(code))).toBe(0b0110); // 6
  });
});

// ─── String Pool ─────────────────────────────────────────────────────────────

describe("E2E — String Pool round-trip", () => {
  it("a simple string survives encryption and decryption", () => {
    const source = `module.exports = "hello";`;
    const { code } = protect(source, {
      obfuscation: {
        stringPool: { seed: 42 },
        mba: false,
        sequenceExpression: false,
        functionTable: false,
        controlFlowFlattening: false,
        deadCode: false,
      },
      antiDebug: { nativeBinding: false, integrityTag: false },
    });
    expect(exports_(run(code))).toBe("hello");
  });

  it("multiple different strings are correctly decrypted", () => {
    const source = `
      const a = "foo";
      const b = "bar";
      module.exports = a + b;
    `;
    const { code } = protect(source, {
      obfuscation: {
        stringPool: { seed: 7 },
        mba: false,
        sequenceExpression: false,
        functionTable: false,
        controlFlowFlattening: false,
        deadCode: false,
      },
      antiDebug: { nativeBinding: false, integrityTag: false },
    });
    expect(exports_(run(code))).toBe("foobar");
  });

  it("deduplicated string is decrypted correctly at every use site", () => {
    const source = `
      const a = "dup";
      const b = "dup";
      module.exports = [a, b];
    `;
    const { code } = protect(source, {
      obfuscation: {
        stringPool: { seed: 1 },
        mba: false,
        sequenceExpression: false,
        functionTable: false,
        controlFlowFlattening: false,
        deadCode: false,
      },
      antiDebug: { nativeBinding: false, integrityTag: false },
    });
    const result = exports_(run(code)) as string[];
    expect(result[0]).toBe("dup");
    expect(result[1]).toBe("dup");
  });
});

// ─── Function Table ───────────────────────────────────────────────────────────

describe("E2E — Function Table call preservation", () => {
  it("function calls return correct values through the table", () => {
    const source = `
      function add(a, b) { return a + b; }
      function mul(a, b) { return a * b; }
      module.exports = add(3, 4) + mul(2, 5);
    `;
    const { code } = protect(source, {
      obfuscation: {
        functionTable: { minFunctions: 2 },
        mba: false,
        sequenceExpression: false,
        stringPool: false,
        controlFlowFlattening: false,
        deadCode: false,
      },
      antiDebug: { nativeBinding: false, integrityTag: false },
    });
    expect(exports_(run(code))).toBe(17); // 7 + 10
  });
});

// ─── Control Flow Flattening ─────────────────────────────────────────────────

describe("E2E — Control Flow Flattening", () => {
  it("flattened function still returns the correct value", () => {
    // Use var (not const) so variables are accessible across switch/case blocks
    const source = `
      function compute(n) {
        var a = n * 2;
        var b = a + 3;
        var c = b - 1;
        return c;
      }
      module.exports = compute(5);
    `;
    const { code } = protect(source, {
      obfuscation: {
        controlFlowFlattening: { passes: 1 },
        mba: false,
        sequenceExpression: false,
        functionTable: false,
        stringPool: false,
        deadCode: false,
      },
      antiDebug: { nativeBinding: false, integrityTag: false },
    });
    expect(exports_(run(code))).toBe(12); // (5*2 + 3 - 1) = 12
  });

  it("function with an early return evaluates the correct branch", () => {
    const source = `
      function classify(n) {
        if (n < 0) { return "negative"; }
        return "non-negative";
      }
      module.exports = classify(-5);
    `;
    const { code } = protect(source, {
      obfuscation: {
        controlFlowFlattening: { passes: 1 },
        mba: false,
        sequenceExpression: false,
        functionTable: false,
        stringPool: false,
        deadCode: false,
      },
      antiDebug: { nativeBinding: false, integrityTag: false },
    });
    expect(exports_(run(code))).toBe("negative");
  });
});

// ─── Native Binding ───────────────────────────────────────────────────────────

describe("E2E — Native Binding declarations", () => {
  it("generated code with native bindings is valid and evaluable", () => {
    const source = `module.exports = 42;`;
    const { code } = protect(source, {
      obfuscation: {
        mba: false,
        sequenceExpression: false,
        functionTable: false,
        stringPool: false,
        controlFlowFlattening: false,
        deadCode: false,
      },
      antiDebug: { nativeBinding: { methods: ["Math.floor", "Math.random"] }, integrityTag: false },
    });
    expect(() => run(code)).not.toThrow();
    expect(exports_(run(code))).toBe(42);
  });
});

// ─── Full Pipeline ────────────────────────────────────────────────────────────

describe("E2E — Full pipeline", () => {
  it("outputs valid JS when all passes are enabled", () => {
    const source = `
      function greet(name) {
        const msg = "Hello, " + name + "!";
        return msg;
      }
      function shout(name) {
        return greet(name).toUpperCase();
      }
      module.exports = greet("world");
    `;
    const { code, appliedPasses } = protect(source);
    // Must parse cleanly
    expect(() => parse(code, { sourceType: "script" })).not.toThrow();
    // Several passes must have been applied
    expect(appliedPasses.length).toBeGreaterThan(0);
  });

  it("dead code injection does not break runtime behaviour", () => {
    const source = `module.exports = 99;`;
    const { code } = protect(source, {
      obfuscation: {
        deadCode: { targetLines: 20 },
        mba: false,
        sequenceExpression: false,
        functionTable: false,
        stringPool: false,
        controlFlowFlattening: false,
      },
      antiDebug: { nativeBinding: false, integrityTag: false },
    });
    expect(exports_(run(code))).toBe(99);
  });

  it("sequenceExpression with if-else produces correct branch at runtime", () => {
    const source = `
      let result;
      if (true) { result = "yes"; } else { result = "no"; }
      module.exports = result;
    `;
    const { code } = protect(source, {
      obfuscation: {
        sequenceExpression: { probability: 1 },
        mba: false,
        functionTable: false,
        stringPool: false,
        controlFlowFlattening: false,
        deadCode: false,
      },
      antiDebug: { nativeBinding: false, integrityTag: false },
    });
    expect(exports_(run(code))).toBe("yes");
  });
});

// ─── Template Literal ─────────────────────────────────────────────────────────────

describe("E2E — Template Literal encryption", () => {
  it("static template literal round-trips to original string", () => {
    const source = "module.exports = `hello world`;";
    const { code } = protect(source, {
      obfuscation: {
        stringPool: { seed: 42 },
        mba: false,
        sequenceExpression: false,
        functionTable: false,
        controlFlowFlattening: false,
        deadCode: false,
      },
      antiDebug: { nativeBinding: false, integrityTag: false },
    });
    expect(exports_(run(code))).toBe("hello world");
  });

  it("interpolated template literal preserves runtime value", () => {
    const source = `
      const name = "world";
      module.exports = \`Hello, \${name}!\`;
    `;
    const { code } = protect(source, {
      obfuscation: {
        stringPool: { seed: 7 },
        mba: false,
        sequenceExpression: false,
        functionTable: false,
        controlFlowFlattening: false,
        deadCode: false,
      },
      antiDebug: { nativeBinding: false, integrityTag: false },
    });
    expect(exports_(run(code))).toBe("Hello, world!");
  });
});

// ─── Combined passes ────────────────────────────────────────────────────────────

describe("E2E — stringPool + controlFlowFlattening combined", () => {
  it("function body with string literals produces correct output through both passes", () => {
    const source = `
      function greet(name) {
        var prefix = "Hello";
        var suffix = "welcome";
        return prefix + ", " + name + "! " + suffix + ".";
      }
      module.exports = greet("Alice");
    `;
    const { code } = protect(source, {
      obfuscation: {
        stringPool: { seed: 42 },
        controlFlowFlattening: { passes: 1 },
        mba: false,
        sequenceExpression: false,
        functionTable: false,
        deadCode: false,
      },
      antiDebug: { nativeBinding: false, integrityTag: false },
    });
    expect(exports_(run(code))).toBe("Hello, Alice! welcome.");
  });
});

// ─── CFF passes=2 ───────────────────────────────────────────────────────────────

describe("E2E — CFF passes=2", () => {
  it("doubly-flattened function returns the correct result", () => {
    const source = `
      function compute(n) {
        var a = n + 1;
        var b = a * 2;
        var c = b - n;
        return c;
      }
      module.exports = compute(4);
    `;
    const { code } = protect(source, {
      obfuscation: {
        controlFlowFlattening: { passes: 2 },
        mba: false,
        sequenceExpression: false,
        functionTable: false,
        stringPool: false,
        deadCode: false,
      },
      antiDebug: { nativeBinding: false, integrityTag: false },
    });
    expect(exports_(run(code))).toBe(6); // (4+1)*2 - 4 = 6
  });
});
