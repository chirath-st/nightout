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
// Approximate (no venue-level source; may be off by up to ~100 m): Knights Public House, Batch Bin &
// Barrel, Esquina Latina; Glass Woods Tavern is the Hyatt building's center. Used only for straight-line
// distance from the demo spot; sources in research/claude-raw/geo-and-deals.md.
const GEO = {
  'olde-queens': [40.49887, -74.45207], 'scarlet-pub': [40.49960, -74.45290], 'ale-n-wich': [40.49626, -74.45610],
  'hueys-knight-club': [40.49972, -74.45430], 'old-man-raffertys': [40.49657, -74.44380], 'knights-public-house': [40.49679, -74.44710],
  evelyns: [40.49798, -74.44875], 'pitch-social': [40.49793, -74.44966], 'tavern-on-george': [40.49497, -74.44372],
  'frog-and-peach': [40.49503, -74.44073], 'fat-cactus': [40.49460, -74.44395], roosterspin: [40.49636, -74.44539],
  'destination-dogs': [40.49470, -74.44819], 'esquina-latina': [40.49393, -74.44219], 'batch-bin-barrel': [40.49642, -74.44321],
  'glass-woods-tavern': [40.49630, -74.44104], deltas: [40.49467, -74.44077],
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
      windows: [['w1', 22, 30, 23, 0, 6], ['w2', 23, 0, 23, 30, 4], ['w3', 23, 30, 0, 0, 10]] },
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
      windows: [['w1', 22, 30, 23, 0, 0], ['w2', 23, 0, 23, 30, 3], ['w3', 23, 30, 0, 0, 8]] },
  },
  {
    id: 'ale-n-wich', name: "Ale 'N 'Wich Pub", area: 'College Ave', address: '246 Hamilton St', tags: ['Pub'],
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
      windows: [['w1', 22, 30, 23, 0, 5], ['w2', 23, 0, 23, 30, 5], ['w3', 23, 30, 0, 0, 5]] },
  },
  {
    id: 'old-man-raffertys', name: "Old Man Rafferty's", area: 'Downtown', address: '106 Albany St', tags: ['Restaurant & bar'],
    blurb: 'Albany St restaurant and bar listed in the city directory.',
    source: SRC.directory,
    cover: null, hours: { open: '17:00', close: '01:00' }, art: 'embers',
    palette: ['#2B1B17', '#E07A3F', '#F2E3D5', '#4A2A20'],
    typical: [2, 2, 3, 3, 2, 1, 0],
    queue: { sourceType: 'crowd', ago: 42, reportCount: 2, peopleLow: 10, peopleHigh: 20, admitPerMin: 2, doorStatus: 'moving' },
    menu: MENUS.restaurant(),
    pass: null,
  },
  {
    id: 'knights-public-house', name: 'Knights Public House', area: 'Easton Ave', address: '12 Easton Ave', tags: ['Pub', 'College nights'],
    blurb: 'Easton Ave pub that hosted promoter-run college nights in 2025 event listings.',
    source: 'Public event listings (2025)',
    cover: 0, hours: { open: '15:00', close: '01:00' }, art: 'grid',
    palette: ['#3A2618', '#C97B3C', '#F0E6DA', '#5A3A24'],
    typical: [2, 2, 2, 2, 1, 1, 0],
    queue: null,
    menu: MENUS.pub(),
    pass: null,
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
    id: 'tavern-on-george', name: 'Tavern on George', area: 'Downtown', address: '361 George St', tags: ['Tavern'],
    blurb: 'George St tavern listed in the city directory.',
    source: SRC.directory,
    cover: 0, hours: { open: '17:00', close: '02:00' }, closedTonight: true, art: 'moon',
    palette: ['#1D1D3B', '#F2D16B', '#ECEAF4', '#2E2E58'],
    typical: [0, 0, 0, 0, 0, 0, 0],
    queue: null,
    menu: MENUS.pub(),
    pass: null,
  },
  {
    id: 'frog-and-peach', name: 'The Frog and The Peach', area: 'Downtown', address: '29 Dennis St', tags: ['Restaurant & bar'],
    blurb: 'Dennis St restaurant and bar listed in the city directory.',
    source: SRC.directory,
    cover: 0, hours: { open: '17:00', close: '01:00' }, art: 'lamps',
    palette: ['#3B1530', '#E8A0BF', '#F5E9EF', '#55203F'],
    typical: [0, 1, 2, 3, 3, 2, 1],
    queue: { sourceType: 'venue', ago: 1, peopleLow: 15, peopleHigh: 25, admitPerMin: 1.5, doorStatus: 'paused', note: 'Private event until 11:30 PM (simulated)' },
    menu: MENUS.restaurant(),
    pass: null,
  },
  {
    id: 'fat-cactus', name: 'Fat Cactus Mexican Cantina', area: 'Downtown', address: '350 George St', tags: ['Cantina'],
    blurb: 'George St Mexican cantina listed in the city directory.',
    source: SRC.directory,
    cover: 3, hours: { open: '16:00', close: '02:00' }, art: 'moon',
    palette: ['#262A21', '#A9C46C', '#E9EDE0', '#3A4031'],
    typical: [1, 2, 2, 3, 3, 2, 1],
    queue: { sourceType: 'crowd', ago: 8, reportCount: 2, peopleLow: 5, peopleHigh: 10, admitPerMin: 2, doorStatus: 'moving' },
    menu: MENUS.cantina(),
    pass: null,
  },
  {
    id: 'roosterspin', name: 'Roosterspin', area: 'Downtown', address: '120 Albany St', tags: ['Restaurant & bar'],
    blurb: 'Albany St restaurant and bar listed in the city directory.',
    source: SRC.directory,
    cover: 12, hours: { open: '19:00', close: '02:00' }, art: 'embers',
    palette: ['#3D2A0F', '#F2B33D', '#F7EEDC', '#5C4017'],
    typical: [1, 2, 3, 4, 3, 2, 1],
    queue: { sourceType: 'venue', ago: 17, peopleLow: 25, peopleHigh: 35, admitPerMin: 2, doorStatus: 'moving' },
    menu: MENUS.restaurant(),
    pass: { enabled: true, paused: false, basePrice: 1200, serviceFee: 160, coverIncluded: false,
      windows: [['w1', 22, 0, 22, 30, 4], ['w2', 23, 15, 23, 45, 6]] },
  },
  {
    id: 'destination-dogs', name: 'Destination Dogs', area: 'Downtown', address: '101 Paterson St', tags: ['Bar & food'],
    blurb: 'Paterson St bar and restaurant listed in the city directory.',
    source: SRC.directory,
    cover: 0, hours: { open: '16:00', close: '02:00' }, art: 'grid',
    palette: ['#2A1F14', '#E8B04A', '#F3EADB', '#43321F'],
    typical: [1, 2, 3, 3, 2, 1, 0],
    queue: { sourceType: 'crowd', ago: 3, reportCount: 3, peopleLow: 10, peopleHigh: 20, admitPerMin: 2.5, doorStatus: 'moving' },
    menu: MENUS.dogs(),
    pass: null,
  },
  {
    id: 'esquina-latina', name: 'Esquina Latina', area: 'Downtown', address: '25 Liberty St', tags: ['Restaurant & bar'],
    blurb: 'Liberty St restaurant and bar listed in the city directory.',
    source: SRC.directory,
    cover: 10, hours: { open: '18:00', close: '02:00' }, art: 'waves',
    palette: ['#1E1430', '#E46B8C', '#F2E6EE', '#33224D'],
    typical: [0, 1, 2, 3, 3, 3, 1],
    queue: null,
    menu: MENUS.cantina(),
    pass: null,
  },
  {
    id: 'batch-bin-barrel', name: 'Batch Bin & Barrel', area: 'Downtown', address: '98 Albany St', tags: ['Bar'],
    blurb: 'Albany St bar listed in the city directory.',
    source: SRC.directory,
    cover: 0, hours: { open: '16:00', close: '01:00' }, art: 'stripes',
    palette: ['#1D2B2A', '#7FC8B5', '#E4EFEC', '#2C403E'],
    typical: [1, 2, 2, 2, 1, 1, 0],
    queue: { sourceType: 'venue', ago: 12, peopleLow: 8, peopleHigh: 12, admitPerMin: 2, doorStatus: 'moving' },
    menu: MENUS.pub(),
    pass: null,
  },
  {
    id: 'glass-woods-tavern', name: 'Glass Woods Tavern', area: 'Downtown', address: '2 Albany St (Hyatt)', tags: ['Hotel bar'],
    blurb: 'Bar in the Hyatt on Albany St, listed in the city directory.',
    source: SRC.directory,
    cover: 0, hours: { open: '16:00', close: '00:00' }, art: 'lamps',
    palette: ['#1B2430', '#C9D3E0', '#EEF1F5', '#2A3646'],
    typical: [1, 1, 2, 2, 1, 0, 0],
    queue: { sourceType: 'venue', ago: 4, peopleLow: 0, peopleHigh: 3, admitPerMin: 2, doorStatus: 'moving' },
    menu: MENUS.hotel(),
    pass: null,
  },
  {
    id: 'deltas', name: "Delta's", area: 'Downtown', address: '19 Dennis St', tags: ['Restaurant & bar'],
    blurb: 'Dennis St restaurant and bar listed in the city directory.',
    source: SRC.directory,
    cover: 0, hours: { open: '17:00', close: '22:00' }, art: 'arches',
    palette: ['#2C1A12', '#D98E4A', '#F4E7DB', '#47291C'],
    typical: [1, 2, 1, 0, 0, 0, 0],
    queue: null,
    menu: MENUS.restaurant(),
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
  const g = GEO[v.id];
  v.geo = g ? { lat: g[0], lng: g[1] } : null;
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

export const AREAS = ['College Ave', 'Easton Ave', 'Downtown'];
export const TYPICAL_HOURS = ['8p', '9p', '10p', '11p', '12a', '1a', '2a'];
