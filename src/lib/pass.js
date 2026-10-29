// Small shared helpers: demo reference codes (reward vouchers, Business view ids) and sample-price formatting.
// Nothing here charges money, contacts a venue or grants entry.

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const USD_WHOLE = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
/** Whole-dollar sample prices (covers, menu items): "$8"; non-integers keep cents. */
export const dollars = (d) => (Number.isInteger(d) ? USD_WHOLE : USD).format(d);

/** Deterministic, obviously-demo reference from an operation id (idempotency key). */
export function refCode(opId) {
  const alphabet = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
  let h = 2166136261;
  for (const ch of String(opId)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  let out = '';
  for (let i = 0; i < 4; i += 1) {
    out += alphabet[h % alphabet.length];
    h = Math.floor(h / alphabet.length) + 7919 * (i + 1);
  }
  return `NO-${out}`;
}
