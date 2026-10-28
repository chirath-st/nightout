// Shared queue-estimate contract. Every screen formats estimates through this module so a
// venue's wait means the same thing on cards, detail, Saved and the operator preview.
// Thresholds are design hypotheses (see research/comparison.md D1), not industry standards.
import { LIVE } from './backend.js';

export const FRESHNESS_MINUTES = Object.freeze({
  venue: { fresh: 10, stale: 20 },
  crowd: { fresh: 10, stale: 20 },
  photo: { fresh: 10, stale: 20 },
});

/** Line-size buckets guests pick in Scan (people in line). */
export const LINE_BUCKETS = Object.freeze([
  { id: 'none', label: 'No line', low: 0, high: 2 },
  { id: 'short', label: '1–10', low: 1, high: 10 },
  { id: 'medium', label: '10–25', low: 10, high: 25 },
  { id: 'long', label: '25–50', low: 25, high: 50 },
  { id: 'huge', label: '50+', low: 50, high: 80 },
]);

const MIN = 60_000;
/** How long a door status (closed, paused, at capacity) stays valid on its own (same as the server's rule). */
export const DOOR_FRESH_MINUTES = 30;
/** Clock skew tolerated between the server and this device (a phone running a little fast or slow). An update stamped
 *  further in the future than this can't be dated, so it is never called fresh, aged or given a confidence. */
export const FUTURE_SKEW_MINUTES = 2;
export const isFromFuture = (t, now) => t != null && t - now > FUTURE_SKEW_MINUTES * MIN;

export function ageMinutes(observedAt, now) {
  if (observedAt == null) return null;
  return Math.max(0, (now - observedAt) / MIN);
}

/** 'fresh' | 'aging' | 'stale' | 'unknown' */
export function freshnessOf(q, now) {
  if (!q || q.observedAt == null || !q.sourceType) return 'unknown';
  if (isFromFuture(q.observedAt, now)) return 'unknown';
  if (q.sourceType === 'crowd' && !((q.reportCount ?? 0) >= 1)) return 'unknown';
  if (q.sourceType === 'photo' && !((q.photoCount ?? 0) >= 1)) return 'unknown';
  const t = FRESHNESS_MINUTES[q.sourceType];
  if (!t) return 'unknown';
  const age = ageMinutes(q.observedAt, now);
  if (age <= t.fresh) return 'fresh';
  if (age <= t.stale) return 'aging';
  return 'stale';
}

const round5 = (n) => Math.max(0, Math.round(n / 5) * 5);
const usableRate = (r) => Number.isFinite(r) && r > 0;
/** People counts are usable only as finite, non-negative, ordered numbers. */
export const validPeople = (q) => !!q && Number.isFinite(q.peopleLow) && Number.isFinite(q.peopleHigh) && q.peopleLow >= 0 && q.peopleHigh >= q.peopleLow;

/**
 * Wait range from a people range and an admission rate (Little's law framing:
 * wait ≈ people ahead ÷ admissions per minute). Returns null if no positive rate is known:
 * even a short line can't be called "0–5 min" when the door isn't admitting anyone.
 */
export function waitRange(q) {
  if (!q) return null;
  // A pace that is given but unusable (0, negative, not a number) means the door isn't admitting
  // at a known rate: no wait can be claimed, not even an explicitly reported one.
  if (q.admitPerMin != null && !usableRate(q.admitPerMin)) return null;
  if (Number.isFinite(q.waitLow) && Number.isFinite(q.waitHigh) && q.waitLow >= 0 && q.waitHigh >= q.waitLow) {
    return { low: q.waitLow, high: q.waitHigh };
  }
  if (!validPeople(q) || !usableRate(q.admitPerMin)) return null;
  const rate = q.admitPerMin;
  const low = round5(q.peopleLow / rate);
  const high = Math.max(low + 5, round5((q.peopleHigh / rate) * 1.2));
  return { low, high };
}

export function confidenceOf(q, freshness) {
  if (!q || freshness === 'unknown' || freshness === 'stale') return null;
  if (q.conflict) return 'Low';
  if (q.sourceType === 'photo') {
    const knownPace = q.paceSource === 'door' || q.paceSource === 'measured';
    const recent = freshness === 'fresh' && q.photoFresh !== false;
    return recent ? (knownPace ? 'High' : 'Medium') : knownPace ? 'Medium' : 'Low';
  }
  // A venue number only backed up by newer guests is no longer recent itself (mirrors photoFresh above).
  if (q.sourceType === 'venue') return freshness === 'fresh' && q.photoFresh !== false ? 'High' : 'Medium';
  if (q.sourceType === 'crowd') {
    if (freshness === 'aging') return 'Low';
    return (q.reportCount ?? 0) >= 3 ? 'Medium' : 'Low';
  }
  return null;
}

const plus = (n) => (n ? ` +${n}` : '');
const guests = (n) => (n ? ` + ${n} guest report${n === 1 ? '' : 's'}` : '');
// Store build: the server's head counts come from our counters (by: 'staff') or a bar's door staff (by: 'door'); no photo is
// ever taken or kept, so the words say "head count". The team build keeps its photo-console wording.
export const ROLE_WORD = (globalThis.__STORE__ || LIVE) ? { staff: 'our counter', door: 'door staff' } : { ambassador: 'an ambassador', bouncer: 'a bouncer' };

export function shortSourceLabel(q) {
  if (!q || !q.sourceType) return null;
  if (q.sourceType === 'photo') return `${(globalThis.__STORE__ || LIVE) ? 'Count' : 'Photo'}${plus(q.reportCount ?? 0)}`;
  if (q.sourceType === 'venue') return `Venue${plus(q.reportCount ?? 0)}`;
  const n = q.reportCount ?? 0;
  return `${n} report${n === 1 ? '' : 's'}`;
}

export function sourceLabel(q) {
  if (!q || !q.sourceType) return 'No source';
  if (q.sourceType === 'photo') return (globalThis.__STORE__ || LIVE) ? `Head count by ${ROLE_WORD[q.by] ?? 'our staff'}${guests(q.reportCount ?? 0)}` : `Line photo by ${ROLE_WORD[q.by] ?? 'door staff'}${guests(q.reportCount ?? 0)}`;
  if (q.sourceType === 'venue') return `Venue update${guests(q.reportCount ?? 0)}`;
  if (q.sourceType === 'crowd') {
    const n = q.reportCount ?? 0;
    return `${n} crowd report${n === 1 ? '' : 's'}`;
  }
  return 'Unknown source';
}

export function relativeAge(observedAt, now) {
  const age = ageMinutes(observedAt, now);
  if (age == null) return null;
  if (age < 1) return 'just now';
  if (age < 60) return `${Math.floor(age)} min ago`;
  const h = Math.floor(age / 60);
  const m = Math.floor(age % 60);
  return m ? `${h} hr ${m} min ago` : `${h} hr ago`;
}

const fmtRange = (r) => `${r.low}–${r.high} min`;
export const CONFLICT_COPY = (globalThis.__STORE__ || LIVE)
  ? { 'photo-guests': 'Head count and guest reports disagree', photos: 'Two head counts disagree' }
  : { 'photo-guests': 'Line photo and guest reports disagree', photos: 'Two line photos disagree' };
/** Where the door pace came from, in words (shown after the pace). */
export const PACE_COPY = { door: 'set at the door', measured: 'measured from guests’ waits', typical: 'typical here', assumed: 'assumed' };

/**
 * One description for every surface.
 * tone: fresh | aging | stale | unknown | uncertain | capacity | paused | closed
 */
export function describeEstimate(venue, now, { isOpen = true } = {}) {
  const q = venue?.queue ?? null;
  const freshness = freshnessOf(q, now);
  const age = q?.observedAt != null ? relativeAge(q.observedAt, now) : null;
  const base = {
    freshness,
    ageLabel: age,
    observedAt: q?.observedAt ?? null,
    sourceLabel: sourceLabel(q),
    shortSource: shortSourceLabel(q),
    confidence: confidenceOf(q, freshness),
    qualifiesShortWait: false,
    waitLow: null,
    waitHigh: null,
    peopleLabel: null,
  };

  if (!isOpen) {
    return { ...base, tone: 'closed', headline: 'Closed now', detail: 'Outside opening hours', confidence: null, ageLabel: null, observedAt: null, sortRank: 5 };
  }
  // A door status past its 30 minutes (or stamped in the future) no longer speaks for the door, whatever the age of the
  // count it travels with: read it as moving.
  const doorExpired = q?.doorAt != null && (isFromFuture(q.doorAt, now) || ageMinutes(q.doorAt, now) > DOOR_FRESH_MINUTES);
  const doorStatus = doorExpired ? 'moving' : q?.doorStatus;
  if (doorStatus === 'closed' && freshness !== 'stale' && freshness !== 'unknown') {
    return { ...base, tone: 'closed', headline: 'Closed now', detail: 'Entry closed at the door', confidence: null, sortRank: 5 };
  }
  // A door status set in the last 30 minutes still reaches guests when no people count is live. The 30 minutes are
  // checked here against its own time: a saved copy (offline, next launch) still says doorFresh after it has expired.
  const doorFresh = Boolean(q?.doorFresh) && !isFromFuture(q.doorAt, now) && (q.doorAt == null || ageMinutes(q.doorAt, now) <= DOOR_FRESH_MINUTES);
  if (doorFresh && (freshness === 'stale' || freshness === 'unknown') && ['closed', 'paused', 'capacity'].includes(q.doorStatus)) {
    const door = { ...base, observedAt: q.doorAt ?? null, ageLabel: q.doorAt != null ? relativeAge(q.doorAt, now) : null, sourceLabel: 'Door status', shortSource: 'Door', confidence: null };
    if (q.doorStatus === 'closed') return { ...door, tone: 'closed', headline: 'Closed now', detail: 'Entry closed at the door', sortRank: 5 };
    if (q.doorStatus === 'paused') return { ...door, tone: 'paused', headline: 'Entry paused', detail: q.note || 'Entry paused at the door', sortRank: 3 };
    return { ...door, tone: 'capacity', headline: 'At capacity', detail: 'Entry only as people leave. The wait can grow quickly.', sortRank: 3 };
  }
  if (freshness === 'unknown') {
    // A time ahead of this device's clock: no age ("just now") and no source time, since neither can be trusted.
    if (isFromFuture(q?.observedAt, now)) return { ...base, observedAt: null, ageLabel: null, tone: 'unknown', hasReport: true, headline: 'Wait unknown', detail: 'Can’t tell how old the last update is. Check this device’s date and time.', sortRank: 4 };
    return { ...base, tone: 'unknown', headline: 'Wait unknown', detail: 'No current estimate for this venue', sortRank: 4 };
  }
  if (freshness === 'stale') {
    return { ...base, tone: 'stale', headline: 'Current wait unavailable', detail: `Last update ${age}`, sortRank: 4 };
  }

  const people = validPeople(q)
    ? (q.peopleLow === q.peopleHigh ? `~${q.peopleLow} in line` : `~${q.peopleLow}–${q.peopleHigh} in line`)
    : null;
  const range = waitRange(q);
  const withRange = {
    ...base,
    peopleLabel: people,
    peopleLow: validPeople(q) ? q.peopleLow : null,
    peopleHigh: validPeople(q) ? q.peopleHigh : null,
    waitLow: range?.low ?? null,
    waitHigh: range?.high ?? null,
  };

  if (doorStatus === 'paused') {
    return { ...withRange, tone: 'paused', headline: 'Entry paused', detail: q.note || 'Entry paused at the door', sortRank: 3 };
  }
  if (doorStatus === 'capacity') {
    return { ...withRange, tone: 'capacity', headline: 'At capacity', detail: 'Entry only as people leave. The wait can grow quickly.', sortRank: 3 };
  }
  if (q.conflict) {
    const reported = Number.isFinite(q.conflictLow) && Number.isFinite(q.conflictHigh) && q.conflictLow >= 0 && q.conflictHigh >= q.conflictLow;
    const lo = reported ? q.conflictLow : range?.low;
    const hi = reported ? q.conflictHigh : range?.high;
    if (lo == null || hi == null) {
      return { ...withRange, tone: 'uncertain', headline: 'Wait uncertain', detail: CONFLICT_COPY[q.conflictWhy] ?? 'Recent reports disagree', waitLow: null, waitHigh: null, sortRank: 4 };
    }
    return { ...withRange, tone: 'uncertain', headline: `${lo}–${hi} min`, detail: CONFLICT_COPY[q.conflictWhy] ?? 'Recent reports disagree', waitLow: lo, waitHigh: hi, sortRank: 2 };
  }
  if (!range) {
    // No usable admission rate (missing or zero): the wait stays unknown and never counts as short.
    const detail = people ? `${people.replace('~', 'About ')} reported, but no door pace to estimate a wait` : 'Report has no line size';
    return { ...base, tone: 'unknown', hasReport: Boolean(people), headline: 'Wait unknown', detail, confidence: null, sortRank: 4 };
  }
  return {
    ...withRange,
    tone: freshness,
    headline: fmtRange(range),
    detail: freshness === 'aging' ? 'May have changed since this update' : null,
    qualifiesShortWait: range.high <= 20,
    sortRank: freshness === 'fresh' ? 0 : 1,
  };
}

/** Typical pattern is a model of past nights — never presented as "now". */
export const TYPICAL_LABELS = ['Quiet', 'Light', 'Steady', 'Busy', 'Very busy'];
