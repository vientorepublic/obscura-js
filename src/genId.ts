import { randomBytes } from "crypto";

/**
 * Unicode look-alikes for hex digits a/c/e:
 *   а U+0430 (Cyrillic small letter a) — visually identical to ASCII a
 *   с U+0441 (Cyrillic small letter es) — visually identical to ASCII c
 *   е U+0435 (Cyrillic small letter ie) — visually identical to ASCII e
 *
 * Substituting these at random defeats simple /[0-9a-f]/ regex scanners
 * without changing how the identifier appears in most fonts or editors.
 */
const LOOKALIKE_MAP: Readonly<Record<string, string>> = {
  a: "\u0430",
  c: "\u0441",
  e: "\u0435",
};

function applyLookalikes(hex: string): string {
  let out = "";
  for (const ch of hex) {
    const alt = LOOKALIKE_MAP[ch];
    out += alt !== undefined && Math.random() < 0.5 ? alt : ch;
  }
  return out;
}

/** All identifiers issued since the last resetIdRegistry() call. */
const _registry = new Set<string>();

/**
 * Clears the identifier registry.
 *
 * Call this at the start of each protect() invocation in long-lived processes
 * (e.g. build servers) to prevent unbounded memory growth and to ensure IDs
 * are unique per invocation rather than globally.
 */
export function resetIdRegistry(): void {
  _registry.clear();
}

/**
 * Returns a globally unique hex-style identifier with 16 hex-body characters
 * (64-bit name space, birthday threshold ≈ 2^32 IDs — effectively unreachable).
 *
 * Uses crypto.randomBytes for high-quality, unpredictable randomness and
 * applies Unicode look-alikes to selected digits for analysis resistance.
 *
 * Example: _0x3f1аd72с8b9е0f14  (а/с/е may be Cyrillic look-alikes)
 */
export function genId(): string {
  for (;;) {
    const id = `_0x${applyLookalikes(randomBytes(8).toString("hex"))}`;
    if (!_registry.has(id)) {
      _registry.add(id);
      return id;
    }
  }
}
