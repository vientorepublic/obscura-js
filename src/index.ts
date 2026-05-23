import { parse } from "@babel/parser";
import generate from "@babel/generator";
import { applyObfuscation } from "./obfuscation";
import { applyAntiDebug } from "./antiDebug";
import type { HazeOptions, ProtectResult } from "./types";

export type { HazeOptions, ProtectResult } from "./types";
export type {
  ObfuscationOptions,
  AntiDebugOptions,
  SequenceExpressionOptions,
  MbaOptions,
  FunctionTableOptions,
  StringPoolOptions,
  ControlFlowFlatteningOptions,
  DeadCodeOptions,
  IntegrityTagOptions,
  NativeBindingOptions,
} from "./types";

/**
 * Protect JavaScript source code by running the configured passes.
 *
 * @param source  - Original JavaScript source code
 * @param options - Protection configuration
 * @returns       ProtectResult containing the protected code and applied pass names
 */
export function protect(source: string, options: HazeOptions = {}): ProtectResult {
  if (typeof source !== "string") {
    throw new TypeError("source must be a string");
  }

  const ast = parse(source, {
    sourceType: "unambiguous",
    plugins: ["jsx"],
  });

  const appliedPasses: string[] = [];

  applyObfuscation(ast, options.obfuscation, appliedPasses);
  applyAntiDebug(ast, options.antiDebug, appliedPasses);

  const stripComments = options.stripComments !== false;

  const { code } = generate(ast, {
    minified: options.minify ?? false,
    compact: options.minify ?? false,
    shouldPrintComment: stripComments ? () => false : undefined,
  });

  return { code, appliedPasses };
}
