// Community theme-night ideas (team ask, 2026-10-17): people propose a theme night at a bar, others say
// "I'm in" and hype it, and the bar approves or passes in the venue console. Pure helpers, unit-tested.
// SIMULATED: seeds are fictional, nothing leaves this device, and no bar is ever contacted.
import { BANNED, ALCOHOL } from './deals.js';
import { THEMES, GENRES } from '../data/events.js';
import { eventWindow, PRICE_BANDS } from './events.js';
import { atNightOn } from '../data/venues.js';
import { timeLabel } from './clock.js';
import { relativeAge } from './queue.js';

export const TITLE_MAX = 36;
export const PITCH_MAX = 140;
export const START_TIMES = Object.freeze([[20, 0], [21, 0], [22, 0]]);
export const END_TIMES = Object.freeze([[23, 0], [0, 0], [1, 0], [2, 0]]);
const HOUR = 60 * 60_000;

const RULES = [
  [/https?:|www\.|\b[\w.-]+\.(com|net|org|io|co|me)\b|@\w|\b\d{3}[\s.-]?\d{3}[\s.-]?\d{4}\b/i, 'Leave out links, @handles, emails and phone numbers.'],
  [BANNED, 'New Jersey doesn’t allow free-drink, 2-for-1, unlimited-drink or gender-based nights.'],
  [/\b(beer\s*pong|flip\s*cup|chug\w*|keg\s*stands?|shotgun\w*|drinking\s+games?|power\s*hour|raffles?|bingo|50\s*\/\s*50|lotter(y|ies)|poker|casino|bet(s|ting)?|gambl\w*|wagers?)\b/i, 'Night Out doesn’t post ideas about drinking games, raffles, bingo or betting.'],
  [/(?<!\d)(1[6-9]|20)\s*\+|\b((18|19|20)\s*(and|&)\s*(up|over)|under\s*21|all\s*ages|underage|teens?|kids?)\b/i, 'Every night here is 21+. Leave out under-21 or all-ages wording.'],
  [ALCOHOL, 'Theme nights can’t be about drinks. Make it about the music, the theme or the game; the bar sets any specials.'],
  [/\b(official(ly)?|sponsor\w*|partner(ed|ship)|hosted\s+by|presented\s+by)\b/i, 'Ideas can’t say a bar is hosting or sponsoring them. Only the bar can.'],
];
/** First rule an idea's text breaks, as a message; null when it's fine. */
export function textProblem(s) {
  const text = String(s ?? '');
  for (const [re, msg] of RULES) if (re.test(text)) return msg;
  return null;
}

const nightMin = ([h, m]) => (h < 12 ? h + 24 : h) * 60 + m;
const parseHHMM = (s) => String(s).split(':').map(Number);
const sameTime = (a, b) => a?.[0] === b[0] && a?.[1] === b[1];

/** Validate a proposal. `existing` = ideas and bar events already on the calendar. */
export function checkIdea(draft, venue, existing = []) {
  if (!venue) return { errors: { venue: 'Pick a bar.' }, clean: null };
  const d = draft;
  const errors = {};
  if (!Number.isInteger(d.day) || d.day < 1 || d.day > 6) errors.day = 'Pick a night in the next week.';
  if (!THEMES.includes(d.theme)) errors.theme = 'Pick what kind of night it is.';
  const genre = GENRES.includes(d.genre) ? d.genre : '';
  const title = String(d.title ?? '').trim();
  const pitch = String(d.pitch ?? '').trim();
  if (!title) errors.title = 'Give it a short name, like “Y2K Night”.';
  else if (title.length > TITLE_MAX) errors.title = `Keep the name to ${TITLE_MAX} characters.`;
  else if (textProblem(title)) errors.title = textProblem(title);
  if (!pitch) errors.pitch = 'Add a line about what people should expect.';
  else if (pitch.length > PITCH_MAX) errors.pitch = `Keep it to ${PITCH_MAX} characters.`;
  else if (textProblem(pitch)) errors.pitch = textProblem(pitch);
  if (!START_TIMES.some((t) => sameTime(d.start, t)) || !END_TIMES.some((t) => sameTime(d.end, t))) errors.time = 'Pick a start and end time.';
  else if (venue.hours?.close) {
    const close = parseHHMM(venue.hours.close);
    if (nightMin(d.end) > nightMin(close)) errors.time = `${venue.name} usually closes at ${timeLabel(close)} (simulated hours). Pick an earlier end.`;
  }
  if (!errors.day) {
    const clash = existing.find((x) => x.venueId === venue.id && x.day === d.day && x.status !== 'declined');
    if (clash) errors.day = `${venue.name} already has “${clash.title}” that night. Hype it instead, or pick another night.`;
  }
  if (d.ack !== true) errors.ack = 'Confirm it’s a 21+ night that isn’t about drinks, drinking games or betting.';
  return { errors, clean: { title, pitch, genre } };
}

const n = (x) => (Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
/** Expected turnout shown to the bar: 70% of "I'm in" up to everyone in plus a quarter of the hype (demo assumption). */
export function expectedTurnout(joins, hype) {
  return { low: Math.round(0.7 * n(joins)), high: n(joins) + Math.round(0.25 * n(hype)) };
}
export const turnoutLevel = (high) => (high < 20 ? 'quiet' : high < 50 ? 'lively' : 'packed');
export const staffingHint = (level) => ({
  quiet: 'Regular staffing should cover it.',
  lively: 'Plan one extra bartender, and a second ID check at the door from the start time.',
  packed: 'Plan extra bar and door staff, and decide a capacity limit before doors open.',
}[level]);

const dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
/** Mon–Wed: the slow nights bars most want to fill. */
export const isSlowNight = (ms) => [1, 2, 3].includes(new Date(ms).getDay());
export const nightLabel = (ms) => dayFmt.format(ms);
export function nightOptions(base) {
  return [1, 2, 3, 4, 5, 6].map((day) => {
    const ms = atNightOn(base, day, 21, 0);
    return { day, label: nightLabel(ms), slow: isSlowNight(ms) };
  });
}
export const takenDays = (existing, venueId) => new Set(existing.filter((x) => x.venueId === venueId && x.status !== 'declined').map((x) => x.day));
export function defaultNight(base, venueId, existing) {
  const taken = takenDays(existing, venueId);
  const opts = nightOptions(base);
  return (opts.find((o) => o.slow && !taken.has(o.day)) ?? opts.find((o) => !taken.has(o.day)) ?? { day: 1 }).day;
}
export const coverLabel = (c) => (c == null ? 'Bar decides' : c === 0 ? 'Free entry' : `$${c} cover`);
export const defaultCover = (v) => ([0, 5, 10].includes(v?.cover) ? v.cover : 0);
export function agoLabel(at, now) {
  const age = now - at;
  if (age < HOUR) return relativeAge(at, now);
  if (age < 24 * HOUR) return `${Math.floor(age / HOUR)} hr ago`;
  const days = Math.floor(age / (24 * HOUR));
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Seeds + your ideas, with the console's decisions applied. Drops anything that breaks the text rules or has no bar. */
export function resolveIdeas(seeds, created = [], decisions = {}, venueIds = null) {
  const mine = created.filter((c) => !textProblem(c.title) && !textProblem(c.pitch) && THEMES.includes(c.theme));
  return [...mine, ...seeds]
    .filter((x) => !venueIds || venueIds.has(x.venueId))
    .map((x) => {
      const dec = decisions[x.id];
      return { ...x, status: dec?.status ?? 'pending', cover: dec?.status === 'approved' ? dec.cover ?? 0 : null, decidedAt: dec?.at ?? null };
    });
}
/** Counts with the viewer's own "I'm in" and hype added. */
export function ideaCounts(idea, st) {
  return { joins: n(idea.joins) + (st.ideas.joined.includes(idea.id) ? 1 : 0), hype: n(idea.hype) + (st.ideas.hyped.includes(idea.id) ? 1 : 0) };
}
const RANK = { pending: 0, approved: 1, declined: 2 };
/** Ideas view: upcoming ideas, filtered like events; pending first, then yours, then the biggest expected turnout. */
export function ideaList(ideas, { genre = '', theme = '', price = '' } = {}, now, nightStart, st) {
  const band = PRICE_BANDS.find((b) => b.id === price);
  return ideas
    .filter((x) => eventWindow(x, now, nightStart) !== 'past')
    .filter((x) => (!genre || x.genres.includes(genre)) && (!theme || x.theme === theme) && (!band || band.test(x.cover)))
    .map((x) => ({ x, high: expectedTurnout(...Object.values(ideaCounts(x, st))).high }))
    .sort((a, b) => RANK[a.x.status] - RANK[b.x.status] || (b.x.mine ? 1 : 0) - (a.x.mine ? 1 : 0) || b.high - a.high || a.x.startsAt - b.x.startsAt)
    .map((r) => r.x);
}
