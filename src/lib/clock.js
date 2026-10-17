// Demo clock. The prototype always runs on a simulated night (starting 10:40 PM on the review
// date) so hours, freshness and pass windows behave the same whenever it is reviewed. It
// advances in real time and can be fast-forwarded to show estimates aging. Labeled "Demo time".
//
// `base` anchors the synthetic dataset and never moves; fast-forward only grows `offsetMin`.

export function defaultBase(realNow) {
  const d = new Date(realNow);
  d.setHours(22, 40, 0, 0);
  return d.getTime();
}

export function normalizeClock(clock, realNow) {
  const realStart = Number.isFinite(clock?.realStart) ? clock.realStart : realNow;
  return {
    realStart,
    base: Number.isFinite(clock?.base) ? clock.base : defaultBase(realStart),
    offsetMin: Number.isFinite(clock?.offsetMin) ? clock.offsetMin : 0,
  };
}

export function demoNow(clock, realNow) {
  return clock.base + clock.offsetMin * 60_000 + Math.max(0, realNow - clock.realStart);
}

export const advance = (clock, minutes) => ({ ...clock, offsetMin: clock.offsetMin + minutes });

export const formatTime = (ms) =>
  new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(ms));

export const formatDayTime = (ms) =>
  new Intl.DateTimeFormat('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
