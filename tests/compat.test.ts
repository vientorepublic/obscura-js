/**
 * Module compatibility tests.
 *
 * Verifies that obscura-js can be consumed in both CJS and ESM environments
 * and that the package.json exports map is structurally correct.
 *
 * NOTE: Requires a built dist/ directory. Run `npm run build` before these tests.
 */

import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
const DIST_INDEX = path.join(ROOT, "dist/src/index.js");
const DIST_DTS = path.join(ROOT, "dist/src/index.d.ts");
const PACKAGE_JSON = path.join(ROOT, "package.json");

// ── subprocess helpers ────────────────────────────────────────────────────────

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Run a snippet as a CJS script (`node -e`) from the package root. */
function runCJS(code: string): RunResult {
  const r = childProcess.spawnSync(process.execPath, ["-e", code], {
    encoding: "utf8",
    cwd: ROOT,
  });
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

/** Run a snippet as an ES module (`node --input-type=module`) from the package root. */
function runESM(code: string): RunResult {
  const r = childProcess.spawnSync(process.execPath, ["--input-type=module"], {
    input: code,
    encoding: "utf8",
    cwd: ROOT,
  });
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

// ── CJS compatibility ─────────────────────────────────────────────────────────

describe("CJS compatibility", () => {
  beforeAll(() => {
    if (!fs.existsSync(DIST_INDEX)) {
      throw new Error(`dist not built — run 'npm run build' first (missing: ${DIST_INDEX})`);
    }
  });

  it("require() from dist path exposes protect()", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(DIST_INDEX) as Record<string, unknown>;
    expect(typeof mod.protect).toBe("function");
  });

  it("require() from package name resolves via exports map", () => {
    const { exitCode, stderr } = runCJS(
      `const m = require('obscura-js');
       if (typeof m.protect !== 'function') process.exit(1);`
    );
    expect(stderr).not.toMatch(/ERR_PACKAGE_PATH_NOT_EXPORTED/);
    expect(stderr).not.toMatch(/ERR_MODULE_NOT_FOUND/);
    expect(exitCode).toBe(0);
  });

  it("require() protect() returns a ProtectResult with a code string", () => {
    const { exitCode, stdout, stderr } = runCJS(
      `const { protect } = require('obscura-js');
       const r = protect('var x = 1;');
       process.stdout.write(typeof r.code);`
    );
    expect(stderr).not.toMatch(/ERR_/);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("string");
  });

  it("require() obfuscation produces non-empty output", () => {
    const { exitCode, stdout } = runCJS(
      `const { protect } = require('obscura-js');
       const r = protect('var x = "hello";', { obfuscation: { stringPool: true } });
       process.stdout.write(r.code.length > 0 ? 'ok' : 'empty');`
    );
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("ok");
  });
});

// ── ESM compatibility ─────────────────────────────────────────────────────────

describe("ESM compatibility", () => {
  beforeAll(() => {
    if (!fs.existsSync(DIST_INDEX)) {
      throw new Error(`dist not built — run 'npm run build' first`);
    }
  });

  it("static import { protect } resolves via exports map", () => {
    const { exitCode, stderr } = runESM(
      `import { protect } from 'obscura-js';
       if (typeof protect !== 'function') process.exit(1);`
    );
    expect(stderr).not.toMatch(/ERR_PACKAGE_PATH_NOT_EXPORTED/);
    expect(stderr).not.toMatch(/ERR_MODULE_NOT_FOUND/);
    expect(exitCode).toBe(0);
  });

  it("static import protect() returns a ProtectResult with a code string", () => {
    const { exitCode, stdout, stderr } = runESM(
      `import { protect } from 'obscura-js';
       const r = protect('var x = 1;');
       process.stdout.write(typeof r.code);`
    );
    expect(stderr).not.toMatch(/ERR_/);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("string");
  });

  it("dynamic import() resolves and exposes protect()", () => {
    const { exitCode, stdout, stderr } = runESM(
      `const m = await import('obscura-js');
       process.stdout.write(typeof m.protect);`
    );
    expect(stderr).not.toMatch(/ERR_/);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("function");
  });

  it("ESM protect() obfuscation produces non-empty output", () => {
    const { exitCode, stdout } = runESM(
      `import { protect } from 'obscura-js';
       const r = protect('var x = "hello";', { obfuscation: { stringPool: true } });
       process.stdout.write(r.code.length > 0 ? 'ok' : 'empty');`
    );
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("ok");
  });

  it("ESM and CJS produce identical output for the same input", () => {
    const src = `var n = 1 + 2; module.exports = n;`;
    // Only MBA is fully deterministic (no Math.random, no genId).
    // functionTable and nativeBinding now use genId() per-call, so they
    // produce different identifier names across separate processes.
    const optsJson = JSON.stringify({
      obfuscation: {
        mba: { rounds: 1 },
        functionTable: false,
        sequenceExpression: false,
        stringPool: false,
        controlFlowFlattening: false,
        deadCode: false,
      },
      antiDebug: {
        nativeBinding: false,
        integrityTag: false,
      },
    });

    const { exitCode: cjsExit, stdout: cjsOut } = runCJS(
      `const { protect } = require('obscura-js');
       const r = protect(${JSON.stringify(src)}, ${optsJson});
       process.stdout.write(r.code);`
    );

    const { exitCode: esmExit, stdout: esmOut } = runESM(
      `import { protect } from 'obscura-js';
       const r = protect(${JSON.stringify(src)}, ${optsJson});
       process.stdout.write(r.code);`
    );

    expect(cjsExit).toBe(0);
    expect(esmExit).toBe(0);
    // Both must resolve the same dist file — deterministic options guarantee
    // byte-identical output, proving that ESM and CJS load the same module.
    expect(esmOut).toBe(cjsOut);
  });
});

// ── exports map structure ─────────────────────────────────────────────────────

describe("package.json exports map", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pkg: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exp: any;

  beforeAll(() => {
    pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf8"));
    exp = pkg.exports["."];
  });

  it('has "type": "commonjs"', () => {
    expect(pkg.type).toBe("commonjs");
  });

  it('"require" condition is an object with nested types and default', () => {
    expect(typeof exp.require).toBe("object");
    expect(exp.require.types).toMatch(/\.d\.ts$/);
    expect(exp.require.default).toBeDefined();
  });

  it('"import" condition is an object with nested types and default', () => {
    expect(typeof exp.import).toBe("object");
    expect(exp.import.types).toMatch(/\.d\.ts$/);
    expect(exp.import.default).toBeDefined();
  });

  it('"default" fallback condition is defined', () => {
    expect(exp.default).toBeDefined();
  });

  it("all condition paths resolve to existing files on disk", () => {
    const checks: Array<[string, string]> = [
      ["require.types", exp.require.types],
      ["require.default", exp.require.default],
      ["import.types", exp.import.types],
      ["import.default", exp.import.default],
      ["default", exp.default],
    ];
    for (const [label, rel] of checks) {
      const abs = path.resolve(ROOT, rel);
      expect({ [label]: fs.existsSync(abs) }).toEqual({ [label]: true });
    }
  });

  it('"require.types" and "import.types" point to the same declaration file', () => {
    expect(exp.require.types).toBe(exp.import.types);
  });

  it('"main" top-level field exists for legacy Node.js compatibility', () => {
    expect(pkg.main).toBeDefined();
    expect(fs.existsSync(path.resolve(ROOT, pkg.main))).toBe(true);
  });

  it('"types" top-level field exists for legacy TypeScript (moduleResolution: node)', () => {
    expect(pkg.types).toBeDefined();
    expect(fs.existsSync(path.resolve(ROOT, pkg.types))).toBe(true);
  });
});

// ── TypeScript declarations ───────────────────────────────────────────────────

describe("TypeScript declarations", () => {
  let src: string;

  beforeAll(() => {
    if (!fs.existsSync(DIST_DTS)) {
      throw new Error(`Declaration file missing: ${DIST_DTS}`);
    }
    src = fs.readFileSync(DIST_DTS, "utf8");
  });

  it("index.d.ts exists", () => {
    expect(fs.existsSync(DIST_DTS)).toBe(true);
  });

  it("exports protect() function declaration", () => {
    expect(src).toMatch(/export declare function protect/);
  });

  it("exports ObscuraOptions type", () => {
    expect(src).toMatch(/ObscuraOptions/);
  });

  it("exports HazeOptions as backward-compat alias", () => {
    expect(src).toMatch(/HazeOptions/);
  });

  it("exports ProtectResult type", () => {
    expect(src).toMatch(/ProtectResult/);
  });

  it("protect() signature accepts optional second parameter", () => {
    // Verify the signature includes an optional options parameter
    expect(src).toMatch(/protect\s*\([^)]*options\?/);
  });
});
