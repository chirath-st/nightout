// Bar deals for slow hours: kinds, timing and the posting rules. Pure (no DOM), unit-tested.
// Rules follow New Jersey ABC regulations as researched on 2026-10-17 (research/claude-raw/geo-and-deals.md;
// not legal advice). Time-limited drink prices are allowed at or above the bar's cost (N.J.A.C. 13:2-24.8;
// ABC Handbook "Happy Hours"). Banned in every deal: 2-for-1 and multi-drink offers, unlimited drinks
// for a set price, upsized pours, anything free that requires buying alcohol, alcohol as a prize, and
// gender-based pricing (N.J.A.C. 13:2-23.16; Gillespie v. Coastline, DCR 2004). Contests are 21+ only
// (13:2-23.16(b)). The app only offers structured fields, so banned shapes can't be built from the form.

export const DEAL_KINDS = Object.freeze({
  entry: { label: 'Entry or cover', short: 'Entry', icon: 'ticket' },
  food: { label: 'Food', short: 'Food', icon: 'tag' },
  na: { label: 'Non-alcoholic drink', short: 'Non-alcoholic', icon: 'sparkle' },
  event: { label: 'Event or contest (21+ entrants)', short: 'Event', icon: 'star', adults: true },
  drink: { label: 'Drink special (21+)', short: 'Drink special', icon: 'tag', adults: true },
});

/** Drink specials: one item, a standard size, one per-drink price. No "upsize", bundles or "was" prices. */
export const DRINK_ITEMS = Object.freeze([
  { id: 'draft', label: 'Draft beer', size: '16 oz' },
  { id: 'well', label: 'Well drink', size: '1.5 oz' },
  { id: 'wine', label: 'House wine', size: '5 oz' },
  { id: 'seltzer', label: 'Hard seltzer', size: '12 oz' },
]);

export const DEAL_TITLE_MAX = 32;

const BANNED = /\b(2|two)\s*-?\s*(for|4)\s*-?\s*(1|one)\b|\bbogo\b|buy\s+(one|1|\d+)\s+get|bottomless|unlimited|all[\s-]*you[\s-]*can[\s-]*drink|open\s*bar|free\s+(shots?|drinks?|beers?|rounds?|pitchers?|cocktails?)|\bladies\b|\bgirls?\b|\bguys\b|\bmen\b|\bwomen\b|\bupsize\b|\bupgrade\b|\bdoubles?\s+for\b|\bdrink\s+tickets?\b|\bbuckets?\b|\bpitchers?\s+for\b|\bwas\s+\$/i;
const ALCOHOL = /\b(beers?|drafts?|shots?|cocktails?|wines?|liquor|margaritas?|pitchers?|seltzers?|vodka|tequila|whiske?y|rum|gin|ipas?|lagers?|sangria|mimosas?|well\s+drinks?|booze|happy\s+hour)\b/i;
const NA_WORDS = /non-?alcoholic|mocktails?|soda|soft\s+drinks?|zero-?proof|red\s*bull|coffee|water|juice|lemonade/i;

const toMin = ([h, m]) => (h < 12 ? h + 24 : h) * 60 + m; // hours before noon count as after midnight

/** Where a deal stands at `now`: live, soon or ended. */
export function dealState(deal, now) {
  if (now < deal.startsAt) return 'soon';
  if (now >= deal.endsAt) return 'ended';
  return 'live';
}

/** The live deal that ends first, or null. */
export function activeDeal(venue, now) {
  const live = (venue?.deals ?? []).filter((d) => dealState(d, now) === 'live');
  return live.sort((a, b) => a.endsAt - b.endsAt)[0] ?? null;
}

/** Tonight's deals: live first, then upcoming by start, then ended. */
export function dealsTonight(venue, now) {
  const rank = { live: 0, soon: 1, ended: 2 };
  return [...(venue?.deals ?? [])].sort((a, b) => rank[dealState(a, now)] - rank[dealState(b, now)] || a.startsAt - b.startsAt);
}

/** Headline for a drink special is built from its fields, never typed freely. */
export function drinkTitle(itemId, price) {
  const item = DRINK_ITEMS.find((i) => i.id === itemId);
  return item && Number.isFinite(price) ? `$${price % 1 ? price.toFixed(2) : price} ${item.label.toLowerCase()} (${item.size})` : '';
}

/**
 * Checks a deal draft from the venue console. Returns { errors, title } where errors maps field -> message.
 * draft: { kind, title, start: [h, m], end: [h, m], item?, price?, costOk? }
 */
export function checkDeal(draft) {
  const errors = {};
  const kind = DEAL_KINDS[draft.kind] ? draft.kind : null;
  if (!kind) errors.kind = 'Pick a deal type.';
  let title = (draft.title ?? '').trim();
  if (kind === 'drink') {
    const price = Number(draft.price);
    if (!DRINK_ITEMS.some((i) => i.id === draft.item)) errors.item = 'Pick the drink.';
    if (!(Number.isFinite(price) && price >= 1 && price <= 50)) errors.price = 'Enter the price per drink, $1 to $50.';
    if (!draft.costOk) errors.costOk = 'Confirm the price is at or above your cost. New Jersey bars can’t sell drinks below cost (N.J.A.C. 13:2-24.8).';
    title = errors.item || errors.price ? '' : drinkTitle(draft.item, price);
  } else if (kind) {
    if (!title) errors.title = 'Add a short headline, like “No cover before 11”.';
    else if (title.length > DEAL_TITLE_MAX) errors.title = `Keep it to ${DEAL_TITLE_MAX} characters.`;
    else if (BANNED.test(title)) errors.title = 'New Jersey doesn’t allow 2-for-1, unlimited, free-drink, upsized, multi-drink or gender-based deals.';
    else if (ALCOHOL.test(title) && !NA_WORDS.test(title)) errors.title = 'Alcohol prices go under “Drink special (21+)” so the price and size are checked.';
  }
  const okTime = (t) => Array.isArray(t) && t.length === 2 && t.every(Number.isFinite);
  if (!okTime(draft.start) || !okTime(draft.end)) errors.time = 'Pick a start and end time.';
  else if (toMin(draft.end) <= toMin(draft.start)) errors.time = 'The deal has to end after it starts.';
  return { errors, title };
}

/** Typical slow hours from a venue's 7-slot pattern (8 PM to 2 AM): the quietest slots, for the console hint. */
export function slowHours(typical, labels) {
  if (!Array.isArray(typical) || typical.length !== labels.length) return [];
  const min = Math.min(...typical);
  return labels.filter((_, i) => typical[i] === min);
}
