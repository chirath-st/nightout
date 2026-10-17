// Versioned local persistence. Everything stays on this device; nothing is transmitted.
// Every storage access is wrapped: private windows or blocked storage must not break the app.

export const STORAGE_KEY = 'doorline:v1';
export const SCHEMA_VERSION = 1;

export function defaultState(realNow) {
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
    points: [{ id: 'start', at: null, delta: 240, label: 'Demo starting balance' }],
    checkins: [], // { id, venueId, at } (simulated door-QR check-ins)
    lastDaily: null, // demo night (ms) of the last daily-login bonus
    vouchers: [], // redeemed rewards: { id, rewardId, ref, at }
    groups: { joined: [], created: [] },
    reports: [], // { id, venueId, at, bucket, inLine, gotInAt, waitMin }
    activeWait: null, // { reportId, venueId, startedAt }
    prefs: { notifyDrops: false, notifyDeals: false, notifyGroups: false },
    vipCards: [], // sample bar cards added in My account: { id, venueId, title, addedAt } (no photo is read)
    subscription: { plan: 'plus', billing: 'monthly', since: null }, // SIMULATED Night Out Plus: no billing exists
    savedEvents: [], // event ids (sample events, this device only)
    goingEvents: [],
    votes: {}, // venueId -> 'going' | 'maybe' | 'no' (sample poll, this device only)
    deals: [], // deals posted from the venue console: { id, venueId, kind, title, short, startsAt, endsAt, postedAt }
  };
}

const arr = (v) => (Array.isArray(v) ? v : []);

export function migrate(raw, realNow) {
  const base = defaultState(realNow);
  if (!raw || typeof raw !== 'object' || raw.version !== SCHEMA_VERSION) return base;
  return {
    ...base,
    ...raw,
    saved: Array.isArray(raw.saved) ? raw.saved.filter((s) => typeof s === 'string') : [],
    passes: Array.isArray(raw.passes) ? raw.passes : [],
    overrides: raw.overrides && typeof raw.overrides === 'object' ? raw.overrides : {},
    audit: Array.isArray(raw.audit) ? raw.audit.slice(0, 50) : [],
    clock: { ...base.clock, ...(raw.clock || {}) },
    sim: { ...base.sim, ...(raw.sim || {}) },
    dataset: ['demo', 'worst', 'empty'].includes(raw.dataset) ? raw.dataset : 'demo',
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
      plan: raw.subscription?.plan === 'none' ? 'none' : 'plus',
      billing: raw.subscription?.billing === 'annual' ? 'annual' : 'monthly',
      since: Number.isFinite(raw.subscription?.since) ? raw.subscription.since : null,
    },
    deals: arr(raw.deals).filter((d) => d && typeof d.venueId === 'string' && typeof d.title === 'string' && Number.isFinite(d.startsAt) && Number.isFinite(d.endsAt)).slice(0, 50),
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
