import { parse } from "@babel/parser";
import generate from "@babel/generator";
import { applySequenceExpression } from "../src/obfuscation/sequenceExpression";
import { applyMba } from "../src/obfuscation/mba";
import { applyStringPool } from "../src/obfuscation/stringPool";
import { applyControlFlowFlattening } from "../src/obfuscation/cff";
import { applyDeadCode } from "../src/obfuscation/deadCode";

function parseAndApply(source: string, fn: (ast: ReturnType<typeof parse>) => void): string {
  const ast = parse(source, { sourceType: "script" });
  fn(ast);
  return generate(ast).code;
}

describe("Obfuscation passes", () => {
  describe("sequenceExpression", () => {
    it("flattens a simple if block", () => {
      const code = parseAndApply("if (x) { a = 1; b = 2; }", (ast) => applySequenceExpression(ast, { probability: 1 }));
      expect(code).toContain("&&");
      expect(code).not.toContain("if");
    });
  });

  describe("mba", () => {
    it("expands addition into MBA form", () => {
      const code = parseAndApply("const r = a + b;", (ast) => applyMba(ast, { rounds: 1 }));
      expect(code).toContain("^");
      expect(code).toContain("&");
    });
  });

  describe("stringPool", () => {
    it("replaces string literals with decryption calls", () => {
      const code = parseAndApply('const s = "hello";', (ast) => applyStringPool(ast, { seed: 42 }));
      expect(code).toContain("__haze_sp");
      expect(code).not.toContain('"hello"');
    });
  });

  describe("controlFlowFlattening", () => {
    it("converts a function body into a state machine", () => {
      const code = parseAndApply("function f() { const a = 1; const b = 2; const c = 3; }", (ast) => applyControlFlowFlattening(ast));
      expect(code).toContain("switch");
      expect(code).toContain("while");
    });
  });

  describe("deadCode", () => {
    it("injects unreachable statements", () => {
      const code = parseAndApply("const x = 1;", (ast) => applyDeadCode(ast, { targetLines: 5 }));
      expect(code).toContain("0 === 1");
    });
  });
});
