/**
 * Generates a random 8-digit hex identifier that matches the style already
 * used by the dead-code pass (_0xAAAABBBB).  Injected runtime helpers
 * (string pool, function table, CFF state, integrity tag, native bindings)
 * use these names so they are visually indistinguishable from obfuscated
 * user variables produced by other passes.
 */
export function genId(): string {
  const a = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, "0");
  const b = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, "0");
  return `_0x${a}${b}`;
}
