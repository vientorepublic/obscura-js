# haze-js

A JavaScript code protection library inspired by the obfuscation and anti-debugging techniques used in Google reCAPTCHA.

[![npm version](https://img.shields.io/npm/v/haze-js)](https://www.npmjs.com/package/haze-js)
[![license](https://img.shields.io/npm/l/haze-js)](LICENSE)
[![node](https://img.shields.io/node/v/haze-js)](package.json)

## Features

| Category    | Pass                    | Description                                                         |
| ----------- | ----------------------- | ------------------------------------------------------------------- |
| Obfuscation | `sequenceExpression`    | Flatten `if` blocks into comma-sequence expressions                 |
| Obfuscation | `mba`                   | Expand arithmetic into Mixed Boolean Arithmetic (MBA) expressions   |
| Obfuscation | `functionTable`         | Move function declarations into an indirect table, call by index    |
| Obfuscation | `stringPool`            | Encrypt all string literals into an LCG-XOR pool                    |
| Obfuscation | `controlFlowFlattening` | Transform function bodies into flat state machines                  |
| Obfuscation | `deadCode`              | Inject unreachable code blocks                                      |
| Anti-debug  | `nativeBinding`         | Pre-bind native methods to defend against prototype pollution       |
| Anti-debug  | `integrityTag`          | Attach Symbol-based integrity tags to detect object cloning/replace |

## 시작하기

```bash
npm install
npm run build   # dist/ 로 컴파일
npm test        # 테스트 실행
```

## Installation

```bash
npm install haze-js
```

## Quick Start

### API

```typescript
import { protect } from "haze-js";
import { readFileSync } from "fs";

const source = readFileSync("app.js", "utf-8");

const { code, appliedPasses } = protect(source);
// All 8 passes are enabled by default

console.log(appliedPasses);
// ['sequenceExpression', 'mba', 'functionTable', 'stringPool',
//  'controlFlowFlattening', 'deadCode', 'nativeBinding', 'integrityTag']
```

### CLI

```bash
# Protect a file (output: app.haze.js)
npx haze-js protect app.js

# Specify output path
npx haze-js protect app.js -o app.protected.js

# Minify output
npx haze-js protect app.js --minify
```

## API Reference

### `protect(source, options?)`

| Parameter | Type          | Description                       |
| --------- | ------------- | --------------------------------- |
| `source`  | `string`      | JavaScript source code to protect |
| `options` | `HazeOptions` | Optional configuration            |

Returns `ProtectResult`:

```typescript
interface ProtectResult {
  code: string; // Protected source code
  appliedPasses: string[]; // Names of passes that were applied
}
```

### `HazeOptions`

```typescript
interface HazeOptions {
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
});
```

## CLI Reference

```bash
npx haze-js protect <input> [options]
```

| Option                | Description                                          |
| --------------------- | ---------------------------------------------------- |
| `-o, --output <file>` | Output file path (default: `<input>.haze.js`)        |
| `--no-seq`            | Disable `sequenceExpression` pass                    |
| `--no-mba`            | Disable `mba` pass                                   |
| `--no-ft`             | Disable `functionTable` pass                         |
| `--no-sp`             | Disable `stringPool` pass                            |
| `--no-cff`            | Disable `controlFlowFlattening` pass                 |
| `--no-dead`           | Disable `deadCode` pass                              |
| `--no-native`         | Disable `nativeBinding` pass                         |
| `--no-tag`            | Disable `integrityTag` pass                          |
| `--sp-seed <number>`  | XOR seed for the string pool cipher                  |
| `--minify`            | Compact output (remove whitespace, shorten literals) |

## Requirements

- Node.js ≥ 18

## License

MIT
