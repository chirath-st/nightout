// Bar deals for slow hours: kinds, timing and the posting rules. Pure (no DOM), unit-tested.
// Rules follow New Jersey ABC regulations as researched on 2026-10-17 (research/claude-raw/geo-and-deals.md;
// not legal advice). Time-limited drink prices are allowed at or above the bar's cost (N.J.A.C. 13:2-24.8;
// ABC Handbook "Happy Hours"). Banned in every deal: 2-for-1 and multi-drink offers, unlimited drinks
// for a set price, upsized pours, anything free that requires buying alcohol, alcohol as a prize, and
// gender-based pricing (N.J.A.C. 13:2-23.16; Gillespie v. Coastline, DCR 2004). Contests are 21+ only
// (13:2-23.16(b)). The app only offers structured fields, so banned shapes can't be built from the form.
// The text rule (DEAL_RE, dealTextProblem) is shared with the server's app.deal_text_problem (supabase/proposed,
// M1); app/tests/deals-parity.test.mjs keeps the two identical.

export const DEAL_KINDS = Object.freeze({
  entry: { label: 'Entry or cover', short: 'Entry', icon: 'ticket' },
  food: { label: 'Food', short: 'Food', icon: 'tag' },
  na: { label: 'Non-alcoholic drink', short: 'Non-alcoholic', icon: 'cup' },
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
export const DEAL_TITLE_MIN = 3;

// The posting rule's patterns, shared with the server. app.deal_re() in
// supabase/proposed/migrations/20261028090000_m1_fixes.sql holds the same strings with Postgres \y where these
// have \b (in Postgres \b is a backspace); app/tests/deals-parity.test.mjs fails if the two drift apart.
// Every rule reads the folded text (foldText: NFKD with accents removed), so after the `allowed` check only
// ASCII letters remain and \b means exactly what Postgres \y means. Regex filters are a backstop, not legal
// review: an admin still reads every venue submission.
export const DEAL_RE = Object.freeze({
  // After folding, only these characters may remain: zero-width, bidi and other format characters,
  // non-Latin homoglyphs (Cyrillic "е") and emoji are refused.
  allowed: String.raw`^[\t\n\r\u0020-\u007e\u2018\u2019\u201c\u201d\u2013\u2014\u2022\u00b7\u00b0\u00a1\u00bf\u00ab\u00bb\u20ac\u00a3\u00a9\u00ae]*$`,
  marks: String.raw`[\u0300-\u036f]`,
  // Banned in every deal: unlimited or free drinks, open bars, gender pricing, upsizing, drink tickets, "was $",
  // freebies tied to a drink purchase, THC/hemp/CBD items.
  banned: String.raw`bottomless|unlimited|all[\s-]*you[\s-]*can[\s-]*drink|open\s*bar|free\s+(shots?|drinks?|beers?|rounds?|pitchers?|cocktails?|pints?|brews?|cans|bombs?|shooters?|wines?|ciders?|drafts?|margaritas?|mimosas?|martinis?|mojitos?|seltzers?|booze|liquor|spirits|kegs?|buckets?|bottles?)|\bladies\b|\bgirls?\b|\bguys\b|\bmen\b|\bwomen\b|\bupsize\b|\bupgrade\b|\bdrink\s+tickets?\b|\bwas\s+\$|\bwith\s+(the\s+|a\s+|an\s+|any\s+)?(purchase\s+of\s+(a\s+|an\s+|any\s+)?)?(drinks?|beers?|cocktails?|shots?|alcohol|pints?|wines?|brews?)\b|\b(thc|hemp|cbd)\b`,
  // Multi-item offers (2-for-1, BOGO, buy N get…): fine for food, entry and non-alcoholic drinks only.
  multi: String.raw`\b(2|two)\s*-?\s*(for|4)\s*-?\s*(1|one)\b|\bbogo\b|\bb1g1\b|buy\s*(one|1|[0-9]+)[\s,]*get|\bdoubles?\s+for\b|\bbuckets?\b|\bpitchers?\s+for\b`,
  // The alcohol vocabulary (checked after the non-alcoholic products below are removed).
  alcohol: String.raw`\b(alcohol|alcoholic|booze|boozy|liquor|spirits|libations?|beers?|brews?|brewskis?|brewskies|suds|cold\s+ones|drafts?|pints?|cans|tall\s*boys?|bottles?|growlers?|kegs?|pitchers?|fishbowls?|shots?|shooters?|bombs?|drinks?|beverages?|bevs?|bevvies|cocktails?|wines?|vino|champagne|prosecco|ciders?|seltzers?|ipas?|lagers?|stouts?|pale\s+ales?|vodka|tequila|whiske?y|bourbon|rum|gin|soju|mezcal|cognac|schnapps|vermouth|aperol|spritz(es)?|margaritas?|mojitos?|martinis?|mimosas?|bellinis?|negronis?|daiquiris?|palomas?|sangria|moscow\s+mules?|long\s+island\s+(iced\s+)?teas?|happy\s+hour|jager\w*|white\s*claws?|bud\s*light|budweiser|coors|michelob|heineken|modelo|coronas?|guinness|natty\s*(light|lite|daddy)|fireball|smirnoff|bacardi|jameson|casamigos|hennessy)\b`,
  // "hard X" is alcohol whatever follows.
  hard: String.raw`\bhard\s+(ciders?|seltzers?|lemonades?|kombuchas?|teas?|sodas?|root\s+beers?|ginger\s+beers?)\b`,
  // Pass 1: explicitly non-alcoholic products. A mixer word (soda, juice, coffee, Red Bull) excuses nothing.
  na_product: String.raw`\b(non[\s-]?alcoholic|alcohol[\s-]?free|zero[\s-]?proof|virgin|na)\s+(beers?|drafts?|brews?|pints?|cans|cocktails?|wines?|ciders?|spirits|margaritas?|mojitos?|martinis?|mimosas?|sangria|seltzers?|ipas?|lagers?|drinks?|beverages?)\b|\b(soft|energy|fountain|sports)\s+drinks?\b|\b(root|ginger)\s+beers?\b|\bcold\s+brews?\b|\bespresso\s+shots?\b|\bcider\s+(donuts?|doughnuts?)\b|\bseltzer\s+waters?\b|\bwater\s+bottles?\b`,
  // Pass 2: the non-alcoholic words themselves.
  na_word: String.raw`\b(non[\s-]?alcoholic|alcohol[\s-]?free|zero[\s-]?proof)\b`,
  // Event text: a price or discount next to an alcohol mention, and drinking games (ideas.js RULES).
  listing_price: String.raw`\$\s?[0-9]|[0-9]+\s*%|[0-9]+\s*cents?\b|half[\s-]*(price|off)|\b(discount(s|ed)?|specials?|cheap|deals?|on\s+the\s+house)\b`,
  drinking_game: String.raw`\b(beer\s*pong|flip\s*cup|chug\w*|keg\s*stands?|shotgun\w*|drinking\s+games?|power\s*hour|kings?\s*cup|beer\s*olympics)\b`,
});
const rx = (name, flags = 'i') => new RegExp(DEAL_RE[name], flags);

// Banned in every deal: unlimited or bottomless drinks, open bars, free drinks, gender pricing, upsizing, drink tickets, "was $".
export const ALWAYS_BANNED = rx('banned');
// Multi-item offers (2-for-1, BOGO, buy N get…): banned for alcohol, fine for food, entry and non-alcoholic drinks.
export const MULTI_OFFER = rx('multi');
/** Either kind of banned shape (used for free text where we can't tell what the offer is on). */
export const BANNED = new RegExp(`${ALWAYS_BANNED.source}|${MULTI_OFFER.source}`, 'i');
export const ALCOHOL = rx('alcohol');
const HARD = rx('hard');
const NA_PRODUCT = rx('na_product', 'gi');
const NA_WORD = rx('na_word', 'gi');
const ALLOWED = rx('allowed', '');
const MARKS = rx('marks', 'g');
const LISTING_PRICE = rx('listing_price');
const DRINKING_GAME = rx('drinking_game');
const PLAIN_KINDS = ['entry', 'food', 'na', 'event', 'reward'];

/** NFKD with combining marks removed (fullwidth letters become ASCII, é becomes e). Same as SQL app.deal_fold. */
export const foldText = (s) => String(s ?? '').normalize('NFKD').replace(MARKS, '');

/** True when the text mentions alcohol: "hard X", or a listed word left after non-alcoholic products are removed. */
export function alcoholMentioned(s) {
  const f = foldText(s);
  return HARD.test(f) || ALCOHOL.test(f.replace(NA_PRODUCT, ' ').replace(NA_WORD, ' '));
}

/**
 * The first rule a deal, event ('listing') or reward text breaks, as the server's field code; null when fine.
 * Same function as SQL app.deal_text_problem (supabase/proposed): unsupported_characters, banned_terms,
 * multi_drink, alcohol_needs_drink_special, alcohol_price, drinking_game.
 */
export function dealTextProblem(kind, text) {
  if (text == null || String(text).replace(/^ +| +$/g, '') === '') return null; // Postgres btrim(): spaces only
  const f = foldText(text);
  if (!ALLOWED.test(f)) return 'unsupported_characters';
  if (ALWAYS_BANNED.test(f)) return 'banned_terms';
  if (MULTI_OFFER.test(f) && (kind === 'drink' || alcoholMentioned(f))) return 'multi_drink';
  if (kind === 'drink') return null;
  if (PLAIN_KINDS.includes(kind) && alcoholMentioned(f)) return 'alcohol_needs_drink_special';
  if (kind === 'listing' && alcoholMentioned(f) && LISTING_PRICE.test(f)) return 'alcohol_price';
  if (kind === 'listing' && DRINKING_GAME.test(f)) return 'drinking_game';
  return null;
}

/** A headline as the server stores it: NFKC, trimmed of spaces, tabs and line breaks (the same set the server trims). */
export const cleanTitle = (s) => String(s ?? '').normalize('NFKC').replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, '');

const TITLE_MESSAGES = {
  title_required: 'Add a short headline, like “No cover before 11”.',
  title_too_short: `Use at least ${DEAL_TITLE_MIN} characters.`,
  title_too_long: `Keep it to ${DEAL_TITLE_MAX} characters.`,
  unsupported_characters: 'Use plain letters, numbers and punctuation. Emoji and hidden characters aren’t allowed.',
  banned_terms: 'New Jersey doesn’t allow unlimited, free-drink, upsized or gender-based deals.',
  multi_drink: 'New Jersey doesn’t allow 2-for-1 or multi-drink deals on alcohol. Buy 1, get 1 works for food, entry and non-alcoholic drinks.',
  alcohol_needs_drink_special: 'Alcohol prices go under “Drink special (21+)” so the price and size are checked.',
};

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
 * Checks a deal draft from the venue console. Returns { errors, title, fields }: errors maps field -> message,
 * fields maps field -> the server's code (api.venue_submit_deal answers {error: 'invalid_deal', fields} with the
 * same codes). draft: { kind, title, start: [h, m], end: [h, m], item?, price?, costOk? }
 */
export function checkDeal(draft) {
  const errors = {};
  const fields = {};
  const fail = (field, code, message) => { fields[field] = code; errors[field] = message; };
  const kind = DEAL_KINDS[draft.kind] ? draft.kind : null;
  if (!kind) fail('kind', 'pick_kind', 'Pick a deal type.');
  let title = cleanTitle(draft.title);
  if (kind === 'drink') {
    const price = Number(draft.price);
    if (!DRINK_ITEMS.some((i) => i.id === draft.item)) fail('item', 'pick_drink', 'Pick the drink.');
    if (!(Number.isFinite(price) && price >= 1 && price <= 50)) fail('price', 'price_range', 'Enter the price per drink, $1 to $50.');
    if (!draft.costOk) fail('costOk', 'cost_not_confirmed', 'Confirm the price is at or above your cost. New Jersey bars can’t sell drinks below cost (N.J.A.C. 13:2-24.8).');
    title = errors.item || errors.price ? '' : drinkTitle(draft.item, price);
  } else if (kind) {
    const length = [...title].length; // code points, like Postgres char_length
    const code = !title ? 'title_required'
      : length < DEAL_TITLE_MIN ? 'title_too_short'
        : length > DEAL_TITLE_MAX ? 'title_too_long'
          : dealTextProblem(kind, title);
    if (code) fail('title', code, TITLE_MESSAGES[code]);
  }
  const okTime = (t) => Array.isArray(t) && t.length === 2 && t.every(Number.isFinite);
  if (!okTime(draft.start) || !okTime(draft.end)) fail('time', 'time_required', 'Pick a start and end time.');
  else if (toMin(draft.end) <= toMin(draft.start)) fail('time', 'end_before_start', 'The deal has to end after it starts.');
  return { errors, title, fields };
}

/** Typical slow hours from a venue's 7-slot pattern (8 PM to 2 AM): the quietest slots, for the console hint. */
export function slowHours(typical, labels) {
  if (!Array.isArray(typical) || typical.length !== labels.length) return [];
  const min = Math.min(...typical);
  return labels.filter((_, i) => typical[i] === min);
}
