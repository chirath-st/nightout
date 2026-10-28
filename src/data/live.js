// App Store build: turns the server's rows into the venue, deal and event objects every screen already draws.
// Only real inputs: the bundled directory (public facts) overlaid with the server's bar rows (confirmed hours, listing
// status), each bar's current estimate from bar_status (our staff head counts, door staff, corroborated guest reports),
// and deals and events a bar approved. Nothing is invented: a bar with no recent input simply has no estimate.
import { DIRECTORY } from './directory.js';

const ms = (iso) => (iso == null ? null : typeof iso === 'number' ? iso : Date.parse(iso));
const num = (n) => (Number.isFinite(Number(n)) && n !== null && n !== '' ? Number(n) : null);

/** bar_status row → the queue object queue.js understands (null when there is nothing recent). The server already sends
 *  `queue` in that shape (epoch-ms times); the flat fields are the fallback. */
export function queueFromStatus(st) {
  if (!st) return null;
  if (st.queue && typeof st.queue === 'object') return Number.isFinite(st.queue.observedAt) ? { ...st.queue, live: true } : null;
  const observedAt = ms(st.observed_at);
  const low = num(st.people_low), high = num(st.people_high);
  if (observedAt == null || low == null || high == null || high < low) return null;
  const source = st.source === 'crowd' ? 'crowd' : st.source === 'door' ? 'venue' : 'photo';
  const q = { sourceType: source, observedAt, peopleLow: low, peopleHigh: high, doorStatus: st.door ?? 'moving', live: true };
  const pace = num(st.admit_per_min);
  if (pace != null) q.admitPerMin = pace;
  if (source === 'crowd') q.reportCount = num(st.report_count) ?? 1;
  if (source === 'photo') { q.photoCount = 1; q.paceSource = pace != null ? 'measured' : undefined; }
  if (st.note) q.note = String(st.note).slice(0, 120);
  return q;
}

export function dealFromRow(d) {
  const price = num(d.price_cents);
  return {
    id: String(d.id), venueId: d.bar_id, kind: d.kind ?? 'entry', title: d.title, short: d.short ?? d.title,
    // Every priced deal carries "Price set by X. Valid only at X." (NJ ABC 13:2-24.10(a)8).
    terms: [d.terms, d.price_note].filter(Boolean).join(' '),
    startsAt: ms(d.starts_at), endsAt: ms(d.ends_at), price: price != null ? price / 100 : null, item: d.drink_item ?? null,
    adults: d.adults_only !== false, approved: true,
  };
}

export function eventFromRow(e) {
  const cover = num(e.cover_cents);
  return {
    id: String(e.id), venueId: e.bar_id, kind: 'bar', title: e.title, theme: e.theme ?? '', genres: Array.isArray(e.genres) ? e.genres : [],
    music: e.details ?? e.music ?? '', host: e.host ?? null, cover: cover != null ? cover / 100 : null, going: null,
    startsAt: ms(e.starts_at), endsAt: ms(e.ends_at), adults: true, note: e.approved_note ?? null,
  };
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
/** Tonight's hours from a per-weekday map ({ thu: { open, close } }); a night belongs to the day it starts (before 6 AM = yesterday). */
export function hoursTonight(hours, now = Date.now()) {
  if (!hours || typeof hours !== 'object') return null;
  if (hours.open && hours.close) return { open: hours.open, close: hours.close };
  const d = new Date(now);
  if (d.getHours() < 6) d.setDate(d.getDate() - 1);
  const h = hours[DAYS[d.getDay()]];
  return h?.open && h?.close ? { open: h.open, close: h.close } : null;
}

/** "Last Friday · busiest around 11:40 PM · about 45–53 in line · staff counts" (never "typical"). */
export function lastNightFrom(ln) {
  if (!ln || !Number.isFinite(ln.peak_low)) return null;
  const day = ln.date ? new Date(`${ln.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' }) : null;
  const at = ln.peak_at ? new Date(ln.peak_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
  const src = ln.source === 'door' ? 'door staff' : ln.source === 'crowd' ? 'guest reports' : 'our staff counts';
  return { label: day ? `Last ${day}` : 'Last night', peakPeople: ln.peak_high ?? ln.peak_low, peakLow: ln.peak_low, peakAt: at, source: src, hourly: ln.hourly ?? null, hours: ln.hours ?? null };
}

/** Rows only: anything that isn't a list of objects (a cached copy from an older shape, a proxy's error page) is ignored. */
const rows = (x) => (Array.isArray(x) ? x.filter((r) => r && typeof r === 'object' && !Array.isArray(r)) : []);

// What a usable row looks like, per collection. An empty list is a real answer ("no bars listed"); a list with a row that
// lacks its identity ([{}], a row without an id or name) is a broken response: the caller refuses that whole part, so the
// last good copy stays on screen instead of being replaced by nothing.
const isObj = (r) => Boolean(r) && typeof r === 'object' && !Array.isArray(r);
const isId = (v) => (typeof v === 'string' && v.length > 0 && v.length <= 80) || Number.isFinite(v);
const ROW_OK = {
  bars: (r) => isObj(r) && typeof r.id === 'string' && isId(r.id) && typeof r.name === 'string' && r.name.trim() !== '',
  status: (r) => isObj(r) && typeof r.bar_id === 'string' && isId(r.bar_id),
  deals: (r) => isObj(r) && isId(r.id) && typeof r.bar_id === 'string' && typeof r.title === 'string',
  events: (r) => isObj(r) && isId(r.id) && typeof r.bar_id === 'string' && typeof r.title === 'string',
};
/** True when x is a list (possibly empty) whose every row has the identity its kind needs. */
export const validRows = (kind, x) => Array.isArray(x) && x.every(ROW_OK[kind]);
/** A cached or fetched snapshot in the shape liveData() reads, or null. */
export function validLive(l) {
  if (!isObj(l) || !Number.isFinite(l.at)) return null;
  return validRows('bars', l.bars) && validRows('status', l.status) && validRows('deals', l.deals ?? []) && validRows('events', l.events ?? []) ? l : null;
}

/**
 * snapshot = { bars?: server bar rows, status?: bar_status rows, deals?: rows, events?: rows, at? }.
 * Returns { venues, events }. Venues keep directory order. get_bars returns listed bars only, so once a bar list has
 * loaded (snapshot.at), a directory bar it leaves out is no longer listed and is dropped; before any list has loaded,
 * the bundled directory draws the bars with no estimates (first launch offline).
 */
export function liveData(snapshot = {}) {
  const loaded = Array.isArray(snapshot.bars) && Number.isFinite(snapshot.at);
  const serverBars = new Map(rows(snapshot.bars).filter((b) => typeof b.id === 'string').map((b) => [b.id, b]));
  const status = new Map(rows(snapshot.status).map((s) => [s.bar_id, s]));
  const deals = rows(snapshot.deals).map(dealFromRow).filter((d) => d.startsAt != null && d.endsAt != null && d.endsAt > d.startsAt);
  const events = rows(snapshot.events).map(eventFromRow).filter((e) => e.startsAt != null);
  const ids = loaded ? new Set([...DIRECTORY.map((d) => d.id).filter((id) => serverBars.has(id)), ...serverBars.keys()]) : new Set(DIRECTORY.map((d) => d.id));
  const venues = [];
  for (const id of ids) {
    const dir = DIRECTORY.find((d) => d.id === id) ?? {};
    const row = serverBars.get(id) ?? {};
    if (row.is_listed === false) continue;
    const name = row.name ?? dir.name;
    if (!name) continue;
    const geo = Number.isFinite(row.lat) && Number.isFinite(row.lng) ? { lat: row.lat, lng: row.lng } : dir.geo ?? null;
    const st = status.get(id);
    venues.push({
      id, name, area: row.area ?? dir.area ?? null, address: row.address ?? dir.address ?? null, geo,
      blurb: dir.blurb ?? '', source: dir.source ?? null, tags: [],
      art: dir.art ?? 'lamps', palette: dir.palette ?? null,
      hours: hoursTonight(row.hours),
      cover: num(row.cover), typical: null, menu: [], pass: null,
      doors: [{ id: 'main', label: 'Door' }],
      queue: queueFromStatus(st),
      lastNight: lastNightFrom(st?.last_night),
      deals: deals.filter((d) => d.venueId === id),
      synthetic: false,
    });
  }
  return { venues, events: events.filter((e) => venues.some((v) => v.id === e.venueId)) };
}
