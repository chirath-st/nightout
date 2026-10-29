// SIMULATED social and rewards data for the demo. Every person, group, handle, point and reward here
// is invented. Hosts are fictional (first name + initial); Instagram handles end in ".demo" and links
// to Instagram are switched off in the prototype so they can never open a real stranger's profile.
import { atNight } from './venues.js';

export const POINTS = Object.freeze({
  DAILY: 5, // first visit on a demo night
  CHECKIN: 25, // scanning the bar's door QR (once per bar per night)
  REPORT: 15, // a verified crowd update (line photo + size); verified instantly in the demo
  GOT_IN: 10, // telling us when you got in, which gives a measured wait
  START: 240, // demo starting balance so the rewards can be tried
});

/** Report sizes a guest can pick. Ranges become the crowd estimate for that bar. */
export { LINE_BUCKETS } from '../lib/queue.js';

// Fictional people for demo groups: made-up names, class years, interests and Instagram-style handles. Every seeded
// handle uses hyphens, which Instagram doesn't allow in usernames, so none can match a real account. Everyone is 21+. Pictures are drawn by src/ui/avatars.js from `seed`, never photos.
export const PEOPLE = Object.freeze([
  ['Chris T.', 'Senior', ['Chill', 'Bar hop']], ['Ana M.', 'Senior', ['Dancer']], ['Leo G.', 'Senior', ['Sports fan']], ['Nia B.', 'Senior', ['Karaoke']],
  ['Omar H.', 'Grad student', ['Live music']], ['Jess W.', 'Senior', ['New to Easton Ave']], ['Kenji A.', 'Senior', ['DJ fan']], ['Bella C.', 'Senior', ['Dancer', 'Karaoke']],
  ['Tariq N.', 'Grad student', ['Trivia nerd']], ['Zoe F.', 'Senior', ['Chill']], ['Marcus D.', 'Senior', ['Sports fan', 'Bar hop']], ['Elena V.', 'Senior', ['Karaoke']],
  ['Ravi J.', 'Grad student', ['Sports fan']], ['Hannah O.', 'Senior', ['Birthday crew']], ['Diego Q.', 'Senior', ['DJ fan']], ['Imani Y.', 'Senior', ['Dancer']],
  ['Noah Z.', 'Grad student', ['Chill', 'Trivia nerd']], ['Grace E.', 'Senior', ['New to Easton Ave']], ['Ethan U.', 'Senior', ['Trivia nerd']], ['Sofia R.', 'Senior', ['Live music']],
  ['Malik P.', 'Senior', ['Sports fan']], ['Lily K.', 'Senior', ['Karaoke', 'Dancer']], ['Sam O.', 'Alum', ['Chill']], ['Aisha L.', 'Senior', ['DJ fan', 'Bar hop']],
].map(([name, year, vibe]) => ({ name, year, vibe, handle: `${name.split(' ')[0].toLowerCase()}-${name.split(' ')[1][0].toLowerCase()}`, seed: `p-${name}` })));

const GROUPS = [
  { id: 'g1', title: 'Pregame then Olde Queens', venueId: 'olde-queens', at: [0, 0], spots: 6, going: 3, host: { name: 'Maya R.', handle: 'maya-r', hue: 18, year: 'Senior' }, note: 'Chill group, mostly seniors. Meeting outside at 11:55.', tags: ['Chill', 'Seniors'] },
  { id: 'g2', title: 'Late trivia crew needs two more', venueId: 'ale-n-wich', at: [0, 30], spots: 5, going: 3, host: { name: 'Dev P.', handle: 'dev-trivia', hue: 205, year: 'Grad student' }, note: 'We lose every week. Come lose with us.', tags: ['Trivia'] },
  { id: 'g3', title: 'Birthday at Scarlet Pub', venueId: 'scarlet-pub', at: [23, 30], spots: 10, going: 7, host: { name: 'Sam K.', handle: 'sam-k', hue: 340, year: 'Senior' }, note: 'Turning 22. Everyone welcome, bring good energy.', tags: ['Birthday'] },
  { id: 'g4', title: 'Late night at PITCH', venueId: 'pitch-social', at: [0, 30], spots: 4, going: 2, host: { name: 'Jordan L.', handle: '', hue: 140, year: 'Senior' }, note: 'Going for the DJ. One more and we’re a crew.', tags: ['DJ'] },
  { id: 'g5', title: 'Easton Ave bar walk', venueId: 'hueys-knight-club', at: [23, 30], spots: 8, going: 5, host: { name: 'Priya S.', handle: 'priya-walks', hue: 270, year: 'Senior' }, note: 'Three stops, one block. We move on when the next line is short.', tags: ['Bar hop'],
    stops: [['hueys-knight-club', 23, 30], ['scarlet-pub', 0, 15], ['olde-queens', 1, 0]] },
  { id: 'g6', title: 'Hamilton to Easton hop', venueId: 'ale-n-wich', at: [23, 0], spots: 6, going: 4, host: { name: 'Luis F.', handle: 'luis-hops', hue: 30, year: 'Grad student' }, note: 'Wings and trivia first, then dancing.', tags: ['Bar hop'],
    stops: [['ale-n-wich', 23, 0], ['pitch-social', 0, 45]] },
];

/** Members of a seeded group: the host plus fictional people (deterministic per group), and you if you joined. */
export function groupMembers(g, { you = null, joined = false } = {}) {
  const host = { ...g.host, seed: g.mine ? null : `p-${g.host.name}`, initials: initials(g.host.name), role: 'Host', vibe: g.tags ?? [] };
  const me = (extra = {}) => ({ name: you?.name ?? g.host.name, initials: initials(you?.name ?? g.host.name), seed: youSeed(you?.name ?? g.host.name), handle: you?.handle ?? '', vibe: [], you: true, ...extra });
  if (g.mine) return [me({ role: 'Host', handle: g.host.handle ?? '', vibe: g.tags ?? [] })];
  let h = 0;
  for (const ch of g.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const others = [];
  for (let i = 0; others.length < Math.max(0, g.going - 1) && i < PEOPLE.length; i += 1) {
    const p = PEOPLE[(h + i * 7) % PEOPLE.length];
    if (p.name !== g.host.name && !others.includes(p)) others.push(p);
  }
  return [host, ...others.map((p) => ({ ...p, initials: initials(p.name) })), ...(joined && you ? [me()] : [])];
}

/** The demo account's drawn picture (team ask: \"create a demo profile image\"); never a photo. */
export const youSeed = (name) => `me-${name || 'you'}`;

export function buildGroups(demoStart) {
  return GROUPS.map(({ stops, ...g }) => ({
    ...g, startsAt: atNight(demoStart, g.at[0], g.at[1]), synthetic: true,
    ...(stops ? { stops: stops.map(([venueId, h, m]) => ({ venueId, startsAt: atNight(demoStart, h, m) })) } : {}),
  }));
}

/** When a group (or the last stop of a bar hop) is over: 2 hours after it starts. One rule for cards, timelines and counts. */
export const groupEndsAt = (g) => (g.stops?.length ? g.stops[g.stops.length - 1].startsAt : g.startsAt) + 2 * 60 * 60_000;

/** Which stop of a bar hop is current at `now` (null before the first or with no stops). Each stop runs until the next starts. */
export function currentStop(stops, now) {
  if (!stops?.length) return null;
  let cur = null;
  for (let i = 0; i < stops.length; i += 1) if (now >= stops[i].startsAt) cur = i;
  return cur;
}

/** Rewards catalog. Simulated: no bar honors these. Nothing here is alcohol (see DRINKS_LOCK). */
export const REWARDS = Object.freeze([
  { id: 'na-drink', title: 'Free non-alcoholic drink', detail: 'Soda, mocktail or water', cost: 100, icon: 'cup' },
  { id: 'cover', title: 'Cover on us', detail: 'One cover charge', cost: 200, icon: 'ticket' },
  { id: 'line-cut', title: 'Line cut', detail: 'Priority entry during a set window', cost: 400, icon: 'arrowRight' },
  { id: 'merch', title: 'Night Out hat', detail: 'Pick up at a pop-up', cost: 600, icon: 'cap' },
  { id: 'vip', title: 'VIP entry', detail: 'Skip the line for you and one friend', cost: 1000, icon: 'star' },
]);

/** The cheapest reward still out of reach, and how far away it is (null when everything is affordable). */
export function nextReward(balance) {
  const r = [...REWARDS].sort((a, b) => a.cost - b.cost).find((x) => x.cost > balance);
  return r ? { reward: r, need: r.cost - balance, progress: Math.max(0, Math.min(1, balance / r.cost)) } : null;
}

/** One check-in per bar per demo night. checkins: [{ venueId, at }]; night: the demo night's start (ms). */
export function checkedInTonight(checkins, venueId, night) {
  return checkins.some((c) => c.venueId === venueId && c.at >= night - 6 * 60 * 60_000);
}

export const DRINKS_LOCK = 'New Jersey doesn’t allow prizes or rewards that consist of alcohol or can be redeemed for it (N.J.A.C. 13:2-23.16), so points can’t be used for drinks.';

export const balanceOf = (ledger) => ledger.reduce((sum, e) => sum + e.delta, 0);

/** Fictional avatar: initials on a hue. Never a photo of a real person. */
export const initials = (name) => (name || '?').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

/** Instagram handle rules (letters, numbers, periods, underscores; 1–30 chars). */
export const validHandle = (h) => /^[A-Za-z0-9._]{1,30}$/.test(h);
/** A LinkedIn public profile name (linkedin.com/in/<name>): letters, numbers and hyphens, 3–100. */
export const validLinkedIn = (h) => /^[A-Za-z0-9-]{3,100}$/.test(h);
/** What someone typed or pasted ("@name", "instagram.com/name", a full profile URL) → the bare handle. */
export const bareHandle = (raw, site) => String(raw ?? '').trim()
  .replace(new RegExp(`^(https?://)?(www\\.)?${site === 'linkedin' ? 'linkedin\\.com/in/' : 'instagram\\.com/'}`, 'i'), '')
  .replace(/^@/, '').replace(/[/?#].*$/, '');
/** The profile pages a handle opens (the person's own handles only; sample people's handles are never linked). */
export const instagramUrl = (h) => `https://www.instagram.com/${encodeURIComponent(h)}/`;
export const linkedinUrl = (h) => `https://www.linkedin.com/in/${encodeURIComponent(h)}/`;

/** Night Out Plus (SIMULATED): no billing exists in the prototype; prices show what a plan might cost. */
export const PLANS = Object.freeze([
  { id: 'monthly', label: 'Monthly', price: '$4.99 a month' },
  { id: 'annual', label: 'Yearly', price: '$39.99 a year' },
]);
export const PLUS_PERKS = Object.freeze(['Wait-drop alerts for saved bars', 'See deals 30 minutes early', '1.5× points on door check-ins']);

/** Sample cards the "Add a VIP card" demo can add (no photo is read). Fictional programs at real bars. */
export const SAMPLE_BAR_CARDS = Object.freeze([
  { venueId: 'scarlet-pub', title: 'Scarlet Pub regulars card' },
  { venueId: 'olde-queens', title: 'Olde Queens loyalty card' },
  { venueId: 'pitch-social', title: 'PITCH Social guest list card' },
]);
