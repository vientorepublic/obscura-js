# Google reCAPTCHA Reverse Engineering Analysis Reference

> **Source**: [elyelysiox/recaptcha](https://github.com/elyelysiox/recaptcha)  
> **Purpose**: Technical analysis for educational and research purposes  
> **Subject**: Obfuscation and anti-debugging/tampering techniques used in Google reCAPTCHA (Antibot system)

---

## Table of Contents

1. [Obfuscation Techniques](#1-obfuscation-techniques)
2. [Anti-debugging / Anti-tampering Techniques](#2-anti-debugging--anti-tampering-techniques)
3. [BotGuard Internal Structure](#3-botguard-internal-structure)
4. [Fingerprint Timing-based Detection](#4-fingerprint-timing-based-detection)
5. [Summary](#5-summary)

---

## 1. Obfuscation Techniques

reCAPTCHA applies some of the most sophisticated obfuscation in the industry, using a combination of transformation techniques to reduce code readability and hinder reverse engineering. Most obfuscation can be processed via AST (Abstract Syntax Tree), but some is handled at runtime, making static AST analysis impossible. **Polymorphism** is also applied so that the code structure differs between script versions.

---

### 1.1 Sequence Expressions

Block statements are flattened into comma-separated sequential expressions. They can appear anywhere — inside `if` statements, function arguments, object literals, etc.

```js
// Original block structure
if (cond) {
  a = 1;
  b = 2;
}

// Transformed into sequence expressions
cond && ((a = 1), (b = 2));
```

---

### 1.2 Mixed Boolean Arithmetic (MBA)

Arithmetic operations (addition, subtraction, multiplication) are mixed with bitwise operations (AND, OR, XOR, NOT) to hide the original logic.

```js
// Example: using complex expressions to conceal simple values
-2 * ~(h & H) + -2 + (h ^ H);
```

---

### 1.3 Indirect Function Table

All functions are registered in a table (array) and invoked via index. This makes it difficult to determine which function is being called through static analysis.

```js
functions[index](args);
```

---

### 1.4 Inline Constant Array

Numeric and string constants used repeatedly in a function body are stored in a locally defined array inlined within sequence expressions, and referenced by index.

```js
function(Y, Q, c, l, G, X, W, J, b, P) {
    // b = [14, 1, "call"] assigned inline within a sequence expression
    (Y & 94) == Y && (b = [14, 1, "call"], ...)

    W[b[2]](J, G)   // → W.call(J, G)
    Y >> b[1] & b[0]  // → Y >> 1 & 14
}
```

---

### 1.5 Function Multiplexing

Multiple logically distinct functions are merged into a single function, using a numeric parameter as a **block selector**. Bitwise conditions determine the active block, and numeric literals are passed at call sites as selectors.

```js
function(N, y, U, Y, h, H, m, C, u) {
    C = [26, 47, 6];

    // Block 1: logic to convert a value to a string
    if ((N - 2 ^ 14) < N && (N - C[2] | 28) >= N) { ... }

    // Block 2: error handling logic
    if ((N + 4 & 40) >= N && (N + 5 & C[0]) < N) {
        Y = bB();
        throw Error(Y === void 0 ? "unexpected value " + U + y : Y);
    }

    return u;
}
```

---

### 1.6 Logical Operator Branching

`if` / `if-else` blocks are replaced with logical operator short-circuit evaluation. Combined with sequence expressions and control flow flattening (CFF), multiple branches appear as a single continuous comma expression.

```js
// if (a) { block }
a && (block)

// if (!a) { block }
a || (block)

// if (a) { x } else { y }
a ? x : y

// Example combined with CFF + sequence expressions
(Y | 1) & 14 || (c = Q.O, J = c.O.length + c.g.length),
(Y ^ 59) >> 3 == 3 && (Q.classList
    ? Q.classList.add(c)
    : Z[31](31, Q, c) || (l = f[0](84, "string", "", Q), ...)),
```

---

### 1.7 Bind Native Methods as Constants

Browser native methods are bound to their original receiver and stored as constants to prevent tampering. Even if `Math.floor` is redefined externally, the already-bound reference is unaffected.

```js
LO =
  (Tw = self) == null
    ? void 0
    : (K9 = Tw.Math) == null
      ? void 0
      : (v4 = K9.floor) == null
        ? void 0
        : (mF = v4.bind) == null
          ? void 0
          : mF.call(v4, Math); // → Math.floor.bind(Math)

LO(x); // Math.floor(x)
U4(); // Math.random()
Ge(obj, prop); // Object.defineProperty(obj, prop)
```

---

### 1.8 Dead Code Injection

Unreachable or unused code blocks are inserted throughout the file, inflating it to over 60,000 lines. This hinders static analysis and LLM-based reverse engineering.

---

### 1.9 Control Flow Flattening (CFF)

All code — including declarations and loops — is transformed into a **flat state machine**. All code blocks are routed through a central "dispatcher" block, hiding the original execution flow.

- The dispatcher changes shape between versions (2–3 state variables, different loop/condition types).
- A variant exists that handles `try` and `catch` blocks with separate state variables each.

---

### 1.10 Encrypted String Pool

**All string literals** — DOM APIs, browser properties, CSS values, error messages — are stored in a single large encrypted pool. A decryption function extracts each string at runtime using a seed and an **LCG-based XOR cipher**.

- Over 1,990 call sites are spread throughout the code
- The decryption function accumulates a running key so each character depends on all preceding characters

```js
X = function (J, b, P, F, U) {
  U = ["codePointAt", 127, "char encrypted pool"];
  for (F = ((P = 0), (b = ""), l); P < Q; P++)
    ((J = (U[2][U[0]](c + P) ^ F) & U[1]), // XOR with running key
      (b += String.fromCodePoint(J)),
      (F += J)); // key accumulation
  return (G = b);
};

// Each call site passes a seed to decrypt its string
Z[23](64, 4, 54961, 103)(); // → "lang"
Z[23](66, 4, 54961, 103)(); // → "addEventListener"
Z[23](32, 12, 20287, 852)(); // → "inline-block"
```

---

### 1.11 Stateful Value Iterator

A **stateful function** that returns runtime objects/values — such as `window`, `document.body`, and numeric constants — in a fixed order. The internal cursor advances on each call; reading out of order or calling too many times corrupts all subsequent reads. It also has a built-in **timeout mechanism** that returns `null` after a certain time.

```js
c(); // → window
c(); // → document.body
c(); // → 123
c(); // → null (timeout expired)

// Real usage example
c().querySelectorAll(a[X[2]](98, X[1], X[1]));
// ↑ document.body
```

> **Note for reverse engineers**: Setting a debugger breakpoint causes the timeout to expire, invalidating the cursor state.

---

### 1.12 Computed Function Table

Similar to the indirect function table, but the index of the function to retrieve is **computed at runtime** using seeds, XOR, and modular arithmetic. Functions are dynamically selected from a table of 50 or more.

```js
c = (((Q ^ no) | U[1]) >> 5) + no;
A = mN[((c % U[2]) + U[2]) % U[2]]; // mN is a table of 50+ functions

q[29](5, 6977); // seed=6977 → selects mN[X]
q[29](53, 6187); // seed=6187 → different index, different function
```

---

### 1.13 Runtime Value Encryption

**Sensitive values** such as CAPTCHA configuration parameters and anchor parameters are never stored in plaintext. They are encrypted immediately upon collection and decrypted only at the point of use. They are identified by the prefix `B` in the code.

---

### 1.14 Async Control Flow Obfuscation

Synchronous logic is transformed into a **generator-based state machine** and wrapped in recursive `Promise` chains. Tracing values in a debugger requires stepping through multiple async handlers, losing the original execution context at each `.then()` boundary.

---

## 2. Anti-debugging / Anti-tampering Techniques

### 2.1 Symbol-based Integrity Tag

reCAPTCHA sets a `Symbol("jas")` key with an integer integrity check value on **every array and object** that holds numeric values.

- Symbols are non-enumerable, so they are invisible to standard cloning operations like `JSON.stringify`.
- Replacing or cloning a structure removes the tag, and reCAPTCHA **detects this as tampering**.

```js
// Conceptual representation
const arr = [1, 2, 3];
arr[Symbol("jas")] = 0xdeadbeef; // integrity tag

// JSON.stringify(arr) → "[1,2,3]"  (tag missing)
// reCAPTCHA detects missing tag → tampering verdict
```

---

### 2.2 Closure Variable Capture

Some values are intentionally isolated within **an outer function's scope** and consumed only inside nested callbacks or closures. The discrepancy between where a variable is used and where it is declared makes it difficult to inspect or hook values in a debugger.

---

### 2.3 Crash Source Tab

When a certain timeout (`setInterval`) expires, the developer tools Source tab crashes for approximately 10–15 seconds. This disrupts the debugging session and makes breakpoint-based analysis more difficult.

---

### 2.4 Fingerprint Elapsed Time Measurement (Timing-based Hook Detection)

Each fingerprint sub-field has the following format:

```
[value, key, elapsed]
```

- `elapsed`: time in ms it took for the collector to gather the value and encrypt it
- The reCAPTCHA server analyzes this value to detect the following anomalies:

| Anomaly                   | Detection Method                                         |
| ------------------------- | -------------------------------------------------------- |
| Abnormally fast execution | `elapsed` value is unusually low                         |
| Hooking                   | Collection time is abnormally long or uniformly constant |
| Breakpoints               | `elapsed` spikes to several seconds or more              |
| Sandboxing                | `elapsed` for certain collectors is fixed at 0           |

---

### 2.5 Stateful Iterator Timeout

The Stateful Value Iterator described in [Section 1.11](#111-stateful-value-iterator) also serves an **anti-debugging role**.

- Pausing execution with a debugger causes the internal timeout to expire
- Subsequent cursor reads all return `null` → fingerprint collection fails
- This results in an abnormal fingerprint being sent to the server, increasing the likelihood of a bot verdict

---

### 2.6 Native Method Protection

The binding-as-constants technique from [Section 1.7](#17-bind-native-methods-as-constants) simultaneously acts as **anti-tampering**.

- `Math.floor`, `Math.random`, `Object.defineProperty`, etc. are pre-bound
- Even if external scripts or browser extensions modify the prototype, the already-captured bindings are unaffected
- Defends against prototype pollution attacks

---

## 3. BotGuard Internal Structure

> **Note**: Google removed BotGuard from reCAPTCHA as of April 1, 2026.

### 3.1 ARX Cipher

The BotGuard VM uses an **ARX cipher** (similar to Speck, developed by the NSA in 2013) to encrypt token data. Constants (e.g., `3990`), operation order, and round count differ between versions.

```js
Vl = function (D, P, E, F, v) {
  // D → cipher state array, P → seed, E → byte index
  F = D[3] | 0;
  D = D[2] | 0;
  for (v = 0; v < 14; v++) {
    E = (E >>> 8) | (E << 24);
    E += P | 0;
    E ^= D + 3990; // constant that changes per version
    P = (P << 3) | (P >>> 29);
    P ^= E;
    F = (F >>> 8) | (F << 24);
    F += D | 0;
    F ^= v + 3990;
    D = (D << 3) | (D >>> 29);
    D ^= F;
  }
  return [
    (P >>> 24) & 255,
    (P >>> 16) & 255,
    (P >>> 8) & 255,
    (P >>> 0) & 255,
    (E >>> 24) & 255,
    (E >>> 16) & 255,
    (E >>> 8) & 255,
    (E >>> 0) & 255,
  ];
};
```

### 3.2 Buffer Structure and Byte Writer

The VM uses 4 types of buffers, and the main encryption function supports both encrypted and non-encrypted modes.

| Buffer ID | Role                                                     |
| --------- | -------------------------------------------------------- |
| `180`     | Main buffer                                              |
| `353`     | Entropy pad buffer                                       |
| `304`     | Error buffer                                             |
| `243`     | PoE (Proof of Execution) buffer (unused in this version) |

In encrypted mode, keystream is generated via the ARX cipher and data is encrypted with XOR:

```js
v.push(v.zB[A & 7] ^ h);
// lower 3 bits of A select the keystream byte, XOR'd with data
```

### 3.3 Token Integrity Verification

The VM generates an error token when it detects any of the following abnormal states:

- Bytecode offset deviation
- Missing VM registers
- Invalid VM state
- Control Flow Integrity (CFI) violation

When an error is detected, the error dispatcher records error bytes into the error buffer (`304`) and main buffer (`180`), which are then included in the token sent to the server when VM execution ends.

---

## 4. Fingerprint Timing-based Detection

The fingerprint collection pipeline goes beyond simply gathering values — it **monitors the collection process itself**.

### 4.1 Collector Execution Order

An internal scheduler runs collectors in a fixed order:

```
[42, 45, 53, 30, 28, 54, 29, 31, 32, 33, 34, 35, 37, 36, 38, 39,
 43, 40, 41, 46, 48, 57, 58, 60, 61, 62, 63, 64, 66, 68, 69, 71, 72, 79, 55]
```

### 4.2 Signal Code Derivation Pipeline

Each fingerprint value passes through the following stages to become an encryption key:

```
Raw Value
   ↓
Signal Code Derivation  (generates deterministic identifier)
   ↓
Compact Signal Code
   ↓
Numeric Key Derivation  (converts to numeric encryption key)
   ↓
Encryption Key
   ↓
Value Encryption
```

Example:

```
Input:          "BUTTON,195a81c9"
Signal code:    "wg"
Numeric key:    3792
Encrypted:      encryptValueWithKey(3792, "wgia1z9pwq") → "bYVbh6BUsE_5pLA"
```

The same input value always produces the same signal code and encryption key (deterministic).

### 4.3 VM Signal-based Detection

VM signal (Idx 73) includes the execution time for each collector:

```json
[null, collectorElapsed, encryptElapsed, value]
```

- `collectorElapsed`: time in ms to collect the value
- `encryptElapsed`: time in ms to encrypt the value

When a debugger breakpoint or hook is present, these values become abnormally large and trigger detection.

---

## 5. Summary

| Category       | Technique                         | Primary Purpose                      |
| -------------- | --------------------------------- | ------------------------------------ |
| Obfuscation    | Sequence expressions, MBA         | Reduce code readability              |
| Obfuscation    | Indirect/computed function tables | Hinder static analysis               |
| Obfuscation    | Encrypted string pool             | Prevent string extraction            |
| Obfuscation    | Control flow flattening           | Hide execution flow                  |
| Obfuscation    | Async control flow                | Hinder debugger step-tracing         |
| Obfuscation    | Polymorphism                      | Vary code structure per version      |
| Anti-debugging | Symbol integrity tag              | Detect object cloning/replacement    |
| Anti-debugging | Closure variable capture          | Prevent variable hooking             |
| Anti-debugging | Crash source tab                  | Disrupt developer tools usage        |
| Anti-debugging | Elapsed time measurement          | Detect breakpoints and hooks         |
| Anti-debugging | Stateful iterator timeout         | Detect debugger pauses               |
| Anti-tampering | Native method binding             | Defend against prototype pollution   |
| Encryption     | ARX Cipher (BotGuard)             | Encrypt token data                   |
| Encryption     | Runtime value encryption          | Prevent plaintext parameter exposure |

> **Disclaimer**: This document is written purely for educational and research purposes. The content is a technical summary of the original repository's analysis and must not be used to bypass reCAPTCHA.
