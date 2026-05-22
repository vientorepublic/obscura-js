import { parse } from "@babel/parser";
import generate from "@babel/generator";
import { applyIntegrityTag } from "../src/antiDebug/integrityTag";
import { applyNativeBinding } from "../src/antiDebug/nativeBinding";

function parseAndApply(source: string, fn: (ast: ReturnType<typeof parse>) => void): string {
  const ast = parse(source, { sourceType: "script" });
  fn(ast);
  return generate(ast).code;
}

describe("Anti-debug passes", () => {
  describe("integrityTag", () => {
    it("wraps array literals with __haze_tag", () => {
      const code = parseAndApply("const a = [1, 2, 3];", (ast) => applyIntegrityTag(ast));
      expect(code).toContain("__haze_tag");
      expect(code).toContain("__haze_sym");
    });
  });

  describe("nativeBinding", () => {
    it("prepends pre-bound native method constants", () => {
      const code = parseAndApply("const x = 1;", (ast) => applyNativeBinding(ast, { methods: ["Math.floor"] }));
      expect(code).toContain("__haze_Math_floor");
      expect(code).toContain(".bind(");
    });
  });
});
