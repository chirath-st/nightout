// Events and the "Who's going?" poll: pure helpers (no DOM), unit-tested.

const DAY = 24 * 60 * 60_000;

/** Tonight = starts before the demo night's 6 AM and hasn't ended; This week = the next 7 nights. */
export function eventWindow(ev, now, nightStart) {
  const ended = (ev.endsAt ?? ev.startsAt + 5 * 60 * 60_000) <= now;
  if (ended) return 'past';
  const nightEnd = nightStart + 0.5 * DAY; // demo night runs from its evening to the next morning
  return ev.startsAt < nightEnd ? 'tonight' : ev.startsAt < nightStart + 7 * DAY ? 'week' : 'later';
}

/** Live: started and not over. */
export const isLive = (ev, now) => ev.startsAt <= now && (ev.endsAt == null || now < ev.endsAt);

export const PRICE_BANDS = Object.freeze([
  { id: 'free', label: 'Free entry', test: (c) => c === 0 },
  { id: 'under10', label: 'Under $10', test: (c) => c > 0 && c < 10 },
  { id: 'ten', label: '$10 and up', test: (c) => c >= 10 },
]);

/**
 * Events list for the Events tab. view: 'tonight' | 'week' | 'saved'; filters: { genre, theme, price }.
 * Sorted by start time; past events are dropped (except in Saved, where they show as ended).
 */
export function eventList(events, { view = 'tonight', genre = '', theme = '', price = '' } = {}, now, nightStart, savedIds = new Set()) {
  const band = PRICE_BANDS.find((b) => b.id === price);
  return events
    .filter((e) => {
      const w = eventWindow(e, now, nightStart);
      if (view === 'saved') { if (!savedIds.has(e.id)) return false; } else if (w !== view) return false;
      if (genre && !e.genres.includes(genre)) return false;
      if (theme && e.theme !== theme) return false;
      if (band && !band.test(e.cover)) return false;
      return true;
    })
    .sort((a, b) => a.startsAt - b.startsAt);
}

/** Poll percentages with the viewer's vote added. Rounds so the three always sum to 100. */
export function pollResult([going, maybe, no], vote) {
  const counts = { going: going + (vote === 'going' ? 1 : 0), maybe: maybe + (vote === 'maybe' ? 1 : 0), no: no + (vote === 'no' ? 1 : 0) };
  const total = counts.going + counts.maybe + counts.no;
  if (!total) return { counts, total, pct: { going: 0, maybe: 0, no: 0 } };
  const raw = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, (v / total) * 100]));
  const pct = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Math.floor(v)]));
  let left = 100 - Object.values(pct).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(raw).sort((a, b) => (raw[b] % 1) - (raw[a] % 1))) { if (left <= 0) break; pct[k] += 1; left -= 1; }
  return { counts, total, pct };
}
