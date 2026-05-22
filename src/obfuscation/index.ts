import type * as t from "@babel/types";
import type { ObfuscationOptions } from "../types";
import { applySequenceExpression } from "./sequenceExpression";
import { applyMba } from "./mba";
import { applyFunctionTable } from "./functionTable";
import { applyStringPool } from "./stringPool";
import { applyControlFlowFlattening } from "./cff";
import { applyDeadCode } from "./deadCode";

export { applySequenceExpression, applyMba, applyFunctionTable, applyStringPool, applyControlFlowFlattening, applyDeadCode };

/**
 * Run all enabled obfuscation passes in order.
 * Each pass is opt-in: pass `false` to skip it entirely.
 */
export function applyObfuscation(ast: t.File, options: ObfuscationOptions = {}, appliedPasses: string[]): void {
  if (options.sequenceExpression !== false) {
    applySequenceExpression(ast, options.sequenceExpression ?? {});
    appliedPasses.push("sequenceExpression");
  }
  if (options.mba !== false) {
    applyMba(ast, options.mba ?? {});
    appliedPasses.push("mba");
  }
  if (options.functionTable !== false) {
    applyFunctionTable(ast, options.functionTable ?? {});
    appliedPasses.push("functionTable");
  }
  if (options.stringPool !== false) {
    applyStringPool(ast, options.stringPool ?? {});
    appliedPasses.push("stringPool");
  }
  if (options.controlFlowFlattening !== false) {
    applyControlFlowFlattening(ast, options.controlFlowFlattening ?? {});
    appliedPasses.push("controlFlowFlattening");
  }
  if (options.deadCode !== false) {
    applyDeadCode(ast, options.deadCode ?? {});
    appliedPasses.push("deadCode");
  }
}
