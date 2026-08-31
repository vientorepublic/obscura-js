# Obscura.js

<img width="2492" height="1266" alt="obscura" src="https://github.com/user-attachments/assets/02d32a27-4503-4c72-94d6-b30c205e422b" />

---

A JavaScript code protection library inspired by the obfuscation and anti-debugging techniques used in Google reCAPTCHA.

[![CI](https://github.com/vientorepublic/obscura-js/actions/workflows/ci.yml/badge.svg)](https://github.com/vientorepublic/obscura-js/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/obscura-js)](https://www.npmjs.com/package/obscura-js)
[![license](https://img.shields.io/npm/l/obscura-js)](LICENSE)
[![node](https://img.shields.io/node/v/obscura-js)](package.json)
[![Coverage:statements](.badges/badge-statements.svg)](coverage/lcov-report/index.html)
[![Coverage:lines](.badges/badge-lines.svg)](coverage/lcov-report/index.html)
[![Coverage:functions](.badges/badge-functions.svg)](coverage/lcov-report/index.html)
[![Coverage:branches](.badges/badge-branches.svg)](coverage/lcov-report/index.html)

## Features

| Category    | Pass                    | Description                                                              |
| ----------- | ----------------------- | ------------------------------------------------------------------------ |
| Obfuscation | `sequenceExpression`    | Flatten `if` blocks into comma-sequence expressions                      |
| Obfuscation | `mba`                   | Expand arithmetic into Mixed Boolean Arithmetic (MBA) expressions        |
| Obfuscation | `functionTable`         | Move function declarations into an indirect table, call by index         |
| Obfuscation | `stringPool`            | Encrypt string literals and template literal quasis into an LCG-XOR pool |
| Obfuscation | `controlFlowFlattening` | Transform function bodies into flat state machines                       |
| Obfuscation | `deadCode`              | Inject unreachable code blocks                                           |
| Anti-debug  | `nativeBinding`         | Pre-bind native methods to defend against prototype pollution            |
| Anti-debug  | `integrityTag`          | Attach Symbol-based integrity tags to detect object cloning/replace      |

## Input Format Support

Obscura.js auto-detects the module format of the input file (`sourceType: "unambiguous"`) and handles all three variants:

| Format           | Example                        | Notes                                                             |
| ---------------- | ------------------------------ | ----------------------------------------------------------------- |
| CommonJS (CJS)   | `require()` / `module.exports` | `require()` paths are never encrypted to preserve static analysis |
| ES Modules (ESM) | `import` / `export`            | Module specifier strings are never encrypted                      |
| JSX              | `<Component prop="value" />`   | Attribute strings are wrapped in `{}` after encryption            |

### Per-pass ESM / CJS behaviour

Passes fall into two categories: **format-aware** (contain explicit logic for module syntax) and **format-agnostic** (operate purely on expressions/statements, no module knowledge required).

#### Format-aware passes

**`functionTable`** — avoids removing functions that are reachable from outside the module.

| Pattern                         | Example                         | Behaviour                                                          |
| ------------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| ESM named export                | `export { foo }`                | `foo` is kept as a top-level declaration; not moved into the table |
| ESM default export (identifier) | `export default foo`            | same                                                               |
| CJS `module.exports`            | `module.exports = foo`          | same                                                               |
| CJS `module.exports.x`          | `module.exports.add = add`      | same                                                               |
| CJS `exports.x`                 | `exports.add = add`             | same                                                               |
| CJS object shorthand            | `module.exports = { add, mul }` | all referenced names are preserved                                 |

**`stringPool`** — selectively skips strings whose values must be preserved for the module system or runtime.

| Pattern                    | Example                                               | Behaviour                                                           |
| -------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| ESM import path            | `import x from "./mod"`                               | skipped — bundlers need the literal path                            |
| ESM re-export path         | `export { x } from "./mod"` / `export * from "./mod"` | skipped                                                             |
| Dynamic import path        | `import('./mod')`                                     | skipped — runtime module loader needs the literal                   |
| CJS require path           | `require("./mod")`                                    | skipped                                                             |
| CJS require.resolve path   | `require.resolve("./util")`                           | skipped                                                             |
| ES2022 string binding name | `import { "foo" as bar }` / `export { x as "name" }`  | skipped — spec-mandated string syntax                               |
| Tagged template            | `` html`<b>${x}</b>` ``                               | skipped — tag receives a `TemplateStringsArray`, not a plain string |
| All other strings          | `"hello"`, `` `hi ${name}` ``, `{ 'key': v }`         | **encrypted**                                                       |

#### Format-agnostic passes

These passes operate on expressions and statements only. They produce valid output for both CJS and ESM input without any module-specific logic.

| Pass                    | What it touches                                     |
| ----------------------- | --------------------------------------------------- |
| `sequenceExpression`    | `if` statement bodies                               |
| `mba`                   | Binary arithmetic expressions (`+`, `-`, `\|`, `^`) |
| `controlFlowFlattening` | Function bodies                                     |
| `deadCode`              | Top-level statement boundaries                      |
| `nativeBinding`         | Prepends `const` bindings for native methods        |
| `integrityTag`          | Array and object literals                           |

### What `stringPool` encrypts

| Syntax                    | Example                 | Behaviour                                                                     |
| ------------------------- | ----------------------- | ----------------------------------------------------------------------------- |
| String literal            | `"hello"`               | Replaced with a pool decryption call                                          |
| Template literal          | `` `hello ${x}` ``      | Static quasis encrypted; expressions kept as-is; emitted as `+` concatenation |
| Object / class string key | `{ 'key': v }`          | Key flipped to computed syntax `{ [pool()]: v }`                              |
| JSX attribute value       | `<div className="foo">` | Wrapped in `{pool()}` expression container                                    |
| `export default "…"`      | `export default 'msg'`  | Encrypted normally                                                            |

The following strings are **never** encrypted to avoid breaking the module system:

- `import … from "path"`
- `require("path")` / `require.resolve("path")`
- `export { x } from "path"`
- `export * from "path"`
- ES2022 string binding names — `import { "name" as x }`, `export { x as "name" }`
- Tagged template literals — `` html`…` `` (the tag function receives a `TemplateStringsArray`)

## Installation

```bash
npm install obscura-js
```

## Quick Start

### CLI

```bash
# Protect a file (output: app.obscura.js)
npx obscura-js protect app.js

# Specify output path
npx obscura-js protect app.js -o app.protected.js

# Minify output
npx obscura-js protect app.js --minify

# Preserve original comments (stripped by default)
npx obscura-js protect app.js --keep-comments
```

### API

```typescript
import { protect } from "obscura-js";
import { readFileSync } from "fs";

const source = readFileSync("app.js", "utf-8");

const { code, appliedPasses } = protect(source);
// All 8 passes are enabled by default

console.log(appliedPasses);
// ['sequenceExpression', 'mba', 'functionTable', 'stringPool',
//  'controlFlowFlattening', 'deadCode', 'nativeBinding', 'integrityTag']
```

## API Reference

### `protect(source, options?)`

| Parameter | Type             | Description                       |
| --------- | ---------------- | --------------------------------- |
| `source`  | `string`         | JavaScript source code to protect |
| `options` | `ObscuraOptions` | Optional configuration            |

Returns `ProtectResult`:

```typescript
interface ProtectResult {
  code: string; // Protected source code
  appliedPasses: string[]; // Names of passes that were applied
}
```

### `ObscuraOptions`

```typescript
interface ObscuraOptions {
  obfuscation?: {
    sequenceExpression?: { probability?: number } | false;
    mba?: { rounds?: number } | false;
    functionTable?: { minFunctions?: number } | false;
    stringPool?: { seed?: number } | false;
    controlFlowFlattening?: {} | false;
    deadCode?: { targetLines?: number } | false;
  };
  antiDebug?: {
    nativeBinding?: { methods?: string[] } | false;
    integrityTag?: { tagDescription?: string } | false;
  };
  minify?: boolean; // Default: false
  stripComments?: boolean; // Default: true
}
```

Disable a specific pass by passing `false`:

```typescript
protect(source, {
  obfuscation: { deadCode: false, mba: false },
});
```

Custom options example:

```typescript
protect(source, {
  obfuscation: {
    mba: { rounds: 2 },
    stringPool: { seed: 1234 },
    deadCode: { targetLines: 100 },
  },
  antiDebug: {
    nativeBinding: { methods: ["Math.floor", "Object.defineProperty"] },
    integrityTag: { tagDescription: "myapp" },
  },
  minify: true,
  stripComments: false, // keep original comments
});
```

## CLI Reference

```bash
obscura-js protect <input> [options]
```

| Option                | Description                                            |
| --------------------- | ------------------------------------------------------ |
| `-o, --output <file>` | Output file path (default: `<input>.obscura.js`)       |
| `--no-seq`            | Disable `sequenceExpression` pass                      |
| `--no-mba`            | Disable `mba` pass                                     |
| `--no-ft`             | Disable `functionTable` pass                           |
| `--no-sp`             | Disable `stringPool` pass                              |
| `--no-cff`            | Disable `controlFlowFlattening` pass                   |
| `--no-dead`           | Disable `deadCode` pass                                |
| `--no-native`         | Disable `nativeBinding` pass                           |
| `--no-tag`            | Disable `integrityTag` pass                            |
| `--sp-seed <number>`  | XOR seed for the string pool cipher                    |
| `--minify`            | Compact output (remove whitespace, shorten literals)   |
| `--keep-comments`     | Preserve original source comments (default: strip all) |

## Requirements

- Node.js ≥ 18

## License

MIT
