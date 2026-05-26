/**
 * SWC utilities: traverse + node builder (t.*) functions.
 *
 * Provides a Babel-like API that operates on SWC AST nodes so that the rest
 * of the codebase can be migrated without rewriting every pass.
 *
 * Key SWC vs Babel differences handled here:
 *   - Identifier.value  (not .name)
 *   - BlockStatement.stmts  (not .body)
 *   - FunctionDeclaration.identifier  (not .id)
 *   - Params are { type:"Parameter", pat: Pattern, ... }
 *   - MemberExpression computed props: { type:"Computed", expression: Expr }
 *   - CallExpression.arguments: { spread: null, expression: Expr }[]
 *   - ArrayExpression.elements: { spread: null, expression: Expr }[]
 *   - ObjectProperty → KeyValueProperty
 *   - && / || are still "BinaryExpression" in SWC (no LogicalExpression type)
 *   - Top-level is Module|Script, not File→Program
 *   - TryStatement uses .block not .body
 */

// ─── Dummy span/ctxt for synthesized nodes ──────────────────────────────────

export const DUMMY_SPAN = { start: 0, end: 0, ctxt: 0 };

// ─── SWC program type ────────────────────────────────────────────────────────

/** The top-level SWC AST node (replaces Babel's t.File) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SwcProgram = {
  type: "Module" | "Script";
  body: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  span: typeof DUMMY_SPAN;
  ctxt: 0;
  interpreter: null;
};

// ─── NodePath ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface NodePath<T = any> {
  node: T;
  /** Closest ancestor AST node (has a .type property) */
  parent: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  parentPath: NodePath | null;
  /**
   * - For object properties: the property name on the parent (e.g. "left", "key", "value")
   * - For array items: the numeric index
   */
  key: string | number | null;
  /** When the node is in an array, this is the property name of that array on `parent` */
  listKey: string | null;

  replaceWith(newNode: any): void; // eslint-disable-line @typescript-eslint/no-explicit-any
  remove(): void;
  skip(): void;
}

// ─── Visitor types ───────────────────────────────────────────────────────────

type VisitorFn = (path: NodePath) => void;
type VisitorEntry = VisitorFn | { enter?: VisitorFn; exit?: VisitorFn };
export type Visitors = Record<string, VisitorEntry>;

/** SWC node types that the composite "Function" visitor expands to */
const FUNCTION_TYPES: ReadonlySet<string> = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "MethodProperty",
  "GetterProperty",
  "SetterProperty",
  "Constructor",
]);

// ─── traverse ────────────────────────────────────────────────────────────────

/**
 * Traverse a SWC AST, calling visitor functions for matching node types.
 * Supports enter/exit, `path.replaceWith()`, `path.remove()`, `path.skip()`.
 *
 * Composite visitor "Function" expands to FunctionDeclaration, FunctionExpression,
 * ArrowFunctionExpression, and method variants.
 */
export function traverse(ast: SwcProgram, visitors: Visitors): void {
  // Expand composite visitors
  const expanded: Record<string, { enter?: VisitorFn; exit?: VisitorFn }> = {};

  for (const [key, val] of Object.entries(visitors)) {
    const entry: { enter?: VisitorFn; exit?: VisitorFn } =
      typeof val === "function" ? { enter: val } : val;

    const targets: string[] = key === "Function" ? [...FUNCTION_TYPES] : [key];
    for (const t of targets) {
      if (!expanded[t]) expanded[t] = {};
      if (entry.enter) {
        const prev = expanded[t].enter;
        expanded[t].enter = prev
          ? (p) => {
              prev(p);
              entry.enter!(p);
            }
          : entry.enter;
      }
      if (entry.exit) {
        const prev = expanded[t].exit;
        expanded[t].exit = prev
          ? (p) => {
              prev(p);
              entry.exit!(p);
            }
          : entry.exit;
      }
    }
  }

  // Walk children of the top-level program node
  walkChildren(ast, null, expanded);
}

/**
 * Walk all children of an AST node, calling visitors for each child.
 * `astParent` is the nearest ancestor with a .type property.
 * `astParentPath` is its NodePath (or null for the top-level program).
 */
function walkChildren(
  astParent: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  astParentPath: NodePath | null,
  visitors: Record<string, { enter?: VisitorFn; exit?: VisitorFn }>
): void {
  for (const childKey of Object.keys(astParent)) {
    if (childKey === "span" || childKey === "type" || childKey === "ctxt") continue;
    const childVal = (astParent as any)[childKey]; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!childVal || typeof childVal !== "object") continue;

    if (Array.isArray(childVal)) {
      // Walk array — items may be direct AST nodes or wrapper objects like { spread, expression }
      let i = 0;
      while (i < childVal.length) {
        const prevLen = childVal.length;
        walkValue(childVal[i], astParent, astParentPath, childVal, i, childKey, visitors);
        // Compensate if splice removed the item
        if (childVal.length < prevLen) {
          // index stays the same (next item shifted into position i)
        } else {
          i++;
        }
      }
    } else if (childVal.type) {
      // Direct AST node child
      walkAstNode(childVal, astParent, astParentPath, astParent, childKey, null, visitors);
    } else {
      // Non-AST wrapper object (e.g. TemplateElement's value, but that's gone in SWC)
      // Walk its properties in case they contain AST nodes
      for (const wrapKey of Object.keys(childVal)) {
        const wrapVal = childVal[wrapKey];
        if (wrapVal && typeof wrapVal === "object" && !Array.isArray(wrapVal) && wrapVal.type) {
          walkAstNode(wrapVal, astParent, astParentPath, childVal, wrapKey, null, visitors);
        }
      }
    }
  }
}

/**
 * Dispatch on whether `item` is a direct AST node or a wrapper
 * (like CallExpression arguments: `{ spread, expression }`).
 */
function walkValue(
  item: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  astParent: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  astParentPath: NodePath | null,
  container: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  key: string | number,
  listKey: string,
  visitors: Record<string, { enter?: VisitorFn; exit?: VisitorFn }>
): void {
  if (!item || typeof item !== "object") return;

  if (item.type) {
    // Direct AST node in the array
    walkAstNode(item, astParent, astParentPath, container, key, listKey, visitors);
  } else {
    // Wrapper object (e.g. { spread: null, expression: Expr })
    // Walk its properties looking for AST nodes
    for (const wrapKey of Object.keys(item)) {
      const wrapVal = item[wrapKey];
      if (!wrapVal || typeof wrapVal !== "object") continue;
      if (Array.isArray(wrapVal)) {
        let wi = 0;
        while (wi < wrapVal.length) {
          const prevLen = wrapVal.length;
          walkValue(wrapVal[wi], astParent, astParentPath, wrapVal, wi, wrapKey, visitors);
          if (wrapVal.length < prevLen) {
            /* removed */
          } else {
            wi++;
          }
        }
      } else if (wrapVal.type) {
        walkAstNode(wrapVal, astParent, astParentPath, item, wrapKey, null, visitors);
      }
    }
  }
}

/**
 * Visit a single AST node (has a .type property).
 * Creates a NodePath, calls enter visitor, walks children, calls exit visitor.
 */
function walkAstNode(
  node: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  astParent: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  astParentPath: NodePath | null,
  container: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  key: string | number,
  listKey: string | null,
  visitors: Record<string, { enter?: VisitorFn; exit?: VisitorFn }>
): void {
  if (!node || typeof node !== "object" || !node.type) return;

  let skipped = false;
  let removed = false;

  const path: NodePath = {
    node,
    parent: astParent,
    parentPath: astParentPath,
    key,
    listKey,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    replaceWith(newNode: any) {
      container[key] = newNode;
      path.node = newNode;
    },
    remove() {
      removed = true;
      if (Array.isArray(container)) {
        container.splice(key as number, 1);
      } else {
        container[key] = null;
      }
      path.node = null;
    },
    skip() {
      skipped = true;
    },
  };

  const visitorEntry = visitors[node.type];

  if (visitorEntry?.enter) {
    visitorEntry.enter(path);
    if (removed || path.node === null) return;
  }

  if (!skipped && path.node) {
    walkChildren(path.node, path, visitors);
  }

  if (!removed && path.node !== null && visitorEntry?.exit) {
    visitorEntry.exit(path);
  }
}

// ─── Node builders (t.*) ─────────────────────────────────────────────────────

/** Convert a Pattern (Identifier, etc.) to a SWC Parameter wrapper */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toParam(pat: any): any {
  if (pat && pat.type === "Parameter") return pat;
  return { type: "Parameter", span: DUMMY_SPAN, decorators: [], pat };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toArg(expr: any): any {
  return { spread: null, expression: expr };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toElement(expr: any): any {
  if (expr === null) return null;
  if (expr && expr.expression !== undefined) return expr; // already wrapped
  return { spread: null, expression: expr };
}

export const t = {
  // ── Identifiers & Literals ──────────────────────────────────────────────

  identifier(name: string): AnyNode {
    return { type: "Identifier", span: DUMMY_SPAN, ctxt: 0, value: name, optional: false };
  },

  stringLiteral(value: string): AnyNode {
    return { type: "StringLiteral", span: DUMMY_SPAN, value, raw: JSON.stringify(value) };
  },

  numericLiteral(value: number): AnyNode {
    return { type: "NumericLiteral", span: DUMMY_SPAN, value, raw: String(value) };
  },

  booleanLiteral(value: boolean): AnyNode {
    return { type: "BooleanLiteral", span: DUMMY_SPAN, value };
  },

  // ── Expressions ─────────────────────────────────────────────────────────

  binaryExpression(operator: string, left: AnyNode, right: AnyNode): AnyNode {
    return { type: "BinaryExpression", span: DUMMY_SPAN, operator, left, right };
  },

  /**
   * Babel's logicalExpression (&&, ||, ??) maps to BinaryExpression in SWC.
   */
  logicalExpression(operator: string, left: AnyNode, right: AnyNode): AnyNode {
    return { type: "BinaryExpression", span: DUMMY_SPAN, operator, left, right };
  },

  unaryExpression(operator: string, argument: AnyNode, prefix = true): AnyNode {
    void prefix; // SWC UnaryExpression has no prefix field — unary ops are always prefix in JS
    return { type: "UnaryExpression", span: DUMMY_SPAN, operator, argument };
  },

  updateExpression(operator: string, argument: AnyNode, prefix = false): AnyNode {
    return { type: "UpdateExpression", span: DUMMY_SPAN, operator, argument, prefix };
  },

  assignmentExpression(operator: string, left: AnyNode, right: AnyNode): AnyNode {
    return { type: "AssignmentExpression", span: DUMMY_SPAN, operator, left, right };
  },

  /**
   * member expression builder.
   * computed=true  → property = { type:"Computed", expression: prop }
   * computed=false → property = prop (Identifier node)
   */
  memberExpression(object: AnyNode, property: AnyNode, computed = false): AnyNode {
    const prop = computed ? { type: "Computed", span: DUMMY_SPAN, expression: property } : property;
    return { type: "MemberExpression", span: DUMMY_SPAN, object, property: prop };
  },

  callExpression(callee: AnyNode, args: AnyNode[]): AnyNode {
    return {
      type: "CallExpression",
      span: DUMMY_SPAN,
      ctxt: 0,
      callee,
      arguments: args.map(toArg),
      typeArguments: null,
    };
  },

  sequenceExpression(expressions: AnyNode[]): AnyNode {
    return { type: "SequenceExpression", span: DUMMY_SPAN, expressions };
  },

  conditionalExpression(test: AnyNode, consequent: AnyNode, alternate: AnyNode): AnyNode {
    return { type: "ConditionalExpression", span: DUMMY_SPAN, test, consequent, alternate };
  },

  arrayExpression(elements: AnyNode[]): AnyNode {
    return { type: "ArrayExpression", span: DUMMY_SPAN, elements: elements.map(toElement) };
  },

  objectExpression(properties: AnyNode[]): AnyNode {
    return { type: "ObjectExpression", span: DUMMY_SPAN, properties };
  },

  /**
   * Babel objectProperty → SWC KeyValueProperty.
   */
  objectProperty(key: AnyNode, value: AnyNode): AnyNode {
    return { type: "KeyValueProperty", key, value };
  },

  jsxExpressionContainer(expression: AnyNode): AnyNode {
    return { type: "JSXExpressionContainer", span: DUMMY_SPAN, expression };
  },

  functionExpression(
    id: AnyNode | null,
    params: AnyNode[],
    body: AnyNode,
    generator = false,
    async = false
  ): AnyNode {
    return {
      type: "FunctionExpression",
      span: DUMMY_SPAN,
      ctxt: 0,
      identifier: id,
      params: params.map(toParam),
      body,
      generator,
      async,
      decorators: [],
      typeParameters: null,
      returnType: null,
    };
  },

  parenthesizedExpression(expression: AnyNode): AnyNode {
    return {
      type: "ParenthesisExpression",
      span: DUMMY_SPAN,
      expression,
    };
  },

  // ── Statements ───────────────────────────────────────────────────────────

  expressionStatement(expression: AnyNode): AnyNode {
    return { type: "ExpressionStatement", span: DUMMY_SPAN, expression };
  },

  blockStatement(stmts: AnyNode[]): AnyNode {
    return { type: "BlockStatement", span: DUMMY_SPAN, ctxt: 0, stmts };
  },

  returnStatement(argument: AnyNode = null): AnyNode {
    return { type: "ReturnStatement", span: DUMMY_SPAN, argument };
  },

  breakStatement(label: AnyNode = null): AnyNode {
    return { type: "BreakStatement", span: DUMMY_SPAN, label };
  },

  emptyStatement(): AnyNode {
    return { type: "EmptyStatement", span: DUMMY_SPAN };
  },

  ifStatement(test: AnyNode, consequent: AnyNode, alternate: AnyNode = null): AnyNode {
    return { type: "IfStatement", span: DUMMY_SPAN, test, consequent, alternate };
  },

  whileStatement(test: AnyNode, body: AnyNode): AnyNode {
    return { type: "WhileStatement", span: DUMMY_SPAN, test, body };
  },

  forStatement(init: AnyNode, test: AnyNode, update: AnyNode, body: AnyNode): AnyNode {
    return { type: "ForStatement", span: DUMMY_SPAN, init, test, update, body };
  },

  switchStatement(discriminant: AnyNode, cases: AnyNode[]): AnyNode {
    return { type: "SwitchStatement", span: DUMMY_SPAN, discriminant, cases };
  },

  switchCase(test: AnyNode, consequent: AnyNode[]): AnyNode {
    return { type: "SwitchCase", span: DUMMY_SPAN, test, consequent };
  },

  tryStatement(block: AnyNode, handler: AnyNode = null, finalizer: AnyNode = null): AnyNode {
    return { type: "TryStatement", span: DUMMY_SPAN, block, handler, finalizer };
  },

  catchClause(param: AnyNode, body: AnyNode): AnyNode {
    return { type: "CatchClause", span: DUMMY_SPAN, param, body };
  },

  variableDeclaration(kind: "var" | "let" | "const", declarations: AnyNode[]): AnyNode {
    return {
      type: "VariableDeclaration",
      span: DUMMY_SPAN,
      ctxt: 0,
      kind,
      declare: false,
      declarations,
    };
  },

  variableDeclarator(id: AnyNode, init: AnyNode = null): AnyNode {
    return { type: "VariableDeclarator", span: DUMMY_SPAN, id, init, definite: false };
  },

  /**
   * Babel FunctionDeclaration: id, params, body
   * SWC FunctionDeclaration: identifier, params (Parameter[]), body
   */
  functionDeclaration(
    id: AnyNode,
    params: AnyNode[],
    body: AnyNode,
    generator = false,
    async = false
  ): AnyNode {
    return {
      type: "FunctionDeclaration",
      span: DUMMY_SPAN,
      ctxt: 0,
      identifier: id,
      declare: false,
      params: params.map(toParam),
      decorators: [],
      body,
      generator,
      async,
      typeParameters: null,
      returnType: null,
    };
  },

  // ── Type guards ──────────────────────────────────────────────────────────

  isBlockStatement(node: AnyNode): boolean {
    return node?.type === "BlockStatement";
  },

  isExpressionStatement(node: AnyNode): boolean {
    return node?.type === "ExpressionStatement";
  },

  isIfStatement(node: AnyNode): boolean {
    return node?.type === "IfStatement";
  },

  isSwitchStatement(node: AnyNode): boolean {
    return node?.type === "SwitchStatement";
  },

  isEmptyStatement(node: AnyNode): boolean {
    return node?.type === "EmptyStatement";
  },

  isVariableDeclaration(node: AnyNode, opts?: { kind?: string }): boolean {
    if (node?.type !== "VariableDeclaration") return false;
    if (opts?.kind !== undefined && node.kind !== opts.kind) return false;
    return true;
  },

  isIdentifier(node: AnyNode, opts?: { name?: string }): boolean {
    if (node?.type !== "Identifier") return false;
    // SWC uses .value; also accept .name for forward-compatibility
    const name = node.value ?? node.name;
    if (opts?.name !== undefined && name !== opts.name) return false;
    return true;
  },

  isStringLiteral(node: AnyNode): boolean {
    return node?.type === "StringLiteral";
  },

  isNumericLiteral(node: AnyNode): boolean {
    return node?.type === "NumericLiteral";
  },

  isTemplateLiteral(node: AnyNode): boolean {
    return node?.type === "TemplateLiteral";
  },

  isTaggedTemplateExpression(node: AnyNode): boolean {
    return node?.type === "TaggedTemplateExpression";
  },

  isCallExpression(node: AnyNode): boolean {
    return node?.type === "CallExpression";
  },

  /** Dynamic import() – SWC represents the callee as { type: "Import" } */
  isImport(node: AnyNode): boolean {
    return node?.type === "Import";
  },

  isMemberExpression(node: AnyNode, opts?: { computed?: boolean }): boolean {
    if (node?.type !== "MemberExpression") return false;
    if (opts?.computed !== undefined) {
      const isComputed = node.property?.type === "Computed";
      if (opts.computed !== isComputed) return false;
    }
    return true;
  },

  isObjectExpression(node: AnyNode): boolean {
    return node?.type === "ObjectExpression";
  },

  /** Babel ObjectProperty → SWC KeyValueProperty */
  isObjectProperty(node: AnyNode): boolean {
    return node?.type === "KeyValueProperty";
  },

  /** Babel ObjectMethod → SWC MethodProperty */
  isObjectMethod(node: AnyNode): boolean {
    return node?.type === "MethodProperty";
  },

  /** SWC ClassProperty */
  isClassProperty(node: AnyNode): boolean {
    return node?.type === "ClassProperty";
  },

  /** Class methods: ClassMethod in Babel → check ClassMember subtypes in SWC */
  isClassMethod(node: AnyNode): boolean {
    return node?.type === "ClassMethod";
  },

  isJSXAttribute(node: AnyNode): boolean {
    return node?.type === "JSXAttribute";
  },

  isImportDeclaration(node: AnyNode): boolean {
    return node?.type === "ImportDeclaration";
  },

  isExportNamedDeclaration(node: AnyNode): boolean {
    return node?.type === "ExportNamedDeclaration";
  },

  isExportAllDeclaration(node: AnyNode): boolean {
    return node?.type === "ExportAllDeclaration";
  },

  /** Import specifier: { type: "ImportSpecifier" } in both Babel and SWC */
  isImportSpecifier(node: AnyNode): boolean {
    return node?.type === "ImportSpecifier";
  },

  /**
   * Export specifier.
   * Babel: ExportSpecifier, SWC: ExportSpecifier (same type name).
   */
  isExportSpecifier(node: AnyNode): boolean {
    return node?.type === "ExportSpecifier";
  },

  isExportDefaultDeclaration(node: AnyNode): boolean {
    // SWC splits into ExportDefaultDeclaration (fn/class) and ExportDefaultExpression (expr)
    return node?.type === "ExportDefaultDeclaration" || node?.type === "ExportDefaultExpression";
  },

  /** Babel t.isProgram → SWC Module or Script */
  isProgram(node: AnyNode): boolean {
    return node?.type === "Module" || node?.type === "Script";
  },

  /** Generic expression type-guard */
  isExpression(node: AnyNode): boolean {
    if (!node || typeof node !== "object") return false;
    const EXPR_TYPES = new Set([
      "Identifier",
      "StringLiteral",
      "NumericLiteral",
      "BooleanLiteral",
      "NullLiteral",
      "BigIntLiteral",
      "RegExpLiteral",
      "TemplateLiteral",
      "TaggedTemplateExpression",
      "BinaryExpression",
      "UnaryExpression",
      "UpdateExpression",
      "AssignmentExpression",
      "ConditionalExpression",
      "CallExpression",
      "NewExpression",
      "MemberExpression",
      "ArrayExpression",
      "ObjectExpression",
      "FunctionExpression",
      "ArrowFunctionExpression",
      "SequenceExpression",
      "YieldExpression",
      "AwaitExpression",
      "MetaProperty",
      "ParenthesisExpression",
      "OptionalChainingExpression",
      "JSXElement",
      "JSXFragment",
      "JSXMemberExpression",
      "TsAsExpression",
      "TsSatisfiesExpression",
      "TsInstantiation",
      "TsTypeAssertion",
      "TsNonNullExpression",
    ]);
    return EXPR_TYPES.has(node.type);
  },

  // ── Deep clone ───────────────────────────────────────────────────────────

  cloneNode<T>(node: T, deep = true): T {
    if (!deep) return { ...(node as object) } as T;
    return JSON.parse(JSON.stringify(node)) as T;
  },
};
