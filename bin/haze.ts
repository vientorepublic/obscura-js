#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { Command } from "commander";
import { protect } from "../src/index";
import type { HazeOptions } from "../src/types";

const program = new Command();

program
  .name("obscura-js")
  .description("JavaScript code protection tool — obfuscation & anti-debugging")
  .version("0.1.0");

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
  .action((input: string, opts: Record<string, unknown>) => {
    const inputPath = resolve(process.cwd(), input);
    const source = readFileSync(inputPath, "utf-8");

    const options: HazeOptions = {
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
    };

    const { code, appliedPasses } = protect(source, options);

    const outputPath = opts["output"]
      ? resolve(process.cwd(), opts["output"] as string)
      : inputPath.replace(/\.js$/, "") + ".obscura.js";

    writeFileSync(outputPath, code, "utf-8");
    console.log(`✔ Protected: ${outputPath}`);
    console.log(`  Passes applied: ${appliedPasses.join(", ")}`);
  });

program.parse(process.argv);
