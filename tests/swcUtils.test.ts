/**
 * Unit tests for src/swc-utils.ts.
 *
 * Focuses on SWC-vs-Babel structural differences that were the primary
 * migration risk:
 *   - Node builder field names (.value, .stmts, .identifier, …)
 *   - SWC's {spread, expression} wrapper objects for array/call arguments
 *   - traverse visitor protocol (enter/exit, replaceWith, remove, skip)
 *   - Composite "Function" visitor expansion
 *   - && / || as BinaryExpression (no LogicalExpression in SWC)
 *   - ExportDefaultExpression vs ExportDefaultDeclaration
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { parseSync, printSync } from "@swc/core";
import { traverse, t } from "../src/swc-utils";
import type { SwcProgram } from "../src/swc-utils";

function parse(source: string): SwcProgram {
  return parseSync(source, { syntax: "ecmascript" }) as unknown as SwcProgram;
}

// ─── t.* node builders — SWC field names ────────────────────────────────────

describe("t.* builders — SWC field names (Babel migration guard)", () => {
  it("t.identifier uses .value, not .name", () => {
    const node = t.identifier("foo");
    expect(node.type).toBe("Identifier");
    expect(node.value).toBe("foo");
    expect((node as any).name).toBeUndefined();
  });

  it("t.blockStatement uses .stmts, not .body", () => {
    const block = t.blockStatement([t.expressionStatement(t.numericLiteral(1))]);
    expect(block.type).toBe("BlockStatement");
    expect(Array.isArray(block.stmts)).toBe(true);
    expect(block.stmts).toHaveLength(1);
    expect((block as any).body).toBeUndefined();
  });

  it("t.functionDeclaration uses .identifier, not .id", () => {
    const id = t.identifier("fn");
    const node = t.functionDeclaration(id, [], t.blockStatement([]));
    expect(node.type).toBe("FunctionDeclaration");
    expect(node.identifier).toBe(id);
    expect((node as any).id).toBeUndefined();
  });

  it("t.callExpression wraps each argument in a {spread:null, expression} object", () => {
    // SWC CallExpression.arguments = Array<{ spread: Span|null, expression: Expr }>
    const arg = t.stringLiteral("x");
    const node = t.callExpression(t.identifier("fn"), [arg]);
    expect(node.type).toBe("CallExpression");
    expect(node.arguments).toHaveLength(1);
    expect(node.arguments[0]).toMatchObject({ spread: null, expression: arg });
    // The wrapper itself must not have a .value property (it is not the literal)
    expect((node.arguments[0] as any).value).toBeUndefined();
  });

  it("t.arrayExpression wraps each element in a {spread:null, expression} object", () => {
    const el = t.numericLiteral(1);
    const node = t.arrayExpression([el]);
    expect(node.type).toBe("ArrayExpression");
    expect(node.elements).toHaveLength(1);
    expect(node.elements[0]).toMatchObject({ spread: null, expression: el });
  });

  it("t.logicalExpression (&&/||) emits BinaryExpression — SWC has no LogicalExpression type", () => {
    const node = t.logicalExpression("&&", t.identifier("a"), t.identifier("b"));
    expect(node.type).toBe("BinaryExpression");
    expect(node.operator).toBe("&&");
  });

  it("t.memberExpression with computed=true wraps property in a Computed node", () => {
    const idx = t.numericLiteral(0);
    const node = t.memberExpression(t.identifier("arr"), idx, true);
    expect(node.type).toBe("MemberExpression");
    expect(node.property.type).toBe("Computed");
    expect((node.property as any).expression).toBe(idx);
  });

  it("t.memberExpression with computed=false leaves the property node as-is", () => {
    const prop = t.identifier("bar");
    const node = t.memberExpression(t.identifier("obj"), prop, false);
    expect(node.property.type).toBe("Identifier");
    expect((node.property as any).value).toBe("bar");
  });

  it("t.isIdentifier name option matches via .value (SWC) field", () => {
    const node = t.identifier("hello");
    expect(t.isIdentifier(node, { name: "hello" })).toBe(true);
    expect(t.isIdentifier(node, { name: "other" })).toBe(false);
  });

  it("t.isExportDefaultDeclaration returns true for ExportDefaultExpression (export default expr)", () => {
    // SWC emits `ExportDefaultExpression` for `export default <expr>;`
    const ast = parse("export default 42;");
    const node = (ast as any).body[0];
    expect(node.type).toBe("ExportDefaultExpression");
    expect(t.isExportDefaultDeclaration(node)).toBe(true);
  });

  it("t.isExportDefaultDeclaration returns true for ExportDefaultDeclaration (export default function)", () => {
    // SWC emits `ExportDefaultDeclaration` for `export default function f() {}`
    const ast = parse("export default function f() {}");
    const node = (ast as any).body[0];
    expect(node.type).toBe("ExportDefaultDeclaration");
    expect(t.isExportDefaultDeclaration(node)).toBe(true);
  });
});

// ─── SWC parser output — field structure verification ───────────────────────

describe("SWC parser output — SWC-specific field names", () => {
  it("parsed BlockStatement uses .stmts not .body", () => {
    const ast = parse("function f() { return 1; }");
    const fnDecl = (ast as any).body[0];
    expect(fnDecl.body.type).toBe("BlockStatement");
    expect(Array.isArray(fnDecl.body.stmts)).toBe(true);
    expect((fnDecl.body as any).body).toBeUndefined();
  });

  it("parsed FunctionDeclaration uses .identifier not .id", () => {
    const ast = parse("function myFn() {}");
    const fnDecl = (ast as any).body[0];
    expect(fnDecl.type).toBe("FunctionDeclaration");
    expect(fnDecl.identifier?.value).toBe("myFn");
    expect(fnDecl.id).toBeUndefined();
  });

  it("parsed CallExpression arguments are {spread, expression} wrappers, not raw nodes", () => {
    const ast = parse('foo("bar");');
    const callExpr = (ast as any).body[0].expression;
    expect(callExpr.type).toBe("CallExpression");
    // Argument must be a wrapper object, not the StringLiteral directly
    expect(callExpr.arguments[0]).toMatchObject({ spread: null });
    expect(callExpr.arguments[0].expression.type).toBe("StringLiteral");
    expect(callExpr.arguments[0].expression.value).toBe("bar");
  });

  it("parsed ArrayExpression elements are {spread, expression} wrappers", () => {
    const ast = parse('var a = ["x"];');
    const arrExpr = (ast as any).body[0].declarations[0].init;
    expect(arrExpr.type).toBe("ArrayExpression");
    expect(arrExpr.elements[0]).toMatchObject({ spread: null });
    expect(arrExpr.elements[0].expression.type).toBe("StringLiteral");
  });

  it("parsed && and || are BinaryExpression, not LogicalExpression", () => {
    const ast = parse("const r = a && b;");
    const init = (ast as any).body[0].declarations[0].init;
    expect(init.type).toBe("BinaryExpression");
    expect(init.operator).toBe("&&");
  });

  it("parsed || is also BinaryExpression", () => {
    const ast = parse("const r = a || b;");
    const init = (ast as any).body[0].declarations[0].init;
    expect(init.type).toBe("BinaryExpression");
    expect(init.operator).toBe("||");
  });
});

// ─── traverse — wrapper object traversal ────────────────────────────────────

describe("traverse — SWC wrapper object traversal", () => {
  it("visits StringLiteral nodes inside CallExpression argument wrappers", () => {
    // Core SWC migration guard: arguments = [{spread, expression}], not [StringLiteral]
    const ast = parse('foo("hello");');
    const visited: string[] = [];
    traverse(ast, {
      StringLiteral(path) {
        visited.push(path.node.value);
      },
    });
    expect(visited).toContain("hello");
  });

  it("visits StringLiteral nodes inside ArrayExpression element wrappers", () => {
    const ast = parse('var a = ["item"];');
    const visited: string[] = [];
    traverse(ast, {
      StringLiteral(path) {
        visited.push(path.node.value);
      },
    });
    expect(visited).toContain("item");
  });

  it("path.parent for a node inside a call argument wrapper is the CallExpression", () => {
    // path.parent must skip the wrapper {spread, expression} and point to CallExpression
    const ast = parse('foo("hello");');
    let parentType: string | null = null;
    traverse(ast, {
      StringLiteral(path) {
        parentType = path.parent?.type ?? null;
      },
    });
    expect(parentType).toBe("CallExpression");
  });

  it("path.parent for a node inside an array element wrapper is the ArrayExpression", () => {
    const ast = parse('var a = ["x"];');
    let parentType: string | null = null;
    traverse(ast, {
      StringLiteral(path) {
        parentType = path.parent?.type ?? null;
      },
    });
    expect(parentType).toBe("ArrayExpression");
  });

  it("path.key is 'expression' for a node inside a {spread, expression} wrapper", () => {
    // In SWC, array/call argument wrappers are walked by key — path.key is the
    // wrapper's property name ("expression"), NOT the numeric array index.
    const ast = parse('foo("test");');
    let capturedKey: string | number | null = null;
    traverse(ast, {
      StringLiteral(path) {
        capturedKey = path.key;
      },
    });
    expect(capturedKey).toBe("expression");
  });

  it("path.key is the property name ('key') for a StringLiteral used as object property key", () => {
    // This is what stringPool uses to detect computed-key context
    const ast = parse("var o = { 'name': 1 };");
    let capturedKey: string | number | null = null;
    traverse(ast, {
      StringLiteral(path) {
        if (path.node.value === "name") capturedKey = path.key;
      },
    });
    expect(capturedKey).toBe("key");
  });

  it("replaceWith inside a call argument wrapper correctly updates the AST and output", () => {
    // Critical: replaceWith must set wrapper.expression = newNode (not array[i])
    const ast = parse('var r = foo("old");');
    traverse(ast, {
      StringLiteral(path) {
        path.replaceWith(t.stringLiteral("new"));
      },
    });
    const code = printSync(ast as any).code;
    expect(code).toContain('"new"');
    expect(code).not.toContain('"old"');
  });

  it("replaceWith inside an array element wrapper correctly updates the AST and output", () => {
    const ast = parse('var a = ["old"];');
    traverse(ast, {
      StringLiteral(path) {
        path.replaceWith(t.numericLiteral(42));
      },
    });
    const code = printSync(ast as any).code;
    expect(code).toContain("42");
    expect(code).not.toContain('"old"');
  });

  it("traverse fires no LogicalExpression visitors — SWC uses BinaryExpression for && / ||", () => {
    const ast = parse("const r = a && b || c;");
    let firedLogical = false;
    traverse(ast, {
      // LogicalExpression is not a SWC node type — the visitor key simply never matches
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      ...({
        LogicalExpression: () => {
          firedLogical = true;
        },
      } as any),
    });
    expect(firedLogical).toBe(false);
  });
});

// ─── traverse — path operations ─────────────────────────────────────────────

describe("traverse — path operations (remove / replaceWith / skip)", () => {
  it("path.remove() splices the node from its parent array", () => {
    const ast = parse("const a = 1; const b = 2; const c = 3;");
    traverse(ast, {
      VariableDeclaration(path) {
        if ((path.node.declarations[0]?.init as any)?.value === 2) {
          path.remove();
        }
      },
    });
    const code = printSync(ast as any).code;
    expect(code).toContain("const a");
    expect(code).not.toContain("const b");
    expect(code).toContain("const c");
  });

  it("path.remove() of the first element shifts remaining indices correctly", () => {
    // Remove a=1 and c=3; b=2 must survive with correct index compensation
    const ast = parse("var a = 1; var b = 2; var c = 3;");
    traverse(ast, {
      VariableDeclaration(path) {
        const val = (path.node.declarations[0]?.init as any)?.value;
        if (val === 1 || val === 3) path.remove();
      },
    });
    const code = printSync(ast as any).code;
    expect(code).not.toContain("var a");
    expect(code).toContain("var b");
    expect(code).not.toContain("var c");
  });

  it("path.skip() prevents visiting child nodes", () => {
    // BinaryExpression has Identifier children; skip must suppress them
    const ast = parse("const r = a + b;");
    const visited: string[] = [];
    traverse(ast, {
      BinaryExpression(path) {
        visited.push("binary");
        path.skip();
      },
      Identifier(path) {
        visited.push("id:" + path.node.value);
      },
    });
    expect(visited).toContain("binary");
    // Identifiers a and b are children of the BinaryExpression — must be suppressed
    expect(visited.filter((v) => v === "id:a" || v === "id:b")).toHaveLength(0);
  });

  it("exit visitor fires after all child nodes have been visited", () => {
    const ast = parse("const r = a + b;");
    const log: string[] = [];
    traverse(ast, {
      BinaryExpression: {
        enter() {
          log.push("enter:Binary");
        },
        exit() {
          log.push("exit:Binary");
        },
      },
      Identifier: {
        // Only track the operand identifiers (a, b) to avoid the declarator `r`
        // firing before the BinaryExpression enter
        enter(path) {
          if (path.node.value === "a" || path.node.value === "b") {
            log.push("id:" + path.node.value);
          }
        },
      },
    });
    const enterIdx = log.indexOf("enter:Binary");
    const exitIdx = log.indexOf("exit:Binary");
    // At least one child Identifier must appear between enter and exit
    const firstIdIdx = log.findIndex((v) => v.startsWith("id:"));
    expect(enterIdx).toBeGreaterThanOrEqual(0);
    expect(firstIdIdx).toBeGreaterThan(enterIdx);
    expect(exitIdx).toBeGreaterThan(firstIdIdx);
  });

  it("replaceWith makes the new node available as path.node for exit visitor", () => {
    const ast = parse("const r = 0;");
    let nodeTypeAfterReplace: string | null = null;
    traverse(ast, {
      NumericLiteral: {
        enter(path) {
          path.replaceWith(t.stringLiteral("replaced"));
        },
        exit(path) {
          nodeTypeAfterReplace = path.node?.type ?? null;
        },
      },
    });
    expect(nodeTypeAfterReplace).toBe("StringLiteral");
    const code = printSync(ast as any).code;
    expect(code).toContain('"replaced"');
  });
});

// ─── traverse — composite Function visitor ──────────────────────────────────

describe("traverse — composite Function visitor", () => {
  it("fires for FunctionDeclaration", () => {
    const ast = parse("function fn(x) { return x; }");
    const types: string[] = [];
    traverse(ast, {
      Function(path) {
        types.push(path.node.type);
      },
    });
    expect(types).toContain("FunctionDeclaration");
  });

  it("fires for FunctionExpression", () => {
    const ast = parse("var f = function(x) { return x; };");
    const types: string[] = [];
    traverse(ast, {
      Function(path) {
        types.push(path.node.type);
      },
    });
    expect(types).toContain("FunctionExpression");
  });

  it("fires for ArrowFunctionExpression with a block body", () => {
    const ast = parse("const f = (x) => { return x; };");
    const types: string[] = [];
    traverse(ast, {
      Function(path) {
        types.push(path.node.type);
      },
    });
    expect(types).toContain("ArrowFunctionExpression");
  });

  it("fires for ArrowFunctionExpression with an expression body", () => {
    const ast = parse("const f = x => x * 2;");
    const types: string[] = [];
    traverse(ast, {
      Function(path) {
        types.push(path.node.type);
      },
    });
    expect(types).toContain("ArrowFunctionExpression");
  });

  it("fires for MethodProperty (object method shorthand)", () => {
    const ast = parse("var obj = { foo() { return 1; } };");
    const types: string[] = [];
    traverse(ast, {
      Function(path) {
        types.push(path.node.type);
      },
    });
    expect(types).toContain("MethodProperty");
  });

  it("fires for Constructor inside a class", () => {
    const ast = parse("class C { constructor() {} }");
    const types: string[] = [];
    traverse(ast, {
      Function(path) {
        types.push(path.node.type);
      },
    });
    expect(types).toContain("Constructor");
  });

  it("does NOT fire for non-function nodes", () => {
    const ast = parse("const x = 1 + 2;");
    const fired: string[] = [];
    traverse(ast, {
      Function(path) {
        fired.push(path.node.type);
      },
    });
    expect(fired).toHaveLength(0);
  });

  it("enter and exit both work for composite Function visitor", () => {
    const ast = parse("function fn() { return 1; }");
    const log: string[] = [];
    traverse(ast, {
      Function: {
        enter() {
          log.push("enter");
        },
        exit() {
          log.push("exit");
        },
      },
    });
    expect(log).toContain("enter");
    expect(log).toContain("exit");
    expect(log.indexOf("enter")).toBeLessThan(log.indexOf("exit"));
  });
});
