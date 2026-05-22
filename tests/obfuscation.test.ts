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

  it("builds __obscura_ft array from function declarations", () => {
    const code = parseAndApply(twoFnSource, (ast) => applyFunctionTable(ast));
    expect(code).toContain("__obscura_ft");
    expect(code).not.toMatch(/^function add/m);
    expect(code).not.toMatch(/^function sub/m);
  });

  it("replaces call sites with indexed lookups", () => {
    const code = parseAndApply(twoFnSource, (ast) => applyFunctionTable(ast));
    expect(code).toMatch(/__obscura_ft\[0\]/);
    expect(code).toMatch(/__obscura_ft\[1\]/);
  });

  it("skips transformation when function count is below minFunctions", () => {
    const source = "function only() {} only();";
    const code = parseAndApply(source, (ast) => applyFunctionTable(ast, { minFunctions: 2 }));
    expect(code).not.toContain("__obscura_ft");
    expect(code).toContain("function only");
  });

  it("applies when minFunctions=1 and one function exists", () => {
    const source = "function solo(x) { return x; } solo(42);";
    const code = parseAndApply(source, (ast) => applyFunctionTable(ast, { minFunctions: 1 }));
    expect(code).toContain("__obscura_ft");
    expect(code).toMatch(/__obscura_ft\[0\]/);
  });
});

// ─── stringPool ──────────────────────────────────────────────────────────────

describe("stringPool", () => {
  it("replaces string literals with __obscura_sp calls", () => {
    const code = parseAndApply('const s = "hello";', (ast) => applyStringPool(ast, { seed: 42 }));
    expect(code).toContain("__obscura_sp");
    expect(code).not.toContain('"hello"');
  });

  it("deduplicates: identical strings share the same pool entry", () => {
    const code = parseAndApply('const a = "dup"; const b = "dup";', (ast) =>
      applyStringPool(ast, { seed: 10 })
    );
    // Both calls should reference the same start offset (0)
    const matches = [...code.matchAll(/__obscura_sp\((\d+),/g)];
    expect(matches).toHaveLength(2);
    expect(matches[0][1]).toBe(matches[1][1]); // same start offset
  });

  it("does not encrypt import path strings", () => {
    const ast = parse('import foo from "some-module";', { sourceType: "module" });
    applyStringPool(ast, { seed: 42 });
    const code = generate(ast).code;
    expect(code).toContain('"some-module"');
    expect(code).not.toContain("__obscura_sp");
  });

  it("does not encrypt require() argument strings", () => {
    const code = parseAndApply('const x = require("fs");', (ast) =>
      applyStringPool(ast, { seed: 42 })
    );
    expect(code).toContain('"fs"');
    expect(code).not.toContain("__obscura_sp");
  });

  it("no-op when there are no string literals", () => {
    const code = parseAndApply("const x = 1 + 2;", (ast) => applyStringPool(ast, { seed: 42 }));
    expect(code).not.toContain("__obscura_sp");
    expect(code).not.toContain("__obscura_pool");
  });

  it("pool decryption produces the original string at runtime", () => {
    const vm = require("vm") as typeof import("vm");
    // globalThis inside a vm context IS the sandbox object itself
    const source = 'var __result = "haze";';
    const code = parseAndApply(source, (ast) => applyStringPool(ast, { seed: 99 }));
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    expect(ctx["__result"]).toBe("haze");
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
    expect(code).toContain("__obscura_s");
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
