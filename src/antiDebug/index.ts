import type * as t from "@babel/types";
import type { AntiDebugOptions } from "../types";
import { applyIntegrityTag } from "./integrityTag";
import { applyNativeBinding } from "./nativeBinding";

export { applyIntegrityTag, applyNativeBinding };

/**
 * Run all enabled anti-debugging/tampering passes in order.
 * Each pass is opt-in: pass `false` to skip it.
 */
export function applyAntiDebug(
  ast: t.File,
  options: AntiDebugOptions = {},
  appliedPasses: string[]
): void {
  if (options.nativeBinding !== false) {
    applyNativeBinding(ast, options.nativeBinding ?? {});
    appliedPasses.push("nativeBinding");
  }
  if (options.integrityTag !== false) {
    applyIntegrityTag(ast, options.integrityTag ?? {});
    appliedPasses.push("integrityTag");
  }
}
