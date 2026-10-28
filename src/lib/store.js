// Versioned local persistence. Everything stays on this device; nothing is transmitted.
// Every storage access is wrapped: private windows or blocked storage must not break the app.

import { activeReminders } from './reminders.js';

export const STORAGE_KEY = globalThis.__STORE__ ? 'app:state:v1' : 'doorline:v1';
export const SCHEMA_VERSION = 1;

export function defaultState(realNow) {
  if (globalThis.__STORE__) {
    // App Store build: nothing pre-filled. No profile, points, plan or sample anything; the rest of the app reads these
    // keys, so they exist but stay empty.
    return {
      version: SCHEMA_VERSION, ageConfirmed: false, saved: [], passes: [], overrides: {}, audit: [],
      clock: { realStart: realNow, base: null, offsetMin: 0 }, dataset: 'live', syncAt: null,
      sim: { offline: false, failNextRefresh: false, failNextPass: false },
      profile: { name: '', handle: '' }, points: [], checkins: [], lastDaily: null, vouchers: [],
      groups: { joined: [], created: [] }, reports: [], activeWait: null,
      prefs: { notifyDrops: false, notifyDeals: false, notifyGroups: false }, vipCards: [],
      subscription: { plan: 'none', billing: 'monthly', since: null }, savedEvents: [], goingEvents: [], votes: {},
      ideas: { joined: [], hyped: [], created: [], decisions: {} }, counts: [], doors: {}, deals: [],
      reminders: {}, // venueId -> { at, nid }: local reminders for saved bars (this phone only)
      splashSeen: false, // the animated wordmark plays on the first launch only
      termsAgreedAt: null, // when this phone agreed to the Terms (asked before the first report)
    };
  }
  return {
    version: SCHEMA_VERSION,
    ageConfirmed: false,
    saved: [],
    passes: [],
    overrides: {}, // venueId -> { queue?, pass? } written by the operator console
    audit: [], // operator changes, newest first
    clock: { realStart: realNow, base: null, offsetMin: 0 },
    dataset: 'demo',
    syncAt: null, // demo time of the last successful simulated refresh
    sim: { offline: false, failNextRefresh: false, failNextPass: false },
    // Social + rewards (all simulated, this device only)
    profile: { name: 'Alex', handle: '' },
    points: [{ id: 'start', at: null, delta: 240, label: 'Starting balance' }],
    checkins: [], // { id, venueId, at } (simulated door-QR check-ins)
    lastDaily: null, // demo night (ms) of the last daily-login bonus
    vouchers: [], // redeemed rewards: { id, rewardId, ref, at }
    groups: { joined: [], created: [] },
    reports: [], // { id, venueId, at, bucket, inLine, gotInAt, waitMin }
    activeWait: null, // { reportId, venueId, startedAt }
    prefs: { notifyDrops: false, notifyDeals: false, notifyGroups: false },
    vipCards: [], // sample bar cards added in My account: { id, venueId, title, addedAt } (no photo is read)
    subscription: { plan: 'none', billing: 'monthly', since: null }, // SIMULATED Night Out Plus: off until picked; no billing exists
    savedEvents: [], // event ids (sample events, this device only)
    goingEvents: [],
    votes: {}, // venueId -> 'going' | 'maybe' | 'no' (sample poll, this device only)
    ideas: { joined: [], hyped: [], created: [], decisions: {} },
    counts: [], // console photo head counts (simulated photos): { id, venueId, at, by, heads, seed, method }
    doors: {}, // venueId -> { at, by, list: { doorId: { status, pace } } } (console door status and pace) // community theme-night ideas (demo; this device only)
    deals: [], // deals posted from the venue console: { id, venueId, kind, title, short, startsAt, endsAt, postedAt }
    reminders: {}, // venueId -> { at, nid }: Saved > bell (in a browser the reminder is saved and shown, not notified)
    termsAgreedAt: null, // asked once, before the first report
    business: { on: false, venueId: null }, // Profile > Business view: a demo login as one venue (no account, no server)
    redemptions: [], // reward codes the venue marked used in Business view: { id, ref, rewardId, venueId, at, sample, night } (night = clock.realStart)
  };
}

const arr = (v) => (Array.isArray(v) ? v : []);
const strs = (v, max = 100) => arr(v).filter((s) => typeof s === 'string').slice(0, max);
const count = (n) => (Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0);

/** A created community idea as stored; anything malformed is dropped (null). */
function normIdea(c) {
  if (!c || typeof c !== 'object') return null;
  if (![c.id, c.venueId, c.title, c.theme, c.pitch].every((x) => typeof x === 'string')) return null;
  if (!Number.isFinite(c.startsAt) || !Number.isFinite(c.endsAt) || c.startsAt >= c.endsAt) return null;
  if (!Number.isInteger(c.day) || c.day < 1 || c.day > 6) return null;
  return {
    ...c, genres: strs(c.genres, 6), joins: count(c.joins), hype: count(c.hype),
    by: { name: typeof c.by?.name === 'string' ? c.by.name : 'You' }, postedAt: Number.isFinite(c.postedAt) ? c.postedAt : c.startsAt,
    kind: 'community', cover: null, adults: true, synthetic: true, mine: true,
  };
}
const ROLES = ['ambassador', 'bouncer'];
const DOOR_STATUSES = ['moving', 'capacity', 'paused', 'closed'];
/** Only these keys survive, so nothing like an image or data: URL can ride along. */
function normCount(c) {
  if (!c || typeof c.id !== 'string' || typeof c.venueId !== 'string' || !ROLES.includes(c.by) || !Number.isFinite(c.at)) return null;
  if (!Number.isInteger(c.heads) || c.heads < 0 || c.heads > 400) return null;
  return { id: c.id, venueId: c.venueId, at: c.at, ...(Number.isFinite(c.night) ? { night: c.night } : {}), by: c.by, heads: c.heads, seed: typeof c.seed === 'string' ? c.seed : '', method: c.method === 'demo-fill' ? 'demo-fill' : 'tap' };
}
function normDoors(d) {
  if (!d || typeof d !== 'object') return {};
  const out = {};
  for (const [vid, x] of Object.entries(d)) {
    if (!x || !Number.isFinite(x.at) || !x.list || typeof x.list !== 'object') continue;
    const list = {};
    for (const [id, s] of Object.entries(x.list)) {
      if (!DOOR_STATUSES.includes(s?.status)) continue;
      list[id] = { status: s.status, pace: Number.isFinite(s.pace) && s.pace >= 0.5 && s.pace <= 6 ? s.pace : null };
    }
    if (Object.keys(list).length) out[vid] = { at: x.at, by: ROLES.includes(x.by) ? x.by : 'ambassador', list };
  }
  return out;
}
function normDecisions(d) {
  if (!d || typeof d !== 'object') return {};
  const out = {};
  for (const [id, x] of Object.entries(d)) {
    if (!x || !['approved', 'declined'].includes(x.status) || !Number.isFinite(x.at)) continue;
    out[id] = { status: x.status, at: x.at, cover: x.status === 'approved' ? ([0, 5, 10].includes(x.cover) ? x.cover : 0) : null };
  }
  return out;
}

/** Before Ship E, Scan and the old console wrote whole queues into overrides; reports now merge in instead, so a kept
 *  queue would count the same report twice. Only `queue: null` (a cleared estimate) is still written. */
function dropOldQueues(o) {
  if (!o || typeof o !== 'object') return {};
  const out = {};
  for (const [id, v] of Object.entries(o)) {
    if (!v || typeof v !== 'object') continue;
    const { queue, ...rest } = v;
    const keep = queue === null ? { ...rest, queue: null } : rest;
    if (Object.keys(keep).length) out[id] = keep;
  }
  return out;
}

export function migrate(raw, realNow) {
  const base = defaultState(realNow);
  if (!raw || typeof raw !== 'object' || raw.version !== SCHEMA_VERSION) return base;
  return {
    ...base,
    ...raw,
    saved: Array.isArray(raw.saved) ? raw.saved.filter((s) => typeof s === 'string') : [],
    passes: Array.isArray(raw.passes) ? raw.passes : [],
    overrides: dropOldQueues(raw.overrides),
    audit: Array.isArray(raw.audit) ? raw.audit.slice(0, 50) : [],
    clock: { ...base.clock, ...(raw.clock || {}) },
    sim: { ...base.sim, ...(raw.sim || {}) },
    dataset: globalThis.__STORE__ ? 'live' : ['demo', 'worst', 'empty'].includes(raw.dataset) ? raw.dataset : 'demo',
    profile: { ...base.profile, ...(raw.profile && typeof raw.profile === 'object' ? raw.profile : {}) },
    points: Array.isArray(raw.points) ? raw.points.filter((e) => Number.isFinite(e?.delta)) : base.points,
    vouchers: arr(raw.vouchers),
    groups: { joined: arr(raw.groups?.joined).filter((s) => typeof s === 'string'), created: arr(raw.groups?.created) },
    reports: arr(raw.reports).slice(0, 100),
    activeWait: raw.activeWait && typeof raw.activeWait === 'object' && raw.activeWait.venueId ? raw.activeWait : null,
    prefs: { ...base.prefs, ...(raw.prefs && typeof raw.prefs === 'object' ? raw.prefs : {}) },
    savedEvents: arr(raw.savedEvents).filter((s) => typeof s === 'string'),
    goingEvents: arr(raw.goingEvents).filter((s) => typeof s === 'string'),
    checkins: arr(raw.checkins).filter((c) => c && typeof c.venueId === 'string' && Number.isFinite(c.at)).slice(0, 200),
    lastDaily: Number.isFinite(raw.lastDaily) ? raw.lastDaily : null,
    votes: raw.votes && typeof raw.votes === 'object' ? Object.fromEntries(Object.entries(raw.votes).filter(([, x]) => ['going', 'maybe', 'no'].includes(x))) : {},
    vipCards: arr(raw.vipCards).filter((c) => c && typeof c.id === 'string' && typeof c.title === 'string' && Number.isFinite(c.addedAt)).slice(0, 20),
    subscription: {
      // Only a plan someone picked counts (it carries `since`); the old untouched default ('plus', since null) reads as off.
      plan: raw.subscription?.plan === 'plus' && Number.isFinite(raw.subscription?.since) ? 'plus' : 'none',
      billing: raw.subscription?.billing === 'annual' ? 'annual' : 'monthly',
      since: Number.isFinite(raw.subscription?.since) ? raw.subscription.since : null,
    },
    ideas: {
      joined: strs(raw.ideas?.joined), hyped: strs(raw.ideas?.hyped),
      created: arr(raw.ideas?.created).map(normIdea).filter(Boolean).slice(0, 20), decisions: normDecisions(raw.ideas?.decisions),
    },
    counts: arr(raw.counts).map(normCount).filter(Boolean).slice(0, 100),
    doors: normDoors(raw.doors),
    reminders: activeReminders(raw.reminders, realNow),
    deals: arr(raw.deals).filter((d) => d && typeof d.venueId === 'string' && typeof d.title === 'string' && Number.isFinite(d.startsAt) && Number.isFinite(d.endsAt)).slice(0, 50),
    ...(globalThis.__STORE__ ? {} : {
      business: { on: raw.business?.on === true, venueId: typeof raw.business?.venueId === 'string' ? raw.business.venueId : null },
      redemptions: arr(raw.redemptions).filter((r) => r && typeof r.ref === 'string' && typeof r.venueId === 'string' && Number.isFinite(r.at))
        .map(({ id, ref, rewardId, venueId, at, sample, night }) => ({ id: String(id ?? ref), ref, rewardId: String(rewardId ?? ''), venueId, at, sample: sample === true, night: Number.isFinite(night) ? night : null })).slice(0, 200),
    }),
  };
}

export function load(storage, realNow) {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    return migrate(text ? JSON.parse(text) : null, realNow);
  } catch {
    return defaultState(realNow);
  }
}

export function save(storage, state) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clear(storage) {
  try { storage?.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
}
