import { parse } from "@babel/parser";
import generate from "@babel/generator";
import { applySequenceExpression } from "../src/obfuscation/sequenceExpression";
import { applyMba } from "../src/obfuscation/mba";
import { applyFunctionTable } from "../src/obfuscation/functionTable";
import { applyStringPool } from "../src/obfuscation/stringPool";
import { applyControlFlowFlattening } from "../src/obfuscation/cff";
import { applyDeadCode } from "../src/obfuscation/deadCode";

type ParseResult = ReturnType<typeof parse>;

function parseAndApply(source: string, fn: (ast: ParseResult) => void): string {
  const ast = parse(source, { sourceType: "script" });
  fn(ast);
  return generate(ast).code;
}

function parseAst(source: string): ParseResult {
  return parse(source, { sourceType: "script" });
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
    expect(code).toMatch(/const _0x[0-9a-f]{8} = \[/);
    expect(code).not.toMatch(/^function add/m);
    expect(code).not.toMatch(/^function sub/m);
  });

  it("replaces call sites with indexed lookups", () => {
    const code = parseAndApply(twoFnSource, (ast) => applyFunctionTable(ast));
    expect(code).toMatch(/_0x[0-9a-f]{8}\[0\]/);
    expect(code).toMatch(/_0x[0-9a-f]{8}\[1\]/);
  });

  it("skips transformation when function count is below minFunctions", () => {
    const source = "function only() {} only();";
    const code = parseAndApply(source, (ast) => applyFunctionTable(ast, { minFunctions: 2 }));
    // No function table array — original declaration must survive
    expect(code).not.toMatch(/const _0x[0-9a-f]{8} = \[/);
    expect(code).toContain("function only");
  });

  it("applies when minFunctions=1 and one function exists", () => {
    const source = "function solo(x) { return x; } solo(42);";
    const code = parseAndApply(source, (ast) => applyFunctionTable(ast, { minFunctions: 1 }));
    expect(code).toMatch(/const _0x[0-9a-f]{8} = \[/);
    expect(code).toMatch(/_0x[0-9a-f]{8}\[0\]/);
  });

  it("skips ESM-exported function declarations (export { foo })", () => {
    // foo is exported by specifier — must keep its declaration.
    // bar is internal — can be moved to the table when minFunctions=1.
    const ast = parse(
      "function foo() { return 1; }\nfunction bar() { return 2; }\nexport { foo };",
      { sourceType: "module" }
    );
    applyFunctionTable(ast, { minFunctions: 1 });
    const code = generate(ast).code;
    expect(code).toContain("function foo");
    // bar has no leak — it is moved to the table
    expect(code).toMatch(/const _0x[0-9a-f]{8} = \[/);
    expect(code).not.toContain("function bar(");
  });

  it("skips ESM export-default-by-identifier functions", () => {
    const ast = parse(
      "function foo() { return 1; }\nfunction bar() { return 2; }\nexport default foo;",
      { sourceType: "module" }
    );
    applyFunctionTable(ast, { minFunctions: 1 });
    const code = generate(ast).code;
    expect(code).toContain("function foo");
  });

  it("skips CJS module.exports-assigned function declarations", () => {
    // foo is leaked via module.exports — must keep its declaration.
    // bar is internal and can be moved to the table.
    const ast = parse(
      "function foo() { return 1; }\nfunction bar() { return 2; }\nmodule.exports = { foo };\nbar();",
      { sourceType: "script" }
    );
    applyFunctionTable(ast, { minFunctions: 1 });
    const code = generate(ast).code;
    expect(code).toContain("function foo");
    expect(code).toMatch(/const _0x[0-9a-f]{8} = \[/);
  });

  it("skips CJS exports.foo = funcName assignments", () => {
    const ast = parse("function greet() { return 'hi'; }\nexports.greet = greet;", {
      sourceType: "script",
    });
    applyFunctionTable(ast, { minFunctions: 1 });
    const code = generate(ast).code;
    expect(code).toContain("function greet");
    expect(code).not.toMatch(/const _0x[0-9a-f]{8} = \[/);
  });
});

// ─── stringPool ──────────────────────────────────────────────────────────────

describe("stringPool", () => {
  it("replaces string literals with pool decryption calls", () => {
    const code = parseAndApply('const s = "hello";', (ast) => applyStringPool(ast, { seed: 42 }));
    // Original string must be gone; a hex-named function call must appear
    expect(code).toMatch(/_0x[0-9a-f]{8}\(/);
    expect(code).not.toContain('"hello"');
  });

  it("identical strings at different sites get distinct pool entries", () => {
    const vm = require("vm") as typeof import("vm");
    const code = parseAndApply('var a = "dup"; var b = "dup";', (ast) =>
      applyStringPool(ast, { seed: 10 })
    );
    const matches = [...code.matchAll(/_0x[0-9a-f]{8}\((\d+),/g)];
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
    const ast = parse('import foo from "some-module";', { sourceType: "module" });
    applyStringPool(ast, { seed: 42 });
    const code = generate(ast).code;
    expect(code).toContain('"some-module"');
    expect(code).not.toMatch(/_0x[0-9a-f]{8}\(/);
  });

  it("does not encrypt dynamic import() path strings", () => {
    const ast = parse('const m = import("./module");', { sourceType: "module" });
    applyStringPool(ast, { seed: 42 });
    const code = generate(ast).code;
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
    expect(code).not.toMatch(/_0x[0-9a-f]{8}\(/);
  });

  it("no-op when there are no string literals", () => {
    const code = parseAndApply("const x = 1 + 2;", (ast) => applyStringPool(ast, { seed: 42 }));
    // Nothing injected — no hex-named identifiers at all
    expect(code).not.toMatch(/_0x[0-9a-f]{8}/);
  });

  it("pool decryption produces the original string at runtime", () => {
    const vm = require("vm") as typeof import("vm");
    const source = 'var __result = "haze";';
    const code = parseAndApply(source, (ast) => applyStringPool(ast, { seed: 99 }));
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect(ctx["__result"]).toBe("haze");
  });

  // ─── boundary conditions ─────────────────────────────────────────────────

  it("seed = 0 normalizes to 1 and decrypts correctly", () => {
    const vm = require("vm") as typeof import("vm");
    const code = parseAndApply('var r = "norm";', (ast) => applyStringPool(ast, { seed: 0 }));
    expect(code).not.toContain('"norm"');
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect(ctx["r"]).toBe("norm");
  });

  it("seed = 0x10000 (low 16 bits are zero) normalizes to 1 and decrypts correctly", () => {
    const vm = require("vm") as typeof import("vm");
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
    const vm = require("vm") as typeof import("vm");
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
    const vm = require("vm") as typeof import("vm");
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
    const vm = require("vm") as typeof import("vm");
    const code = parseAndApply('var r = "Hello \uD83D\uDE00\uD83C\uDF89";', (ast) =>
      applyStringPool(ast, { seed: 77 })
    );
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect(ctx["r"]).toBe("Hello \uD83D\uDE00\uD83C\uDF89");
  });

  it("correctly round-trips empty string", () => {
    const vm = require("vm") as typeof import("vm");
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
    const poolAst = parse(code, { sourceType: "script" });
    const poolDecl = poolAst.program.body[1] as any;
    const elements: Array<{ value: number }> = poolDecl.declarations[0].init.elements;
    expect(elements.length).toBeGreaterThan(0);
    for (const el of elements) {
      expect(el.value).toBeGreaterThanOrEqual(0);
      expect(el.value).toBeLessThanOrEqual(0xffff);
    }
  });

  // ─── boundary conditions: context-aware encryption ──────────────────────

  it("encrypts non-computed object property string keys (computed flipped)", () => {
    const vm = require("vm") as typeof import("vm");
    // { 'foo': 99 } — key must be encrypted; value accessible at runtime
    const code = parseAndApply("var o = { 'foo': 99 };", (ast) =>
      applyStringPool(ast, { seed: 42 })
    );
    expect(code).not.toContain("'foo'");
    expect(code).not.toContain('"foo"');
    // Generator must emit computed syntax [ ] around the encrypted key
    expect(code).toMatch(/\[_0x[0-9a-f]{8}\(/);
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect((ctx["o"] as Record<string, unknown>)["foo"]).toBe(99);
  });

  it("encrypts class method string keys and method remains callable", () => {
    const vm = require("vm") as typeof import("vm");
    const code = parseAndApply(
      "class C { 'greet'() { return 'hi'; } } var r = new C().greet();",
      (ast) => applyStringPool(ast, { seed: 42 })
    );
    expect(code).not.toContain("'greet'");
    expect(code).toMatch(/\[_0x[0-9a-f]{8}\(/);
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect(ctx["r"]).toBe("hi");
  });

  it("encrypts JSX attribute string values via JSXExpressionContainer", () => {
    const ast = parse("<div className='bar'>t</div>;", {
      sourceType: "script",
      plugins: ["jsx"],
    });
    applyStringPool(ast, { seed: 42 });
    const code = generate(ast).code;
    // String literal must be gone; expression container must replace it
    expect(code).not.toContain("'bar'");
    expect(code).not.toContain('"bar"');
    expect(code).toContain("className={");
  });

  it("encrypts export default string value", () => {
    const ast = parse("export default 'secret';", { sourceType: "module" });
    applyStringPool(ast, { seed: 42 });
    const code = generate(ast).code;
    expect(code).not.toContain("'secret'");
    expect(code).not.toContain('"secret"');
    expect(code).toMatch(/export default _0x[0-9a-f]{8}\(/);
  });

  it("preserves ES2022 export specifier string names", () => {
    // export { x as 'name' } — 'name' is a binding identifier, must stay
    const ast = parse("const x = 1; export { x as 'thing' };", { sourceType: "module" });
    applyStringPool(ast, { seed: 42 });
    const code = generate(ast).code;
    expect(code).toMatch(/as 'thing'|as "thing"/);
  });

  it("preserves ES2022 import specifier string names", () => {
    // import { 'foo' as bar } — 'foo' is the remote binding name, must stay
    const ast = parse("import { 'foo' as bar } from './m';", { sourceType: "module" });
    applyStringPool(ast, { seed: 42 });
    const code = generate(ast).code;
    expect(code).toMatch(/'foo' as|"foo" as/);
  });

  it("skips empty string literals (no pool entry injected)", () => {
    const code = parseAndApply('var x = "";', (ast) => applyStringPool(ast, { seed: 42 }));
    // No pool function or pool array should appear — nothing to encrypt
    expect(code).not.toMatch(/_0x[0-9a-f]{8}/);
    expect(code).toContain('""');
  });

  // ─── template literal encryption ──────────────────────────────────────────

  it("encrypts all-static template literal into a single pool call", () => {
    const vm = require("vm") as typeof import("vm");
    // `hello` has no expressions — result should be just a pool call, not a template
    const code = parseAndApply("var s = `hello`;", (ast) => applyStringPool(ast, { seed: 42 }));
    expect(code).not.toContain("`hello`");
    expect(code).toMatch(/_0x[0-9a-f]{8}\(/);
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect(ctx["s"]).toBe("hello");
  });

  it("encrypts static quasis and preserves expressions in template literals", () => {
    const vm = require("vm") as typeof import("vm");
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
    const vm = require("vm") as typeof import("vm");
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
    expect(code).not.toMatch(/_0x[0-9a-f]{8}/);
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
    const vm = require("vm") as typeof import("vm");
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
    expect(code).toMatch(/_0x[0-9a-f]{8}/);
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
});

// ─── deadCode ────────────────────────────────────────────────────────────────

describe("deadCode", () => {
  it("injects dead code statements using opaque predicates", () => {
    const code = parseAndApply("const x = 1;", (ast) => applyDeadCode(ast, { targetLines: 5 }));
    // All 7 templates produce either randHexId (_0x<8hex>) or randInternalId (_mask_xxx, _hash_xxx, etc.)
    expect(code).toMatch(
      /_0x[0-9a-f]{8}|_mask_|_hash_|_flag_|_val_|_acc_|_shift_|_buf_|_idx_|_key_|_state_|_tmp_|_crc_/
    );
  });

  it("targetLines=0 injects nothing", () => {
    const ast = parseAst("const x = 1;");
    const before = ast.program.body.length;
    applyDeadCode(ast, { targetLines: 0 });
    expect(ast.program.body.length).toBe(before);
  });

  it("injects exactly targetLines statements when body is large enough", () => {
    // With 8 original statements the insertAt stride (+=2) never exceeds body.length
    // for targetLines=6 injections, so all 6 are inserted.
    const ast = parseAst(
      "const a=1; const b=2; const c=3; const d=4; const e=5; const f=6; const g=7; const h=8;"
    );
    const before = ast.program.body.length; // 8
    applyDeadCode(ast, { targetLines: 6 });
    expect(ast.program.body.length).toBe(before + 6);
  });

  it("output remains parseable after injection", () => {
    const code = parseAndApply("const a = 1; const b = 2;", (ast) =>
      applyDeadCode(ast, { targetLines: 10 })
    );
    expect(() => parse(code, { sourceType: "script" })).not.toThrow();
  });
});
