// Simulated priority-pass logic. Nothing here charges money, contacts a venue or grants entry.
// Money is integer cents. Party size is capped at 4 and by real remaining inventory.

export const MAX_PARTY = 4;
export const DEMO_OUTCOME = 'Pass created';

export function priceFor(offer, party) {
  const perPerson = offer.basePrice + offer.serviceFee;
  return {
    base: offer.basePrice * party,
    fees: offer.serviceFee * party,
    total: perPerson * party,
    perPerson,
  };
}

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const USD_WHOLE = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const money = (cents) => USD.format(cents / 100);
/** Whole-dollar sample prices (covers, menu items): "$8"; non-integers keep cents. */
export const dollars = (d) => (Number.isInteger(d) ? USD_WHOLE : USD).format(d);

/** 'open' | 'few' | 'soldout' | 'passed' | 'paused' | 'unavailable' */
export function windowState(offer, win, now) {
  if (!offer || !offer.enabled) return 'unavailable';
  if (now >= win.end) return 'passed';
  if (offer.paused) return 'paused';
  if (win.remaining <= 0) return 'soldout';
  if (win.remaining <= 3) return 'few';
  return 'open';
}

export const WINDOW_STATE_COPY = Object.freeze({
  open: 'Available',
  few: (n) => `${n} left`,
  soldout: 'Sold out',
  passed: 'Window ended',
  paused: 'Paused by venue',
  unavailable: 'Not offered',
});

export const purchasable = (state) => state === 'open' || state === 'few';

export function offerSummary(offer, now) {
  if (!offer || !offer.enabled) return { state: 'unavailable', label: 'No priority pass' };
  const states = offer.windows.map((w) => windowState(offer, w, now));
  if (offer.paused && states.some((s) => s !== 'passed')) return { state: 'paused', label: 'Priority paused by venue' };
  if (states.some(purchasable)) {
    return { state: 'available', label: `Priority pass · ${money(offer.basePrice + offer.serviceFee)} all-in` };
  }
  if (states.every((s) => s === 'passed')) return { state: 'passed', label: 'All windows ended' };
  return { state: 'soldout', label: 'Priority sold out tonight' };
}

export function maxPartyFor(win) {
  return Math.max(0, Math.min(MAX_PARTY, win.remaining));
}

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

export function createPass({ opId, venue, win, party, now }) {
  const price = priceFor(venue.pass, party);
  return {
    id: opId,
    ref: refCode(opId),
    venueId: venue.id,
    venueName: venue.name,
    windowId: win.id,
    windowStart: win.start,
    windowEnd: win.end,
    party,
    total: price.total,
    perPerson: price.perPerson,
    coverNote: venue.pass.coverIncluded ? 'Includes cover' : 'Cover not included',
    createdAt: now,
    cancelledAt: null,
    demo: true,
  };
}

/** 'cancelled' | 'upcoming' | 'active' | 'expired' */
export function passStatus(pass, now) {
  if (pass.cancelledAt) return 'cancelled';
  if (now < pass.windowStart) return 'upcoming';
  if (now < pass.windowEnd) return 'active';
  return 'expired';
}

export const PASS_STATUS_COPY = Object.freeze({
  upcoming: 'Window not open yet',
  active: 'Entry window open',
  expired: 'Window ended',
  cancelled: 'Cancelled',
});
