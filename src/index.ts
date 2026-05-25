import { parseSync, printSync } from "@swc/core";
import { applyObfuscation } from "./obfuscation";
import { applyAntiDebug } from "./antiDebug";
import { resetIdRegistry } from "./genId";
import type { ObscuraOptions, ProtectResult } from "./types";
import type { SwcProgram } from "./swc-utils";

export type { ObscuraOptions as HazeOptions, ProtectResult } from "./types";
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
export function protect(source: string, options: ObscuraOptions = {}): ProtectResult {
  if (typeof source !== "string") {
    throw new TypeError("source must be a string");
  }

  resetIdRegistry();

  const ast = parseSync(source, {
    syntax: "ecmascript",
    jsx: true,
  }) as unknown as SwcProgram;

  const appliedPasses: string[] = [];

  applyObfuscation(ast, options.obfuscation, appliedPasses);
  applyAntiDebug(ast, options.antiDebug, appliedPasses);

  const stripComments = options.stripComments !== false;
  void stripComments; // SWC strips comments by default in printSync output

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { code } = printSync(ast as any, {
    minify: options.minify ?? false,
  });

  return { code, appliedPasses };
}
