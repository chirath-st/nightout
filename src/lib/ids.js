// Client ids for idempotent writes. The server's client_id columns are uuid, so a fallback must be a real UUID too
// (a made-up "c-…" id was refused with 22P02, and every retry reused it).
/** A random RFC 4122 version 4 UUID: crypto.randomUUID where it exists (secure contexts), else built from getRandomValues. */
export function uuid() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
