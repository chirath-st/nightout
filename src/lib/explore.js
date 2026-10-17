// Pure search / filter / sort for the Tonight list. No DOM access, so it is unit-tested directly.
import { describeEstimate } from './queue.js';
import { distanceTo, DEMO_SPOT } from './geo.js';

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Sample hours only. Handles closing after midnight. Unknown hours → null. */
export function isOpenAt(venue, now) {
  if (venue.closedTonight) return false;
  if (!venue.hours) return null;
  const d = new Date(now);
  const mins = d.getHours() * 60 + d.getMinutes();
  const open = toMinutes(venue.hours.open);
  const close = toMinutes(venue.hours.close);
  return close > open ? mins >= open && mins < close : mins >= open || mins < close;
}

export const FILTERS = Object.freeze([
  { id: 'open', label: 'Open now' },
  { id: 'short', label: 'Under 20 min' },
  { id: 'nocover', label: 'No cover' },
  { id: 'saved', label: 'Saved' },
]);

export const SORTS = Object.freeze([
  { id: 'near', label: 'Nearest' },
  { id: 'wait', label: 'Shortest wait' },
  { id: 'name', label: 'A–Z' },
]);

const fold = (s) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

export function matchesQuery(venue, q) {
  const needle = fold(q.trim());
  if (!needle) return true;
  const hay = fold([venue.name, venue.area, ...(venue.tags ?? [])].join(' '));
  return needle.split(/\s+/).every((t) => hay.includes(t));
}

/**
 * @returns {{ results: Array<{venue, est, open}>, unknown: Array, total: number, excludedStale: number }}
 * `results` are venues with a usable estimate; `unknown` are listed separately under "Wait unknown"
 * so unknown never sorts as zero.
 */
/** Area picker ids -> the venue `area` label they match. */
export const AREAS = Object.freeze([
  { id: '', label: 'All of New Brunswick' },
  { id: 'easton', label: 'Easton Ave', match: 'Easton Ave' },
  { id: 'college', label: 'College Ave', match: 'College Ave' },
  { id: 'downtown', label: 'Downtown', match: 'Downtown' },
]);
export const areaLabel = (id) => AREAS.find((a) => a.id === (id || ''))?.label ?? AREAS[0].label;

export function exploreList(venues, { q = '', filters = [], sort = 'wait', area = '' } = {}, now, savedIds = new Set(), { from = DEMO_SPOT } = {}) {
  const areaMatch = AREAS.find((a) => a.id === area)?.match;
  const active = new Set(filters);
  let excludedStale = 0;
  const rows = [];
  for (const venue of venues) {
    if (!matchesQuery(venue, q)) continue;
    if (areaMatch && venue.area !== areaMatch) continue;
    const open = isOpenAt(venue, now);
    const est = describeEstimate(venue, now, { isOpen: open !== false });
    if (active.has('open') && open !== true) continue;
    if (active.has('nocover') && venue.cover !== 0) continue;
    if (active.has('saved') && !savedIds.has(venue.id)) continue;
    if (active.has('short') && !est.qualifiesShortWait) {
      if (est.tone === 'stale') excludedStale += 1;
      continue;
    }
    rows.push({ venue, est, open, miles: distanceTo(venue, from) });
  }
  const byName = (a, b) => a.venue.name.localeCompare(b.venue.name);
  if (sort === 'near' || sort === 'name') {
    // One list (the mockup's grid): nearest first, or A–Z. Unknown waits stay in place with their own label.
    const byNear = (a, b) => (a.miles ?? Infinity) - (b.miles ?? Infinity) || byName(a, b);
    rows.sort(sort === 'near' ? byNear : byName);
    return { results: rows, unknown: [], total: rows.length, excludedStale };
  }
  const known = rows.filter((r) => r.est.sortRank <= 3);
  const unknown = rows.filter((r) => r.est.sortRank > 3);
  known.sort((a, b) => a.est.sortRank - b.est.sortRank || (a.est.waitLow ?? 999) - (b.est.waitLow ?? 999) || byName(a, b));
  unknown.sort((a, b) => a.est.sortRank - b.est.sortRank || byName(a, b));
  return { results: known, unknown, total: known.length + unknown.length, excludedStale };
}
