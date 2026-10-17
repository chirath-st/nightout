// SIMULATED social and rewards data for the demo. Every person, group, handle, point and reward here
// is invented. Hosts are fictional (first name + initial); Instagram handles end in ".demo" and links
// to Instagram are switched off in the prototype so they can never open a real stranger's profile.
import { atNight } from './venues.js';

export const POINTS = Object.freeze({
  REPORT: 50, // a line report (photo + size)
  GOT_IN: 25, // telling us when you got in, which gives a measured wait
  START: 300, // demo starting balance so the rewards can be tried
});

/** Report sizes a guest can pick. Ranges become the crowd estimate for that bar. */
export const LINE_BUCKETS = Object.freeze([
  { id: 'none', label: 'No line', low: 0, high: 2 },
  { id: 'short', label: '1–10', low: 1, high: 10 },
  { id: 'medium', label: '10–25', low: 10, high: 25 },
  { id: 'long', label: '25–50', low: 25, high: 50 },
  { id: 'huge', label: '50+', low: 50, high: 80 },
]);

const GROUPS = [
  { id: 'g1', title: 'Pregame then Olde Queens', venueId: 'olde-queens', at: [22, 30], spots: 6, going: 3, host: { name: 'Maya R.', handle: 'maya.r.demo', hue: 18 }, note: 'Chill group, mostly seniors. Meeting outside at 10:25.', tags: ['Chill', 'Seniors'] },
  { id: 'g2', title: 'Trivia crew needs two more', venueId: 'ale-n-wich', at: [21, 0], spots: 5, going: 3, host: { name: 'Dev P.', handle: 'dev.trivia.demo', hue: 205 }, note: 'We lose every week. Come lose with us.', tags: ['Trivia'] },
  { id: 'g3', title: 'Birthday at Scarlet Pub', venueId: 'scarlet-pub', at: [23, 0], spots: 10, going: 7, host: { name: 'Sam K.', handle: 'samk.demo', hue: 340 }, note: 'Turning 22. Everyone welcome, bring good energy.', tags: ['Birthday'] },
  { id: 'g4', title: 'Late night at PITCH', venueId: 'pitch-social', at: [23, 30], spots: 4, going: 1, host: { name: 'Jordan L.', handle: '', hue: 140 }, note: 'Going for the DJ. Solo right now.', tags: ['DJ'] },
  { id: 'g5', title: 'Downtown bar walk', venueId: 'old-man-raffertys', at: [22, 0], spots: 8, going: 4, host: { name: 'Priya S.', handle: 'priya.walks.demo', hue: 270 }, note: 'Starting at Rafferty’s, then wherever the line is shortest.', tags: ['Bar walk'] },
];

export function buildGroups(demoStart) {
  return GROUPS.map((g) => ({ ...g, startsAt: atNight(demoStart, g.at[0], g.at[1]), synthetic: true }));
}

/** Rewards catalog. Simulated: no bar honors these. Nothing here is alcohol (see DRINKS_LOCK). */
export const REWARDS = Object.freeze([
  { id: 'cover', title: 'Cover on us', detail: 'One cover charge at a participating bar', cost: 300, icon: 'ticket' },
  { id: 'na-drink', title: 'Non-alcoholic drink', detail: 'Soda, mocktail or water', cost: 150, icon: 'sparkle' },
  { id: 'line-cut', title: 'Line cut', detail: 'Priority entry during a set window', cost: 500, icon: 'arrowRight' },
  { id: 'vip', title: 'VIP entry', detail: 'Skip the line for you and one friend', cost: 1200, icon: 'star' },
  { id: 'merch', title: 'Night Out hat', detail: 'Pick up at a pop-up', cost: 800, icon: 'shield' },
]);

export const DRINKS_LOCK = 'New Jersey doesn’t allow prizes or rewards that consist of alcohol or can be redeemed for it (N.J.A.C. 13:2-23.16), so points can’t be used for drinks.';

export const balanceOf = (ledger) => ledger.reduce((sum, e) => sum + e.delta, 0);

/** Fictional avatar: initials on a hue. Never a photo of a real person. */
export const initials = (name) => (name || '?').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

/** Instagram handle rules (letters, numbers, periods, underscores; 1–30 chars). */
export const validHandle = (h) => /^[A-Za-z0-9._]{1,30}$/.test(h);
