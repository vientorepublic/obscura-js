/* eslint-disable @typescript-eslint/no-explicit-any */
import { parseSync, printSync } from "@swc/core";
import * as vm from "vm";
import type { SwcProgram } from "../src/swc-utils";
import { applySequenceExpression } from "../src/obfuscation/sequenceExpression";
import { applyMba } from "../src/obfuscation/mba";
import { applyFunctionTable } from "../src/obfuscation/functionTable";
import { applyStringPool } from "../src/obfuscation/stringPool";
import { applyControlFlowFlattening } from "../src/obfuscation/cff";
import { applyDeadCode } from "../src/obfuscation/deadCode";

function parseAndApply(source: string, fn: (ast: SwcProgram) => void, jsx = false): string {
  const ast = parseSync(source, { syntax: "ecmascript", jsx }) as unknown as SwcProgram;
  fn(ast);
  return printSync(ast as any).code;
}

function parseAst(source: string, module = false): SwcProgram {
  return parseSync(source, {
    syntax: "ecmascript",
    ...(module ? { target: "es2022" } : {}),
  }) as unknown as SwcProgram;
}

// ─── sequenceExpression ──────────────────────────────────────────────────────

describe("sequenceExpression", () => {
  it("flattens a simple if block into &&", () => {
    const code = parseAndApply("if (x) { a = 1; b = 2; }", (ast) =>
      applySequenceExpression(ast, { probability: 1 })
    );
    expect(code).toContain("&&");
    expect(code).not.toContain("if (");
  });

  it("converts if-else into a ternary expression", () => {
    const code = parseAndApply("if (x) { a = 1; } else { a = 2; }", (ast) =>
      applySequenceExpression(ast, { probability: 1 })
    );
    expect(code).toContain("?");
    expect(code).toContain(":");
    expect(code).not.toContain("if (");
    expect(code).not.toContain("else");
  });

  it("probability=0 leaves code unchanged", () => {
    const source = "if (x) { a = 1; }";
    const code = parseAndApply(source, (ast) => applySequenceExpression(ast, { probability: 0 }));
    expect(code).toContain("if");
  });

  it("does not flatten a body that contains declarations", () => {
    const source = "if (x) { let a = 1; }";
    const code = parseAndApply(source, (ast) => applySequenceExpression(ast, { probability: 1 }));
    // VariableDeclaration is not an ExpressionStatement — must be left alone
    expect(code).toContain("if");
  });

  it("handles a single-expression consequent without extra parens", () => {
    const code = parseAndApply("if (flag) { doThing(); }", (ast) =>
      applySequenceExpression(ast, { probability: 1 })
    );
    expect(code).toContain("&&");
    expect(code).toContain("doThing()");
  });

  it("processes nested if blocks independently", () => {
    const source = "if (a) { x = 1; } if (b) { y = 2; }";
    const code = parseAndApply(source, (ast) => applySequenceExpression(ast, { probability: 1 }));
    expect(code).not.toContain("if (");
    // Both && operators present
    expect(code.split("&&").length - 1).toBeGreaterThanOrEqual(2);
  });

  it("does not flatten an empty block body (if (x) {})", () => {
    // body.length=0: canFlatten must return false to avoid sequenceExpression([])
    const source = "if (x) {}";
    const code = parseAndApply(source, (ast) => applySequenceExpression(ast, { probability: 1 }));
    expect(code).toContain("if");
    expect(code).not.toContain("&&");
  });
});

// ─── mba ─────────────────────────────────────────────────────────────────────

describe("mba", () => {
  it("expands + into XOR/AND form", () => {
    const code = parseAndApply("const r = a + b;", (ast) => applyMba(ast, { rounds: 1 }));
    expect(code).toContain("^");
    expect(code).toContain("&");
    expect(code).not.toMatch(/a \+ b/); // original form removed
  });

  it("expands - into XOR/NOT-AND form", () => {
    const code = parseAndApply("const r = a - b;", (ast) => applyMba(ast, { rounds: 1 }));
    expect(code).toContain("^");
    expect(code).toContain("~");
    expect(code).toContain("&");
  });

  it("does not expand *, /, === operators", () => {
    const code = parseAndApply("const r = a * b; const s = a === b;", (ast) =>
      applyMba(ast, { rounds: 1 })
    );
    expect(code).toContain("a * b");
    expect(code).toContain("a === b");
  });

  it("expands all + operators in a multi-operator expression", () => {
    // rounds=1 with exit-order processes all + nodes in a single pass
    const code = parseAndApply("const r = a + b + c;", (ast) => applyMba(ast, { rounds: 1 }));
    expect(code).toContain("^");
    expect(code).toContain("&");
    // No bare identifier + identifier pattern should remain
    expect(code).not.toMatch(/[a-z] \+ [a-z]/);
  });

  it("expands | into XOR-plus-AND form", () => {
    const code = parseAndApply("const r = a | b;", (ast) => applyMba(ast, { rounds: 1 }));
    expect(code).not.toMatch(/a \| b/);
    expect(code).toContain("^");
    expect(code).toContain("&");
  });

  it("expands ^ into OR-minus-AND form", () => {
    const code = parseAndApply("const r = a ^ b;", (ast) => applyMba(ast, { rounds: 1 }));
    expect(code).not.toMatch(/a \^ b/);
    expect(code).toContain("|");
    expect(code).toContain("&");
  });

  it("rounds=0 leaves code unchanged", () => {
    const code = parseAndApply("const r = a + b;", (ast) => applyMba(ast, { rounds: 0 }));
    expect(code).toContain("a + b");
    expect(code).not.toContain("^");
  });

  it("does not expand string literal concatenation", () => {
    const code = parseAndApply('const r = "hello" + " world";', (ast) =>
      applyMba(ast, { rounds: 1 })
    );
    expect(code).toContain('"hello"');
    expect(code).toContain('" world"');
    expect(code).not.toContain("^");
  });

  // ─── SWC-specific: && / || are BinaryExpression, not LogicalExpression ──────

  it("does not expand && operator (SWC BinaryExpression — not a valid MBA identity)", () => {
    // In SWC, `a && b` parses as BinaryExpression{operator:"&&"}.
    // MBA must only expand +, -, |, ^ — never logical operators.
    const code = parseAndApply("const r = a && b;", (ast) => applyMba(ast, { rounds: 3 }));
    expect(code).toContain("&&");
    // Verify no spurious XOR/AND expansion of the operands introduced by MBA
    expect(code).not.toMatch(/a \^ b/);
    expect(code).not.toMatch(/a & b/);
  });

  it("does not expand || operator (SWC BinaryExpression — not a valid MBA identity)", () => {
    const code = parseAndApply("const r = a || b;", (ast) => applyMba(ast, { rounds: 3 }));
    expect(code).toContain("||");
  });

  it("does not expand ?? (nullish coalescing) operator", () => {
    const code = parseAndApply("const r = a ?? b;", (ast) => applyMba(ast, { rounds: 1 }));
    expect(code).toContain("??");
  });

  it("rounds=2 produces correct arithmetic result at runtime", () => {
    const source = "var __r = 7 + 5;";
    const code = parseAndApply(source, (ast) => applyMba(ast, { rounds: 2 }));
    // Must not contain the original plain `+`
    expect(code).not.toContain("7 + 5");
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect(ctx["__r"]).toBe(12);
  });
});

// ─── functionTable ───────────────────────────────────────────────────────────

describe("functionTable", () => {
  const twoFnSource = `
    function add(a, b) { return a + b; }
    function sub(a, b) { return a - b; }
    add(1, 2);
    sub(3, 1);
  `;

  it("builds a function table array from function declarations", () => {
    const code = parseAndApply(twoFnSource, (ast) => applyFunctionTable(ast));
    // Original declarations must be removed and replaced by an array of functions
    expect(code).toMatch(/const _0x[0-9a-fасе]{16} = \[/);
    expect(code).not.toMatch(/^function add/m);
    expect(code).not.toMatch(/^function sub/m);
  });

  it("replaces call sites with indexed lookups", () => {
    const code = parseAndApply(twoFnSource, (ast) => applyFunctionTable(ast));
    expect(code).toMatch(/_0x[0-9a-fасе]{16}\[0\]/);
    expect(code).toMatch(/_0x[0-9a-fасе]{16}\[1\]/);
  });

  it("skips transformation when function count is below minFunctions", () => {
    const source = "function only() {} only();";
    const code = parseAndApply(source, (ast) => applyFunctionTable(ast, { minFunctions: 2 }));
    // No function table array — original declaration must survive
    expect(code).not.toMatch(/const _0x[0-9a-fасе]{16} = \[/);
    expect(code).toContain("function only");
  });

  it("applies when minFunctions=1 and one function exists", () => {
    const source = "function solo(x) { return x; } solo(42);";
    const code = parseAndApply(source, (ast) => applyFunctionTable(ast, { minFunctions: 1 }));
    expect(code).toMatch(/const _0x[0-9a-fасе]{16} = \[/);
    expect(code).toMatch(/_0x[0-9a-fасе]{16}\[0\]/);
  });

  it("skips ESM-exported function declarations (export { foo })", () => {
    // foo is exported by specifier — must keep its declaration.
    // bar is internal — can be moved to the table when minFunctions=1.
    const ast = parseSync(
      "function foo() { return 1; }\nfunction bar() { return 2; }\nexport { foo };",
      { syntax: "ecmascript" }
    ) as unknown as SwcProgram;
    applyFunctionTable(ast, { minFunctions: 1 });
    const code = printSync(ast as any).code;
    expect(code).toContain("function foo");
    // bar has no leak — it is moved to the table
    expect(code).toMatch(/const _0x[0-9a-fасе]{16} = \[/);
    expect(code).not.toContain("function bar(");
  });

  it("skips ESM export-default-by-identifier functions", () => {
    const ast = parseSync(
      "function foo() { return 1; }\nfunction bar() { return 2; }\nexport default foo;",
      { syntax: "ecmascript" }
    ) as unknown as SwcProgram;
    applyFunctionTable(ast, { minFunctions: 1 });
    const code = printSync(ast as any).code;
    expect(code).toContain("function foo");
  });

  it("skips CJS module.exports-assigned function declarations", () => {
    // foo is leaked via module.exports — must keep its declaration.
    // bar is internal and can be moved to the table.
    const ast = parseSync(
      "function foo() { return 1; }\nfunction bar() { return 2; }\nmodule.exports = { foo };\nbar();",
      { syntax: "ecmascript" }
    ) as unknown as SwcProgram;
    applyFunctionTable(ast, { minFunctions: 1 });
    const code = printSync(ast as any).code;
    expect(code).toContain("function foo");
    expect(code).toMatch(/const _0x[0-9a-fасе]{16} = \[/);
  });

  it("skips CJS exports.foo = funcName assignments", () => {
    const ast = parseSync("function greet() { return 'hi'; }\nexports.greet = greet;", {
      syntax: "ecmascript",
    }) as unknown as SwcProgram;
    applyFunctionTable(ast, { minFunctions: 1 });
    const code = printSync(ast as any).code;
    expect(code).toContain("function greet");
    expect(code).not.toMatch(/const _0x[0-9a-fасе]{16} = \[/);
  });

  it("rewrites self-recursive call sites inside the function body", () => {
    const ast = parseSync(
      "function fact(n) { return n <= 1 ? 1 : n * fact(n - 1); }\nvar r = fact(5);",
      { syntax: "ecmascript" }
    ) as unknown as SwcProgram;
    applyFunctionTable(ast, { minFunctions: 1 });
    const code = printSync(ast as any).code;
    // Internal recursive call fact(n-1) must also be rewritten to a table lookup
    expect(code).not.toContain("fact(");
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect(ctx["r"]).toBe(120);
  });

  it("skips CJS module.exports = funcName (direct identifier assignment)", () => {
    const ast = parseSync(
      "function foo() { return 1; }\nfunction bar() { return 2; }\nmodule.exports = foo;\nbar();",
      { syntax: "ecmascript" }
    ) as unknown as SwcProgram;
    applyFunctionTable(ast, { minFunctions: 1 });
    const code = printSync(ast as any).code;
    expect(code).toContain("function foo");
    expect(code).toMatch(/const _0x[0-9a-fасе]{16} = \[/); // bar gets tabled
  });

  // ─── SWC-specific: cross-function call rewriting ─────────────────────────

  it("mutual recursion: cross-function calls are both rewritten and execute correctly", () => {
    // Both isEven and isOdd reference each other — both must appear in the table
    // and both call sites must be rewritten to indexed lookups.
    const source = `
      function isEven(n) { return n === 0 ? true : isOdd(n - 1); }
      function isOdd(n) { return n === 0 ? false : isEven(n - 1); }
      var __r = isEven(4);
    `;
    const ast = parseSync(source, { syntax: "ecmascript" }) as unknown as SwcProgram;
    applyFunctionTable(ast, { minFunctions: 1 });
    const code = printSync(ast as any).code;
    // Neither original call site should survive
    expect(code).not.toContain("isEven(");
    expect(code).not.toContain("isOdd(");
    // Runtime result must be correct
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect(ctx["__r"]).toBe(true);
  });

  it("call site inside another tabled function body is rewritten correctly", () => {
    // greet() calls helper() — both tabled; the internal call must become a lookup
    const source = `
      function helper(name) { return "Hello " + name; }
      function greet(name) { return helper(name); }
      var __r = greet("world");
    `;
    const ast = parseSync(source, { syntax: "ecmascript" }) as unknown as SwcProgram;
    applyFunctionTable(ast, { minFunctions: 1 });
    const code = printSync(ast as any).code;
    expect(code).not.toContain("helper(");
    expect(code).not.toContain("greet(");
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect(ctx["__r"]).toBe("Hello world");
  });
});

// ─── stringPool ──────────────────────────────────────────────────────────────

describe("stringPool", () => {
  it("replaces string literals with pool decryption calls", () => {
    const code = parseAndApply('const s = "hello";', (ast) => applyStringPool(ast, { seed: 42 }));
    // Original string must be gone; a hex-named function call must appear
    expect(code).toMatch(/_0x[0-9a-fасе]{16}\(/);
    expect(code).not.toContain('"hello"');
  });

  it("identical strings at different sites get distinct pool entries", () => {
    const code = parseAndApply('var a = "dup"; var b = "dup";', (ast) =>
      applyStringPool(ast, { seed: 10 })
    );
    const matches = [...code.matchAll(/_0x[0-9a-fасе]{16}\((\d+),/g)];
    expect(matches).toHaveLength(2);
    // Each occurrence is independently encrypted — different pool offsets
    expect(matches[0][1]).not.toBe(matches[1][1]);
    // Both must still decrypt to the same original string at runtime
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect(ctx["a"]).toBe("dup");
    expect(ctx["b"]).toBe("dup");
  });

  it("does not encrypt import path strings", () => {
    const ast = parseSync('import foo from "some-module";', {
      syntax: "ecmascript",
    }) as unknown as SwcProgram;
    applyStringPool(ast, { seed: 42 });
    const code = printSync(ast as any).code;
    expect(code).toContain('"some-module"');
    expect(code).not.toMatch(/_0x[0-9a-fасе]{16}\(/);
  });

  it("does not encrypt dynamic import() path strings", () => {
    const ast = parseSync('const m = import("./module");', {
      syntax: "ecmascript",
    }) as unknown as SwcProgram;
    applyStringPool(ast, { seed: 42 });
    const code = printSync(ast as any).code;
    expect(code).toContain('"./module"');
    // Other strings in the file may cause a pool function to appear, but the
    // import path itself must remain a plain string literal.
    const importLine = code.split("\n").find((l) => l.includes("import("));
    expect(importLine).toContain('"./module"');
  });

  it("does not encrypt require() argument strings", () => {
    const code = parseAndApply('const x = require("fs");', (ast) =>
      applyStringPool(ast, { seed: 42 })
    );
    expect(code).toContain('"fs"');
    expect(code).not.toMatch(/_0x[0-9a-fасе]{16}\(/);
  });

  it("no-op when there are no string literals", () => {
    const code = parseAndApply("const x = 1 + 2;", (ast) => applyStringPool(ast, { seed: 42 }));
    // Nothing injected — no hex-named identifiers at all
    expect(code).not.toMatch(/_0x[0-9a-fасе]{16}/);
  });

  it("pool decryption produces the original string at runtime", () => {
    const source = 'var __result = "haze";';
    const code = parseAndApply(source, (ast) => applyStringPool(ast, { seed: 99 }));
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect(ctx["__result"]).toBe("haze");
  });

  // ─── boundary conditions ─────────────────────────────────────────────────

  it("seed = 0 normalizes to 1 and decrypts correctly", () => {
    const code = parseAndApply('var r = "norm";', (ast) => applyStringPool(ast, { seed: 0 }));
    expect(code).not.toContain('"norm"');
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect(ctx["r"]).toBe("norm");
  });

  it("seed = 0x10000 (low 16 bits are zero) normalizes to 1 and decrypts correctly", () => {
    const code = parseAndApply('var r = "overflow";', (ast) =>
      applyStringPool(ast, { seed: 0x10000 })
    );
    expect(code).not.toContain('"overflow"');
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect(ctx["r"]).toBe("overflow");
  });

  it("seed > 0xffff uses only lower 16 bits (same as seed & 0xffff)", () => {
    // 0x1002a & 0xffff = 42, so both seeds must decrypt to the same string.
    // We compare runtime results rather than exact code strings because the
    // pool function name is randomised per call.
    const codeA = parseAndApply('var r = "hello";', (ast) => applyStringPool(ast, { seed: 42 }));
    const codeB = parseAndApply('var r = "hello";', (ast) =>
      applyStringPool(ast, { seed: 0x1002a })
    );
    const ctxA: Record<string, unknown> = {};
    const ctxB: Record<string, unknown> = {};
    vm.createContext(ctxA);
    vm.createContext(ctxB);
    vm.runInContext(codeA, ctxA);
    vm.runInContext(codeB, ctxB);
    expect(ctxA["r"]).toBe("hello");
    expect(ctxB["r"]).toBe("hello");
  });

  it("correctly round-trips Korean characters at runtime", () => {
    const code = parseAndApply('var r = "안녕하세요";', (ast) =>
      applyStringPool(ast, { seed: 42 })
    );
    expect(code).not.toContain('"안녕하세요"');
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect(ctx["r"]).toBe("안녕하세요");
  });

  it("correctly round-trips emoji (SMP surrogate pairs) at runtime", () => {
    const code = parseAndApply('var r = "Hello \uD83D\uDE00\uD83C\uDF89";', (ast) =>
      applyStringPool(ast, { seed: 77 })
    );
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect(ctx["r"]).toBe("Hello \uD83D\uDE00\uD83C\uDF89");
  });

  it("correctly round-trips empty string", () => {
    const code = parseAndApply('var r = "";', (ast) => applyStringPool(ast, { seed: 1 }));
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect(ctx["r"]).toBe("");
  });

  it("does not encrypt require.resolve() argument strings", () => {
    const code = parseAndApply('var p = require.resolve("./config");', (ast) =>
      applyStringPool(ast, { seed: 42 })
    );
    expect(code).toContain('"./config"');
    expect(code).not.toContain("__obscura_sp");
  });

  it("all pool values are in the 0..0xffff range", () => {
    const code = parseAndApply('var a = "hello"; var b = "안녕";', (ast) =>
      applyStringPool(ast, { seed: 42 })
    );
    // __obscura_pool is always the second statement (after the decrypt fn)
    const poolAst = parseSync(code, { syntax: "ecmascript" }) as unknown as SwcProgram;
    const poolDecl = (poolAst as any).body[1] as any;
    const elements: Array<{ value: number }> = poolDecl.declarations[0].init.elements;
    expect(elements.length).toBeGreaterThan(0);
    for (const el of elements) {
      const val = (el as any).expression?.value ?? (el as any).value;
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(0xffff);
    }
  });

  // ─── boundary conditions: context-aware encryption ──────────────────────

  it("encrypts non-computed object property string keys (computed flipped)", () => {
    // { 'foo': 99 } — key must be encrypted; value accessible at runtime
    const code = parseAndApply("var o = { 'foo': 99 };", (ast) =>
      applyStringPool(ast, { seed: 42 })
    );
    expect(code).not.toContain("'foo'");
    expect(code).not.toContain('"foo"');
    // Generator must emit computed syntax [ ] around the encrypted key
    expect(code).toMatch(/\[_0x[0-9a-fасе]{16}\(/);
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect((ctx["o"] as Record<string, unknown>)["foo"]).toBe(99);
  });

  it("encrypts class method string keys and method remains callable", () => {
    const code = parseAndApply(
      "class C { 'greet'() { return 'hi'; } } var r = new C().greet();",
      (ast) => applyStringPool(ast, { seed: 42 })
    );
    expect(code).not.toContain("'greet'");
    expect(code).toMatch(/\[_0x[0-9a-fасе]{16}\(/);
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect(ctx["r"]).toBe("hi");
  });

  it("encrypts JSX attribute string values via JSXExpressionContainer", () => {
    const ast = parseSync("<div className='bar'>t</div>;", {
      syntax: "ecmascript",
      jsx: true,
    }) as unknown as SwcProgram;
    applyStringPool(ast, { seed: 42 });
    const code = printSync(ast as any).code;
    // String literal must be gone; expression container must replace it
    expect(code).not.toContain("'bar'");
    expect(code).not.toContain('"bar"');
    expect(code).toContain("className={");
  });

  it("encrypts export default string value", () => {
    const ast = parseSync("export default 'secret';", {
      syntax: "ecmascript",
    }) as unknown as SwcProgram;
    applyStringPool(ast, { seed: 42 });
    const code = printSync(ast as any).code;
    expect(code).not.toContain("'secret'");
    expect(code).not.toContain('"secret"');
    expect(code).toMatch(/export default _0x[0-9a-fасе]{16}\(/);
  });

  it("preserves ES2022 export specifier string names", () => {
    // export { x as 'name' } — 'name' is a binding identifier, must stay
    const ast = parseSync("const x = 1; export { x as 'thing' };", {
      syntax: "ecmascript",
    }) as unknown as SwcProgram;
    applyStringPool(ast, { seed: 42 });
    const code = printSync(ast as any).code;
    expect(code).toMatch(/as 'thing'|as "thing"/);
  });

  // ─── SWC-specific: {spread, expression} wrapper traversal ───────────────

  it("encrypts a string literal inside a regular call expression argument (SWC wrapper)", () => {
    // SWC: CallExpression.arguments = [{spread:null, expression: StringLiteral}]
    // traverse must descend through the wrapper to find and replace the literal.
    const source = 'var f = String; var r = f("wrapper-test");';
    const code = parseAndApply(source, (ast) => applyStringPool(ast, { seed: 42 }));
    expect(code).not.toContain('"wrapper-test"');
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect(ctx["r"]).toBe("wrapper-test");
  });

  it("encrypts a string literal inside an array expression element (SWC wrapper)", () => {
    // SWC: ArrayExpression.elements = [{spread:null, expression: StringLiteral}]
    const source = 'var r = ["elem-test"];';
    const code = parseAndApply(source, (ast) => applyStringPool(ast, { seed: 42 }));
    expect(code).not.toContain('"elem-test"');
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect((ctx["r"] as string[])[0]).toBe("elem-test");
  });

  it("encrypts a string inside an array that is a call argument (doubly-nested SWC wrappers)", () => {
    // String is inside ArrayExpression element wrapper, inside CallExpression argument wrapper.
    // This exercises two levels of {spread, expression} traversal.
    const source = `
      function first(arr) { return arr[0]; }
      var __r = first(["nested-elem"]);
    `;
    const code = parseAndApply(source, (ast) => applyStringPool(ast, { seed: 55 }));
    expect(code).not.toContain('"nested-elem"');
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect(ctx["__r"]).toBe("nested-elem");
  });

  it("preserves ES2022 import specifier string names", () => {
    // import { 'foo' as bar } — 'foo' is the remote binding name, must stay
    const ast = parseSync("import { 'foo' as bar } from './m';", {
      syntax: "ecmascript",
    }) as unknown as SwcProgram;
    applyStringPool(ast, { seed: 42 });
    const code = printSync(ast as any).code;
    expect(code).toMatch(/'foo' as|"foo" as/);
  });

  it("skips empty string literals (no pool entry injected)", () => {
    const code = parseAndApply('var x = "";', (ast) => applyStringPool(ast, { seed: 42 }));
    // No pool function or pool array should appear — nothing to encrypt
    expect(code).not.toMatch(/_0x[0-9a-fасе]{16}/);
    expect(code).toContain('""');
  });

  // ─── template literal encryption ──────────────────────────────────────────

  it("encrypts all-static template literal into a single pool call", () => {
    // `hello` has no expressions — result should be just a pool call, not a template
    const code = parseAndApply("var s = `hello`;", (ast) => applyStringPool(ast, { seed: 42 }));
    expect(code).not.toContain("`hello`");
    expect(code).toMatch(/_0x[0-9a-fасе]{16}\(/);
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect(ctx["s"]).toBe("hello");
  });

  it("encrypts static quasis and preserves expressions in template literals", () => {
    // `prefix${x}suffix` → _0xSP(...) + x + _0xSP(...)
    const code = parseAndApply("var x = 42; var s = `prefix${x}suffix`;", (ast) =>
      applyStringPool(ast, { seed: 42 })
    );
    expect(code).not.toContain("`prefix${x}suffix`");
    expect(code).not.toContain("prefix");
    expect(code).not.toContain("suffix");
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect(ctx["s"]).toBe("prefix42suffix");
  });

  it("encrypts template literal matching the utxo_algorithm.js console.log pattern", () => {
    const src = "var a = 50000, b = 20; var s = `[설정] 목표 금액: ${a}, 수수료율: ${b}`;";
    const code = parseAndApply(src, (ast) => applyStringPool(ast, { seed: 42 }));
    expect(code).not.toContain("[설정]");
    expect(code).not.toContain("목표 금액");
    expect(code).not.toContain("수수료율");
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect(ctx["s"]).toBe("[설정] 목표 금액: 50000, 수수료율: 20");
  });

  it("skips template literal quasis that are empty strings", () => {
    // `${x}` has two empty quasis — nothing to encrypt, template unchanged
    const code = parseAndApply("var x = 1; var s = `${x}`;", (ast) =>
      applyStringPool(ast, { seed: 42 })
    );
    // No pool entries should be created (only x exists as a non-string)
    expect(code).not.toMatch(/_0x[0-9a-fасе]{16}/);
  });

  it("does not transform tagged template literals", () => {
    // html`<b>text</b>` — tag function receives TemplateStringsArray; must not be touched
    const code = parseAndApply("var r = html`<b>text</b>`;", (ast) =>
      applyStringPool(ast, { seed: 42 })
    );
    // The quasi string must remain intact inside the template syntax
    expect(code).toContain("<b>text</b>");
    expect(code).toContain("`");
  });

  it("encrypts template literals and StringLiterals in the same file with correct runtime values", () => {
    const src = ['var label = "count";', "var n = 3;", "var msg = `${label}: ${n} items`;"].join(
      "\n"
    );
    const code = parseAndApply(src, (ast) => applyStringPool(ast, { seed: 42 }));
    expect(code).not.toContain('"count"');
    expect(code).not.toContain("items");
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect(ctx["msg"]).toBe("count: 3 items");
  });

  // ─── JSX: full pattern coverage ───────────────────────────────────────────

  it("encrypts all string attributes on a multi-attribute JSX element", () => {
    const ast = parseSync('<div className="foo" id="bar" title="baz" />;', {
      syntax: "ecmascript",
      jsx: true,
    }) as unknown as SwcProgram;
    applyStringPool(ast, { seed: 42 });
    const code = printSync(ast as any).code;
    expect(code).not.toContain('"foo"');
    expect(code).not.toContain('"bar"');
    expect(code).not.toContain('"baz"');
    // Every attribute must be wrapped with expression container syntax
    const wrappedCount = (code.match(/=\{_0x[0-9a-fасе]{16}\(/g) ?? []).length;
    expect(wrappedCount).toBe(3);
    expect(() => parseSync(code, { syntax: "ecmascript", jsx: true })).not.toThrow();
  });

  it("encrypts a string literal inside an explicit JSX expression container prop", () => {
    // <div title={"hello"} /> — StringLiteral parent is JSXExpressionContainer, not JSXAttribute
    // so kind = "normal"; the existing {} stays; result: title={_0xSP(...)}
    const ast = parseSync('<div title={"hello"} />;', {
      syntax: "ecmascript",
      jsx: true,
    }) as unknown as SwcProgram;
    applyStringPool(ast, { seed: 42 });
    const code = printSync(ast as any).code;
    expect(code).not.toContain('"hello"');
    // No double-wrapping: exactly one layer of braces around the call
    expect(code).toMatch(/title=\{_0x[0-9a-fасе]{16}\(/);
    expect(() => parseSync(code, { syntax: "ecmascript", jsx: true })).not.toThrow();
  });

  it("encrypts string literal inside JSX children expression container", () => {
    // <p>{'world'}</p> — StringLiteral is inside a JSXExpressionContainer child
    const ast = parseSync("<p>{'world'}</p>;", {
      syntax: "ecmascript",
      jsx: true,
    }) as unknown as SwcProgram;
    applyStringPool(ast, { seed: 42 });
    const code = printSync(ast as any).code;
    expect(code).not.toContain("'world'");
    expect(code).not.toContain('"world"');
    expect(() => parseSync(code, { syntax: "ecmascript", jsx: true })).not.toThrow();
  });

  it("does not encrypt JSXText (plain text children are not StringLiterals)", () => {
    // <p>plain text</p> — "plain text" is a JSXText node, not StringLiteral
    const ast = parseSync("<p>plain text</p>;", {
      syntax: "ecmascript",
      jsx: true,
    }) as unknown as SwcProgram;
    applyStringPool(ast, { seed: 42 });
    const code = printSync(ast as any).code;
    // Nothing to encrypt — no pool injected, text survives intact
    expect(code).toContain("plain text");
    expect(code).not.toMatch(/_0x[0-9a-fасе]{16}/);
  });

  it("does not break boolean and numeric JSX props", () => {
    // boolean props have null value; numeric props have NumericLiteral — neither is StringLiteral
    const ast = parseSync("<Component disabled loading count={3} />;", {
      syntax: "ecmascript",
      jsx: true,
    }) as unknown as SwcProgram;
    applyStringPool(ast, { seed: 42 });
    const code = printSync(ast as any).code;
    expect(code).toContain("disabled");
    expect(code).toContain("loading");
    expect(code).toContain("count={3}");
    // No pool — nothing to encrypt
    expect(code).not.toMatch(/_0x[0-9a-fасе]{16}/);
    expect(() => parseSync(code, { syntax: "ecmascript", jsx: true })).not.toThrow();
  });

  it("encrypts template literal inside a JSX expression prop", () => {
    // <div aria-label={`Hello ${name}`} /> — quasi "Hello " must be encrypted
    const ast = parseSync(
      "const name = 'world'; const el = <div aria-label={`Hello ${name}`} />;",
      {
        syntax: "ecmascript",
        jsx: true,
      }
    ) as unknown as SwcProgram;
    applyStringPool(ast, { seed: 42 });
    const code = printSync(ast as any).code;
    expect(code).not.toContain('"Hello "');
    expect(code).not.toContain("'Hello '");
    expect(code).not.toContain('"world"');
    expect(() => parseSync(code, { syntax: "ecmascript", jsx: true })).not.toThrow();
  });
});

// ─── controlFlowFlattening ───────────────────────────────────────────────────

describe("controlFlowFlattening", () => {
  it("converts multi-statement function body into a state machine", () => {
    const code = parseAndApply("function f() { const a = 1; const b = 2; const c = 3; }", (ast) =>
      applyControlFlowFlattening(ast)
    );
    expect(code).toContain("switch");
    expect(code).toContain("while");
    // State variable is now a random hex identifier
    expect(code).toMatch(/_0x[0-9a-fасе]{16}/);
  });

  it("generates one case per original statement", () => {
    const code = parseAndApply("function f() { const a = 1; const b = 2; const c = 3; }", (ast) =>
      applyControlFlowFlattening(ast)
    );
    // 3 statements + default = 4 cases
    const caseCount = [...code.matchAll(/\bcase\b/g)].length;
    expect(caseCount).toBe(3);
  });

  it("skips trivial bodies with 1 statement", () => {
    const code = parseAndApply("function f() { return 1; }", (ast) =>
      applyControlFlowFlattening(ast)
    );
    expect(code).not.toContain("switch");
  });

  it("skips bodies that already contain a switch statement", () => {
    const source = "function f() { switch(x) { case 1: break; } const y = 2; }";
    const code = parseAndApply(source, (ast) => applyControlFlowFlattening(ast));
    // Should not double-flatten
    const switchCount = [...code.matchAll(/\bswitch\b/g)].length;
    expect(switchCount).toBe(1);
  });

  it("does not flatten arrow functions without block bodies", () => {
    const source = "const f = x => x * 2;";
    const code = parseAndApply(source, (ast) => applyControlFlowFlattening(ast));
    expect(code).not.toContain("switch");
  });

  it("flattens an arrow function with a block body", () => {
    const source = "const f = (x) => { const a = x + 1; const b = a * 2; return b; };";
    const code = parseAndApply(source, (ast) => applyControlFlowFlattening(ast));
    expect(code).toContain("switch");
    expect(code).toContain("while");
  });

  it("passes=0 is a no-op", () => {
    const source = "function f() { const a = 1; const b = 2; }";
    const code = parseAndApply(source, (ast) => applyControlFlowFlattening(ast, { passes: 0 }));
    expect(code).not.toContain("switch");
  });

  it("skips empty function body (body.length = 0)", () => {
    const code = parseAndApply("function f() {}", (ast) => applyControlFlowFlattening(ast));
    expect(code).not.toContain("switch");
  });

  it("passes=2 wraps the state machine in a second outer state machine", () => {
    const source = "function f() { const a = 1; const b = 2; const c = 3; }";
    const code = parseAndApply(source, (ast) => applyControlFlowFlattening(ast, { passes: 2 }));
    const switchCount = [...code.matchAll(/\bswitch\b/g)].length;
    expect(switchCount).toBeGreaterThanOrEqual(2);
  });

  // ─── SWC-specific: let/const hoisting and runtime correctness ────────────

  it("hoists let/const across cases and variables remain accessible at runtime", () => {
    // CFF converts 'let a = ...; let b = a * 2; return b;' into a switch state machine.
    // Each 'let'/'const' is extracted to a 'var' declarator so it is accessible
    // across all cases — this is the Babel→SWC hoisting migration requirement.
    const source = `
      function compute(x) {
        let a = x + 1;
        let b = a * 2;
        return b;
      }
      var __r = compute(3);
    `;
    const code = parseAndApply(source, (ast) => applyControlFlowFlattening(ast));
    expect(code).toContain("switch");
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect(ctx["__r"]).toBe(8); // (3+1)*2 = 8
  });

  it("preserves the return value of a flattened function at runtime", () => {
    const source = `
      function add(a, b) {
        const x = a + b;
        const y = x * 2;
        return y;
      }
      var __r = add(3, 4);
    `;
    const code = parseAndApply(source, (ast) => applyControlFlowFlattening(ast));
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect(ctx["__r"]).toBe(14); // (3+4)*2 = 14
  });

  it("hoists a let declaration with no initializer (let x;) without crashing", () => {
    // extractHoisted must return EmptyStatement for init-less declarations.
    // The case body must skip the EmptyStatement and only include the state update.
    const source = "function f() { let x; x = 5; return x; }";
    const code = parseAndApply(source, (ast) => applyControlFlowFlattening(ast));
    expect(code).toContain("switch");
    expect(() => parseSync(code, { syntax: "ecmascript" })).not.toThrow();
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    // Must not throw at runtime — the var declaration is valid even without init
    expect(() => vm.runInContext(code, ctx)).not.toThrow();
  });

  it("flattened function with multiple parameters executes correctly", () => {
    const source = `
      function clamp(val, lo, hi) {
        const r = val < lo ? lo : val > hi ? hi : val;
        return r;
      }
      var __r = clamp(15, 0, 10);
    `;
    const code = parseAndApply(source, (ast) => applyControlFlowFlattening(ast));
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect(ctx["__r"]).toBe(10);
  });
});

// ─── deadCode ────────────────────────────────────────────────────────────────

describe("deadCode", () => {
  it("injects dead code statements using opaque predicates", () => {
    const code = parseAndApply("const x = 1;", (ast) => applyDeadCode(ast, { targetLines: 5 }));
    // All 7 templates produce either randHexId (_0x<8hex>) or randInternalId (_mask_xxx, _hash_xxx, etc.)
    expect(code).toMatch(
      /_0x[0-9a-fасе]{16}|_mask_|_hash_|_flag_|_val_|_acc_|_shift_|_buf_|_idx_|_key_|_state_|_tmp_|_crc_/
    );
  });

  it("targetLines=0 injects nothing", () => {
    const ast = parseAst("const x = 1;");
    const before = (ast as any).body.length;
    applyDeadCode(ast, { targetLines: 0 });
    expect((ast as any).body.length).toBe(before);
  });

  it("injects exactly targetLines statements when body is large enough", () => {
    // With 8 original statements the insertAt stride (+=2) never exceeds body.length
    // for targetLines=6 injections, so all 6 are inserted.
    const ast = parseAst(
      "const a=1; const b=2; const c=3; const d=4; const e=5; const f=6; const g=7; const h=8;"
    );
    const before = (ast as any).body.length; // 8
    applyDeadCode(ast, { targetLines: 6 });
    expect((ast as any).body.length).toBe(before + 6);
  });

  it("output remains parseable after injection", () => {
    const code = parseAndApply("const a = 1; const b = 2;", (ast) =>
      applyDeadCode(ast, { targetLines: 10 })
    );
    expect(() => parseSync(code, { syntax: "ecmascript" })).not.toThrow();
  });

  it("injects fewer than targetLines when stride exceeds body size", () => {
    // 1-statement body: stride +2 exhausts available slots after ~2 injections
    const ast = parseAst("const x = 1;");
    const before = (ast as any).body.length;
    applyDeadCode(ast, { targetLines: 20 });
    expect((ast as any).body.length).toBeGreaterThan(before);
    expect((ast as any).body.length).toBeLessThan(before + 20);
  });
});
