#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";
import { resolve, basename } from "path";
import { Command } from "commander";
import { protect } from "../src/index";
import type { ObscuraOptions } from "../src/types";

// ── ANSI helpers ─────────────────────────────────────────────────────────────
// Respect NO_COLOR (https://no-color.org) and FORCE_COLOR env vars.
const hasColor = (() => {
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.FORCE_COLOR !== undefined) return true;
  return process.stdout.isTTY ?? false;
})();

// Unicode box-drawing / symbols need a UTF-8 capable terminal.
// On Windows, check for modern terminals: Windows Terminal (WT_SESSION),
// VS Code / other terminal emulators (TERM_PROGRAM), or ConEmu (CONEMUANSI).
const hasUnicode = (() => {
  if (process.platform !== "win32") return true;
  return !!(
    process.env.WT_SESSION ||
    process.env.TERM_PROGRAM ||
    process.env.CONEMUANSI ||
    process.env.COLORTERM
  );
})();

const c = {
  reset: hasColor ? "\x1b[0m" : "",
  bold: hasColor ? "\x1b[1m" : "",
  dim: hasColor ? "\x1b[2m" : "",
  green: hasColor ? "\x1b[32m" : "",
  cyan: hasColor ? "\x1b[36m" : "",
  yellow: hasColor ? "\x1b[33m" : "",
  gray: hasColor ? "\x1b[90m" : "",
  red: hasColor ? "\x1b[31m" : "",
  white: hasColor ? "\x1b[97m" : "",
};

const sym = {
  diamond: hasUnicode ? "\u25C6" : "*",
  check: hasUnicode ? "\u2713" : "+",
  cross: hasUnicode ? "\u2717" : "x",
  done: hasUnicode ? "\u2714" : "*",
  line: hasUnicode ? "\u2500" : "-",
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(2)} MB`;
}

function pad(s: string, w: number): string {
  return s + " ".repeat(Math.max(0, w - s.length));
}

// ── CLI definition ────────────────────────────────────────────────────────────
const program = new Command();

program
  .name("obscura-js")
  .description("JavaScript code protection tool — obfuscation & anti-debugging")
  .version("1.0.0");

program
  .command("protect <input>")
  .description("Protect a JavaScript file")
  .option("-o, --output <file>", "Output file (default: <input>.obscura.js)")
  .option("--no-seq", "Disable sequence expression pass")
  .option("--no-mba", "Disable mixed boolean arithmetic pass")
  .option("--no-ft", "Disable indirect function table pass")
  .option("--no-sp", "Disable encrypted string pool pass")
  .option("--no-cff", "Disable control flow flattening pass")
  .option("--no-dead", "Disable dead code injection pass")
  .option("--no-native", "Disable native method binding pass")
  .option("--no-tag", "Disable symbol integrity tag pass")
  .option("--sp-seed <number>", "Seed for the string pool XOR cipher", parseInt)
  .option("--minify", "Minify output (compact whitespace, shorten literals)")
  .option("--keep-comments", "Preserve original comments in output (default: strip all)")
  .action((input: string, opts: Record<string, unknown>) => {
    const t0 = Date.now();
    const inputPath = resolve(process.cwd(), input);
    const source = readFileSync(inputPath, "utf-8");

    const options: ObscuraOptions = {
      obfuscation: {
        sequenceExpression: opts["seq"] === false ? false : {},
        mba: opts["mba"] === false ? false : {},
        functionTable: opts["ft"] === false ? false : {},
        stringPool: opts["sp"] === false ? false : { seed: opts["spSeed"] as number | undefined },
        controlFlowFlattening: opts["cff"] === false ? false : {},
        deadCode: opts["dead"] === false ? false : {},
      },
      antiDebug: {
        nativeBinding: opts["native"] === false ? false : {},
        integrityTag: opts["tag"] === false ? false : {},
      },
      minify: opts["minify"] === true,
      stripComments: opts["keepComments"] !== true,
    };

    const { code, appliedPasses } = protect(source, options);

    const outputPath = opts["output"]
      ? resolve(process.cwd(), opts["output"] as string)
      : inputPath.replace(/\.js$/, "") + ".obscura.js";

    writeFileSync(outputPath, code, "utf-8");

    // ── Output report ─────────────────────────────────────────────────────
    const elapsed = Date.now() - t0;
    const inputBytes = Buffer.byteLength(source, "utf-8");
    const outputBytes = Buffer.byteLength(code, "utf-8");
    const growthPct = (((outputBytes - inputBytes) / inputBytes) * 100).toFixed(0);
    const growthStr = outputBytes >= inputBytes ? `+${growthPct}%` : `${growthPct}%`;

    const inputName = basename(inputPath);
    const outputName = basename(outputPath);
    const nameW = Math.max(inputName.length, outputName.length);
    const sizeW = Math.max(formatBytes(inputBytes).length, formatBytes(outputBytes).length);

    const OBF_PASSES = [
      "sequenceExpression",
      "mba",
      "functionTable",
      "stringPool",
      "controlFlowFlattening",
      "deadCode",
    ] as const;
    const DBG_PASSES = ["nativeBinding", "integrityTag"] as const;
    const applied = new Set(appliedPasses);

    const passLine = (name: string): string => {
      const on = applied.has(name);
      const mark = on ? `${c.green}${sym.check}${c.reset}` : `${c.red}${sym.cross}${c.reset}`;
      const label = on ? `${c.white}${name}${c.reset}` : `${c.dim}${name}${c.reset}`;
      return `    ${mark}  ${label}`;
    };

    const activeFlags: string[] = [];
    if (opts["minify"] === true) activeFlags.push("minify");
    if (opts["keepComments"] === true) activeFlags.push("keep-comments");

    const sep = `  ${c.dim}${sym.line.repeat(46)}${c.reset}`;

    const report: string[] = [
      "",
      `  ${c.bold}${c.cyan}${sym.diamond}  obscura-js${c.reset}`,
      "",
      sep,
      `  ${c.gray}Input   ${c.reset}  ${pad(inputName, nameW)}  ${c.dim}${pad(formatBytes(inputBytes), sizeW)}${c.reset}`,
      `  ${c.gray}Output  ${c.reset}  ${pad(outputName, nameW)}  ${pad(formatBytes(outputBytes), sizeW)}  ${c.yellow}${growthStr}${c.reset}`,
      `  ${c.gray}Elapsed ${c.reset}  ${elapsed}ms`,
      ...(activeFlags.length ? [`  ${c.gray}Flags   ${c.reset}  ${activeFlags.join("  ")}`] : []),
      sep,
      "",
      `  ${c.cyan}Obfuscation${c.reset}`,
      ...OBF_PASSES.map(passLine),
      "",
      `  ${c.cyan}Anti-Debug${c.reset}`,
      ...DBG_PASSES.map(passLine),
      "",
      sep,
      `  ${c.green}${sym.done}${c.reset}  ${c.bold}Protected successfully${c.reset}`,
      "",
    ];

    console.log(report.join("\n"));
  });

program.parse(process.argv);
