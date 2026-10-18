// Demo clock. The prototype always runs on a simulated night so hours, freshness and pass windows behave the same
// whenever it is reviewed. The night is anchored at 10:40 PM on the review date (`base`: the synthetic dataset's
// times hang off it and it never moves), and the demo starts at midnight (team ask, 2026-10-17: "it's maybe
// midnight, so everybody's already open"), i.e. START_OFFSET_MIN after the anchor. It advances in real time and can
// be fast-forwarded. Labeled "Demo time".

export const START_OFFSET_MIN = 80;
const CLOCK_VERSION = 2; // bump to give every saved demo a fresh night (v2: start at midnight)
const STALE_SESSION_MS = 4 * 60 * 60_000; // a session left for 4+ hours starts a fresh night

export function defaultBase(realNow) {
  const d = new Date(realNow);
  d.setHours(22, 40, 0, 0);
  return d.getTime();
}

export function normalizeClock(clock, realNow) {
  const valid = clock?.v === CLOCK_VERSION && Number.isFinite(clock.realStart) && Number.isFinite(clock.base) && realNow - clock.realStart < STALE_SESSION_MS;
  if (!valid) return { v: CLOCK_VERSION, realStart: realNow, base: defaultBase(realNow), offsetMin: START_OFFSET_MIN };
  return { v: CLOCK_VERSION, realStart: clock.realStart, base: clock.base, offsetMin: Number.isFinite(clock.offsetMin) ? clock.offsetMin : START_OFFSET_MIN };
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
