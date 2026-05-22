import * as t from "@babel/types";

// ─── Shared pass interface ──────────────────────────────────────────────────

/** A single AST transformation pass */
export interface Pass<TOptions> {
  /** Human-readable name of the pass */
  readonly name: string;
  /** Apply the pass to the given AST node in-place */
  apply(ast: t.File, options?: TOptions): void;
}

// ─── Obfuscation options ────────────────────────────────────────────────────

export interface SequenceExpressionOptions {
  /** Probability (0–1) of converting a block to a sequence expression */
  probability?: number;
}

export interface MbaOptions {
  /** Number of MBA expansion rounds (default: 1) */
  rounds?: number;
}

export interface FunctionTableOptions {
  /** Minimum number of functions before building an indirect table */
  minFunctions?: number;
}

export interface StringPoolOptions {
  /** XOR seed for the encrypted string pool */
  seed?: number;
}

export interface ControlFlowFlatteningOptions {
  /** Number of state-machine passes (default: 1) */
  passes?: number;
}

export interface DeadCodeOptions {
  /** Target lines of dead code to inject (default: 50) */
  targetLines?: number;
}

export interface ObfuscationOptions {
  sequenceExpression?: SequenceExpressionOptions | false;
  mba?: MbaOptions | false;
  functionTable?: FunctionTableOptions | false;
  stringPool?: StringPoolOptions | false;
  controlFlowFlattening?: ControlFlowFlatteningOptions | false;
  deadCode?: DeadCodeOptions | false;
}

// ─── Anti-debug options ─────────────────────────────────────────────────────

export interface IntegrityTagOptions {
  /** Symbol description string (default: 'jas') */
  tagDescription?: string;
}

export interface NativeBindingOptions {
  /** List of native methods to pre-bind (e.g. 'Math.floor') */
  methods?: string[];
}

export interface AntiDebugOptions {
  integrityTag?: IntegrityTagOptions | false;
  nativeBinding?: NativeBindingOptions | false;
}

// ─── Top-level options ───────────────────────────────────────────────────────

export interface HazeOptions {
  obfuscation?: ObfuscationOptions;
  antiDebug?: AntiDebugOptions;
  /** Minify the output (removes whitespace and shortens literals). Default: false */
  minify?: boolean;
}

// ─── Protect result ──────────────────────────────────────────────────────────

export interface ProtectResult {
  /** Protected source code */
  code: string;
  /** Applied pass names in order */
  appliedPasses: string[];
}
