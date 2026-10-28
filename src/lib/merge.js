// Crowd console merge (Ship E; team ask, 2026-10-17: "head count base on photos from ambassador, bouncer and
// customer self report"). One guest-facing queue per bar from: photo head counts by door staff (a Night Out
// ambassador, or as a demo role the bar's bouncer), guests' Scan reports, door status and pace per door, and guests'
// measured "I'm in" waits. Pure functions, unit-tested. SIMULATED: every photo, role and count is made up.
import { waitRange, validPeople, LINE_BUCKETS } from './queue.js';

const MIN = 60_000;
export const WINDOW = 20; // minutes an input stays live
export const FRESH = 10; // a staff count this new always sets the number
export const DOOR_TTL = 30; // door status and pace stay valid this long
export const PACE_WINDOW = 45; // measured waits count for pace this long after "I'm in"
export const ASSUMED_PACE = 2;
const OPEN = new Set(['moving', 'capacity']);

/** People-in-line range from a head count: 0 → 0–2; n → n…ceil(1.15n)+1 (people arrive while you count). */
export const photoRange = (heads) => (heads <= 0 ? { low: 0, high: 2 } : { low: heads, high: Math.ceil(heads * 1.15) + 1 });
export const overlaps = (a, b) => a.low <= b.high && b.low <= a.high;

/** Seeded count for the simulated photo, around a typical line for the bar (deterministic per seed). */
export function headsFor(seed, around) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  h = (h + 0x6D2B79F5) >>> 0;
  let t = Math.imul(h ^ (h >>> 15), h | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return Math.max(0, Math.min(400, Math.round(around * (0.8 + 0.4 * r))));
}

/** Door state → venue pace and status. Pace is the sum over open doors, only when every open door has one. */
export function doorPace(doors, door, now) {
  if (!door || !door.list || now - door.at > DOOR_TTL * MIN || door.at > now) return null;
  const rows = (doors?.length ? doors : [{ id: 'main', label: 'Door' }]).map((d) => ({ ...d, ...(door.list[d.id] ?? { status: 'moving', pace: null }) }));
  const open = rows.filter((d) => OPEN.has(d.status));
  const status = rows.some((d) => d.status === 'moving') ? 'moving' : rows.some((d) => d.status === 'capacity') ? 'capacity' : rows.some((d) => d.status === 'paused') ? 'paused' : 'closed';
  const complete = open.length > 0 && open.every((d) => Number.isFinite(d.pace) && d.pace > 0);
  const pace = complete ? open.reduce((a, d) => a + d.pace, 0) : null;
  // Detail never carries the unit: "Main 2 + Side 2", "3", or "No door open".
  const detail = !open.length ? 'No door open' : rows.length > 1 ? open.map((d) => `${d.label.replace(/ door$/i, '')} ${d.pace ?? '?'}`).join(' + ') : String(pace ?? '?');
  return { pace, open: open.length, total: rows.length, status, detail, by: door.by };
}

const bucketOf = (id) => LINE_BUCKETS.find((b) => b.id === id);
/** Measured door pace samples: people ahead ÷ minutes waited, from guests who tapped "I'm in" recently. */
export function waitSamples(reports, photos, now) {
  return reports
    .filter((r) => Number.isFinite(r.waitMin) && r.waitMin >= 2 && r.bucket !== 'none' && Number.isFinite(r.gotInAt) && r.gotInAt <= now && now - r.gotInAt <= PACE_WINDOW * MIN)
    .map((r) => {
      const near = photos.filter((p) => Math.abs(p.at - r.at) <= 5 * MIN).sort((a, b) => Math.abs(a.at - r.at) - Math.abs(b.at - r.at))[0];
      const b = bucketOf(r.bucket);
      const ahead = near ? near.heads : b ? (b.low + b.high) / 2 : null;
      return ahead == null ? null : { ahead, waitMin: r.waitMin, anchored: !!near, rate: ahead / r.waitMin };
    })
    .filter(Boolean);
}
/** Median of 2+ samples (or 1 anchored on a photo), clamped to 0.5–6 a minute, rounded to the nearest 0.5. */
export function paceFromSamples(samples) {
  if (!(samples.length >= 2 || samples.some((s) => s.anchored))) return null;
  const rates = samples.map((s) => s.ahead / s.waitMin).sort((a, b) => a - b);
  const mid = rates.length % 2 ? rates[(rates.length - 1) / 2] : (rates[rates.length / 2 - 1] + rates[rates.length / 2]) / 2;
  return Math.round(Math.min(6, Math.max(0.5, mid)) * 2) / 2;
}
/** Pace precedence: a complete door pace, then measured waits, then the bar's typical pace, then 2 a minute (assumed). */
export function resolvePace({ dp = null, samples = [], typical = null }) {
  if (dp && (dp.pace != null || dp.open === 0)) return { admitPerMin: dp.open ? dp.pace : null, paceSource: 'door', paceDetail: dp.detail };
  const measured = paceFromSamples(samples);
  if (measured != null) return { admitPerMin: measured, paceSource: 'measured', paceDetail: `${samples.length} guest${samples.length === 1 ? '' : 's'}` };
  if (Number.isFinite(typical) && typical > 0) return { admitPerMin: typical, paceSource: 'typical', paceDetail: `${typical} a min` };
  return { admitPerMin: ASSUMED_PACE, paceSource: 'assumed', paceDetail: `${ASSUMED_PACE} a min` };
}

/** The seeded queue as one input (a venue update, or a batch of earlier crowd reports). */
export function seedInputs(seed) {
  if (!seed || !validPeople(seed) || !Number.isFinite(seed.observedAt)) return [];
  if (seed.sourceType === 'venue') return [{ kind: 'venue', staff: true, at: seed.observedAt, low: seed.peopleLow, high: seed.peopleHigh, n: 1, seed: true }];
  return [{ kind: 'guest', at: seed.observedAt, low: seed.peopleLow, high: seed.peopleHigh, n: seed.reportCount ?? 1, seed: true }];
}

/**
 * One queue from all inputs. The newest live staff count leads while it's ≤10 min old, or later if no newer guest
 * disagrees; otherwise the newest guest report leads. Agreeing guests back it up (they never move the number); 2+
 * newer guests who disagree, or two photos by different roles that differ a lot, make it "uncertain".
 * Returns { queue, used: [{ input, outcome: 'sets'|'backs'|'against'|'older' }] }.
 */
export function mergeVenue({ seed = null, photos = [], reports = [], door = null, doors = null, now }) {
  const inputs = [
    ...seedInputs(seed),
    ...photos.map((p) => ({ kind: 'photo', staff: true, at: p.at, by: p.by, heads: p.heads, ...photoRange(p.heads), n: 1, id: p.id })),
    ...reports.map((r) => { const b = bucketOf(r.bucket); return b ? { kind: 'guest', at: r.at, low: b.low, high: b.high, n: 1, id: r.id, door: r.door } : null; }).filter(Boolean),
  ].filter((x) => x.at <= now).sort((a, b) => b.at - a.at);
  const dp = doorPace(doors, door, now);
  const pace = resolvePace({ dp, samples: waitSamples(reports, photos, now), typical: seed?.admitPerMin ?? null });
  const live = inputs.filter((x) => now - x.at <= WINDOW * MIN);
  const latestGuestDoor = reports.filter((r) => r.door && r.at <= now && now - r.at <= WINDOW * MIN).sort((a, b) => b.at - a.at)[0]?.door;
  const doorStatus = dp?.status ?? latestGuestDoor ?? seed?.doorStatus ?? 'moving';
  // doorFresh: a door status set in the last 30 min reaches guests even when no people count is live.
  const common = { ...pace, doorStatus, doorsOpen: dp?.open ?? null, doorsTotal: dp?.total ?? null, photoCount: live.filter((x) => x.kind === 'photo').length, note: dp ? undefined : seed?.note, ...(dp ? { doorFresh: true, doorAt: door.at } : {}) };
  const sourceOf = (x) => (x.kind === 'photo' ? 'photo' : x.kind === 'venue' ? 'venue' : 'crowd');
  if (!inputs.length) return { queue: dp ? { ...(seed ?? {}), ...common } : seed && reports.length ? { ...seed, ...common } : seed, used: [] };
  if (!live.length) {
    const x = inputs[0];
    return { queue: { sourceType: sourceOf(x), by: x.by, heads: x.heads, observedAt: x.at, peopleLow: x.low, peopleHigh: x.high, reportCount: x.kind === 'guest' ? x.n : 0, ...common, photoCount: x.kind === 'photo' ? 1 : 0 }, used: inputs.map((input) => ({ input, outcome: 'older' })) };
  }
  const staff = live.find((x) => x.staff);
  const guestsAfter = staff ? live.filter((x) => x.kind === 'guest' && x.at > staff.at) : [];
  const lead = staff && (now - staff.at <= FRESH * MIN || guestsAfter.every((g) => overlaps(g, staff))) ? staff : live.find((x) => x.kind === 'guest') ?? staff;
  const used = [];
  let queue;
  if (lead.staff) {
    const backs = guestsAfter.filter((g) => overlaps(g, lead));
    const against = guestsAfter.filter((g) => !overlaps(g, lead));
    const cross = lead.kind === 'photo' ? live.find((p) => p.kind === 'photo' && p.by !== lead.by && Math.abs(p.at - lead.at) <= FRESH * MIN && Math.abs(p.heads - lead.heads) > Math.max(5, 0.3 * Math.max(p.heads, lead.heads))) : null;
    const conflict = against.reduce((a, g) => a + g.n, 0) >= 2 || !!cross;
    queue = {
      sourceType: sourceOf(lead), by: lead.by, heads: lead.heads, photoFresh: now - lead.at <= FRESH * MIN, leadAt: lead.at,
      observedAt: Math.max(lead.at, ...backs.map((g) => g.at)), peopleLow: lead.low, peopleHigh: lead.high,
      reportCount: backs.reduce((a, g) => a + g.n, 0), ...common,
    };
    if (conflict) {
      const all = [lead, ...against, ...(cross ? [cross] : [])];
      const r = waitRange({ peopleLow: Math.min(...all.map((x) => x.low)), peopleHigh: Math.max(...all.map((x) => x.high)), admitPerMin: pace.admitPerMin });
      Object.assign(queue, { conflict: true, conflictWhy: cross && against.reduce((a, g) => a + g.n, 0) < 2 ? 'photos' : 'photo-guests', conflictLow: r?.low ?? null, conflictHigh: r?.high ?? null });
    }
    for (const x of inputs) used.push({ input: x, outcome: x === lead ? 'sets' : backs.includes(x) ? 'backs' : against.includes(x) || x === cross ? 'against' : 'older' });
  } else {
    const liveGuests = live.filter((x) => x.kind === 'guest');
    queue = { sourceType: 'crowd', observedAt: lead.at, peopleLow: lead.low, peopleHigh: lead.high, reportCount: liveGuests.reduce((a, g) => a + g.n, 0), ...common };
    if (lead.seed && seed?.conflict) Object.assign(queue, { conflict: true, conflictLow: seed.conflictLow, conflictHigh: seed.conflictHigh });
    for (const x of inputs) used.push({ input: x, outcome: x === lead ? 'sets' : liveGuests.includes(x) && overlaps(x, lead) ? 'backs' : liveGuests.includes(x) ? 'against' : 'older' });
  }
  return { queue, used };
}

/**
 * A venue with this device's counts, reports and door state merged in. Venues with nothing new pass through unchanged.
 * - `since` and `night` keep inputs from an earlier demo night out (reports and counts carry the night they were made).
 * - After "Clear estimate" the seeded observations are gone for good: they are re-timed on every simulated refresh, so
 *   comparing their time with clearedAt would bring them back.
 * - Seeded data is re-timed on every refresh too, so it may never look newer than this device's own counts and reports.
 * `rawQueue` keeps the queue before merging, so the console can preview a count with the same rules.
 */
export function withObservations(venue, state, now, { since = -Infinity, night = null } = {}) {
  const ov = state.overrides?.[venue.id];
  const cleared = Math.max(ov?.clearedAt ?? -Infinity, since);
  const mine = (x) => x.venueId === venue.id && x.at > cleared && (night == null || x.night === night);
  const counts = (state.counts ?? []).filter(mine);
  const reports = (state.reports ?? []).filter(mine);
  const ownFrom = Math.min(...counts.map((x) => x.at), ...reports.map((x) => x.at));
  const seeded = (at) => at > cleared && at < ownFrom;
  const obs = ov?.clearedAt != null ? null : venue.obs;
  const photos = [...(obs?.photos ?? []).filter((p) => seeded(p.at)), ...counts];
  const stateDoor = state.doors?.[venue.id];
  const door = stateDoor && stateDoor.at > cleared ? stateDoor : obs?.door && obs.door.at > cleared ? obs.door : null;
  if (!counts.length && !reports.length && !(stateDoor && stateDoor.at > cleared) && !venue.obs) return venue;
  let seed = venue.obs ? null : venue.queue;
  // A seed re-timed past this device's first input keeps its usual pace and note but drops out as a count.
  if (seed && Number.isFinite(seed.observedAt) && !(seed.observedAt < ownFrom)) seed = { ...seed, observedAt: null };
  const { queue, used } = mergeVenue({ seed, photos, reports, door, doors: venue.doors, now });
  return { ...venue, queue, inputs: used, rawQueue: venue.queue };
}

/** What a guest's report did, for the Scan done step. */
export function scanOutcome(venue, reportId) {
  const mine = venue?.inputs?.find((u) => u.input.id === reportId);
  const lead = venue?.inputs?.find((u) => u.outcome === 'sets');
  if (!mine || !lead || mine === lead) return { kind: 'lead' };
  const q = venue.queue ?? {};
  return {
    kind: mine.outcome === 'backs' ? 'backs' : 'against',
    leadNoun: lead.input.kind === 'photo' ? (globalThis.__STORE__ ? 'head count' : 'line photo') : lead.input.kind === 'venue' ? 'venue update' : 'crowd report',
    leadAt: lead.input.at, staffLead: !!lead.input.staff,
    conflict: !!q.conflict && q.conflictWhy !== 'photos', photosDisagree: q.conflictWhy === 'photos',
  };
}
