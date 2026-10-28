// Demo clock. The prototype always runs on a simulated night so hours, freshness and pass windows behave the same
// whenever it is reviewed. The night is anchored at 10:40 PM on the review date (`base`: the synthetic dataset's
// times hang off it and it never moves), and the demo starts at midnight (team ask, 2026-10-17: "it's maybe
// midnight, so everybody's already open"), i.e. START_OFFSET_MIN after the anchor. It advances in real time and can
// be fast-forwarded. Labeled "Demo time".

export const START_OFFSET_MIN = 80;
const CLOCK_VERSION = 2; // bump to give every saved demo a fresh night (v2: start at midnight)
const STALE_SESSION_MS = 4 * 60 * 60_000; // a session left for 4+ hours starts a fresh night
export const NIGHT_LENGTH_MIN = 200; // every demo bar closes by 2:00 AM (anchor 10:40 PM + 200 min on a normal night; see nightEnd)

export function defaultBase(realNow) {
  const d = new Date(realNow);
  d.setHours(22, 40, 0, 0);
  return d.getTime();
}

export function normalizeClock(clock, realNow) {
  const valid = clock?.v === CLOCK_VERSION && Number.isFinite(clock.realStart) && Number.isFinite(clock.base) && realNow - clock.realStart < STALE_SESSION_MS
    && !nightIsOver(clock, realNow);
  if (!valid) return { v: CLOCK_VERSION, realStart: realNow, base: defaultBase(realNow), offsetMin: START_OFFSET_MIN };
  return { v: CLOCK_VERSION, realStart: clock.realStart, base: clock.base, offsetMin: Number.isFinite(clock.offsetMin) ? clock.offsetMin : START_OFFSET_MIN };
}

/** 2:00 AM by the wall clock after the night's anchor. Calendar math, not a fixed number of minutes: on a night
 *  when the clocks change (Halloween night 2026: 2:00 AM EDT on Nov 1 becomes 1:00 AM EST) a fixed length would end
 *  the night an hour early or late. */
export function nightEnd(base) {
  const d = new Date(base);
  d.setDate(d.getDate() + 1);
  d.setHours(2, 0, 0, 0);
  return d.getTime();
}

/** The night is over once every demo bar has closed (2:00 AM); the next load or tick starts a fresh night. */
export function nightIsOver(clock, realNow) {
  return demoNow({ offsetMin: START_OFFSET_MIN, ...clock }, realNow) >= nightEnd(clock.base);
}

export function demoNow(clock, realNow) {
  return clock.base + clock.offsetMin * 60_000 + Math.max(0, realNow - clock.realStart);
}

export const advance = (clock, minutes) => ({ ...clock, offsetMin: clock.offsetMin + minutes });

export const formatTime = (ms) =>
  new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(ms));

/** [h, m] → '0:30' (select values) and → '12:30 AM' (labels); hours before noon are after midnight. */
export const hhmm = ([h, m]) => `${h}:${String(m).padStart(2, '0')}`;
export const timeLabel = ([h, m]) => formatTime(new Date(2000, 0, h < 12 ? 2 : 1, h, m).getTime());

export const formatDayTime = (ms) =>
  new Intl.DateTimeFormat('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
