// DEMO DATA. Bar names and street addresses are real, from public listings as of Oct 2026 (sources
// in each entry and on the About page). EVERYTHING ELSE IS SIMULATED for this prototype: waits,
// line sizes, report counts, passes, prices, covers, hours, menus and typical patterns. None of it
// describes how these bars actually operate, and no bar is affiliated with or has endorsed Night Out.

const MIN = 60_000;

/** Absolute time on the demo night: hours < 12 are treated as after midnight. */
export function atNight(demoStart, hh, mm = 0) {
  const d = new Date(demoStart);
  d.setHours(hh, mm, 0, 0);
  if (hh < 12) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** Absolute time `day` nights after the demo night (calendar math, so a DST change can't shift it). */
export function atNightOn(demoStart, day, hh, mm = 0) {
  const d = new Date(demoStart);
  d.setDate(d.getDate() + day + (hh < 12 ? 1 : 0));
  d.setHours(hh, mm, 0, 0);
  return d.getTime();
}

const menu = (food, zero, drinks) => [
  { title: 'Food', items: food },
  { title: 'Zero-proof', items: zero },
  { title: 'Drinks', items: drinks },
];

// Illustrative menus by kind of place. Never a venue's real menu or prices.
const MENUS = {
  pub: () => menu([['Wings (6)', 11], ['Fries', 6]], [['Soda', 3], ['Iced tea', 3]], [['Draft beer, pint', 6], ['Well drink', 7]]),
  restaurant: () => menu([['Small plate', 10], ['Burger', 15]], [['Lemonade', 4], ['Sparkling water', 3]], [['Glass of wine', 11], ['House cocktail', 13]]),
  cantina: () => menu([['Tacos (2)', 9], ['Chips & salsa', 6]], [['Agua fresca', 5]], [['Margarita', 12], ['Mexican lager', 7]]),
  hotel: () => menu([['Flatbread', 14], ['Olives', 7]], [['Sparkling water', 4]], [['House cocktail', 15], ['Glass of wine', 13]]),
  dogs: () => menu([['Hot dog', 6], ['Fries', 5]], [['Soda', 3]], [['Draft beer, pint', 7]]),
};
const SRC = {
  directory: 'New Brunswick City Market directory, "Nightlife, Bars & Taverns" (2026)',
};

// Bar coordinates (2026-10-17, checked twice): an OpenStreetMap point named for the bar, a New Jersey
// (NJOGIS) address point, or the US Census Bureau geocoder's address match, in that order of preference.
// Approximate (Census address interpolation, ~20–50 m): 30 Burgers & Brews, The Vine, The Olive Branch. Used only for straight-line
// distance from the demo spot; sources in research/claude-raw/geo-and-deals.md.
const GEO = {
  'olde-queens': [40.49887, -74.45207], 'scarlet-pub': [40.49960, -74.45290], 'ale-n-wich': [40.49626, -74.45610],
  'hueys-knight-club': [40.49972, -74.45430], evelyns: [40.49798, -74.44875], 'pitch-social': [40.49793, -74.44966],
  'stuff-yer-face': [40.49813, -74.44895], 'thirty-burgers': [40.49776, -74.44862],
  'the-vine': [40.50096, -74.45488], 'olive-branch': [40.50104, -74.45321],
};

// Real logos and photos, shown so judges recognize the bars (user decision 2026-10-17: "we will ask for the bars'
// permission once we actually launch"). They belong to the bars (and one Flickr photographer); no bar has given
// permission or is affiliated. Files, sources and crops: assets/bars/CREDITS.md. Scarlet Pub and Huey's keep the
// initials badge and illustration (no usable logo or photo); PITCH Social has a logo only.
const MEDIA = {
  'olde-queens': { photo: 'Olde Queens Tavern website', alt: 'The Olde Queens Tavern neon sign at night', pos: '60% 40%' },
  'ale-n-wich': { photo: 'Ale ’N ’Wich Pub website', alt: 'The brick corner building of Ale ’N ’Wich Pub', pos: '40% 55%' },
  'pitch-social': {},
  evelyns: { photo: 'Evelyn’s Restaurant website', alt: 'A plate of tabbouleh at Evelyn’s', pos: '50% 55%' },
  'stuff-yer-face': { photo: 'Ben+Sam on Flickr, CC BY-SA 2.0', alt: 'The Stuff Yer Face storefront with its green awning', pos: '55% 50%' },
  'thirty-burgers': { photo: '30 Burgers website (chain photo)', alt: 'A bacon cheeseburger from 30 Burgers', pos: '50% 45%' },
  'the-vine': { photo: '@dtjphotography via The Vine’s website', alt: 'The Vine’s sign on a wall of greenery', pos: '50% 40%' },
  'olive-branch': { photo: 'The Olive Branch website', alt: 'The beer taps at The Olive Branch', pos: '50% 50%' },
};

// SIMULATED deals ("weak hours" promotions), set up for the demo's midnight. No bar is offering these; every one is
// labeled a demo deal. Delivery-app style promos (Buy 1 get 1, % off) are only on food, entry and non-alcoholic
// drinks: New Jersey bans 2-for-1 and multi-drink offers on alcohol, so drink specials stay a single fixed price
// (src/lib/deals.js). `promo` drives the card badge; `item` and `terms` show on the bar page. Times are on the demo
// night (hours < 12 are after midnight).
const DEALS = {
  'olde-queens': [
    { id: 'oq-fries', kind: 'food', promo: { type: 'bogo' }, item: 'Loaded fries', title: 'Buy 1, get 1 free loaded fries', short: 'Buy 1 get 1', terms: 'Food only. One free order per person.', at: [23, 30], until: [1, 30] },
    { id: 'oq-drafts', kind: 'drink', item: 'draft', price: 4, promo: { type: 'price', label: '$4 drafts' }, title: 'Happy hour: $4 draft beer (16 oz)', short: '$4 drafts', terms: '21+. One drink per order, 16 oz.', at: [22, 0], until: [1, 0] },
  ],
  'scarlet-pub': [
    { id: 'sp-wings', kind: 'food', promo: { type: 'percent', value: 30 }, item: 'Wings and tenders', title: '30% off wings and tenders', short: '30% off', terms: 'Food only. Not valid on drinks.', at: [23, 0], until: [1, 30] },
    { id: 'sp-late', kind: 'entry', promo: { type: 'free', label: 'Free entry' }, item: 'Entry after 1 AM', title: 'Free entry after 1 AM', short: 'Free entry', terms: '21+ with ID. Capacity permitting.', at: [1, 0], until: [2, 0] },
  ],
  'ale-n-wich': [
    { id: 'aw-food', kind: 'food', promo: { type: 'percent', value: 20 }, item: 'All food', title: '20% off all food', short: '20% off', terms: 'Food only. Dine in.', at: [22, 0], until: [1, 0] },
  ],
  'pitch-social': [
    { id: 'ps-cover', kind: 'entry', promo: { type: 'percent', value: 50 }, item: 'Cover before 12:30 AM', title: '50% off cover before 12:30 AM', short: '50% off', terms: 'Entry only. 21+ with ID.', at: [23, 30], until: [0, 30] },
    { id: 'ps-mock', kind: 'na', promo: { type: 'price', label: '$3 mocktails' }, item: 'Mocktails and sodas', title: '$3 mocktails and sodas all night', short: '$3 mocktails', terms: 'Non-alcoholic drinks.', at: [21, 0], until: [2, 0] },
  ],
  'stuff-yer-face': [
    { id: 'sf-mozz', kind: 'food', promo: { type: 'bogo' }, item: 'Mozzarella sticks', title: 'Buy 1, get 1 free mozzarella sticks', short: 'Buy 1 get 1', terms: 'Food only. One free order per person.', at: [23, 0], until: [1, 0] },
  ],
  evelyns: [
    { id: 'ev-hummus', kind: 'food', promo: { type: 'free', label: 'Free bite' }, item: 'Hummus and pita', title: 'Free hummus and pita, no purchase needed', short: 'Free hummus', terms: 'No purchase needed. While it lasts.', at: [23, 0], until: [0, 30] },
  ],
  'the-vine': [
    { id: 'tv-trivia', kind: 'event', promo: { type: 'free', label: 'Trivia' }, item: '$25 food voucher prize', title: 'Trivia at 11 PM: $25 food voucher prize (21+ teams, no purchase needed)', short: 'Trivia prize', terms: '21+ teams. No purchase needed. Prize is food only.', at: [23, 0], until: [0, 30] },
  ],
};

const BASE = [
  {
    id: 'olde-queens', name: 'Olde Queens Tavern', area: 'Easton Ave', address: '108 Easton Ave', tags: ['College bar', 'Themed nights'],
    blurb: 'Easton Ave bar, established 1933 according to its website, with themed nights and bar crawls.',
    source: 'Venue website (2026); ' + SRC.directory,
    cover: 0, hours: { open: '18:00', close: '02:00' }, art: 'lamps',
    palette: ['#1F3B4D', '#F3C969', '#E9DFC9', '#2E5468'],
    typical: [1, 2, 3, 4, 4, 3, 1],
    queue: { sourceType: 'venue', ago: 3, peopleLow: 20, peopleHigh: 30, admitPerMin: 2.5, doorStatus: 'moving' },
    menu: MENUS.pub(),
    pass: { enabled: true, paused: false, basePrice: 1000, serviceFee: 150, coverIncluded: true,
      windows: [['w1', 0, 0, 0, 30, 6], ['w2', 0, 30, 1, 0, 4], ['w3', 1, 0, 1, 30, 10]] },
  },
  {
    id: 'scarlet-pub', name: 'Scarlet Pub', area: 'Easton Ave', address: '131 Easton Ave', tags: ['Pub'],
    blurb: 'Easton Ave pub, established 1959 according to its website.',
    source: 'Venue website (2026); ' + SRC.directory,
    cover: 5, hours: { open: '18:00', close: '02:00' }, art: 'stripes',
    palette: ['#4A1E1E', '#D9A441', '#F1E4CF', '#6B2C2C'],
    typical: [2, 3, 4, 4, 4, 3, 2],
    queue: { sourceType: 'crowd', ago: 6, reportCount: 4, peopleLow: 35, peopleHigh: 50, admitPerMin: 3, doorStatus: 'moving' },
    menu: MENUS.pub(),
    pass: { enabled: true, paused: false, basePrice: 1500, serviceFee: 195, coverIncluded: false,
      windows: [['w1', 0, 0, 0, 30, 0], ['w2', 0, 30, 1, 0, 3], ['w3', 1, 0, 1, 30, 8]] },
  },
  {
    id: 'ale-n-wich', name: "Ale 'N 'Wich Pub", area: 'Hamilton St', address: '246 Hamilton St', tags: ['Pub'],
    blurb: 'Hamilton St pub, established 1974 according to its website.',
    source: 'Venue website (2025); ' + SRC.directory,
    cover: 0, hours: { open: '16:00', close: '01:30' }, art: 'arches',
    palette: ['#24372B', '#C8A36A', '#E8E2D2', '#36513F'],
    typical: [1, 2, 3, 3, 2, 1, 0],
    queue: { sourceType: 'venue', ago: 14, peopleLow: 10, peopleHigh: 15, admitPerMin: 2, doorStatus: 'moving' },
    menu: MENUS.pub(),
    pass: null,
  },
  {
    id: 'hueys-knight-club', name: "Huey's Knight Club", area: 'Easton Ave', address: '164 Easton Ave', tags: ['College bar'],
    blurb: 'Easton Ave bar listed in the city directory and on 2026 bar-crawl ticket pages.',
    source: SRC.directory + '; bar-crawl ticket listings (2026)',
    cover: 10, hours: { open: '19:00', close: '02:00' }, art: 'waves',
    palette: ['#14213D', '#5EC2B7', '#E5ECF4', '#22335C'],
    typical: [0, 1, 3, 4, 4, 4, 2],
    queue: { sourceType: 'venue', ago: 2, peopleLow: 60, peopleHigh: 80, admitPerMin: 1, doorStatus: 'capacity' },
    menu: MENUS.pub(),
    pass: { enabled: true, paused: true, basePrice: 2000, serviceFee: 250, coverIncluded: true,
      windows: [['w1', 0, 0, 0, 30, 5], ['w2', 0, 30, 1, 0, 5], ['w3', 1, 0, 1, 30, 5]] },
  },
  {
    id: 'evelyns', name: "Evelyn's Restaurant & Bar", area: 'Easton Ave', address: '45 Easton Ave', tags: ['Restaurant & bar', 'Patio'],
    blurb: 'Lebanese and Mediterranean restaurant with a patio bar, per the city directory.',
    source: SRC.directory,
    cover: 0, hours: { open: '17:00', close: '00:30' }, art: 'arches',
    palette: ['#2E2A3A', '#B8A1D9', '#EEE9F4', '#433C55'],
    typical: [1, 1, 2, 2, 1, 0, 0],
    queue: { sourceType: 'venue', ago: 5, peopleLow: 0, peopleHigh: 2, admitPerMin: 2, doorStatus: 'moving' },
    menu: MENUS.restaurant(),
    pass: null,
  },
  {
    id: 'pitch-social', name: 'PITCH Social', area: 'Easton Ave', address: '66 Easton Ave', tags: ['Bar', 'DJ nights'],
    blurb: 'Opened in 2025 in the former Golden Rail space, per The Daily Targum (Oct 2025).',
    source: 'The Daily Targum (Oct 2025); public event listings (2025–26)',
    cover: 5, hours: { open: '20:00', close: '02:00' }, art: 'stripes',
    palette: ['#1C2A33', '#E3B341', '#E6EBEE', '#2B3E4A'],
    typical: [2, 3, 4, 4, 3, 2, 1],
    queue: { sourceType: 'crowd', ago: 4, reportCount: 3, peopleLow: 15, peopleHigh: 40, admitPerMin: 2.5, doorStatus: 'moving', conflict: true, conflictLow: 5, conflictHigh: 35 },
    menu: MENUS.pub(),
    pass: null,
  },
  {
    id: 'stuff-yer-face', name: 'Stuff Yer Face', area: 'Easton Ave', address: '49 Easton Ave', tags: ['Restaurant & bar', 'Crawl stop'],
    blurb: 'Easton Ave restaurant with a bar, and a stop on the 2025–2026 student bar crawls.',
    source: 'NJ ABC retail license list (Oct 2026); LineLeap student bar crawl pages (2025–2026)',
    cover: 0, hours: { open: '11:00', close: '01:00' }, art: 'arches',
    palette: ['#3B2416', '#E39B4A', '#F2E3CF', '#57351F'],
    typical: [2, 3, 3, 3, 2, 1, 0],
    queue: { sourceType: 'crowd', ago: 9, reportCount: 3, peopleLow: 5, peopleHigh: 10, admitPerMin: 2, doorStatus: 'moving' },
    menu: MENUS.restaurant(),
    pass: null,
  },
  {
    id: 'thirty-burgers', name: '30 Burgers & Brews', area: 'Easton Ave', address: '37 Easton Ave', tags: ['Burgers & bar', 'Crawl stop'],
    blurb: 'Burger restaurant with a bar that took over a liquor license on Easton Ave in 2025, and a stop on the 2025–2026 student bar crawls.',
    source: 'New Brunswick council license transfer (Jan 2025); LineLeap student bar crawl pages (2025–2026)',
    cover: 0, hours: { open: '11:00', close: '02:00' }, art: 'stripes',
    palette: ['#2A1A12', '#F07A3A', '#F4E6D6', '#43291C'],
    typical: [1, 2, 3, 3, 3, 2, 1],
    queue: { sourceType: 'venue', ago: 12, peopleLow: 2, peopleHigh: 6, admitPerMin: 2, doorStatus: 'moving' },
    menu: MENUS.dogs(),
    pass: null,
  },
  {
    id: 'the-vine', name: 'The Vine', area: 'Bartlett & Morrell St', address: '75 Morrell St', tags: ['College bar'],
    blurb: 'Bar on Morrell St in the former Kelly’s Korner space, and a stop on the 2025–2026 student bar crawls.',
    source: 'New Brunswick council license renewal (June 2026); LineLeap student bar crawl pages (2025–2026)',
    cover: 5, hours: { open: '20:00', close: '02:00' }, art: 'waves',
    palette: ['#1D2B1F', '#8BC34A', '#E4EEDC', '#2C4230'],
    typical: [0, 1, 2, 4, 4, 3, 1],
    queue: { sourceType: 'venue', ago: 1, peopleLow: 15, peopleHigh: 25, admitPerMin: 1.5, doorStatus: 'paused', note: 'Trivia final round: doors reopen at 12:30 AM (simulated)' },
    menu: MENUS.pub(),
    pass: { enabled: true, paused: false, basePrice: 1000, serviceFee: 150, coverIncluded: true,
      windows: [['w1', 0, 15, 0, 45, 6], ['w2', 0, 45, 1, 15, 6]] },
  },
  {
    id: 'olive-branch', name: 'The Olive Branch', area: 'Bartlett & Morrell St', address: '37 Bartlett St', tags: ['College bar'],
    blurb: 'Bar and restaurant on Bartlett St, and a stop on the 2025–2026 student bar crawls.',
    source: 'NJ ABC retail license list (Oct 2026); LineLeap student bar crawl pages (2025–2026)',
    cover: 0, hours: { open: '16:00', close: '02:00' }, art: 'lamps',
    palette: ['#232A1A', '#C9B458', '#ECE8D4', '#363F27'],
    typical: [1, 2, 3, 3, 3, 2, 1],
    queue: { sourceType: 'crowd', ago: 5, reportCount: 5, peopleLow: 25, peopleHigh: 40, admitPerMin: 2.5, doorStatus: 'moving' },
    menu: MENUS.pub(),
    pass: null,
  },
];

function materialize(raw, demoStart, syncAt = demoStart) {
  const v = structuredClone(raw);
  if (v.queue) {
    const { ago, ...rest } = v.queue;
    // Report ages are relative to the last simulated sync (Refresh), so the designed mix of
    // fresh / aging / out-of-date states survives however long the demo runs.
    v.queue = { ...rest, observedAt: syncAt - ago * MIN };
  }
  v.menu = v.menu.map((s) => ({ title: s.title, items: s.items.map(([name, price]) => ({ name, price })) }));
  if (v.pass) {
    v.pass = {
      ...v.pass,
      windows: v.pass.windows.map(([id, h1, m1, h2, m2, remaining]) => ({
        id, start: atNight(demoStart, h1, m1), end: atNight(demoStart, h2, m2), remaining, capacity: remaining,
      })),
    };
  }
  v.deals = (DEALS[v.id] ?? []).map(({ at, until, ...d }) => ({ ...d, venueId: v.id, startsAt: atNight(demoStart, at[0], at[1]), endsAt: atNight(demoStart, until[0], until[1]), synthetic: true }));
  const g = GEO[v.id];
  v.geo = g ? { lat: g[0], lng: g[1] } : null;
  const m = MEDIA[v.id];
  if (m) {
    v.logo = `assets/bars/${v.id}-logo.png`;
    if (m.photo) Object.assign(v, { photo: `assets/bars/${v.id}-photo.jpg`, photoCredit: m.photo, photoAlt: m.alt, photoPos: m.pos });
  }
  v.synthetic = true;
  return v;
}

/** Worst-case fixture (break-ui): long names, zero/one/huge counts, missing data, all-stale. */
function worstCase(demoStart, syncAt) {
  const base = BASE.map((r) => materialize(r, demoStart, syncAt));
  const long = materialize(BASE[0], demoStart, syncAt);
  long.id = 'worst-long-name';
  long.address = null; long.source = 'Fictional stress-test entry'; long.blurb = '';
  long.name = 'The Extraordinarily Long-Named Rooftop Lounge & Late-Night Kitchen at the Corner';
  long.blurb = 'A deliberately long venue name and description to test wrapping, truncation and layout stability across every screen in the prototype.';
  long.queue = { ...long.queue, peopleLow: 250, peopleHigh: 320, admitPerMin: 2, observedAt: syncAt - 2 * MIN, note: 'Rooftop closes early tonight; downstairs bar still admitting guests' };
  long.tags = ['Rooftop cocktails and late-night small plates', 'Patio'];
  long.menu = [{ title: 'Late kitchen', items: [{ name: 'Slow-roasted heirloom tomato flatbread with whipped ricotta and chili honey', price: 16 }] }];
  long.pass = { ...long.pass, paused: true };
  const one = materialize(BASE[6], demoStart, syncAt);
  one.id = 'worst-one';
  one.address = null; one.source = 'Fictional stress-test entry';
  one.name = 'One In Line';
  one.queue = { ...one.queue, peopleLow: 1, peopleHigh: 1, observedAt: syncAt - 1 * MIN };
  const nothing = materialize(BASE[5], demoStart, syncAt);
  nothing.id = 'worst-missing';
  nothing.address = null; nothing.source = null;
  nothing.name = 'Missing Everything';
  nothing.hours = null; nothing.cover = null; nothing.menu = []; nothing.tags = []; nothing.blurb = '';
  nothing.area = null; nothing.palette = null; nothing.typical = null; nothing.geo = null;
  for (const v of base) if (v.queue) v.queue.observedAt = syncAt - 90 * MIN;
  return [long, one, nothing, ...base];
}

export function buildDataset(kind, demoStart, syncAt = demoStart) {
  if (kind === 'empty') return [];
  if (kind === 'worst') return worstCase(demoStart, syncAt);
  return BASE.map((r) => materialize(r, demoStart, syncAt));
}

export const AREAS = ['Easton Ave', 'Bartlett & Morrell St', 'Hamilton St'];
export const TYPICAL_HOURS = ['8p', '9p', '10p', '11p', '12a', '1a', '2a'];
