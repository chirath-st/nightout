// Night Out prototype controller (codename in storage and QA hook: doorline). Local only: no network requests, no payments, no ID data.
import { load, save, clear, defaultState } from './lib/store.js';
import { normalizeClock, demoNow, advance, formatTime, START_OFFSET_MIN, nightIsOver } from './lib/clock.js';
import { buildDataset, atNight, atNightOn } from './data/venues.js';
import { buildGroups, POINTS, LINE_BUCKETS, REWARDS, balanceOf, nextReward, validHandle, checkedInTonight, PLANS, SAMPLE_BAR_CARDS } from './data/social.js';
import { resolveVenues } from './lib/model.js';
import { withObservations, headsFor, scanOutcome } from './lib/merge.js';
import { parseHash, buildHash, exploreStateFromQuery, exploreQuery } from './lib/router.js';
import { FILTERS, SORTS, exploreList, areaLabel } from './lib/explore.js';
import { windowState, purchasable, createPass, maxPartyFor, passStatus, money, refCode } from './lib/pass.js';
import { estimateCompact, estimateBlock, estimateRing, estimateFor, pointsChip, esc, mapCard, cardStatus, cardFresh, srSummary, dealTag, venueStatus, factStrip, setLiveLoadFailed, venuePhoto, venueLogo } from './ui/components.js';
import { icon } from './ui/icons.js';
import { renderExplore, exploreResults, exploreBanners, exploreChips, extraChips, quickViewOf, pinParts, areaSheet, dealsRail } from './views/explore.js';
import { renderGroups, renderGroupNew, validateGroup, membersSheet, memberProfileSheet, nightMinutes, MAX_STOPS, groupCard, allGroups } from './views/groups.js';
import { renderEvents, eventResults, eventCard } from './views/events.js';
import { renderScan, pickListItems, scanEstimate, scanSubmitReady, draftQueue } from './views/scan.js';
import { renderPoints, checkinSheet } from './views/points.js';
import { renderProfile, settingsSheet, manageSubSheet, helpSheet } from './views/profile.js';
import { renderVenue, directionsSheet, pollSection, dealsSection } from './views/venue.js';
import { buildEvents, buildIdeas } from './data/events.js';
import { resolveIdeas, checkIdea, defaultNight, defaultCover, coverLabel, nightLabel, ideaCounts } from './lib/ideas.js';
import { renderIdeaNew, ideaCard } from './views/ideas.js';
import { renderPassSheet } from './views/passSheet.js';
import { renderSaved, renderPasses, renderPassDetail, renderAbout, newDealDraft } from './views/pages.js';
import { renderConsole, photoPanel, photoPreview, currentDoor } from './views/console.js';
import { checkCode, normalizeCode, samplePhoto, MAX_UPLOADS, BIZ_SECTIONS, venueSections, voucherCode, countWait, typedCount, countBase } from './views/business.js';
import { DRAW_MAX } from './ui/lineart.js';
import { makeGhost, flyPhoto, easeFrom, cornerRadii, heroCopy, cssTimeMs } from './ui/navmotion.js';
import { checkDeal } from './lib/deals.js';
import { createApi, createVenueApi, friendlyError, ApiError, VENUE_KEYS } from './lib/api.js';
import { BACKEND, LIVE } from './lib/backend.js';
import { uuid } from './lib/ids.js';
import { liveData, validRows, validLive } from './data/live.js';
import { renderProfileStore, renderAboutStore, reminderSheet, termsSheet } from './views/store.js';
import { isNative, haptic, share as nativeShare, openExternal, hideSplash, styleStatusBar, onResume, restoreStorage, mirrorStorage, addMirrorKeys, locate, hideKeyboardBar, canRemind, notificationPermission, scheduleReminder, cancelReminder, pendingReminderIds, onReminderTap } from './lib/native.js';
import { reminderAt, reminderDays, reminderId, reminderText, reminderPhrase, defaultChoice, activeReminders } from './lib/reminders.js';
import { setOrigin, milesBetween, DEMO_SPOT } from './lib/geo.js';

// Build flavor. `globalThis.__STORE__` is replaced with `true` when scripts/build-www.mjs builds the App Store app, and
// esbuild then drops every team-only branch and module (sample nights, demo controls, points, groups, passes, Plus).
// Unbuilt (the repo, tests, the private team build) it is undefined, so everything below runs as the team build.
// Always write the check inline as `globalThis.__STORE__`: a copy in a variable defeats the dead-code removal.
// LIVE (lib/backend.js) is true only in a live team build (scripts/build-www.mjs --live): the team app on a server, for
// the lab. Data and honesty checks read `(globalThis.__STORE__ || LIVE)`, inline too (the store bundle folds
// `true || LIVE`), so a live team build behaves like the store build except for the team look it keeps, which stays
// plain `globalThis.__STORE__`: the 5-tab bar with Points, camera-first Scan, Points, Business view and the team Profile.
const LIVE_KEY = 'app:live:v1';
const POLL_MS = 45_000;

const FILTER_IDS = FILTERS.map((f) => f.id);
const EXPLORE_KEYS = ['q', 'f', 'sort', 'view', 'area'];
const SORT_IDS = SORTS.map((s) => s.id);
const webStorage = (() => { try { return window.localStorage; } catch { return null; } })();
/** localStorage, mirrored to native Preferences inside the iOS app (iOS can clear a web view's storage). */
const storage = webStorage && {
  getItem: (k) => webStorage.getItem(k),
  setItem: (k, v) => { webStorage.setItem(k, v); mirrorStorage(k, v); },
  removeItem: (k) => { webStorage.removeItem(k); mirrorStorage(k, null); },
};
// Created after `storage`: the bundler turns these top-level consts into vars, so an earlier line would hand the API an
// undefined storage and the anonymous session would never be saved (a new account on every launch).
// A live team build tags what both clients store with its env (mock, local, staging): one origin can serve several.
const api = (globalThis.__STORE__ || LIVE) ? createApi({ backend: globalThis.__STORE__ ? globalThis.__BACKEND__ : BACKEND, storage, platform: isNative() ? 'ios' : 'web', env: globalThis.__STORE__ ? null : BACKEND.env }) : null;
// Business view's own client in a live team build: a venue session never touches the guest's (the guest's account is
// the one Delete my data removes, and the guest client signs up anonymously). Its keys join the iPhone app's Preferences
// mirror.
const venueApi = !globalThis.__STORE__ && LIVE ? createVenueApi({ backend: BACKEND, storage, env: BACKEND.env }) : null;
if (!globalThis.__STORE__ && LIVE) addMirrorKeys(VENUE_KEYS);
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const app = {
  state: null,
  venues: [],
  route: null,
  explore: { q: '', filters: [], sort: 'near', view: 'list', area: '' },
  lastExploreHash: '#/',
  lastVenueId: null,
  ui: { loading: true, refreshError: false, lastRefreshAt: null, searchOpen: false, eventsView: 'tonight', eventsGenre: '', eventsTheme: '', eventsPrice: '', mapSelected: null, staleNotice: null, lastRemoved: null, resetSnapshot: null, clearedQueue: null },
  firstFetchStarted: false,
  console: freshConsole(),
  ideas: [],
  ideaDraft: null,
  ideaErrors: {},
  passFlow: null,
  venueBack: null, // where the venue page's Back link returns to (Tonight, Saved, Passes…)
  scroll: new Map(),
  renderedHash: null,
  visit: 0, // increments per route; inline Undo rows only show during the visit where the action happened
  groups: [],
  events: [],
  groupDraft: null,
  groupErrors: {},
  scan: null,
  profileEdit: { editing: false, errors: {} },
  navFrom: null, // the link that started the current navigation (for the shared-photo morph)
  pickerReturn: null, // selector to refocus when the picker closes and its opener was re-rendered (check-in)
};
// Business view (Profile > Business view, team build): section, the code being checked, and photos added to preview
// (object URLs in memory only: never saved or sent, and let go when Business view is left).
function freshConsole() { return { venueId: null, dealDraft: null, dealErrors: {}, ideaCover: {}, role: 'ambassador', photo: null, heldPhotos: {}, snaps: 0, section: 'tonight', ideasFirst: null, codeDraft: '', codeResult: null, uploads: [] }; }
// photo: an object URL for the picture just taken (memory only, never uploaded); manual: reporting without a photo;
// camera: 'open' while the phone's camera is up, 'cancelled' once it was closed without a photo.
const freshScan = () => ({ step: 'pick', venueId: null, photo: null, manual: false, camera: null, bucket: null, door: 'moving', inLine: true, q: '', error: null });
app.scan = freshScan();
app.checkin = { step: 'pick', venueId: null };
// Live team build. Business view (venue account): phase 'signin' (no venue session), 'loading', 'totp' (the second
// factor), 'error' (the account couldn't be read) or 'ready'; count is the number being made at the bar (photo: an
// object URL in memory only, marks: where heads were tapped). Points: the server's balance, catalog and codes.
// error: a number Publish can't take (shown under the field, which it describes).
const freshCount = () => ({ people: 0, raw: null, door: 'moving', pace: null, photo: null, marks: [], error: null });
// code.clientId belongs to code.clientCode; code.lost is a redemption whose answer was lost ({ code, reward }): it keeps
// its id, so trying it again (or checking that code again) answers "duplicate", never "already used".
const freshCode = () => ({ draft: '', result: null, clientId: null, clientCode: null, lost: null, busy: false });
/** What one venue account sees: dropped at sign-out, so the next account on the same phone starts clean. */
const accountState = () => ({ count: freshCount(), msg: {}, notices: [], code: freshCode(), deals: null, dealSending: false, dealClient: null, report: null, confirmOut: false, withdrawAsk: null, withdrawing: [] });
function freshVenue() { return { phase: 'signin', staff: null, email: '', error: null, errorField: null, note: null, busy: false, verified: false, section: 'tonight', barId: null, queued: 0, ...accountState() }; }
// loaded: the first read has finished (until then nothing is known: no balance is shown, not even 0).
const freshPoints = () => ({ mine: null, mineError: null, catalog: null, catalogError: null, note: null, busy: null, pending: {}, loaded: false });
app.venue = !globalThis.__STORE__ && LIVE ? freshVenue() : null;
app.points = !globalThis.__STORE__ && LIVE ? freshPoints() : null;

/* ---------------- state ---------------- */
function init() {
  const realNow = Date.now();
  app.state = load(storage, realNow);
  if (globalThis.__STORE__ || LIVE) {
    app.state.clock = { v: 2, realStart: realNow, base: nightAnchor(realNow), offsetMin: 0 };
    // The last good copy for offline and the next launch. A copy that isn't the shape we wrote is dropped, never drawn,
    // and a live team build takes only its own server's copy (mock, local and staging never mix).
    try { app.live = validLive(JSON.parse(storage?.getItem(LIVE_KEY) ?? 'null')) ?? {}; } catch { app.live = {}; }
    if (!globalThis.__STORE__ && LIVE && app.live.env !== BACKEND.env) app.live = {};
    // Shown until the first refresh (and named by "Couldn't refresh… still showing the last update from …" if it fails).
    app.ui.lastRefreshAt = app.live.at ?? null;
    persist();
    rebuild();
    return;
  }
  const prev = app.state.clock;
  app.state.clock = normalizeClock(prev, realNow);
  if (prev?.realStart !== app.state.clock.realStart || prev?.base !== app.state.clock.base) clearNightState();
  persist();
  rebuild();
}
/** A fresh demo night: anything tied to the old night's clock would read as stale or as "just now", so drop it. */
function clearNightState() {
  app.state.syncAt = null;
  for (const [id, o] of Object.entries(app.state.overrides)) {
    delete o.queue;
    delete o.clearedAt;
    if (!Object.keys(o).length) delete app.state.overrides[id];
  }
  app.state.counts = [];
  app.state.doors = {};
  app.state.activeWait = null;
  app.state.deals = [];
}
/** Called from tick and on return to the tab: once every bar has closed, start a new midnight. */
function maybeStartNewNight() {
  if (globalThis.__STORE__ || LIVE) {
    const base = nightAnchor(Date.now());
    if (base === app.state.clock.base) return false;
    app.state.clock = { ...app.state.clock, base };
    persist();
    rebuild();
    render({ focus: 'none' });
    return true;
  }
  if (!nightIsOver(app.state.clock, Date.now())) return false;
  app.state.clock = normalizeClock(null, Date.now());
  clearNightState();
  persist();
  rebuild();
  render({ focus: 'none' });
  toast('A new night started at midnight.');
  return true;
}
const now = () => (globalThis.__STORE__ || LIVE ? Date.now() : demoNow(app.state.clock, Date.now()));
/** Store build: a night runs 6 PM to 6 AM; its anchor (state.clock.base) is that evening's 6 PM. Events "tonight" hang off it. */
function nightAnchor(t) { const d = new Date(t); if (d.getHours() < 6) d.setDate(d.getDate() - 1); d.setHours(18, 0, 0, 0); return d.getTime(); }
function persist() { save(storage, app.state); updatePointsChip(); }
function rebuild() {
  if (globalThis.__STORE__ || LIVE) {
    const live = liveData(app.live ?? {});
    app.venues = live.venues;
    app.events = live.events;
    app.groups = [];
    app.ideas = [];
    return;
  }
  // Report ages count back from the last simulated refresh; before the first one, from the demo's start (midnight).
  const base = buildDataset(app.state.dataset, app.state.clock.base, app.state.syncAt ?? app.state.clock.base + START_OFFSET_MIN * 60_000);
  const n = now();
  // This device's photo counts, guest reports and door state merge into each bar's queue (src/lib/merge.js).
  app.venues = resolveVenues(base, app.state.overrides, app.state.passes, app.state.deals).map((v) => withObservations(v, app.state, n, { since: app.state.clock.base, night: app.state.clock.realStart }));
  app.groups = buildGroups(app.state.clock.base);
  app.events = buildEvents(app.state.clock.base);
  app.ideas = resolveIdeas(buildIdeas(app.state.clock.base, app.events), app.state.ideas.created, app.state.ideas.decisions, new Set(app.venues.map((v) => v.id)), app.state.clock.base);
}
const isOffline = () => (globalThis.__STORE__ || LIVE ? navigator.onLine === false : app.state.sim.offline || navigator.onLine === false);
const savedSet = () => new Set(app.state.saved);

function ctx(extra = {}) {
  return {
    venues: app.venues, now: now(), state: app.state, explore: app.explore, ui: app.ui, savedSet: savedSet(),
    offline: isOffline(), console: app.console, visit: app.visit, groups: app.groups, events: app.events, ideas: app.ideas,
    backHref: app.venueBack?.href ?? app.lastExploreHash, backLabel: app.venueBack?.label ?? 'Bars', passesFrom: app.passesFrom,
    native: isNative(), canRemind: (globalThis.__STORE__ || LIVE) && canRemind(), loadFailed: (globalThis.__STORE__ || LIVE) && app.ui.refreshError && !app.live?.at,
    // Live data loaded, but events and deals never arrived (the Events view and bar pages say so instead of "none listed").
    eventsMissing: (globalThis.__STORE__ || LIVE) && Boolean(app.live?.at) && app.live.edAt === null,
    // A live team build: Business view's venue account and bar, and the server's points (null otherwise).
    venue: !globalThis.__STORE__ && LIVE ? app.venue : null, venueBar: !globalThis.__STORE__ && LIVE ? venueBar() : null, points: !globalThis.__STORE__ && LIVE ? app.points : null, ...extra,
  };
}

/* ---------------- history ---------------- */
function histIdx() { return history.state?.idx ?? 0; }
function go(hash, { replace = false } = {}) {
  if (hash === location.hash || (hash === '#/' && (location.hash === '' || location.hash === '#'))) { route(); return; }
  rememberScroll();
  const idx = replace ? histIdx() : histIdx() + 1;
  history[replace ? 'replaceState' : 'pushState']({ idx }, '', hash);
  route();
}
function goBack(fallback) {
  if (histIdx() > 0) history.back();
  else go(fallback, { replace: true });
}
function rememberScroll() { if (app.renderedHash) app.scroll.set(app.renderedHash, window.scrollY); }

/* ---------------- toast & announcer ---------------- */
// The store build's CSS is minified, which writes 380ms as .38s: read the unit (a bare parseFloat made it 0.38 ms).
const cssMs = (name, fallback) => {
  const v = cssTimeMs(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
};
/** Motion tokens from tokens.css, read once at boot (and again when reduced motion flips): JS never hardcodes a curve. */
const T = {};
function readTokens() {
  const css = getComputedStyle(document.documentElement);
  const ease = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  Object.assign(T, {
    easeOut: ease('--ease-out', 'ease-out'), easeInOut: ease('--ease-in-out', 'ease-in-out'), easeSheet: ease('--ease-sheet', 'ease-out'),
    springPop: ease('--spring-pop', 'ease-out'), springDrawer: ease('--spring-drawer', 'ease-out'),
    swap: cssMs('--d-swap', 150), icon: cssMs('--d-icon', 160), thumb: cssMs('--d-thumb', 220), flip: cssMs('--d-flip', 220),
    tray: cssMs('--d-tray', 260), roll: cssMs('--d-roll', 280), reveal: cssMs('--d-reveal', 200), toastOut: cssMs('--d-toast-out', 160),
    flash: cssMs('--d-flash', 240), fade: cssMs('--d-fade', 150), rmIn: cssMs('--d-rm-in', 150), rmOut: cssMs('--d-rm-out', 120),
    sheetLock: cssMs('--d-sheet-lock', 320), shake: cssMs('--d-shake', 240), springPopMs: cssMs('--d-spring-pop', 380), fly: cssMs('--d-fly', 320),
    springDrawerMs: cssMs('--d-spring-drawer', 400), sheetOut: cssMs('--d-sheet-out', 220), quick: cssMs('--d-quick', 120), boop: cssMs('--d-boop', 300),
    select: cssMs('--d-select', 160), morph: cssMs('--d-morph', 240), morphOut: cssMs('--d-morph-out', 180), pressUp: cssMs('--d-press-up', 240),
    pick: cssMs('--d-flash-pick', 120), toast: cssMs('--d-toast', 220), trayOut: cssMs('--d-tray-out', 180),
    navFly: cssMs('--d-nav-fly', 380), navFlyBack: cssMs('--d-nav-fly-back', 340), navOut: cssMs('--d-nav-out', 160), navPage: cssMs('--d-nav-page', 240),
    easeNav: ease('--ease-nav', 'cubic-bezier(0.32, 0.72, 0, 1)'),
  });
}
/**
 * One toast at a time, except that a live Undo is never dropped silently (QA plan 6.9): when the toast on screen offers
 * an action and the new message doesn't, the old one steps back (up and smaller, at .6) and the new one enters in front;
 * at most two, each with its own timer. Otherwise the toast on screen swaps its text in place. `key` names the subject:
 * a message about the same thing (Saved X after Removed X) replaces it instead of stacking.
 */
function toast(message, { actionLabel, onAction, timeout = actionLabel ? 15000 : 6000, key = null } = {}) {
  const region = document.getElementById('toasts');
  region.querySelectorAll('.toast.is-leaving').forEach((n) => n.remove());
  // The newest toast comes first in the region (read first, found first); CSS paints the one behind under it.
  let el = region.querySelector('.toast:not(.is-behind)');
  if (el && el._action && !(key != null && el._key === key)) {
    region.querySelectorAll('.toast.is-behind').forEach((n) => dismissToast(n, { now: true })); // at most two
    el.classList.add('is-behind');
    el = null;
  }
  const reused = !!el;
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    const alive = () => !el.classList.contains('is-leaving');
    el.addEventListener('pointerenter', () => { if (alive()) clearTimeout(el._timer); });
    el.addEventListener('pointerleave', () => { if (alive()) armToast(el, el._timeout); });
    el.addEventListener('focusin', () => { if (alive()) { clearTimeout(el._timer); bringToastForward(el); } });
    el.addEventListener('focusout', () => { if (alive()) armToast(el, el._timeout); });
    // A tap on the toast behind (its peeking edge) brings it, and its Undo, to the front.
    el.addEventListener('click', (e) => { if (alive() && !e.target.closest('[data-toast-action]')) bringToastForward(el); });
    region.prepend(el);
  }
  // Where focus returns if the toast closes while its button holds focus.
  if (!el.contains(document.activeElement)) el._origin = document.activeElement;
  el._timeout = timeout;
  el._key = key;
  el._action = !!actionLabel;
  // A toast already on screen swaps its text in place (2px blur settle) instead of re-entering.
  if (reused) el.classList.add('is-swapping');
  el.innerHTML = `<p>${esc(message)}</p>${actionLabel ? `<button type="button" class="btn" data-toast-action>${esc(actionLabel)}</button>` : ''}`;
  if (reused) requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('is-swapping')));
  if (actionLabel) {
    el.querySelector('[data-toast-action]').addEventListener('click', (e) => withGesture(e, () => {
      dismissToast(el);
      toastActing = true; // its own Undo: the other toast (if any) stays
      try { onAction?.(); } finally { toastActing = false; }
    }));
  }
  armToast(el, timeout);
  placeToastStack();
  liftToasts();
}
/** The two toasts trade places (CSS layers them by .is-behind, so no node moves and focus stays put). */
function bringToastForward(el) {
  if (!el.classList.contains('is-behind')) return;
  document.querySelector('#toasts .toast:not(.is-behind):not(.is-leaving)')?.classList.add('is-behind');
  el.classList.remove('is-behind');
  placeToastStack();
}
/** The toast behind peeks 14px above the one in front, whatever their heights. */
function placeToastStack() {
  const region = document.getElementById('toasts');
  const front = region.querySelector('.toast:not(.is-behind):not(.is-leaving)');
  region.querySelectorAll('.toast.is-behind').forEach((b) => {
    b.style.setProperty('--peek', `${-(Math.max(0, (front?.offsetHeight ?? 0) - b.offsetHeight) + 14)}px`);
  });
}
/** Toasts never land on the action under them (QA plan 6.3): the map preview card on Bars, and the line-photo button on
 *  the console (Door console and Business view Tonight), which sits mid-screen when its panel is scrolled up (polish
 *  acceptance note "P02 live toast"). When one would be under the toasts as they appear, the toasts rise above it. */
function liftToasts() {
  const region = document.getElementById('toasts');
  if (!region) return;
  const route = app.route?.name;
  // A toast that was already showing glides to the new lift; a new one (nothing showing before it) starts at it.
  const live = [...region.querySelectorAll('.toast:not(.is-leaving)')];
  region.classList.toggle('is-settled', live.some((t) => t._settled));
  live.forEach((t) => { t._settled = true; });
  const card = route === 'tonight' ? document.querySelector('#main .map-preview:not([hidden])') : route === 'console' ? document.querySelector('#main .photo-cta .btn')
    : route === 'venue' || route === 'pass' ? document.querySelector('#main .venue-actions') : null; // the bar page's Report the line row
  region.style.removeProperty('--toast-lift');
  if (!card) return;
  // The toasts' bottom edge without a lift, from layout: the lift is a translate (it may still be gliding), so the
  // region's on-screen box can't be read for this.
  const floor = document.documentElement.clientHeight - parseFloat(getComputedStyle(region).bottom);
  const r = card.getBoundingClientRect();
  if (Math.min(r.bottom, floor) - Math.max(r.top, floor - 52) > 4) region.style.setProperty('--toast-lift', `${Math.ceil(floor - r.top + 8)}px`);
}
/** Re-place live toasts after the page moved under them (a scroll that settled, a console panel that changed size). */
const reliftToasts = () => { if (document.querySelector('#toasts .toast:not(.is-leaving)')) liftToasts(); };
function armToast(el, timeout) { clearTimeout(el._timer); el._timer = setTimeout(() => dismissToast(el), timeout); }
/** Exit: fade and drop 6px (CSS .is-leaving), click-through at once, removed on the opacity transitionend. The toast
 *  waiting behind comes forward. `now` removes it at once (a third toast pushes the oldest out). */
function dismissToast(el, { now: instant = false } = {}) {
  if (!el.isConnected || el.classList.contains('is-leaving')) return;
  clearTimeout(el._timer);
  // Its button is about to disappear: hand focus back first (an Undo action may then move it on).
  if (el.contains(document.activeElement)) (el._origin?.isConnected && el._origin !== document.body ? el._origin : pageHeading())?.focus({ preventScroll: true });
  if (instant) { el.remove(); return; }
  el.classList.add('is-leaving');
  if (!el.classList.contains('is-behind')) document.querySelector('#toasts .toast.is-behind:not(.is-leaving)')?.classList.remove('is-behind');
  let gone = false;
  const done = () => { if (gone) return; gone = true; clearTimeout(timer); el.removeEventListener('transitionend', onEnd); el.remove(); };
  const onEnd = (e) => { if (e.target === el && e.propertyName === 'opacity') done(); };
  el.addEventListener('transitionend', onEnd);
  const timer = setTimeout(done, T.toastOut + 40);
}
/** An inline Undo makes the matching toast stale, so close it: the one about the same thing (key), else the newest one
 *  that offers an action. A message without one (e.g. "Saved" in front of it) stays, and so does everything when the
 *  Undo came from a toast's own button. */
let toastActing = false;
function dismissCurrentToast(key = null) {
  if (toastActing) return;
  const live = [...document.querySelectorAll('#toasts .toast:not(.is-leaving)')];
  const el = (key != null && live.find((t) => t._key === key)) || live.find((t) => t._action);
  if (el) dismissToast(el);
}

/* ---------------- motion helpers (research/claude-raw/ui-motion-qa-2026-10-18.md, item 0.2) ---------------- */
/** The click, change or submit being handled right now. Anything it changes synchronously asks motionOK() with it, so a
 *  keyboard or programmatic activation (click detail 0, or a change/submit while the keyboard is in use) stays instant. */
let gesture = null;
function withGesture(e, fn) {
  const outer = gesture;
  gesture = e;
  try { return fn(); } finally { gesture = outer; }
}
const fromKeys = (e) => (typeof e.detail === 'number' ? e.detail === 0 : document.documentElement.classList.contains('kbd'));
/** JS motion runs only for a visible page, without reduced motion, and never for keyboard or programmatic activations. */
const motionOK = (e = gesture) => !reducedMotion() && !document.hidden && (e == null || !fromKeys(e));
/** Swap a short text with a 2px-blur settle (--d-swap). Reduced motion: a short linear opacity fade. */
function swapText(el, text, { instant = false } = {}) {
  if (!el || el.textContent === text) return;
  el.textContent = text;
  if (reducedMotion()) { if (!instant) el.animate({ opacity: [0.4, 1] }, { duration: T.rmIn, easing: 'linear' }); return; }
  if (!instant && motionOK()) el.animate({ opacity: [0.6, 1], filter: ['blur(2px)', 'blur(0)'] }, { duration: T.swap, easing: T.easeOut });
}
/** A parent whose own text changed (mixed with icons or other spans): settle it with opacity only (it may have a background). */
function settle(el) {
  if (reducedMotion()) { el.animate({ opacity: [0.4, 1] }, { duration: T.rmIn, easing: 'linear' }); return; }
  if (motionOK()) el.animate({ opacity: [0.6, 1] }, { duration: T.swap, easing: T.easeOut });
}
/** A node that a patch inserted: fades in. A field error drops 4px into place as it fades (--d-reveal, QA plan 8.3). */
function enter(el) {
  if (el.nodeType !== 1) return;
  if (reducedMotion()) { el.animate({ opacity: [0, 1] }, { duration: T.rmIn, easing: 'linear' }); return; }
  if (!motionOK()) return;
  if (el.classList.contains('field-error')) el.animate({ opacity: [0, 1], translate: ['0 -4px', '0 0'] }, { duration: T.reveal, easing: T.easeOut });
  else el.animate({ opacity: [0, 1] }, { duration: T.fade, easing: T.easeOut });
}
/** First number in a string ("1,245 pts" → 1245, "5–10" → 5); NaN when there is none. */
const firstNum = (s) => parseFloat((String(s).match(/-?\d[\d,]*(\.\d+)?/)?.[0] ?? '').replace(/,/g, ''));
const dirOf = (from, to) => Math.sign(firstNum(to) - firstNum(from)) || 1;
/** Roll the characters that changed. Every digit moves one way (dir = sign of the value change), so a 9→0 carry never
 *  runs backwards. The rest state is plain text, so textContent (tests, assistive tech) is always the real value. */
function rollText(el, next, dir = 1, { instant = false } = {}) {
  if (!el) return;
  next = String(next);
  const prev = el.dataset.rollTo ?? el.textContent; // the logical value, even mid-roll
  if (prev === next) return;
  el.dataset.rollTo = next;
  const token = (el._roll = (el._roll ?? 0) + 1);
  el.getAnimations({ subtree: true }).forEach((x) => x.cancel()); // an older roll's finally sees a stale token and does nothing
  if (instant || !motionOK()) {
    el.textContent = next;
    el.classList.remove('is-rolling');
    if (reducedMotion() && !instant) el.animate({ opacity: [0.4, 1] }, { duration: T.rmIn, easing: 'linear' });
    return;
  }
  const a = [...prev].reverse(), b = [...next].reverse(), cells = [];
  el.textContent = '';
  el.classList.add('is-rolling');
  el.style.setProperty('--dir', dir);
  // A digit that goes away (245 → 45) rolls out in a cell that keeps its width until the roll ends.
  Array.from({ length: Math.max(a.length, b.length) }, (_, i) => b[i]).forEach((ch, i) => {
    const c = document.createElement('span');
    c.className = 'rl';
    if (ch === undefined) {
      const ghost = document.createElement('span');
      ghost.className = 'rl-ghost';
      ghost.setAttribute('aria-hidden', 'true');
      ghost.textContent = a[i];
      c.append(ghost);
    } else c.textContent = ch;
    if (a[i] !== ch) {
      const o = document.createElement('span');
      o.className = 'rl-old';
      o.setAttribute('aria-hidden', 'true');
      o.textContent = a[i] ?? '';
      c.append(o);
      cells.push(c.animate({ translate: [`0 ${0.75 * dir}em`, '0 0'] }, { duration: T.roll, easing: T.easeOut }));
      o.animate({ opacity: [1, 0] }, { duration: T.icon, easing: T.easeOut, fill: 'forwards' });
    }
    el.prepend(c);
  });
  Promise.all(cells.map((x) => x.finished)).catch(() => {}).finally(() => {
    if (el._roll === token) { el.textContent = next; el.classList.remove('is-rolling'); }
  });
}
/** FLIP: measure, mutate, then glide the survivors back from their old spots (--d-flip, --ease-in-out). */
function flip(nodes, mutate, { duration = T.flip, easing = T.easeInOut } = {}) {
  const first = new Map(nodes.map((n) => [n, n.getBoundingClientRect()]));
  mutate();
  if (!motionOK()) return;
  first.forEach((r, n) => {
    if (!n.isConnected) return;
    const r2 = n.getBoundingClientRect();
    const dx = r.left - r2.left, dy = r.top - r2.top;
    if (Math.abs(dx) + Math.abs(dy) > 0.5) n.animate({ translate: [`${dx}px ${dy}px`, '0 0'] }, { duration, easing, composite: 'add' });
  });
}
/** An element changes height in place (a live estimate collapsing to "Out of date"): what follows it glides to its new
 *  place on transforms (--d-tray), so nothing jumps under the thumb and no layout shift is recorded. Scroll anchoring
 *  is held off for the change, so the element's top stays put on every engine. */
function glideBelow(el, mutate) {
  const parent = el.parentElement;
  const after = parent ? [...parent.children].slice([...parent.children].indexOf(el) + 1) : [];
  const vh = window.innerHeight;
  const seen = after.filter((n) => { const r = n.getBoundingClientRect(); return r.bottom > -40 && r.top < vh + 200; });
  const root = document.documentElement;
  root.style.overflowAnchor = 'none';
  flip(seen, mutate, { duration: T.tray });
  requestAnimationFrame(() => requestAnimationFrame(() => { root.style.overflowAnchor = ''; }));
}

/* ---------------- patch in place (QA plan batch 4) ---------------- */
/** Classes the app adds to live nodes after a render; a patch keeps them. */
const LIVE_CLASSES = new Set(['is-target', 'is-rolling', 'is-flash', 'no-slide', 'is-pending', 'is-landing']);
/** Child identity for a patch: tag, id, first class and the item's key (data-key, or the bar, event, idea or group it
 *  shows). Nodes that share it are patched, never rebuilt, so a list item keeps its node when the items around it change. */
const nodeKey = (n) => (n.nodeType === 1 ? `${n.tagName}#${n.id}.${n.classList[0] ?? ''}|${n.dataset?.key ?? n.dataset?.venueRow ?? n.dataset?.event ?? n.dataset?.idea ?? n.dataset?.group ?? ''}` : `#${n.nodeType}`);
/**
 * Patch the live node `from` to match a fresh render `to`, keeping every node whose identity survives: attributes sync
 * (so CSS transitions run), inputs take their checked/disabled state, `.roll` numbers roll (direction from the value),
 * short leaf text swaps with a blur settle, and new nodes fade in. Only a node whose tag changed is replaced.
 * opts.quiet patches with no motion (frequent surfaces, e.g. bar cards on the 15 s tick); opts.skip(node) leaves a node
 * alone; opts.dir forces the roll direction.
 */
function patchTree(from, to, opts = {}) {
  if (!from || !to) return;
  if (from.nodeType !== 1 || to.nodeType !== 1) {
    if (from.nodeType === to.nodeType && from.nodeType !== 1) { if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue; } else from.replaceWith(to);
    return;
  }
  if (from.tagName !== to.tagName) { from.replaceWith(to); if (!opts.quiet) enter(to); return; }
  if (opts.skip?.(from) || from.isEqualNode(to)) return;
  if (from.classList.contains('roll') && to.classList.contains('roll')) {
    rollText(from, to.textContent, opts.dir ?? dirOf(from.dataset.rollTo ?? from.textContent, to.textContent), { instant: opts.quiet });
    return;
  }
  syncAttrs(from, to);
  if (from instanceof HTMLInputElement) { from.checked = to.hasAttribute('checked'); from.disabled = to.hasAttribute('disabled'); }
  if (from instanceof HTMLTextAreaElement) { if (from.defaultValue !== to.value) from.defaultValue = to.value; return; } // what was typed stays
  if (!from.children.length && !to.children.length) {
    if (from.textContent !== to.textContent) swapText(from, to.textContent, { instant: opts.quiet });
    return;
  }
  patchChildren(from, to, opts);
}
/** Pair children by identity in order (greedy): matched pairs are patched, extra live nodes leave, new ones enter. */
function patchChildren(from, to, opts = {}) {
  const a = [...from.childNodes], b = [...to.childNodes];
  const words = (n) => n.nodeType === 3 && n.nodeValue.trim();
  let textChanged = false;
  const pair = (x, y) => { if (words(x) && x.nodeValue !== y.nodeValue) textChanged = true; patchTree(x, y, opts); };
  if (a.length === b.length && a.every((n, i) => nodeKey(n) === nodeKey(b[i]))) a.forEach((n, i) => pair(n, b[i]));
  else {
    let i = 0;
    for (const nb of b) {
      let j = i;
      // A text node pairs only with the text right here: looking ahead for one would skip (and remove) every element up
      // to the next stretch of whitespace, so an inserted item would rebuild everything after it.
      if (nb.nodeType === 3 && (i >= a.length || a[i].nodeType !== 3)) { from.insertBefore(nb, a[i] ?? null); if (words(nb)) textChanged = true; continue; }
      while (j < a.length && nodeKey(a[j]) !== nodeKey(nb)) j += 1;
      if (j === a.length) { from.insertBefore(nb, a[i] ?? null); if (!opts.quiet) enter(nb); if (words(nb)) textChanged = true; continue; }
      for (; i < j; i += 1) a[i].remove();
      pair(a[j], nb);
      i = j + 1;
    }
    for (; i < a.length; i += 1) a[i].remove();
  }
  if (textChanged && !opts.quiet) settle(from);
}
/** HTML → its first element, ready to patch from. */
function fragment(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}
/** Re-render the page and patch it in place (focus, scroll and every surviving node stay). */
function patchPage(fallback) {
  const main = document.getElementById('main');
  preserveFocus(() => {
    const y = window.scrollY;
    const tpl = document.createElement('template');
    tpl.innerHTML = mainHtml();
    patchChildren(main, tpl.content);
    window.scrollTo(0, y);
  }, fallback);
}
/** Capture flash: a white overlay fades from .5 (CSS .is-flash::after; .3 and no settle under reduced motion). */
function flashView(view) {
  if (!view || document.hidden) return;
  const end = () => { clearTimeout(timer); view.removeEventListener('animationend', onEnd); view.classList.remove('is-flash'); };
  const onEnd = (e) => { if (e.target === view && e.pseudoElement === '::after') end(); };
  view.addEventListener('animationend', onEnd);
  const timer = setTimeout(end, Math.max(T.flash, T.rmIn) + 120);
  view.classList.add('is-flash');
}
/** Blocked action: partial keyframes on `translate`, so it composes with a press `scale`. */
const shake = (el, frames = ['0', '-4px', '4px', '-2px', '0']) => motionOK() && el?.animate({ translate: frames }, { duration: T.shake, easing: T.easeOut });
let announceTimer = null;
function announce(text) {
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => { document.getElementById('announcer').textContent = text; }, 350);
}

/* ---------------- focus preservation for in-place re-renders ---------------- */
function focusKey(el) {
  if (!el || el === document.body) return null;
  if (el.id) return `#${CSS.escape(el.id)}`;
  if (el.type === 'radio' && el.name) return `input[name="${CSS.escape(el.name)}"][value="${CSS.escape(el.value)}"]`;
  const attrs = ['data-action', 'data-input', 'data-id', 'data-delta', 'data-window', 'data-filter', 'data-view', 'data-kind', 'data-key', 'data-role', 'data-nav-venue', 'data-s', 'data-code'];
  const sel = attrs.filter((a) => el.hasAttribute(a)).map((a) => `[${a}="${CSS.escape(el.getAttribute(a))}"]`).join('');
  return sel || null;
}
function preserveFocus(fn, fallback = pageHeading) {
  const active = document.activeElement;
  const key = focusKey(active);
  // A stepper button that hits its limit becomes disabled: keep focus on its sibling instead of <body>.
  const sibling = active?.closest?.('.stepper') && active.dataset.action
    ? `.stepper [data-action="${CSS.escape(active.dataset.action)}"]${active.dataset.window ? `[data-window="${CSS.escape(active.dataset.window)}"]` : ''}:not(:disabled)`
    : null;
  fn();
  if (!key) return;
  let el = document.querySelector(key);
  if (!el || el.disabled || !el.isConnected) el = (sibling && document.querySelector(sibling)) || fallback?.() || null;
  if (el && el !== document.activeElement) el.focus({ preventScroll: true });
}
/** The heading that names the current view. */
function pageHeading() {
  return document.getElementById('page-h');
}

/* ---------------- sliding highlights (QA plan batch 3) ---------------- */
const TABS = globalThis.__STORE__ ? ['bars', 'events', 'scan', 'saved', 'profile'] : ['bars', 'events', 'scan', 'points', 'profile'];
let tabIndex = null; // null until a tab is current: the first placement (and the first after a page with no tab) jumps
/** Move the tab bar's pill (CSS .tab-indicator reads --tab-i). It slides alongside the instant content swap. */
function placeTabIndicator(i) {
  const bar = document.querySelector('.tabbar');
  if (!bar) return;
  if (i < 0) { tabIndex = null; return; } // no current tab: the pill hides (CSS) and stays where it was
  if (i === tabIndex) return;
  const ind = bar.querySelector('.tab-indicator');
  const jump = tabIndex == null;
  if (jump && ind) ind.style.transition = 'none';
  bar.style.setProperty('--tab-i', String(i));
  tabIndex = i;
  if (jump && ind) requestAnimationFrame(() => requestAnimationFrame(() => { ind.style.transition = ''; }));
}
/** Bars sort switch (QA plan 3.3): one ink layer, clipped to the selected segment, glides over unequal widths. */
function placeSegInk(seg, animate = true) {
  const b = seg?.querySelector('button[aria-pressed="true"]'), ink = seg?.querySelector('.seg-ink');
  if (!ink) return;
  if (!b || !b.offsetWidth) { if (!b) seg._inkPlaced = false; return; } // nothing selected (A–Z), or hidden (search open)
  const next = [b.offsetLeft, b.offsetTop, b.offsetWidth, b.offsetHeight].map((v) => `${v}px`);
  const keys = ['--x', '--y', '--w', '--h'];
  if (seg._inkPlaced && keys.every((k, i) => seg.style.getPropertyValue(k) === next[i])) return;
  const jump = !animate || !seg._inkPlaced; // the first placement, or back from no selection: no slide
  if (jump) ink.style.transition = 'none';
  keys.forEach((k, i) => seg.style.setProperty(k, next[i]));
  seg._inkPlaced = true;
  if (jump) requestAnimationFrame(() => requestAnimationFrame(() => { ink.style.transition = ''; }));
}
let segObserver = null;
/** After a full Bars render: place the ink at once, and again (no slide) whenever a segment changes size. */
function watchSortSeg() {
  segObserver?.disconnect();
  const seg = document.querySelector('#main .sort-seg'); // never a fading copy of the last page
  if (!seg) return;
  placeSegInk(seg, false);
  if (!('ResizeObserver' in window)) return;
  segObserver = new ResizeObserver(() => placeSegInk(seg, false));
  [seg, ...seg.querySelectorAll('button')].forEach((n) => segObserver.observe(n));
}
/** Selected controls that keep their nodes when a page is patched: segmented thumbs slide, switches glide, steppers swap. */
const KEEP = '.segmented, .switch, .stepper';
const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('\u0000');
/** Attributes follow the fresh render, except state the page added itself: an open <details>, a roll in flight, and the
 *  live classes (LIVE_CLASSES). */
function syncAttrs(x, y) {
  const keep = (name) => (name === 'open' && x.tagName === 'DETAILS') || name === 'data-roll-to';
  const live = [...x.classList].filter((c) => LIVE_CLASSES.has(c) && !y.classList.contains(c));
  for (const { name } of [...x.attributes]) if (!y.hasAttribute(name) && !keep(name) && !(name === 'class' && live.length)) x.removeAttribute(name);
  for (const { name, value } of [...y.attributes]) {
    const v = name === 'class' && live.length ? [value, ...live].join(' ') : value;
    if (x.getAttribute(name) !== v) x.setAttribute(name, v);
  }
  if (live.length && !y.hasAttribute('class')) x.setAttribute('class', live.join(' '));
}
/** Bring a kept control in line with its fresh render. False when its shape changed (the caller swaps it whole). */
function syncKept(from, to) {
  const a = [from, ...from.querySelectorAll('*')], b = [to, ...to.querySelectorAll('*')];
  if (a.length !== b.length || a.some((x, i) => x.tagName !== b[i].tagName || x.children.length !== b[i].children.length || (x.children.length && ownText(x) !== ownText(b[i])))) return false;
  // A thumb with nothing selected yet appears in place instead of sliding in from the first segment.
  const appear = from.hasAttribute('data-empty') && !to.hasAttribute('data-empty');
  a.forEach((x, i) => {
    const y = b[i];
    syncAttrs(x, y);
    if (x instanceof HTMLInputElement) { x.checked = y.hasAttribute('checked'); x.disabled = y.hasAttribute('disabled'); }
    if (!x.children.length && x.textContent !== y.textContent) swapText(x, y.textContent);
  });
  if (appear) { from.classList.add('no-slide'); requestAnimationFrame(() => requestAnimationFrame(() => from.classList.remove('no-slide'))); }
  return true;
}
/** Make the live node `from` match the fresh `to`. Subtrees with nothing to keep are swapped whole, and only when they
 *  differ; the path down to a kept control is patched node by node. The result always equals the fresh render. */
function morphKeep(from, to) {
  if (from.nodeType !== 1 || to.nodeType !== 1 || from.tagName !== to.tagName) { if (!from.isEqualNode(to)) from.replaceWith(to); return; }
  if (from.matches(KEEP)) { if (!syncKept(from, to)) from.replaceWith(to); return; }
  if (!from.querySelector(KEEP) || from.childNodes.length !== to.childNodes.length) { if (!from.isEqualNode(to)) from.replaceWith(to); return; }
  syncAttrs(from, to);
  const a = [...from.childNodes], b = [...to.childNodes];
  a.forEach((n, i) => morphKeep(n, b[i]));
}
/** Re-render the page in place: like rerenderPage, but selected controls keep their nodes, so their motion runs. */
function patchMain(fallback) {
  const main = document.getElementById('main');
  preserveFocus(() => {
    const y = window.scrollY;
    const tpl = document.createElement('template');
    tpl.innerHTML = mainHtml();
    const a = [...main.childNodes], b = [...tpl.content.childNodes];
    if (a.length !== b.length) main.replaceChildren(tpl.content);
    else a.forEach((n, i) => morphKeep(n, b[i]));
    window.scrollTo(0, y);
  }, fallback);
}

/* ---------------- lists, forms and the rare success beats (QA plan batch 8) ---------------- */
/** A rare pop (--spring-pop, 2.8% peak). iOS runs linear() springs on the main thread, and an engine without linear()
 *  has no spring to run: both get the composited cubic over --d-reveal instead. */
const popTiming = () => (CSS.supports('-webkit-touch-callout', 'none') || !CSS.supports('transition-timing-function', 'linear(0, 1)')
  ? { duration: T.reveal, easing: T.easeOut } : { duration: T.springPopMs, easing: T.springPop });
/** What identifies a list item across a re-render: its key (data-key, or the bar, event, idea or group it shows), its
 *  heading, else the node itself (only a node that survives the render can then be paired). */
const itemKey = (n) => n.dataset.key ?? n.dataset.venueRow ?? n.dataset.event ?? n.dataset.idea ?? n.dataset.group ?? (n.id || n.getAttribute('aria-labelledby')) ?? n;
/** Items that go fade and shrink (--d-toast-out) and stop taking taps; the promise resolves once they're out of sight.
 *  Null when there is nothing to wait for (no items, or a keyboard or scripted change: instant). Reduced motion: a short
 *  linear fade, no scale. */
function exitItems(nodes, { scale = 0.98 } = {}) {
  const live = nodes.filter((n) => n?.isConnected && !n.classList.contains('is-leaving'));
  const rm = reducedMotion();
  if (!live.length || (!rm && !motionOK())) return null;
  live.forEach((n) => { n.inert = true; n.classList.add('is-leaving'); });
  return Promise.all(live.map((n) => n.animate(rm ? { opacity: [1, 0] } : { opacity: [1, 0], scale: [1, scale] },
    { duration: rm ? T.rmOut : T.toastOut, easing: rm ? 'linear' : T.easeOut, fill: 'forwards' }).finished.catch(() => {}))).then(() => {});
}
/** Items that arrive rise into place (8px, --d-reveal) as they fade in. Reduced motion: a short linear fade. */
function riseItems(nodes, from = () => '0 8px') {
  nodes.forEach((n) => {
    n.getAnimations().forEach((a) => { if (!(a instanceof CSSTransition)) a.cancel(); }); // the patch's own fade-in
    if (reducedMotion()) n.animate({ opacity: [0, 1] }, { duration: T.rmIn, easing: 'linear' });
    else if (motionOK()) n.animate({ opacity: [0, 1], translate: [from(n), '0 0'] }, { duration: T.reveal, easing: T.easeOut });
  });
}
/**
 * FLIP across a re-render: elements matching `sel` are paired before and after by itemKey, so a node the render replaced
 * still glides from where its twin was. Those on screen glide back from their old spots (--d-flip, in-out); an item inside
 * a moving one only makes up the difference. Scroll anchoring is held off, so nothing above the change moves. Returns the
 * keyed items that are new (the caller brings them in).
 */
function flipItems(sel, mutate) {
  const vh = window.innerHeight;
  const first = new Map(), before = new Set();
  document.querySelectorAll(sel).forEach((n) => {
    if (n.classList.contains('is-leaving')) return;
    const k = itemKey(n), r = n.getBoundingClientRect();
    before.add(k);
    if (r.bottom > -40 && r.top < vh + 200) first.set(k, r);
  });
  const root = document.documentElement;
  root.style.overflowAnchor = 'none';
  mutate();
  requestAnimationFrame(() => requestAnimationFrame(() => { root.style.overflowAnchor = ''; }));
  // Every new box is read before any animation starts: a just-started animation applies its first frame at once, so a
  // child read after its moving parent would already include the parent's offset and get it subtracted twice.
  const fresh = [], paired = [];
  document.querySelectorAll(sel).forEach((n) => {
    const k = itemKey(n);
    if (!before.has(k)) { if (typeof k === 'string') fresh.push(n); return; }
    const r0 = first.get(k);
    if (r0) paired.push([n, r0, n.getBoundingClientRect()]);
  });
  const moved = [];
  for (const [n, r0, r] of paired) {
    let dx = r0.left - r.left, dy = r0.top - r.top;
    const outer = moved.findLast((m) => m.n.contains(n));
    if (outer) { dx -= outer.dx; dy -= outer.dy; }
    moved.push({ n, dx: dx + (outer?.dx ?? 0), dy: dy + (outer?.dy ?? 0) });
    if (motionOK() && Math.abs(dx) + Math.abs(dy) > 0.5) n.animate({ translate: [`${dx}px ${dy}px`, '0 0'] }, { duration: T.flip, easing: T.easeInOut, composite: 'add' });
  }
  return fresh;
}
/**
 * One list change (QA plan 8.1): what leaves fades out first; then the page updates (`render`), what stays glides into
 * place and what's new rises in (`rise` picks the side). `after` runs once the page has updated, with the new items: at
 * once for a keyboard or scripted change (no exit to wait for), so focus moves in the same task.
 */
function updateList({ sel, render, leaving = [], after, rise, visit = app.visit }) {
  const run = () => { const fresh = flipItems(sel, render); riseItems(fresh, rise); after?.(fresh); };
  const out = exitItems(leaving);
  // A navigation during the exit already rendered the new state: never patch (or refocus) a page that isn't this one.
  if (out) out.then(() => { if (app.visit === visit) run(); }); else run();
}
/** A field that failed (QA plan 8.3): it scrolls to the middle of the screen (smoothly, for a pointer), takes focus
 *  without a second jump, and its control shakes once. */
function focusInvalid(el, shakeEl) {
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: motionOK() ? 'smooth' : 'auto' });
  el.focus({ preventScroll: true });
  shake(shakeEl ?? el.closest('.select, .input-prefix, .check, .radio-row, .window-grid') ?? el);
}
/** Draw a check (its path) in over --d-fade; resolves when it's drawn. */
function drawStroke(path, { delay = 0 } = {}) {
  if (!path?.getTotalLength) return Promise.resolve();
  const len = path.getTotalLength();
  path.style.strokeDasharray = `${len} ${len}`;
  const a = path.animate({ strokeDashoffset: [len, 0] }, { duration: T.fade, delay, easing: T.easeOut, fill: 'backwards' });
  return a.finished.catch(() => {}).then(() => { path.style.strokeDasharray = ''; });
}
/** Where an element sits without its transforms (offsets ignore a running FLIP), in viewport coordinates. */
function layoutRect(el) {
  let x = 0, y = 0;
  for (let n = el; n; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
  return { left: x - window.scrollX, top: y - window.scrollY, width: el.offsetWidth, height: el.offsetHeight };
}

/* ---------------- rendering ---------------- */
const TAB_OF = globalThis.__STORE__
  ? { tonight: 'bars', venue: 'bars', events: 'events', scan: 'scan', saved: 'saved', profile: 'profile', about: 'profile' }
  : { tonight: 'bars', venue: 'bars', pass: 'bars', events: 'events', ideaNew: 'events', groups: 'events', groupNew: 'events', scan: 'scan', points: 'points', passes: 'points', passDetail: 'points', profile: 'profile', saved: 'profile', console: 'profile', about: 'profile' };
/** Screens that exist only in the team build (they need payments, accounts or moderation the App Store app doesn't have yet). */
const TEAM_ONLY = new Set(['pass', 'passes', 'passDetail', 'console', 'ideaNew', 'groups', 'groupNew', 'points']);
/** Screens a live team build hides: their sample people, prices and passes must never sit next to server data. */
const LIVE_HIDDEN = new Set(['pass', 'passes', 'passDetail', 'ideaNew', 'groups', 'groupNew']);
function renderShell() {
  const r = app.route;
  // Passes sits under Points but also opens from Profile: the highlighted tab follows where it was opened (as its Back does).
  const tab = r.name === 'passes' && app.passesFrom === 'profile' ? 'profile' : TAB_OF[r.name];
  document.querySelectorAll('[data-tab]').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  placeTabIndicator(TABS.indexOf(tab));
  const tonightTab = document.querySelector('[data-tab="bars"]');
  if (tonightTab) tonightTab.setAttribute('href', app.lastExploreHash);
  updateBadge();
  // Back from Scan (it hides the top bar): the chip rolls from what it last showed once the new page has painted.
  if (chipBehind && r.name !== 'scan' && !app.ui.holdPoints) { chipBehind = false; requestAnimationFrame(() => requestAnimationFrame(updatePointsChip)); } else updatePointsChip();
}
const fmtPts = (n) => new Intl.NumberFormat('en-US').format(n);
let chipBehind = false; // the balance changed while the chip couldn't be seen
/** Keep the top-right points chip (and the balance on Points and Profile) in step with the ledger (QA plan 4.4). The value
 *  rolls in place; a contribution (a line report, "I got in", the daily login) also nods the star once. While the chip is
 *  out of sight (Scan hides the top bar; the check-in sheet covers it) it keeps the last value it showed. */
function updatePointsChip() {
  if (globalThis.__STORE__ || LIVE) return; // a live team build has no local points to show
  const slot = document.getElementById('demo-slot');
  if (!slot) return;
  const bal = balanceOf(app.state.points);
  const last = app.state.points.at(-1);
  const value = slot.querySelector('[data-pts-value]');
  if (!value) { slot.innerHTML = pointsChip(bal); slot.dataset.balance = String(bal); slot.dataset.entry = last?.id ?? ''; return; }
  if (app.ui.holdPoints || app.route?.name === 'scan') { chipBehind = true; return; }
  const prev = Number(slot.dataset.balance);
  const earned = slot.dataset.entry !== (last?.id ?? '') && bal > prev && last.delta > 0 && !last.id.startsWith('p-ci-');
  slot.dataset.balance = String(bal);
  slot.dataset.entry = last?.id ?? '';
  if (prev === bal) return;
  const dir = Math.sign(bal - prev);
  slot.firstElementChild?.setAttribute('aria-label', `${fmtPts(bal)} points. Open Points`);
  [value, ...document.querySelectorAll('#main [data-points-total], #main [data-points-fact]')].forEach((el) => rollText(el, fmtPts(bal), dir));
  // Check-ins, redemptions and their Undo only roll (never celebrate going out or spending).
  if (earned && motionOK()) {
    slot.querySelector('.pts-chip > .ic')?.animate([
      { scale: 1, rotate: '0deg', easing: T.easeOut }, { scale: 1.1, rotate: '10deg', offset: 0.4, easing: T.easeInOut }, { scale: 1, rotate: '0deg' },
    ], { duration: T.boop, easing: 'linear' }); // eased per segment: up quickly, settle back
  }
}
/** Points page after a ledger change: patched in place, so the balance rolls and the progress bar fills from where it was.
 *  A new target reward restarts the bar from empty instead of draining it backwards. */
function patchPoints() {
  const track = document.querySelector('#main .pn-track');
  const next = nextReward(balanceOf(app.state.points));
  const bar = track?.querySelector('i');
  if (bar && next && track.dataset.reward !== next.reward.id) {
    bar.style.transition = 'none';
    bar.style.setProperty('--pn', '0');
    getComputedStyle(bar).transform; // commit the empty bar before the patch sets the new value
  }
  patchPage();
}
/** The check-in sheet earned points behind its scrim: show them once it has closed (the balance rolls in view). */
function releasePoints() {
  if (!app.ui.holdPoints) return;
  app.ui.holdPoints = false;
  if (app.route?.name === 'points') patchPoints();
  updatePointsChip();
}
function updateBadge() {
  const active = app.state.passes.filter((p) => ['upcoming', 'active'].includes(passStatus(p, now()))).length;
  const badge = document.querySelector('[data-pass-badge]');
  if (badge) { badge.textContent = active ? String(active) : ''; badge.hidden = !active; }
  const sr = document.querySelector('[data-pass-badge-sr]');
  if (sr) sr.textContent = active ? `, ${active} active` : '';
}

function mainHtml() {
  const r = app.route;
  const c = ctx();
  switch (r.name) {
    case 'tonight':
    case 'venue':
    case 'pass': {
      const id = r.name === 'tonight' ? null : r.params.id;
      return id ? renderVenue(c, id) : `<div class="page">${renderExplore(c)}</div>`;
    }
    case 'saved': return renderSaved(c);
    case 'passes': if (!globalThis.__STORE__) return renderPasses(c); break;
    case 'passDetail': if (!globalThis.__STORE__) return renderPassDetail(c, r.params.id); break;
    case 'console': if (!globalThis.__STORE__) return renderConsole(c); break;
    case 'about': return (globalThis.__STORE__ || LIVE) ? renderAboutStore(c, { version: APP_VERSION }) : renderAbout(c);
    case 'events': return renderEvents(c);
    case 'groups': if (!globalThis.__STORE__) return renderGroups(c); break;
    case 'groupNew': if (!globalThis.__STORE__) return renderGroupNew(c, app.groupDraft ?? newGroupDraft(), app.groupErrors); break;
    case 'ideaNew': if (!globalThis.__STORE__) return renderIdeaNew(c, app.ideaDraft ?? newIdeaDraft(), app.ideaErrors); break;
    case 'scan': return renderScan(c, app.scan);
    case 'points': if (!globalThis.__STORE__) return renderPoints(c); break;
    case 'profile': return globalThis.__STORE__ ? renderProfileStore(c, { confirmDelete: app.ui.confirmDelete, deleting: app.ui.deleting, linked: api.hasAccount(), unreachable: unreachableReports() }) : renderProfile(c, app.profileEdit, LIVE ? { confirmDelete: app.ui.confirmDelete, deleting: app.ui.deleting, linked: api.hasAccount(), unreachable: unreachableReports(), venueSignedIn: venueApi.signedIn() } : null);
    default:
      return `<div class="page"><div class="state"><div class="state-icon">${icon('help')}</div><h1 id="page-h" tabindex="-1">Page not found</h1><p>That link doesn’t match anything.</p><div class="actions"><a class="btn btn-primary" href="#/">Go to bars</a></div></div></div>`;
  }
}

/** A screen that failed to draw shows a way out instead of a blank page (and the error goes to the console). */
function errorHtml(err) {
  console.error(err);
  return `<div class="page"><div class="state"><div class="state-icon">${icon('help')}</div><h1 id="page-h" tabindex="-1">Something went wrong</h1><p>This screen couldn’t load. Your saved bars${(globalThis.__STORE__ || LIVE) ? '' : ' and points'} are safe.</p><div class="actions"><a class="btn btn-primary" href="#/">Go to bars</a><button type="button" class="btn" data-action="reload-app">Reload</button></div></div></div>`;
}

/** scroll: 'restore' (Back/Forward), 'top' (new navigation) or 'keep' (in-place refresh). */
function render({ focus = 'heading', scroll = 'keep' } = {}) {
  if (!document.getElementById('picker')?.open) app.ui.holdPoints = false;
  renderShell();
  const main = document.getElementById('main');
  const railList = main.querySelector('.deals-rail:not(.sk-rail) .rail-list');
  if (railList) railScroll = railList.scrollLeft;
  let html;
  try { html = mainHtml(); } catch (err) { html = errorHtml(err); }
  main.innerHTML = html;
  restoreRail(main.querySelector('.deals-rail:not(.sk-rail) .rail-list'));
  revealPhotos(main);
  app.renderedHash = location.hash || '#/';
  // A bar id that isn't listed renders a plain not-found page: it keeps the top bar (the hero layout is for a real bar).
  document.body.dataset.route = ['venue', 'pass'].includes(app.route?.name) ? (app.venues.some((v) => v.id === app.route.params.id) ? 'venue' : 'notfound') : app.route?.name ?? '';
  watchMasthead();
  watchSortSeg();
  liftToasts();
  const banners = document.getElementById('explore-banners');
  if (banners) banners.dataset.sig = exploreBanners(ctx());
  const h1 = main.querySelector('h1');
  document.title = `${h1 ? `${h1.textContent.trim()} · ` : ''}${APP_NAME}`;
  syncSheet();
  if (scroll === 'restore') window.scrollTo(0, app.scroll.get(app.renderedHash) ?? 0);
  else if (scroll === 'top') window.scrollTo(0, 0);
  const dealTarget = app.route?.name === 'venue' && app.route.query.deal ? document.getElementById(`deal-${app.route.query.deal}`) : null;
  if (dealTarget) {
    // Opened from a deal tile: land on that deal's details on the bar page (a deal link never flies the photo).
    dealTarget.classList.add('is-target');
    const land = () => requestAnimationFrame(() => dealTarget.isConnected && dealTarget.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' }));
    land();
    dealTarget.focus({ preventScroll: true });
  } else if (focus === 'heading') {
    pageHeading()?.focus({ preventScroll: true });
  } else if (focus === 'venue' && app.lastVenueId) {
    const link = document.querySelector(`[data-nav-venue="${CSS.escape(app.lastVenueId)}"]`);
    (link ?? pageHeading())?.focus({ preventScroll: true });
  }
}

/** Bars banners (QA plan 6.8): one that goes fades out (--d-toast-out) and then the list glides up into its place; one
 *  that arrives drops 4px in (--d-reveal) while the list glides down to make room (transforms only, so nothing jumps
 *  and no layout shift is recorded). Banners that stay are patched, so a role="alert" banner isn't re-announced on every
 *  keystroke. Reduced motion: fades only, the space closes at once. Keyboard: instant. */
function updateBanners() {
  const box = document.getElementById('explore-banners');
  if (!box) return;
  const html = exploreBanners(ctx());
  if (box.dataset.sig === html) return;
  box.dataset.sig = html;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const fresh = [...tpl.content.children];
  const kind = (n) => [...n.classList].find((c) => c.startsWith('banner-')) ?? '';
  const live = [...box.children].filter((n) => !n.classList.contains('is-leaving'));
  const rm = reducedMotion(), moving = motionOK();
  const leaving = live.filter((n) => !fresh.some((f) => kind(f) === kind(n)));
  if (leaving.some((n) => n.contains(document.activeElement))) listHeading()?.focus({ preventScroll: true });
  if (!moving && !rm) { box.replaceChildren(...fresh.map((f) => { const o = live.find((n) => kind(n) === kind(f)); if (o) { patchTree(o, f, { quiet: true }); return o; } return f; })); return; }
  // Stay: patch. Arrive: insert in order and fade in.
  let at = null;
  [...fresh].reverse().forEach((f) => {
    const o = live.find((n) => kind(n) === kind(f) && !leaving.includes(n));
    if (o) { patchTree(o, f, { quiet: true }); at = o; return; }
    const put = () => box.insertBefore(f, at && at.parentNode === box ? at : box.querySelector(':scope > .banner:not(.is-leaving)') ?? null);
    if (rm) { put(); f.animate({ opacity: [0, 1] }, { duration: T.rmIn, easing: 'linear' }); } else {
      glideBelow(box, put);
      f.animate({ opacity: [0, 1], translate: ['0 -4px', '0 0'] }, { duration: T.reveal, easing: T.easeOut });
    }
    at = f;
  });
  leaving.forEach((n) => {
    n.classList.add('is-leaving');
    n.inert = true;
    const gone = () => { if (!n.isConnected) return; if (rm) n.remove(); else glideBelow(box, () => n.remove()); };
    n.animate({ opacity: [1, 0] }, { duration: rm ? T.rmOut : T.toastOut, easing: rm ? 'linear' : T.easeOut, fill: 'forwards' }).finished.then(gone, gone);
  });
}
const listHeading = () => document.getElementById('page-h');
function renderResultsOnly({ announceCount = true } = {}) {
  const results = document.getElementById('results');
  if (!results) return;
  endNavMotion(); // a card can move or change: a photo still landing on it lands now
  preserveFocus(() => {
    patchResults(results, exploreResults(ctx()));
    results.setAttribute('aria-busy', String(app.ui.loading));
    updateBanners();
    const clearBtn = document.querySelector('[data-action="clear-search"].clear');
    if (clearBtn) clearBtn.hidden = !app.explore.q;
    // The sort switch is patched in place (its ink glides, focus stays); only the extra chips are rebuilt.
    const chips = document.querySelector('#explore-search .chips');
    const seg = chips?.querySelector('.sort-seg');
    if (seg) {
      const current = quickViewOf(app.explore);
      seg.querySelectorAll('button[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === current)));
      const extra = extraChips(ctx());
      if (chips._extra !== extra) { chips.querySelectorAll(':scope > .chip-x').forEach((n) => n.remove()); seg.insertAdjacentHTML('afterend', extra); chips._extra = extra; }
      placeSegInk(seg);
    } else if (chips) chips.innerHTML = exploreChips(ctx());
    const mapBtn = document.querySelector('#explore-search .map-btn');
    if (mapBtn) {
      const onMap = app.explore.view === 'map';
      mapBtn.dataset.view = onMap ? 'list' : 'map';
      mapBtn.setAttribute('aria-pressed', String(onMap));
      // A toggle keeps one name; aria-pressed says whether the map is on (and picks which glyph CSS draws).
    }
  }, listHeading);
  liftToasts();
  if (announceCount && !app.ui.loading) {
    const { total } = exploreList(app.venues, app.explore, now(), savedSet());
    announce(total ? `${total} bar${total === 1 ? '' : 's'} shown` : 'No bars match');
  }
}

/* ---------------- Bars results, patched in place (QA plan 6.4-6.7) ---------------- */
/** A list photo that isn't decoded yet starts transparent and fades in once it is (--d-reveal); a cached one shows at
 *  once. Each image is seen once: a card that is kept is never faded again. */
function revealPhotos(root) {
  root?.querySelectorAll(':is(.bar-photo, .rail-photo) > img').forEach((img) => {
    if (img._seen) return;
    img._seen = true;
    if (img.complete && img.naturalWidth) return;
    img.classList.add('is-pending');
    const show = () => img.classList.remove('is-pending');
    const ready = () => (img.decode ? img.decode().then(show, show) : show());
    if (img.complete) ready();
    else { img.addEventListener('load', ready, { once: true }); img.addEventListener('error', show, { once: true }); }
  });
}
let railScroll = 0; // where the deals row was scrolled, while it is away (Shortest line, map, search)
/** Move a node that may already be in the page, keeping its focus and state where the browser can (moveBefore). */
function moveNode(parent, node, ref) {
  if (parent.moveBefore && node.isConnected && parent.isConnected) { try { parent.moveBefore(node, ref); return; } catch { /* fall through */ } }
  parent.insertBefore(node, ref);
}
const resultsKind = (n) => (n.matches('.sk-group') ? 'sk' : n.matches('.results-bar') ? 'bar' : n.matches('.deals-rail') ? 'rail' : n.matches('ul.bar-grid') ? 'grid'
  : n.matches('.group-title') ? 'gt' : n.matches('.map-wrap') ? 'map' : n.matches('.map-preview') ? 'preview' : `${n.tagName}.${n.classList[0] ?? ''}`);
/** Bring a new deals row back to where the last one was scrolled (no smooth scroll). */
function restoreRail(list) {
  if (!list || !railScroll) return;
  list.style.scrollBehavior = 'auto';
  list.scrollLeft = railScroll;
  list.style.scrollBehavior = '';
}
/**
 * The Bars results after a sort, filter, search, area change or refresh. Cards are keyed by bar and kept: their photos
 * are never recreated, and the order changes at once (frequent: no motion). The results bar is patched (the count and
 * "Updated" swap, Refresh stops spinning and settles), the deals row is kept while its deals are the same (so it keeps
 * its scroll), and only new nodes fade in. The first arrival replaces the skeleton with one short fade, no stagger.
 */
function patchResults(box, html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const fresh = [...tpl.content.children];
  [...box.childNodes].forEach((n) => { if (n.nodeType !== 1) n.remove(); });
  const live = [...box.children];
  const liveList = box.querySelector(':scope > .deals-rail:not(.sk-rail) .rail-list');
  if (liveList) railScroll = liveList.scrollLeft;
  const wasSk = live.some((n) => n.matches('.sk-group')), isSk = fresh.some((n) => n.matches('.sk-group'));
  if (!live.length || wasSk || isSk) {
    box.replaceChildren(...fresh);
    restoreRail(box.querySelector(':scope > .deals-rail .rail-list'));
    revealPhotos(box);
    // Skeleton -> results: the on-screen parts fade in as small layers, not the whole page-tall box (MJ9); under the
    // splash nothing shows yet, so nothing fades.
    if (wasSk && !isSk && !document.getElementById('splash')) {
      const parts = onScreenParts(box);
      if (reducedMotion()) parts.forEach((el) => el.animate({ opacity: [0, 1] }, { duration: T.rmIn, easing: 'linear' }));
      else if (motionOK()) parts.forEach((el) => el.animate({ opacity: [0, 1] }, { duration: T.fade, easing: T.easeOut }));
    }
    return;
  }
  const pool = new Map([...box.querySelectorAll('li.bar-card[data-venue-row]')].map((li) => [li.dataset.venueRow, li]));
  const byKind = new Map();
  live.forEach((n) => { const k = resultsKind(n); if (!byKind.has(k)) byKind.set(k, []); byKind.get(k).push(n); });
  const added = [];
  const plan = fresh.map((n) => {
    const k = resultsKind(n);
    const old = byKind.get(k)?.shift();
    if (k === 'grid') {
      const cards = [...n.children].map((li) => {
        const o = pool.get(li.dataset.venueRow);
        if (!o) { added.push(li); return li; }
        pool.delete(li.dataset.venueRow);
        patchTree(o, li, { quiet: true });
        return o;
      });
      if (old) syncAttrs(old, n);
      return { node: old ?? n, cards };
    }
    if (!old) { added.push(n); return { node: n }; }
    if (k === 'bar') { patchResultsBar(old, n); return { node: old }; }
    if (k === 'rail' && (old.dataset.railSig ?? '') !== (n.dataset.railSig ?? '')) { added.push(n); return { node: n }; }
    if (!old.isEqualNode(n)) patchTree(old, n, { quiet: true });
    return { node: old };
  });
  plan.forEach(({ node }, i) => { if (box.children[i] !== node) moveNode(box, node, box.children[i] ?? null); });
  while (box.children.length > plan.length) box.lastElementChild.remove();
  plan.forEach(({ node, cards }) => {
    if (!cards) return;
    cards.forEach((li, i) => { if (node.children[i] !== li) moveNode(node, li, node.children[i] ?? null); });
    while (node.children.length > cards.length) node.lastElementChild.remove();
  });
  const rail = box.querySelector(':scope > .deals-rail');
  if (rail && added.includes(rail)) restoreRail(rail.querySelector('.rail-list'));
  revealPhotos(box);
  if (added.length && (motionOK() || reducedMotion())) added.forEach(enter);
}
/** Results bar: patched in place. When a refresh ends, the spinning icon settles on to its next full turn (--d-press-up). */
function patchResultsBar(bar, next) {
  const ic = bar.querySelector('.refresh-btn .ic');
  const spin = ic?.getAnimations().find((a) => a.animationName === 'spin');
  const turn = spin ? (spin.effect.getComputedTiming().progress ?? 0) * 360 : null;
  patchTree(bar, next);
  if (turn == null || bar.querySelector('.refresh-btn')?.getAttribute('aria-disabled') === 'true' || !motionOK()) return;
  ic.animate({ transform: [`rotate(${turn}deg)`, 'rotate(360deg)'] }, { duration: T.pressUp, easing: T.easeOut });
}
/** Deals row on the live tick (QA plan 6.7): a deal that ends fades its tile out (--d-fade) and the tiles after it close
 *  the gap (FLIP); a deal that starts rebuilds the row at the same scroll position. */
function patchRail(rail, fresh) {
  const list = rail.querySelector('.rail-list');
  const ids = (el) => (el?.dataset.railSig ?? '').split(',').filter(Boolean);
  const a = ids(rail), b = ids(fresh);
  if (!fresh) { glideBelow(rail, () => rail.remove()); return; }
  const kept = a.filter((id) => b.includes(id));
  if (kept.join() === b.join() && list) {
    rail.dataset.railSig = fresh.dataset.railSig;
    const leaving = [...list.children].filter((li) => !b.includes(li.dataset.key));
    const drop = () => { const stay = [...list.children].filter((li) => !leaving.includes(li)); flip(stay, () => leaving.forEach((li) => li.remove())); };
    if (!motionOK()) { leaving.forEach((li) => li.remove()); return; }
    leaving.forEach((li) => { li.inert = true; });
    Promise.all(leaving.map((li) => li.animate({ opacity: [1, 0] }, { duration: T.fade, easing: T.easeOut, fill: 'forwards' }).finished)).then(drop, drop);
    return;
  }
  railScroll = list?.scrollLeft ?? railScroll;
  rail.replaceWith(fresh);
  restoreRail(fresh.querySelector('.rail-list'));
  revealPhotos(fresh);
}

function updateExploreUrl() {
  const hash = buildHash('tonight', {}, exploreQuery(app.explore));
  app.lastExploreHash = hash;
  const r = app.route;
  const target = r.name === 'tonight' ? hash : null;
  if (target) {
    history.replaceState({ ...(history.state ?? {}), idx: histIdx(), explore: { ...app.explore } }, '', target);
    app.renderedHash = target;
  }
  const tonightTab = document.querySelector('[data-tab="bars"]');
  if (tonightTab) tonightTab.setAttribute('href', hash);
}

/* ---------------- routing ---------------- */
let firstRoute = true;
/** The running navigation motion ({ anims, cleanup }), or null. A newer navigation, or a press, ends it at once. */
let activeNav = null;
/** Lists whose cards fly their photo into the bar page's hero, and back (QA plan 5.2). */
const LIST_ROUTES = new Set(['tonight', 'saved', 'events']);
/** Drill-ins (QA plan 5.3). A bar page opens from anywhere; tab roots are never children, so tab taps stay instant. */
const NAV_CHILDREN = { profile: ['saved', 'passes', 'about', 'console'], points: ['passes', 'passDetail'], passes: ['passDetail'], events: ['groups', 'ideaNew', 'groupNew'], groups: ['groupNew'] };
const isChildOf = (child, parent) => (child === 'venue' ? !['venue', 'pass', 'scan'].includes(parent) : !!NAV_CHILDREN[parent]?.includes(child));
/** 'forward' | 'back' | 'present' | 'dismiss', or null for an instant swap (tab to tab, same page, unrelated jumps). */
function navDirection(prev, r, viaPop) {
  if (!prev || prev.name === r.name) return null;
  if (r.name === 'scan') return 'present';
  if (prev.name === 'scan') return 'dismiss';
  if (isChildOf(r.name, prev.name)) return 'forward';
  // Up to the parent: Back, or re-tapping the tab you're under (another tab is a tab switch: instant).
  if (isChildOf(prev.name, r.name) && (viaPop || TAB_OF[prev.name] === TAB_OF[r.name])) return 'back';
  return null;
}
/** The card photo a list link opens from, as a selector that finds it again on Back (stored on the list's history entry). */
function thumbSelector(link) {
  const holder = link?.querySelector(':is([data-thumb], [data-thumb-ev])');
  if (holder?.dataset.thumbEv) return `[data-thumb-ev="${CSS.escape(holder.dataset.thumbEv)}"]`;
  if (holder?.dataset.thumb) return `[data-thumb="${CSS.escape(holder.dataset.thumb)}"]`;
  return null;
}
/** Run fn once the current navigation has rendered. Navigations render synchronously now (the motion runs over the
 *  rendered page), so this is immediate; kept so callers don't depend on how a navigation animates. */
const afterNav = (fn) => fn();
/** End the running navigation motion now: every part jumps to its end and the layers it added go away. */
function endNavMotion() {
  const n = activeNav;
  if (!n) return;
  activeNav = null;
  n.anims.forEach((a) => { try { a.finish(); } catch { a.cancel(); } });
  n.cleanup.splice(0).forEach((f) => f());
}
function startNav() {
  endNavMotion();
  const n = { anims: [], cleanup: [] };
  activeNav = n;
  performance.clearMarks('nav-motion:start');
  performance.clearMarks('nav-motion:built');
  performance.mark('nav-motion:start');
  if (globalThis.__NAV_DEBUG__) requestAnimationFrame(() => { performance.mark('nav:frame1'); requestAnimationFrame(() => performance.mark('nav:frame2')); });
  return n;
}
/** The motion ended on its own: drop its layers, then run the landing touches (only if nothing newer started). */
function landNav(n, after) {
  if (activeNav !== n) return;
  activeNav = null;
  n.cleanup.splice(0).forEach((f) => f());
  after?.();
  performance.clearMarks('nav-motion:end');
  performance.mark('nav-motion:end');
}
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
/** Lab timing of a navigation's steps (tests/web/nav-probe.js turns it on; nothing is recorded otherwise). */
const navStep = (label, fn) => { if (!globalThis.__NAV_DEBUG__) return fn(); performance.mark(`nav:${label}:a`); try { return fn(); } finally { performance.mark(`nav:${label}:b`); } };
/** On screen enough to fly to or from: at least two thirds of it between the top bar and the tab bar. The photo flies
 *  above the top bar, so a photo mostly under a bar would draw over it and then pop under it. */
function inView(r) {
  const top = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
  const bottom = document.querySelector('.tabbar')?.getBoundingClientRect().top || innerHeight;
  return r.height > 24 && Math.min(r.bottom, bottom) - Math.max(r.top, top) >= r.height * (2 / 3);
}
const topBarShown = () => (document.querySelector('.topbar')?.getBoundingClientRect().height ?? 0) > 0;
/** The parts of a page on screen now, as small layers: a page-tall block is split into its children (a page-tall layer
 *  would have to be painted before it could fade). */
function onScreenParts(root, depth = 0) {
  return [...root.children].flatMap((el) => {
    const r = el.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= innerHeight || r.height === 0) return [];
    return r.height > innerHeight * 1.25 && el.children.length && depth < 4 ? onScreenParts(el, depth + 1) : [el];
  });
}
/** The card scrim, faded inside the flying box, only for a photo that has one (bar cards; events and map tiles don't). */
const cardScrimOf = (holder) => (holder?.querySelector(':scope > .card-scrim') ? `${cssVar('--scrim-bottom')}, ${cssVar('--scrim-top')}` : null);
/** The old page is about to move into the fading ghost: remember the deals row's scroll first, as render() would. */
function ghostPage(main, extra, opts) {
  const rail = main.querySelector('.deals-rail:not(.sk-rail) .rail-list');
  if (rail) railScroll = rail.scrollLeft;
  return makeGhost(main, extra, opts);
}
/** Pages whose fading copy costs WebKit two long frames (MJ1: Scan present 74–94 ms, Events → Groups up to 139 ms on
 *  the lab simulator, evidence/journeys-20261028/motion). Leaving one, only the bars go into the fading layer; the old
 *  page is replaced at once and the new page's first screen slides in. */
const HEAVY_PAGES = new Set(['tonight', 'events', 'console']);
/** The new page's content enters: pages slide a little in the direction of travel; the photo flight only fades. */
function enterContent(n, els, { dx = 0, dy = 0, delay = 0, duration = T.navPage } = {}) {
  const rm = reducedMotion();
  els.forEach((el) => {
    if (!el?.animate) return;
    n.anims.push(rm
      ? el.animate({ opacity: [0, 1] }, { duration: T.rmIn, easing: 'linear', fill: 'backwards' })
      // Nothing to move (the photo flights): opacity only, so no transform layer is made for a no-op (MJ4).
      : el.animate(dx || dy ? { opacity: [0, 1], transform: [`translate(${dx}px, ${dy}px)`, 'none'] } : { opacity: [0, 1] }, { duration, delay, easing: T.easeOut, fill: 'backwards' }));
  });
}
/** List -> bar page: the tapped card's photo flies into the hero while the list fades and the page comes up under it. */
function flyToDetail(fromImg, doRender, id) {
  const holder = fromImg.parentElement;
  const from = holder.getBoundingClientRect();
  const fromPos = getComputedStyle(fromImg).objectPosition;
  const radii = cornerRadii(holder);
  const cardScrim = cardScrimOf(holder);
  const cardFilter = getComputedStyle(fromImg).filter; // a closed bar's photo is gray and dim
  // No fading copy of the list here: re-layering the old page cost WebKit a frame of ~55 ms before anything moved (lab,
  // evidence/iphone-motion-20261026). The photo carries the eye; the bar page's first screen fades in under it.
  navStep('render', doRender);
  const n = startNav();
  const hero = document.querySelector(`#main [data-hero="${CSS.escape(id)}"]`);
  const heroImg = hero?.querySelector(':scope > img');
  if (!hero || !heroImg) { Promise.resolve().then(() => landNav(n)); return; }
  heroImg.classList.remove('is-pending');
  hero.classList.add('is-landing');
  // The card and the hero show the same photo file, so it is normally decoded already. The landing still waits for it,
  // at most 300 ms after the flight, so the hero never lands on an empty frame.
  const decoded = heroImg.decode ? heroImg.decode().catch(() => {}) : Promise.resolve();
  const fly = navStep('fly', () => flyPhoto({
    img: fromImg, from, to: heroImg.getBoundingClientRect(), fromPos, toPos: getComputedStyle(heroImg).objectPosition,
    duration: T.navFly, ease: easeFrom(T.easeNav), radius: { end: 'from', r: radii },
    layers: { out: cardScrim, in: cssVar('--scrim-hero') }, cardFilter,
  }));
  n.anims.push(...fly.anims);
  // A Back during the flight takes over from here (route): the photo's place and each layer's current opacity.
  n.flight = { id, el: fly.el, img: fly.img, under: fly.under, card: fly.outLayer, hero: fly.inLayer, dim: fly.dim, anims: fly.anims, remove: fly.remove };
  n.cleanup.push(() => { if (!n.flight.held) fly.remove(); hero.classList.remove('is-landing'); });
  enterContent(n, [...hero.parentElement.children].filter((el) => el !== hero && el.getBoundingClientRect().top < innerHeight), { duration: T.navOut, delay: 40 });
  performance.mark('nav-motion:built');
  fly.finished.then(() => Promise.race([decoded, new Promise((r) => setTimeout(r, 300))])).then(() => landNav(n, () => {
    if (!motionOK(null)) return;
    // The scrim is already showing (the flying box faded it in), so only the title and buttons arrive.
    hero.querySelectorAll(':scope > :not(img, .hero-scrim)').forEach((el) => el.animate({ opacity: [0, 1], transform: ['translateY(6px)', 'none'] }, { duration: T.reveal, easing: T.easeOut }));
  }));
}
/** Bar page -> list (Back): the hero photo flies back into its card, which then shows its name and scrim again. As on
 *  the way in, the old page is not re-layered into a fading copy: only its hero is copied (a few nodes), and the list's
 *  first screen fades in under the photo. `midFlight` (route: the photo's box and picture on screen, and its layers'
 *  opacities) is a Back that interrupted the flight in: the photo turns around from where it is, as it looked, instead
 *  of jumping to the hero first, and the hero's title and buttons, which never showed, stay hidden. */
function flyToList(heroImg, doRender, sel, midFlight = null) {
  const hero = heroImg.parentElement;
  const from = midFlight?.box ?? heroImg.getBoundingClientRect();
  const fromPos = getComputedStyle(heroImg).objectPosition;
  const copy = midFlight ? null : navStep('copy', () => heroCopy(hero));
  try { navStep('render', doRender); } catch (e) { copy?.el.remove(); midFlight?.held.remove(); throw e; }
  const n = startNav();
  if (copy) {
    n.cleanup.push(() => copy.el.remove());
    // The hero's title and buttons fade out above the photo (under it, they would vanish in the first frame).
    n.anims.push(copy.el.animate({ opacity: [1, 0] }, { duration: T.navOut, easing: T.easeOut, fill: 'forwards' }));
  }
  const main = document.getElementById('main');
  const parts = [...(topBarShown() ? [document.querySelector('.topbar')] : []), ...onScreenParts(main)];
  enterContent(n, parts, { duration: T.navOut, delay: 40 });
  const target = sel ? document.querySelector(`#main ${sel} > img`) : null;
  const holder = target?.parentElement;
  const to = holder?.getBoundingClientRect();
  if (!target || !to || !inView(to)) {
    // Nothing on screen to land on: the photo fades out with its copy of the hero, or, stopped mid-flight, as it was.
    const h = midFlight?.held;
    if (h) {
      const fade = { duration: T.navOut, easing: T.easeOut, fill: 'forwards' };
      n.anims.push(h.el.animate({ opacity: [1, 0] }, fade));
      if (h.under) n.anims.push(h.under.animate({ opacity: [midFlight.under, 0] }, fade));
      n.cleanup.push(() => h.remove());
    }
    performance.mark('nav-motion:built');
    Promise.all(n.anims.map((a) => a.finished.catch(() => {}))).then(() => landNav(n));
    return;
  }
  copy?.photo(false);
  target.classList.remove('is-pending');
  holder.classList.add('is-landing');
  // Interrupted: every layer starts at the opacity it had in the flight it takes over from.
  const m = midFlight;
  const fly = navStep('fly', () => flyPhoto({
    img: heroImg, from, to, fromPos, fromImg: m?.img, toPos: getComputedStyle(target).objectPosition,
    duration: T.navFlyBack, ease: easeFrom(T.easeNav), radius: { end: 'to', r: cornerRadii(holder), squareOther: !m || m.under > 0.01 },
    layers: { out: !m || m.hero > 0.01 ? cssVar('--scrim-hero') : null, in: cardScrimOf(holder) },
    cardFilter: getComputedStyle(target).filter,
    start: m ? { under: m.under, out: m.hero, in: m.card, dim: m.dim } : {},
  }));
  midFlight?.held.remove(); // the new flight starts exactly where the held one is, in this same frame
  n.anims.push(...fly.anims);
  n.cleanup.push(() => { fly.remove(); holder.classList.remove('is-landing'); });
  performance.mark('nav-motion:built');
  fly.finished.then(() => landNav(n, () => {
    if (!motionOK(null)) return;
    holder.querySelectorAll(':scope > :is(.card-top, .bar-id)').forEach((el) => el.animate({ opacity: [0, 1] }, { duration: T.quick, easing: T.easeOut }));
  }));
}
/** Drill-in, Back, and Scan's present/dismiss: the old page fades (and sinks for dismiss) while the new one slides in.
 *  Scan hides the tab bar: presenting it drops a copy of the bar away; dismissing it brings the real one back up. */
function pageMotion(dir, doRender, { from = null } = {}) {
  const main = document.getElementById('main');
  const rm = reducedMotion();
  const tabbar = document.querySelector('.tabbar');
  const barBefore = topBarShown();
  const heavy = HEAVY_PAGES.has(from) && dir !== 'dismiss';
  // The bars go with the old page when the new one hides them: Scan hides both, the bar page the top bar.
  const ghost = navStep('ghost', () => ghostPage(main, [dir === 'present' && tabbar, barBefore && document.querySelector('.topbar')], { page: !heavy }));
  ghost.dataset.dir = dir; // which way the page went (lab and tests read it)
  try { navStep('render', doRender); } catch (e) { ghost.remove(); throw e; }
  const n = startNav();
  n.cleanup.push(() => ghost.remove());
  // Both pages show the top bar: it stays in place above the fading page (no copy) instead of dimming with it.
  if (barBefore && topBarShown()) { ghost.querySelector(':scope > .topbar')?.remove(); ghost.classList.add('is-under-bar'); }
  // Only viewport-sized layers move: the old page (the ghost, clipped to the screen) and, for Scan, its own short page.
  // Scan's fixed Send bar has its own CSS entrance (@starting-style), so it isn't moved twice (MJ10).
  const short = [...main.children].filter((el) => !el.matches('.scan-submit') && el.getBoundingClientRect().height <= innerHeight * 1.25);
  if (heavy) {
    // The old page is gone already (not copied): its bars fade with the layer, and the new first screen comes in.
    n.anims.push(ghost.animate({ opacity: [1, 0] }, { duration: rm ? T.rmOut : T.navOut, easing: rm ? 'linear' : T.easeOut, fill: 'forwards' }));
    const bar = !rm && dir === 'present' ? ghost.querySelector('.tabbar') : null;
    if (bar) n.anims.push(bar.animate({ transform: ['none', 'translateY(100%)'] }, { duration: T.sheetOut, easing: T.easeOut, fill: 'forwards' }));
    const parts = dir === 'present' ? short : onScreenParts(main);
    enterContent(n, parts, dir === 'present' ? { dy: 24 } : { dx: dir === 'back' ? -24 : 24 });
  } else if (rm) {
    n.anims.push(ghost.animate({ opacity: [1, 0] }, { duration: T.rmOut, easing: 'linear', fill: 'forwards' }));
  } else if (dir === 'present') {
    n.anims.push(ghost.animate({ opacity: [1, 0] }, { duration: T.navOut, easing: T.easeOut, fill: 'forwards' }));
    const bar = ghost.querySelector('.tabbar');
    if (bar) n.anims.push(bar.animate({ transform: ['none', 'translateY(100%)'] }, { duration: T.sheetOut, easing: T.easeOut, fill: 'forwards' }));
    enterContent(n, short, { dy: 24 });
  } else if (dir === 'dismiss') {
    n.anims.push(ghost.animate({ opacity: [1, 0], transform: ['none', 'translateY(24px)'] }, { duration: T.sheetOut, easing: T.easeOut, fill: 'forwards' }));
    if (tabbar) n.anims.push(tabbar.animate({ transform: ['translateY(100%)', 'none'] }, { duration: T.navPage, easing: T.easeOut, fill: 'backwards' }));
  } else {
    // Drill-in and Back: the old page slides a little the other way as it fades (one screen-sized layer).
    n.anims.push(ghost.animate({ opacity: [1, 0], transform: ['none', `translateX(${dir === 'back' ? 24 : -24}px)`] }, { duration: T.navPage, easing: T.easeOut, fill: 'forwards' }));
  }
  performance.mark('nav-motion:built');
  Promise.all(n.anims.map((a) => a.finished.catch(() => {}))).then(() => landNav(n));
}
function route({ viaPop = false } = {}) {
  // A 'couldn't load' toast belongs to the screen it was about; it doesn't follow you to the next one.
  if (globalThis.__STORE__ || LIVE) { const t = [...document.querySelectorAll('#toasts .toast:not(.is-leaving)')].find((x) => x._key === 'live-retry'); if (t) dismissToast(t); }
  // A sheet belongs to the page that opened it: Back/Forward or a link must not leave it over the next page (and a
  // stale Terms sheet must not be able to send a report that was left behind).
  const openPicker = document.getElementById('picker');
  if (openPicker?.open) { openPicker.close(); app.pickerReturn = null; }
  const prev = app.route;
  const navFrom = viaPop ? null : app.navFrom;
  app.navFrom = null;
  app.visit += 1;
  // Record the rendered hash now: the hashchange that follows a popstate must not route a second time.
  app.renderedHash = location.hash || '#/';
  app.route = parseHash(location.hash);
  if (globalThis.__STORE__ && TEAM_ONLY.has(app.route.name)) app.route = { name: 'notfound', params: {}, query: {} };
  if (!globalThis.__STORE__ && LIVE && LIVE_HIDDEN.has(app.route.name)) app.route = { name: 'notfound', params: {}, query: {} };
  // An empty search closes when you leave Bars, so the sort row is back next time.
  if (app.route.name !== 'tonight' && !app.explore.q) app.ui.searchOpen = false;
  const r = app.route;
  const entry = history.state ?? {};
  const isListRoute = (name) => ['tonight', 'venue', 'pass'].includes(name);
  const hasExploreQuery = EXPLORE_KEYS.some((k) => r.query[k]);
  if (r.name === 'tonight' || (isListRoute(r.name) && hasExploreQuery)) {
    app.explore = exploreStateFromQuery(r.query, FILTER_IDS, SORT_IDS);
    app.lastExploreHash = buildHash('tonight', {}, exploreQuery(app.explore));
  } else if (isListRoute(r.name) && (viaPop || !prev) && entry.explore) {
    // Desktop venue entry recorded with the default list state (no query in its URL).
    app.explore = { ...entry.explore };
    app.lastExploreHash = buildHash('tonight', {}, exploreQuery(app.explore));
  }
  if (r.name === 'venue' || r.name === 'pass') app.lastVenueId = r.params.id;
  if (r.name === 'venue' && (viaPop || !prev)) {
    // Back/Forward and reload: the label belongs to this history entry, not to the last visit.
    app.venueBack = entry.back ?? null;
  } else if (r.name === 'venue') {
    const from = prev.name === 'scan' && app.scanOpener ? app.scanOpener : prev;
    if (!isListRoute(from.name)) {
      const labels = { saved: 'Saved', passes: 'Passes', passDetail: 'Pass', console: 'Console', about: 'About', events: 'Events' };
      app.venueBack = labels[from.name] ? { label: labels[from.name], href: buildHash(from.name, from.params, from.query) } : null;
    } else if (from.name === 'tonight') app.venueBack = null;
  }
  if (isListRoute(r.name)) history.replaceState({ ...(history.state ?? {}), idx: histIdx(), back: r.name === 'tonight' ? null : app.venueBack ?? null, explore: { ...app.explore } }, '');
  if (r.name === 'console' && r.query.venue) app.console.venueId = r.query.venue;
  if (!globalThis.__STORE__) enterBusiness(r, prev);
  if (!globalThis.__STORE__ && LIVE && r.name === 'points') loadPoints();
  // Passes sits under Points but opens from Profile too: its Back names where it came from (kept on its history entry).
  if (r.name === 'passes') {
    app.passesFrom = !viaPop && prev ? (TAB_OF[prev.name] === 'profile' ? 'profile' : 'points') : entry.from ?? app.passesFrom ?? 'points';
    history.replaceState({ ...(history.state ?? {}), from: app.passesFrom }, '');
  }
  if (r.name === 'groupNew' && !app.groupDraft) { app.groupDraft = newGroupDraft(); app.groupErrors = {}; }
  if (r.name === 'events' && (globalThis.__STORE__ || LIVE ? ['tonight', 'week', 'saved'] : ['tonight', 'week', 'ideas', 'saved']).includes(r.query.view)) app.ui.eventsView = r.query.view;
  if (r.name === 'ideaNew') {
    const valid = r.query.venue && app.venues.some((v) => v.id === r.query.venue);
    if (!app.ideaDraft) { app.ideaDraft = newIdeaDraft(valid ? r.query.venue : null); app.ideaErrors = {}; }
    else if (valid && app.ideaDraft.venueId !== r.query.venue) {
      app.ideaDraft.venueId = r.query.venue;
      if (!app.ideaDraft.dayPicked) app.ideaDraft.day = defaultNight(app.state.clock.base, r.query.venue, [...app.events, ...app.ideas]);
    }
  }
  if (r.name !== 'profile') app.profileEdit = { editing: false, errors: {} };
  if (r.name === 'scan' && prev?.name !== 'scan') {
    app.scanReturn = !!prev; // close returns to where Scan was opened
    app.scanOpener = prev ? { name: prev.name, params: prev.params, query: prev.query } : null;
  }
  // A finished report doesn't wait for you: leaving its result (a link, a tab, Back) starts the next Scan at the camera.
  if (prev?.name === 'scan' && r.name !== 'scan' && app.scan.step === 'done') resetScan();
  if (r.name === 'scan' && r.query.venue && app.venues.some((v) => v.id === r.query.venue)) {
    resetScan({ venueId: r.query.venue, camera: app.scan.camera === 'open' ? 'open' : null }); // a camera just opened by this tap
    history.replaceState({ ...(history.state ?? {}), idx: histIdx() }, '', '#/scan');
    app.renderedHash = '#/scan';
  }
  if (r.name === 'pass') {
    if (!(globalThis.__STORE__ || LIVE) && (!app.passFlow || app.passFlow.venueId !== r.params.id || app.passFlow.step === 'done')) startPassFlow(r.params.id);
  } else if (app.passFlow && app.passFlow.step !== 'pending') {
    app.passFlow = null;
  }

  // Only re-render the main content when the page actually changed (sheet open/close keeps the page).
  const samePage = prev && ((prev.name === 'venue' && r.name === 'pass') || (prev.name === 'pass' && r.name === 'venue')) && prev.params.id === r.params.id;
  if (samePage) { renderShell(); syncSheet(); app.renderedHash = location.hash; return; }

  const backToList = viaPop && LIST_ROUTES.has(r.name) && prev?.name === 'venue';
  const toDetail = !viaPop && r.name === 'venue' && LIST_ROUTES.has(prev?.name);
  const doRender = () => {
    const focusRow = viaPop && prev?.name === 'venue' && (r.name === 'tonight' || r.name === 'saved');
    render({ focus: focusRow ? 'venue' : 'heading', scroll: viaPop ? 'restore' : 'top' });
  };
  // Store build: any first screen loads live data (a reminder or a relaunch can open Events or Saved first).
  const needsFirstFetch = (globalThis.__STORE__ || LIVE || ['tonight', 'venue', 'pass'].includes(r.name)) && !app.firstFetchStarted;
  if (needsFirstFetch) app.firstFetchStarted = true;
  if (firstRoute) {
    firstRoute = false;
    doRender();
    if (needsFirstFetch) simulateFetch({ initial: true });
    return;
  }
  // The first fetch starts before the new page renders (it only marks the list loading), so its result patch can't land
  // in the middle of this navigation's own motion.
  if (needsFirstFetch) simulateFetch({ initial: true });
  const rm = reducedMotion();
  // The photo that was tapped (a deals-rail tile has no data-thumb, so the id lookup would pick the grid card instead).
  const tapped = navFrom?.isConnected ? navFrom.querySelector(':is(.rail-photo, [data-thumb], [data-thumb-ev]) > img') : null;
  // List <-> bar page flies the photo (QA plan 5.1, 5.2). Reduced motion: no flight, a short cross-fade.
  // A deal link lands scrolled to the deal, far from the hero: no flight, the page pushes in instead.
  const shared = (toDetail || backToList) && !rm && !r.query.deal && !(backToList && prev.query?.deal);
  const id = app.lastVenueId;
  const dir = shared ? 'venue' : navDirection(prev, r, viaPop);
  // A Back while the photo is still flying in turns it around from where it is on screen, not from the landed hero:
  // motion starts from what the person sees (evidence/iphone-motion-20261026/research/RESEARCH-APPLICATION.md).
  const f = backToList && activeNav?.flight?.id === app.lastVenueId && activeNav.flight.el.isConnected ? activeNav.flight : null;
  const op = (el) => (el ? Number(getComputedStyle(el).opacity) : 0);
  const midFlight = f ? { box: f.el.getBoundingClientRect(), img: f.img.getBoundingClientRect(), under: op(f.under), card: op(f.card), hero: op(f.hero), dim: op(f.dim), held: f } : null;
  if (f) {
    // Held where it is, not finished (finishing would jump it to the hero): the Back's flight takes over from it.
    f.anims.forEach((a) => a.pause());
    activeNav.anims = activeNav.anims.filter((a) => !f.anims.includes(a));
    f.held = true;
  }
  endNavMotion();
  if (!dir || document.hidden) { midFlight?.held.remove(); doRender(); return; }
  const ready = (img) => img && img.complete && img.naturalWidth > 0;
  if (shared && toDetail) {
    const fromImg = tapped ?? document.querySelector(`#main [data-thumb="${CSS.escape(id)}"] > img`);
    if (ready(fromImg) && inView(fromImg.parentElement.getBoundingClientRect())) { flyToDetail(fromImg, doRender, id); return; }
  }
  if (shared && backToList) {
    const heroImg = document.querySelector(`#main [data-hero="${CSS.escape(id)}"] > img`);
    const sel = entry.navFrom?.id === id ? entry.navFrom.sel : `[data-thumb="${CSS.escape(id)}"]`;
    if (ready(heroImg) && inView(midFlight?.box ?? heroImg.getBoundingClientRect())) { flyToList(heroImg, doRender, sel, midFlight); return; }
  }
  midFlight?.held.remove(); // not handed over: the page pushes instead
  pageMotion(dir === 'venue' ? (toDetail ? 'forward' : 'back') : dir, doRender, { from: prev?.name });
}

/* ---------------- simulated fetch (loading / error / offline) ---------------- */
let fetchTimer = null;
const isObj = (r) => Boolean(r) && typeof r === 'object' && !Array.isArray(r);
const rowsOk = (kind) => (x) => validRows(kind, x);
/** Store build: fetch bars, estimates, deals and events; keep the last good copy for offline and the next launch.
 *  Each part stands alone: events or deals failing never hides the line estimates, and a part that fails (or comes back
 *  in a shape we can't read) keeps its last good copy. Only bars + estimates decide "Couldn't load". */
let liveBusy = null;
async function liveRefresh({ initial = false, quiet = false } = {}) {
  // One refresh at a time. A user's Try again during a running one waits for it (and any other that started first), then
  // runs with visible feedback; quiet polls simply skip.
  while (liveBusy) { if (quiet) return; await liveBusy; }
  if (isOffline()) {
    app.ui.loading = false;
    if (initial) app.ui.lastRefreshAt = app.ui.lastRefreshAt ?? app.live?.at ?? null;
    renderResultsOnly({ announceCount: false });
    if (!initial && !quiet) toast('You’re offline. Showing the last estimates.');
    return;
  }
  let done;
  liveBusy = new Promise((r) => { done = r; });
  try { await refreshParts({ initial, quiet }); } finally { liveBusy = null; done(); }
}
/** The body of liveRefresh, run while it holds the one-at-a-time slot. */
async function refreshParts({ initial, quiet }) {
  const hadData = Boolean(app.live?.at);
  const failedBefore = Boolean(app.ui.refreshError && !hadData);
  if (initial && !globalThis.__STORE__ && LIVE) api.getConfig().then(applyConfig, () => {});
  if (!quiet) { app.ui.loading = !hadData; app.ui.staleNotice = null; app.ui.refreshError = false; renderResultsOnly({ announceCount: false }); }
  const shape = (ok) => (v) => { if (!ok(v)) throw new ApiError('Unreadable response', { status: 200, code: 'bad_response' }); return v; };
  const [bars, status, ed] = await Promise.allSettled([
    api.getBars().then(shape(rowsOk('bars'))),
    api.getBarStatus().then(shape(rowsOk('status'))),
    api.getEventsAndDeals().then(shape((v) => isObj(v) && rowsOk('events')(v.events ?? []) && rowsOk('deals')(v.deals ?? []))),
  ]);
  const prev = app.live?.at ? app.live : null;
  // When events and deals last arrived (null: never). Older caches have no edAt; their copy dates from their own at.
  const edBefore = prev ? ('edAt' in prev ? prev.edAt : prev.at) : null;
  // The estimates (bar_status) are what "Updated hh:mm" and the banner speak about; an older bar list is fine to keep.
  const coreOk = status.status === 'fulfilled' && (bars.status === 'fulfilled' || Boolean(prev?.bars));
  if (coreOk || (prev && (bars.status === 'fulfilled' || status.status === 'fulfilled' || ed.status === 'fulfilled'))) {
    app.live = {
      bars: bars.status === 'fulfilled' ? bars.value : prev?.bars ?? [],
      status: status.status === 'fulfilled' ? status.value : prev?.status ?? [],
      deals: ed.status === 'fulfilled' ? ed.value.deals ?? [] : prev?.deals ?? [],
      events: ed.status === 'fulfilled' ? ed.value.events ?? [] : prev?.events ?? [],
      at: coreOk ? Date.now() : prev.at,
      edAt: ed.status === 'fulfilled' ? Date.now() : Number.isFinite(edBefore) ? edBefore : null,
      ...(!globalThis.__STORE__ && LIVE ? { env: BACKEND.env } : {}),
    };
    try { storage?.setItem(LIVE_KEY, JSON.stringify(app.live)); } catch { /* full or blocked storage: keep it in memory */ }
  }
  const err = [bars, status, ed].find((x) => x.status === 'rejected')?.reason;
  // Every refresh says what it couldn't get (never silently): a part with a last good copy keeps it ("Couldn't refresh"),
  // events and deals that never arrived say so ("Couldn't load"). Background refreshes (the 45 s poll, coming back to
  // the tab, after a report) set the notices too, without a toast. The notices are recomputed each time, so one never
  // outlives the refresh it describes.
  const keptOld = [bars.status === 'rejected' && prev?.bars && 'the bar list', ed.status === 'rejected' && Number.isFinite(edBefore) && 'events and deals'].filter(Boolean);
  const missing = ed.status === 'rejected' && !Number.isFinite(edBefore) ? ['events and deals'] : [];
  app.ui.partialStale = keptOld.length ? keptOld : null;
  app.ui.partialMissing = missing.length ? missing : null;
  if (coreOk && (keptOld.length || missing.length) && !quiet && app.route?.name !== 'tonight') {
    toast(keptOld.length ? `Couldn’t refresh ${keptOld.join(' or ')}. Showing the last copy.` : `Couldn’t load ${missing.join(' or ')}. Try again in a minute.`, { key: 'live-retry' });
  }
  if (coreOk) {
    app.ui.refreshError = false;
    app.ui.lastRefreshAt = app.live.at;
  } else {
    // The estimates didn't refresh: the error banner says so, from a background refresh too (the info notice, which
    // says the estimates are current, stays hidden while this is up). Only a refresh someone asked for also toasts.
    const core = status.status === 'rejected' ? status.reason : bars.reason;
    app.ui.refreshError = true;
    app.ui.refreshErrorKind = core?.code === 'bad_response' ? 'bad' : core?.status ? 'server' : 'network';
    // Bars shows a banner; elsewhere a Try again that fails again says so.
    if (!quiet && app.route?.name !== 'tonight') toast(`${initial ? 'Couldn’t load live data.' : 'Still couldn’t load.'} ${core?.status ? 'Try again in a minute.' : 'Check your connection.'}`, { key: 'live-retry' });
  }
  if (err?.status && (err.status >= 500 || err.code === 'bad_response')) api.logClientError({ message: `refresh ${err.status} ${err.code || err.message}`, version: APP_VERSION });
  app.ui.loading = false;
  const failedNow = Boolean(app.ui.refreshError && !app.live?.at);
  setLiveLoadFailed(failedNow);
  rebuild();
  if (app.route?.name === 'tonight') renderResultsOnly({ announceCount: !quiet });
  // The first data to arrive, or "Not loaded" ↔ loaded, changes text all over the page (estimate, hours, deals, events,
  // fact strip): redraw it once. Later polls only patch the estimate in place (tick).
  else if (failedBefore !== failedNow || (!hadData && app.live?.at)) {
    const howOpen = Boolean(document.querySelector('#main details.how[open]'));
    rerenderPage();
    if (howOpen) document.querySelector('#main details.how')?.setAttribute('open', '');
  }
  else { if (app.route?.name === 'events') patchEventResults(); tick(); }
}
const APP_VERSION = '1.0.0';
// The brand in text the app writes (title, share, gate). The build sets it from APP_NAME; the team build keeps Night Out.
const APP_NAME = globalThis.__APP_NAME__ ?? 'Night Out';

function simulateFetch({ initial = false } = {}) {
  if (globalThis.__STORE__ || LIVE) { liveRefresh({ initial }); return; }
  if (isOffline()) {
    app.ui.loading = false;
    // Never null: a later Reconnect must not swap the cards on screen for the first-load skeleton (QA plan 6.8).
    if (initial) app.ui.lastRefreshAt = app.ui.lastRefreshAt ?? app.state.syncAt ?? now();
    renderResultsOnly();
    if (!initial) toast('You’re offline. Showing the last estimates.');
    return;
  }
  app.ui.loading = true;
  app.ui.staleNotice = null;
  app.ui.refreshError = false;
  renderResultsOnly();
  clearTimeout(fetchTimer);
  fetchTimer = setTimeout(() => {
    app.ui.loading = false;
    if (!initial && app.state.sim.failNextRefresh) {
      app.state.sim.failNextRefresh = false;
      persist();
      app.ui.refreshError = true;
    } else {
      app.ui.refreshError = false;
      app.ui.lastRefreshAt = now();
      app.state.syncAt = app.ui.lastRefreshAt;
      persist();
      rebuild();
    }
    renderResultsOnly();
    if (app.route.name !== 'tonight') tick();
  }, initial ? 450 : 650);
}

/* ---------------- live aging (estimates update in place, never reorder under the finger) ---------------- */
const RANGE_TONES = ['fresh', 'aging', 'uncertain'];
/** Bar page estimate (QA plan 4.1, 4.2). Between range tones the block is patched: the range rolls (only when on screen),
 *  the ≈ fades in or out while the number glides aside, and the scale and freshness markers glide (CSS). A tone change
 *  that rebuilds the block (e.g. "Out of date") hands its height over: what follows glides instead of jumping. */
function patchEstimateBlock(el, fresh) {
  const w0 = el.querySelector('.qb-wait .roll'), w1 = fresh.querySelector('.qb-wait .roll');
  const r = el.getBoundingClientRect();
  const quiet = r.bottom <= 0 || r.top >= window.innerHeight; // off screen: swap the text, no motion
  if (!w0 || !w1 || !RANGE_TONES.includes(el.dataset.tone) || !RANGE_TONES.includes(fresh.dataset.tone)) {
    const openDetails = el.querySelector('details.how')?.open;
    const hadFocus = el.contains(document.activeElement);
    glideBelow(el, () => el.replaceWith(fresh));
    if (openDetails) fresh.querySelector('details.how')?.setAttribute('open', '');
    if (hadFocus) {
      const target = fresh.querySelector('summary') ?? fresh.querySelector('.qb-label');
      if (target && !target.matches('summary')) target.setAttribute('tabindex', '-1');
      target?.focus({ preventScroll: true });
    }
    if (!quiet) fresh.querySelectorAll(':scope > :not(.qb-top)').forEach(enter);
    return;
  }
  glideBelow(el, () => {
    const wait = el.querySelector('.qb-wait');
    const unit = wait.querySelector('small');
    const a0 = wait.querySelector(':scope > .approx:not(.is-leaving)'), a1 = fresh.querySelector('.qb-wait .approx');
    // The number glides aside for the ≈; the unit glides with it only when the number keeps its width (else it would
    // pass over the wider number, so it takes its new place at once).
    const sameWidth = (w0.dataset.rollTo ?? w0.textContent).length === w1.textContent.length;
    const glide = (mutate) => (quiet ? mutate() : flip([w0, sameWidth && unit].filter(Boolean), mutate));
    if (!a0 && a1) { glide(() => w0.before(a1)); if (!quiet) enter(a1); } else if (a0 && !a1) {
      const out = () => { if (a0.isConnected) glide(() => a0.remove()); };
      if (quiet || !motionOK()) out();
      else { a0.classList.add('is-leaving'); a0.animate({ opacity: [1, 0] }, { duration: T.fade, easing: T.easeOut, fill: 'forwards' }).finished.then(out, out); }
    }
    const [lo0, hi0] = (w0.dataset.rollTo ?? w0.textContent).split('–').map(Number);
    const [lo1, hi1] = w1.textContent.split('–').map(Number);
    rollText(w0, w1.textContent, Math.sign(lo1 - lo0) || Math.sign(hi1 - hi0) || 1, { instant: quiet });
    patchTree(el, fresh, { quiet, skip: (n) => n.classList.contains('qb-wait') });
  });
}
/** Bar page deal tickets (QA plan 4.3): patched row by row in place (never reordered): the countdown swaps, the time-left
 *  bar drains (CSS), and live → ended swaps the state word. False when the set of deals changed (the caller rebuilds). */
function patchDeals(sec, next) {
  const fresh = new Map([...next.querySelectorAll('.promo-row')].map((row) => [row.id, row]));
  const rows = [...sec.querySelectorAll('.promo-row')];
  if (rows.length !== fresh.size || rows.some((row) => !fresh.has(row.id))) return false;
  rows.forEach((row) => patchTree(row, fresh.get(row.id)));
  return true;
}
/** Bar card deal slot (QA plan 4.11): a badge that changes keeps its node and swaps its text; one that ends drops 2px and
 *  fades (120 ms) before the next line takes its place; a new badge rises in. */
function patchDealSlot(slot, next) {
  const b0 = slot.querySelector('.promo-badge'), b1 = next.querySelector('.promo-badge');
  const exit = (slot._exit = {}); // a newer patch makes an older exit's swap a no-op
  slot.getAnimations({ subtree: true }).forEach((x) => x.cancel());
  slot.style.minHeight = '';
  if (b0 && !b1) {
    const old = [...slot.children];
    const swap = () => { if (slot._exit !== exit || !slot.isConnected) return; slot.style.minHeight = ''; slot.replaceChildren(...next.childNodes); [...slot.children].forEach(enter); };
    if (!motionOK()) { swap(); return; }
    slot.style.minHeight = `${slot.offsetHeight}px`; // the footer keeps its height through the exit
    Promise.all(old.map((n) => n.animate({ opacity: [1, 0], translate: ['0 0', '0 2px'] }, { duration: T.quick, easing: T.easeOut, fill: 'forwards' }).finished)).then(swap, swap);
    return;
  }
  if (!b0 && b1) {
    slot.replaceChildren(...next.childNodes);
    if (motionOK()) b1.animate({ opacity: [0, 1], translate: ['0 4px', '0 0'] }, { duration: T.reveal, easing: T.easeOut });
    else enter(b1);
    return;
  }
  patchTree(slot, next);
}
function tick() {
  if (maybeStartNewNight()) return;
  pruneReminders();
  rebuild(); // the merge depends on time (inputs age out of the 20-minute window)
  const n = now();
  document.querySelectorAll('[data-demo-time]').forEach((el) => { el.textContent = formatTime(n); });
  document.querySelectorAll('[data-elapsed]').forEach((el) => { el.textContent = String(Math.max(0, Math.floor((n - Number(el.dataset.elapsed)) / 60000))); });
  const byId = new Map(app.venues.map((v) => [v.id, v]));
  document.querySelectorAll('[data-est]').forEach((el) => {
    const v = byId.get(el.dataset.est);
    if (!v) return;
    const before = el.dataset.tone;
    const levelBefore = el.dataset.level;
    const variant = el.dataset.variant;
    const html = variant === 'status' ? cardStatus(v, n) : variant === 'fresh' ? cardFresh(v, n) : variant === 'vstatus' ? venueStatus(v, n) : variant === 'sr' ? srSummary(v, n)
      : variant === 'ring' ? estimateRing(v, n, { size: Number(el.dataset.size) || 56 })
      : variant === 'facts' ? factStrip(v, n) // the bar page's In line / Door pace go blank with the estimate
      : el.dataset.variant === 'block'
      ? estimateBlock(v, n, { headingId: el.getAttribute('aria-labelledby') || 'qb-h', showHow: !!el.querySelector('details.how'), headingLevel: Number(el.dataset.level) || 2 })
      : estimateCompact(v, n);
    const fresh = fragment(html);
    const ringMoved = el.dataset.variant === 'ring' && el.innerHTML !== fresh.innerHTML; // the arc empties as the update ages
    if (!ringMoved && fresh.dataset.tone === before && el.textContent.replace(/\s+/g, ' ') === fresh.textContent.replace(/\s+/g, ' ')) return;
    if (variant === 'block') { patchEstimateBlock(el, fresh); return; }
    if (variant === 'facts') { patchTree(el, fresh); return; } // only the changed cells swap
    if (variant === 'status') {
      patchTree(el, fresh, { quiet: true }); // card numbers never animate on the tick; the dot's color glides (CSS)
      // The card's line just turned packed: its glow pulses twice (renders never add .is-new).
      if (el.dataset.level === 'packed' && levelBefore !== 'packed') el.classList.add('is-new');
      return;
    }
    el.replaceWith(fresh);
  });
  document.querySelectorAll('[data-deal-for]').forEach((slot) => {
    const v = byId.get(slot.dataset.dealFor);
    if (!v) return;
    const next = fragment(dealTag(v, n));
    if (slot.innerHTML !== next.innerHTML) patchDealSlot(slot, next);
  });
  // Bar page deal tickets: the countdown, the time-left bar and live/ended follow the clock.
  document.querySelectorAll('[data-deals]').forEach((sec) => {
    const v = byId.get(sec.dataset.deals);
    if (!v) return;
    const tpl = document.createElement('template');
    tpl.innerHTML = dealsSection(v, n).trim();
    const next = tpl.content.firstElementChild;
    const sig = (el) => [...el.querySelectorAll('.promo-row')].map((r) => r.dataset.state).join() + el.textContent.replace(/\s+/g, ' ');
    if (!next || sig(sec) === sig(next)) return;
    if (patchDeals(sec, next)) return;
    const target = sec.querySelector('.is-target')?.id;
    const focusId = sec.contains(document.activeElement) ? document.activeElement.id : null;
    sec.replaceWith(next);
    if (target) document.getElementById(target)?.classList.add('is-target');
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  });
  // The "Deals right now" row: swap it when the set of live deals changes (a deal starts or ends).
  const rail = document.querySelector('.deals-rail:not(.sk-rail)');
  if (rail || (app.route?.name === 'tonight' && app.explore.view === 'list' && !app.explore.q && !app.explore.filters.length && app.explore.sort === 'near' && !document.querySelector('#results .sk-group'))) {
    const html = dealsRail(ctx());
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    const fresh = tpl.content.firstElementChild;
    const sig = fresh?.dataset.railSig ?? '';
    if (rail && (rail.dataset.railSig ?? '') !== sig) patchRail(rail, fresh);
    else if (!rail && fresh) {
      const bar = document.querySelector('#results .results-bar');
      if (bar) {
        const below = [...bar.parentElement.children].filter((n) => n.getBoundingClientRect().top < window.innerHeight);
        flip(below, () => bar.before(fresh), { duration: T.tray });
        restoreRail(fresh.querySelector('.rail-list'));
        revealPhotos(fresh);
        enter(fresh);
      }
    }
  }
  // Map pins share the same estimate meaning: patch any pin whose state changed, in place (no re-announce).
  document.querySelectorAll('[data-pin-tone]').forEach((b) => {
    const v = byId.get(b.dataset.id);
    if (!v) return;
    const est = estimateFor(v, n);
    if (est.tone === b.dataset.pinTone && b.getAttribute('aria-label').includes(est.headline)) return;
    const parts = pinParts(v, est, b.dataset.action);
    b.className = parts.cls;
    b.dataset.pinTone = est.tone;
    b.setAttribute('aria-label', parts.label);
    b.innerHTML = parts.html;
  });
  // If a venue shown under "Under 20 min" no longer qualifies, say so instead of silently changing the list.
  if (app.route?.name === 'tonight' && app.explore.filters.includes('short') && !app.ui.loading) {
    const shownIds = [...document.querySelectorAll('#results [data-venue-row], #results .map-pin-btn[data-id]')].map((el) => el.dataset.venueRow ?? el.dataset.id);
    const lapsed = shownIds.filter((id) => !estimateFor(byId.get(id), n).qualifiesShortWait);
    const msg = lapsed.length ? `${lapsed.length} estimate${lapsed.length === 1 ? ' is' : 's are'} now out of date or over 20 min, so ${lapsed.length === 1 ? 'it no longer matches' : 'they no longer match'} “Under 20 min”.` : null;
    if (msg !== app.ui.staleNotice) {
      app.ui.staleNotice = msg;
      updateBanners();
    }
  }
  updateBadge();
}

/* ---------------- pass flow ---------------- */
function startPassFlow(venueId) {
  const v = app.venues.find((x) => x.id === venueId);
  const firstOpen = v?.pass?.windows.find((w) => purchasable(windowState(v.pass, w, now())));
  app.passFlow = { venueId, windowId: firstOpen?.id ?? null, party: 2, ack: false, step: 'review', errors: {}, opId: null, passId: null, notice: null };
}

function syncSheet() {
  const dlg = document.getElementById('sheet');
  const wantOpen = app.route?.name === 'pass' && app.passFlow;
  if (!wantOpen) {
    if (dlg.open) closeSheetAnimated();
    return;
  }
  if (sheetClosing) {
    clearTimeout(sheetClosing.t);
    dlg.removeEventListener('transitionend', sheetClosing.onEnd);
    sheetClosing = null;
    dlg.classList.remove('is-closing');
    dlg.style.transform = '';
  }
  renderSheet();
  if (!dlg.open) {
    dlg.classList.remove('is-closing');
    dlg.showModal();
    dlg._openedAt = performance.now(); // drags wait for the opening slide to finish (--d-sheet-lock)
    const auto = dlg.querySelector('[data-autofocus]') || dlg.querySelector('input:checked:not(:disabled)') || dlg.querySelector('input:not(:disabled), button:not(:disabled)');
    auto?.focus();
  }
}
function renderSheet({ beat = false } = {}) {
  const dlg = document.getElementById('sheet');
  const { title, body, foot } = renderPassSheet(ctx(), app.passFlow);
  const sheetFocus = () => (dlg.open ? dlg.querySelector('[data-autofocus]') || dlg.querySelector('input[name="win"]:checked:not(:disabled)') || dlg.querySelector('input:not(:disabled), button:not(:disabled)') : null);
  // An edit within a step (window, party, the checkbox, an error) patches the sheet in place (QA plan 4.8): the picked
  // window's fill glides, the party size rolls, prices swap, and focus and scroll never move. A new step renders.
  const bodyEl = dlg.querySelector('.sheet-body'), footEl = dlg.querySelector('.sheet-foot');
  if (dlg.dataset.step === app.passFlow.step && bodyEl && footEl) {
    const part = (html) => { const t = document.createElement('template'); t.innerHTML = html; return t.content; };
    preserveFocus(() => {
      swapText(dlg.querySelector('.sheet-title'), title);
      patchChildren(bodyEl, part(body));
      patchChildren(footEl, part(foot));
    }, sheetFocus);
    return;
  }
  const prevScroll = bodyEl?.scrollTop ?? 0;
  const prevStep = dlg.dataset.step;
  // A new step glides the sheet to its new height (QA plan 7.2): "Back to review" comes in from the left.
  const dir = prevStep === 'review' || !prevStep ? 0 : app.passFlow.step === 'review' ? -1 : 0;
  swapSheet(dlg, () => {
    preserveFocus(() => {
      dlg.innerHTML = `<div class="sheet-head">
          <button type="button" class="sheet-grabber" data-action="close-sheet" aria-label="Close (or drag down)"></button>
          <h2 class="sheet-title" id="sheet-title">${esc(title)}</h2>
          <button type="button" class="icon-btn sheet-close" data-action="close-sheet" aria-label="Close">${icon('x')}</button>
        </div>
        <div class="sheet-body">${body}</div>
        <div class="sheet-foot">${foot}</div>`;
      dlg.setAttribute('aria-labelledby', 'sheet-title');
    }, sheetFocus);
    // A new step (e.g. "Pass created") opens at the top.
    dlg.dataset.step = app.passFlow.step;
    const sb = dlg.querySelector('.sheet-body');
    if (sb) sb.scrollTop = prevStep === app.passFlow.step ? prevScroll : 0;
  }, dir, { body: !(beat && motionOK() && !reducedMotion()) }); // "Pass created" brings its own parts in (8.4)
}
let sheetClosing = null;
function closeSheetAnimated() {
  const dlg = document.getElementById('sheet');
  if (!dlg.open || sheetClosing) return;
  const finish = () => {
    if (!sheetClosing) return;
    clearTimeout(sheetClosing.t);
    dlg.removeEventListener('transitionend', sheetClosing.onEnd);
    sheetClosing = null;
    dlg.classList.remove('is-closing', 'is-dragging');
    dlg.style.transform = '';
    if (dlg.open) dlg.close();
    dlg.innerHTML = '';
    // Desktop re-renders the detail pane under the sheet, so the trigger may be gone: put focus back on it.
    if (!document.activeElement || document.activeElement === document.body) {
      (document.querySelector('#main [data-nav="pass"]') || pageHeading())?.focus({ preventScroll: true });
    }
  };
  const onEnd = (e) => { if (e.target === dlg && (e.propertyName === 'transform' || e.propertyName === 'opacity')) finish(); };
  sheetClosing = { t: setTimeout(finish, cssMs('--d-sheet-out', 220) + 80), onEnd };
  dlg.addEventListener('transitionend', onEnd);
  // Exit from wherever the sheet is (mid-drag or mid-open): drop the inline offset in the same frame as the class.
  dlg.classList.remove('is-dragging');
  dlg.style.transform = '';
  dlg.classList.add('is-closing');
}
function requestCloseSheet() {
  if (app.passFlow?.step === 'pending') return; // never abandon an in-flight request silently
  const venueHash = buildHash('venue', { id: app.passFlow?.venueId ?? app.route.params.id });
  if (app.route.name === 'pass') goBack(venueHash);
}

function submitPass() {
  const f = app.passFlow;
  const v = app.venues.find((x) => x.id === f.venueId);
  f.errors = {};
  f.notice = null;
  const win = v.pass.windows.find((w) => w.id === f.windowId);
  if (!win || !purchasable(windowState(v.pass, win, now()))) {
    f.errors.window = win ? 'That window is no longer available. Choose another.' : 'Choose an entry window.';
    f.windowId = win && purchasable(windowState(v.pass, win, now())) ? f.windowId : null;
  }
  if (!f.ack) f.errors.ack = 'Check the box to continue.';
  if (Object.keys(f.errors).length) {
    renderSheet(); // the error drops in (patch)
    const first = document.querySelector(f.errors.window ? '#sheet input[name="win"]:not(:disabled)' : '#sheet [data-input="pass-ack"]');
    focusInvalid(first, document.querySelector(f.errors.window ? '#sheet .window-grid' : '#sheet .check'));
    return;
  }
  f.party = Math.min(f.party, maxPartyFor(win));
  f.opId = f.opId ?? `op-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  runPassRequest();
}
function runPassRequest() {
  const f = app.passFlow;
  f.step = 'pending';
  f.errorKind = null;
  renderSheet();
  document.querySelector('#sheet .sheet-foot button')?.focus();
  const g = gesture; // the outcome lands as the request's own result: a keyboard submit stays instant
  setTimeout(() => withGesture(g, () => {
    // The simulated request finishes even if the user navigated away; then the outcome arrives as a toast.
    const inSheet = () => app.passFlow === f && app.route?.name === 'pass' && document.getElementById('sheet').open;
    const v = app.venues.find((x) => x.id === f.venueId);
    const finishAway = (message, opts) => {
      if (app.passFlow === f) app.passFlow = null;
      toast(message, opts);
    };
    // Idempotency: if this operation already produced a pass, don't create another.
    const existing = app.state.passes.find((p) => p.id === f.opId);
    if (existing) {
      f.passId = existing.id; f.step = 'done';
      if (inSheet()) { renderSheet(); focusSheetResult(); }
      return;
    }
    const beat = () => { if (!reducedMotion() && motionOK()) passBeat(document.getElementById('sheet')); };
    if (isOffline() || app.state.sim.failNextPass) {
      f.errorKind = isOffline() ? 'offline' : 'server';
      if (f.errorKind === 'server') { app.state.sim.failNextPass = false; persist(); }
      f.step = 'error';
      if (inSheet()) { renderSheet(); focusSheetResult(); } else finishAway(`The pass for ${v?.name ?? 'that venue'} wasn’t created. Nothing was charged.`);
      return;
    }
    const win = v?.pass?.windows.find((w) => w.id === f.windowId);
    if (!win || !purchasable(windowState(v.pass, win, now())) || win.remaining < f.party) {
      f.step = 'review';
      f.notice = 'That window sold out or was paused while you were reviewing. No pass was created and nothing was charged.';
      f.windowId = null;
      if (inSheet()) {
        renderSheet();
        (document.querySelector('#sheet input[name="win"]:not(:disabled)') || document.querySelector('#sheet [data-notice]'))?.focus();
      } else finishAway('That window filled up before the pass was created. Nothing was charged.');
      return;
    }
    const pass = createPass({ opId: f.opId, venue: v, win, party: f.party, now: now() });
    app.state.passes.push(pass);
    persist();
    rebuild();
    f.passId = pass.id;
    f.step = 'done';
    updateBadge();
    if (inSheet()) { renderSheet({ beat: true }); focusSheetResult(); beat(); return; }
    finishAway(`Pass created for ${v.name}.`, { actionLabel: 'View pass', onAction: () => go(buildHash('passDetail', { id: pass.id })) });
    if (app.route.name === 'passes') render({ focus: 'none' });
  }), 900);
}
function focusSheetResult() { document.querySelector('#sheet [data-autofocus]')?.focus(); }
/**
 * "Pass created" (QA plan 8.4, one beat, after 1.5): in the frame after the render (so iOS isn't running a spring while
 * JS is busy), the white well pops from .9 (--spring-pop, cubic on iOS), its check draws in after 60ms (--d-fade), and
 * the heading, the line under it and the pass follow 60ms apart, rising 6px (--d-reveal). It rides the sheet's height
 * glide (7.2). Focus stays on the heading. Reduced motion: the sheet's short linear fade only.
 */
function passBeat(dlg) {
  const res = dlg.querySelector('.sheet-body .result-ok');
  if (!res) return;
  const well = res.querySelector('.result-icon');
  const parts = [res.querySelector(':scope > h2'), res.querySelector(':scope > p'), res.querySelector(':scope > .pass-card')].filter(Boolean);
  // Hidden until the beat's frame, so nothing flashes in at rest first.
  const hold = [well, ...parts].filter(Boolean).map((el) => el.animate({ opacity: [0, 0] }, { duration: T.sheetLock }));
  requestAnimationFrame(() => {
    hold.forEach((a) => a.cancel());
    if (!dlg.open || !res.isConnected) return;
    if (well) {
      well.animate({ scale: [0.9, 1] }, popTiming());
      well.animate({ opacity: [0, 1] }, { duration: T.fade, easing: T.easeOut });
      drawStroke(well.querySelector('path'), { delay: 60 });
    }
    parts.forEach((el, i) => el.animate({ opacity: [0, 1], translate: ['0 6px', '0 0'] }, { duration: T.reveal, delay: 60 * (i + 1), easing: T.easeOut, fill: 'backwards' }));
  });
}

/* ---------------- saves ---------------- */
function toggleSave(id) {
  haptic('light');
  const v = app.venues.find((x) => x.id === id);
  const idx = app.state.saved.indexOf(id);
  if (idx === -1) {
    app.state.saved.push(id);
    persist();
    refreshCurrent();
    if (!(globalThis.__STORE__ || LIVE)) toast(`Saved ${v?.name ?? 'venue'}`, { key: `save:${id}` });
  } else {
    app.state.saved.splice(idx, 1);
    const rem = app.state.reminders?.[id] ?? null;
    if (rem) { cancelReminder(rem.nid); const { [id]: _gone, ...rest } = app.state.reminders; app.state.reminders = rest; }
    persist();
    app.ui.lastRemoved = { id, idx, name: v?.name ?? 'Venue', visit: app.visit, rem };
    refreshCurrent({ removedId: id });
    toast(`Removed ${v?.name ?? 'venue'} from Saved`, { actionLabel: 'Undo', onAction: () => undoRemove(), key: `save:${id}` });
  }
}
function undoRemove() {
  const r = app.ui.lastRemoved;
  if (!r) return;
  app.ui.lastRemoved = null;
  dismissCurrentToast(`save:${r.id}`);
  if (!app.state.saved.includes(r.id)) app.state.saved.splice(Math.min(r.idx, app.state.saved.length), 0, r.id);
  if (r.rem && r.rem.at > now() + 60_000) {
    const v = app.venues.find((x) => x.id === r.id);
    app.state.reminders = { ...app.state.reminders, [r.id]: r.rem };
    if (v) scheduleReminder({ id: r.rem.nid, at: r.rem.at, ...reminderText(v), extra: { venueId: v.id } });
  }
  persist();
  refreshCurrent();
  document.querySelector(`[data-action="toggle-save"][data-id="${CSS.escape(r.id)}"]`)?.focus();
  announce(`${r.name} restored to Saved`);
}
function refreshCurrent({ removedId } = {}) {
  const r = app.route.name;
  if (r === 'saved') {
    // Saved (QA plan 8.1): the removed card fades out, then the cards after it glide into its place; Undo brings it back
    // the same way. Focus moves at once to the card that takes its place (else the one before it).
    const cards = [...document.querySelectorAll('#main li.bar-card[data-venue-row]:not(.is-leaving)')];
    const gone = removedId ? cards.find((c) => c.dataset.venueRow === removedId) : null;
    if (gone) {
      const i = cards.indexOf(gone), rest = cards.filter((c) => c !== gone);
      (rest[Math.min(i, rest.length - 1)]?.querySelector('[data-nav-venue]') ?? pageHeading())?.focus({ preventScroll: true });
    }
    updateList({ sel: '#main li.bar-card', leaving: gone ? [gone] : [], render: () => { patchPage(); revealPhotos(document.getElementById('main')); } });
    return;
  }
  // Update save buttons in place everywhere else.
  document.querySelectorAll('[data-action="toggle-save"]').forEach((b) => {
    const on = app.state.saved.includes(b.dataset.id);
    const name = app.venues.find((v) => v.id === b.dataset.id)?.name ?? '';
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', `Save ${name}`); // the heart's fill follows aria-pressed (CSS), so the icon is never rebuilt
  });
  const listVisible = r === 'tonight';
  if (listVisible && app.explore.filters.includes('saved')) renderResultsOnly();
}

/* ---------------- console ---------------- */
function consoleVenue() {
  if (!globalThis.__STORE__ && LIVE) return venueBar();
  const id = app.console.venueId && app.venues.some((v) => v.id === app.console.venueId) ? app.console.venueId : app.venues[0]?.id;
  return app.venues.find((v) => v.id === id);
}
function rerenderPage(fallback) {
  endNavMotion(); // the page is replaced: a photo landing on it lands now
  preserveFocus(() => {
    const y = window.scrollY;
    document.getElementById('main').innerHTML = mainHtml();
    window.scrollTo(0, y);
  }, fallback);
}
/** Console (and About) updates patch the page: the role, pace and dataset thumbs slide, the pause switch glides and the
 *  steppers swap their value, because those nodes survive (QA plan 3.2). */
function rerenderConsole() {
  patchMain();
  reliftToasts();
}
/** Console lists (QA plan 8.1, 8.6): ideas, posted deals and inputs leave and arrive with FLIP; the panels after the
 *  change glide to their new places. A new input row drops in from above; anything else rises in. */
const CONSOLE_ITEMS = '#main .console-grid > section, #main .idea-reviews > article, #main .console-grid li[data-key], #main .console-grid h3[data-key]';
function consoleList(leaving = [], after) {
  updateList({ sel: CONSOLE_ITEMS, leaving: leaving.filter(Boolean), render: rerenderConsole, after, rise: (n) => (n.closest('.feed') ? '0 -8px' : '0 8px') });
}
const ROLE_NAME = { ambassador: 'Ambassador', bouncer: 'Bouncer' };
const DOOR_WORD = { moving: 'Letting in', capacity: 'One in, one out', paused: 'Paused', closed: 'Closed' };
function countAnnounce(v, p) {
  announce(`${p.count} counted. Guests would see ${photoPreview(p.count, v, now(), app.state, app.console.role).headline}.`);
}
function snapPhoto() {
  const v = consoleVenue();
  if (!v) return;
  const est = estimateFor(v, now());
  const around = ['fresh', 'aging'].includes(est.tone) && Number.isFinite(v.queue?.peopleLow) ? Math.round((v.queue.peopleLow + v.queue.peopleHigh) / 2) : 20;
  app.console.snaps += 1;
  const seed = `${v.id}:${app.console.snaps}`;
  app.console.photo = { venueId: v.id, seed, heads: headsFor(seed, around), count: 0, newest: -1, touched: false, filled: false, readyAt: performance.now() + 400 };
  const el = document.getElementById('line-photo');
  if (el) el.outerHTML = photoPanel(v, ctx()); else rerenderConsole();
  flashView(document.querySelector('#line-photo .lp-view'));
  document.getElementById('line-photo')?.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
  document.querySelector('#line-photo .scene-btn')?.focus({ preventScroll: true });
  announce('Photo taken. Tap each head, or use the buttons.');
}
/** Patch the line photo panel in place (a running count roll keeps going; the math and "Publish N" swap). */
function patchPhoto() {
  const el = document.getElementById('line-photo');
  const v = consoleVenue();
  if (!el || !v) { rerenderConsole(); return; }
  preserveFocus(() => patchTree(el, fragment(photoPanel(v, ctx()))), () => document.querySelector('#line-photo .scene-btn'));
  reliftToasts(); // the photo button may have moved under a toast that is still up
}
/** Door console "Mark every head": instant (no one-by-one reveal, which read as a machine finding people). The marks
 *  that are new fade in together (patchTree's enter), the count rolls once, and Publish takes focus. */
function fillPhoto() {
  const v = consoleVenue();
  const p = app.console.photo;
  if (!v || !p || p.venueId !== v.id) return;
  Object.assign(p, { count: p.heads, newest: -1, touched: true, filled: true });
  patchPhoto();
  document.querySelector('#line-photo [data-action="photo-publish"]')?.focus({ preventScroll: true });
  announce(`${p.count} people counted. Ready to publish.`);
}
function publishPhoto(btn) {
  const v = consoleVenue();
  const p = app.console.photo;
  if (!v || !p || p.venueId !== v.id) return;
  if (!p.touched) {
    toast('Count the line first.');
    document.querySelector('#line-photo .scene-btn')?.focus();
    return;
  }
  if (btn?.getAttribute('aria-disabled') === 'true' || performance.now() < p.readyAt) return;
  const role = app.console.role;
  const id = `count-${refCode(`${v.id}${p.seed}${Date.now()}`).toLowerCase()}`;
  app.state.counts.unshift({ id, venueId: v.id, at: now(), night: app.state.clock.realStart, by: role, heads: p.count, seed: p.seed, method: p.filled && p.count === p.heads ? 'demo-fill' : 'tap' });
  app.state.counts = app.state.counts.slice(0, 100);
  const filled = p.filled && p.count === p.heads;
  audit(v, `${ROLE_NAME[role]} photo count: ${p.count}${filled ? ' (marked all)' : ''}`);
  app.console.photo = null;
  const clearedBefore = app.ui.clearedQueue;
  app.ui.clearedQueue = null;
  persist(); rebuild();
  // QA plan 8.6: the count flies from the photo to where it lands (the new input row, else the guests' wait), the new
  // row drops into the feed and the panels glide to their new places; the wait number rolls if it changed.
  const vis = document.querySelector('#line-photo .pc-vis');
  const from = vis?.getBoundingClientRect();
  const wait0 = document.querySelector('#main .console-grid .queue-block .roll')?.textContent ?? null;
  const moving = motionOK();
  consoleList([], () => {
    const h = document.getElementById('qb-console');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); h.scrollIntoView({ block: 'nearest' }); }
    const roll = document.querySelector('#main .console-grid .queue-block .roll');
    if (roll && wait0 != null && wait0 !== roll.textContent && /\d/.test(wait0)) {
      const next = roll.textContent;
      roll.textContent = wait0;
      rollText(roll, next, dirOf(wait0, next));
    }
    if (moving && from?.width) flyCount(String(p.count), from);
  });
  // Undo takes the count back out (and brings back "Restore previous estimate" if the publish replaced a cleared one).
  toast(`Published ${p.count} in line`, { key: 'publish', actionLabel: 'Undo', onAction: () => {
    app.state.counts = app.state.counts.filter((c) => c.id !== id);
    audit(v, `Undid: photo count ${p.count}`);
    app.ui.clearedQueue = clearedBefore;
    persist(); rebuild();
    if (app.route.name === 'console') consoleList();
    announce('Count taken back.');
  } });
}
/** The published count's flight (QA plan 8.6): a chip leaves the photo's counter and lands on the new input row when it
 *  is on screen, else on the guests' wait in "What guests see now" (--d-fly, out); the place it lands nods once. */
function flyCount(text, from) {
  const vh = window.innerHeight;
  const onScreen = (el) => { if (!el) return null; const r = layoutRect(el); return r.top >= 0 && r.top + r.height <= vh - 80 ? r : null; };
  const row = document.querySelector('#main .feed > li');
  const wait = document.querySelector('#main .console-grid .queue-block .qb-wait');
  const land = onScreen(row) ? row : onScreen(wait) ? wait : null;
  if (!land) return;
  const to = layoutRect(land);
  const chip = document.createElement('span');
  chip.className = 'fly-chip num';
  chip.setAttribute('aria-hidden', 'true');
  chip.textContent = text;
  document.body.append(chip);
  const w = chip.offsetWidth, h = chip.offsetHeight;
  const x0 = from.left + from.width / 2 - w / 2, y0 = from.top + from.height / 2 - h / 2;
  const x1 = to.left + 12, y1 = to.top + to.height / 2 - h / 2;
  chip.style.left = `${x0}px`;
  chip.style.top = `${y0}px`;
  const flight = chip.animate([
    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    { transform: `translate(${(x1 - x0) * 0.6}px, ${(y1 - y0) * 0.6}px) scale(.8)`, opacity: 1, offset: 0.6 },
    { transform: `translate(${x1 - x0}px, ${y1 - y0}px) scale(.55)`, opacity: 0 },
  ], { duration: T.fly, easing: T.easeOut });
  const done = () => { chip.remove(); land.animate({ scale: [0.97, 1] }, popTiming()); }; // the landing pops once (rare: a publish)
  flight.finished.then(done, () => chip.remove());
}
/** Door status or pace from the console. Starts from the door state guests see now (seeded or this device's). */
function setDoor(t, key) {
  const v = consoleVenue();
  if (!v) return;
  const doorId = t.dataset.door;
  const label = v.doors.find((d) => d.id === doorId)?.label ?? 'Door';
  // Arrow keys walk a radio group one value at a time: changes to the same control within 2 s count as one edit,
  // so Undo goes back to where it started and the log keeps one line.
  const last = app.console.lastDoorEdit;
  const same = last && last.venueId === v.id && last.doorId === doorId && last.key === key && performance.now() - last.t < 2000;
  const prev = same ? last.prev : app.state.doors[v.id] ? structuredClone(app.state.doors[v.id]) : undefined;
  if (same && app.state.audit[0]?.venueId === v.id && app.state.audit[0].summary === last.summary) app.state.audit.shift();
  const base = currentDoor(v, ctx());
  const fallback = v.queue?.doorStatus ?? 'moving';
  const list = Object.fromEntries(v.doors.map((d) => [d.id, { status: base?.list?.[d.id]?.status ?? fallback, pace: base?.list?.[d.id]?.pace ?? null }]));
  const value = key === 'pace' ? Number(t.value) : t.value;
  list[doorId] = { ...list[doorId], [key]: value };
  app.state.doors[v.id] = { at: now(), by: app.console.role, list };
  const what = key === 'pace' ? `${label} pace → ${value} a min` : `${label} → ${DOOR_WORD[value]}`;
  audit(v, `${what} (${ROLE_NAME[app.console.role]})`);
  app.console.lastDoorEdit = { venueId: v.id, doorId, key, prev, t: performance.now(), summary: app.state.audit[0].summary };
  persist(); rebuild(); rerenderConsole();
  // One line, no restating the control (QA plan 9.6): "Pace 3/min", "Side door closed" (a two-door bar names the door).
  const msg = key === 'pace' ? `${v.doors.length > 1 ? `${label} pace` : 'Pace'} ${value}/min` : `${label} ${DOOR_WORD[value].toLowerCase()}`;
  toast(msg, { actionLabel: 'Undo', onAction: () => {
    app.console.lastDoorEdit = null;
    if (prev) app.state.doors[v.id] = prev; else delete app.state.doors[v.id];
    audit(v, `Undid: ${what}`);
    persist(); rebuild(); rerenderConsole();
    announce('Door change undone');
  } });
}
/* ---------------- deals posted from the console ---------------- */
// A live draft remembers its night: sent after that night is over, it is refused, never moved to the next one.
const dealDraft = () => (app.console.dealDraft ??= LIVE ? { ...newDealDraft(dealNight(), now()), night: dealNight() } : newDealDraft(dealNight(), now()));
/** The night a deal is for. A live team build runs on the real clock: once tonight's last slot (2 AM) has passed, the
 *  form is for the coming night. The demo's clock never leaves its night. */
const dealNight = () => (LIVE && now() >= atNight(app.state.clock.base, 2, 0) ? atNightOn(app.state.clock.base, 1, 18, 0) : app.state.clock.base);
function postDeal() {
  if (LIVE) { postDealLive(); return; }
  const v = consoleVenue();
  const d = dealDraft();
  const { errors, title } = checkDeal(d);
  const startsAt = atNight(app.state.clock.base, d.start[0], d.start[1]);
  const endsAt = atNight(app.state.clock.base, d.end[0], d.end[1]);
  if (!errors.time && endsAt <= now()) errors.time = 'That end time has already passed tonight.';
  app.console.dealErrors = errors;
  if (Object.keys(errors).length) {
    patchPage(); // patched, so the error lines drop in and the fields keep their nodes (QA plan 8.3)
    const first = ['kind', 'title', 'item', 'price', 'costOk', 'time'].find((k) => errors[k]);
    const id = { title: 'deal-title', item: 'deal-item', price: 'deal-price', costOk: 'deal-cost', time: 'deal-start' }[first];
    focusInvalid(document.getElementById(id), first === 'time' ? document.querySelector('#deal-form .field-pair') : null);
    announce(errors[first]);
    return;
  }
  const deal = { id: `deal-${refCode(`${v.id}${Date.now()}`).toLowerCase()}`, venueId: v.id, kind: d.kind, title, startsAt, endsAt, postedAt: now(), ...(d.kind === 'drink' ? { item: d.item, price: Number(d.price) } : {}) };
  app.state.deals.unshift(deal);
  audit(v, `Posted deal: ${title} (${formatTime(startsAt)}–${formatTime(endsAt)})`);
  persist();
  rebuild();
  app.console.dealDraft = { ...newDealDraft(app.state.clock.base, now()), kind: d.kind };
  consoleList(); // the new row rises into the posted list; the panels below glide down
  toast('Deal posted', { actionLabel: 'Undo', onAction: () => {
    app.state.deals = app.state.deals.filter((x) => x.id !== deal.id);
    audit(v, `Removed deal: ${title}`);
    persist(); rebuild();
    if (app.route.name === 'console') consoleList();
    announce('Deal removed.');
  } });
}
function removeDeal(id) {
  const i = app.state.deals.findIndex((x) => x.id === id);
  if (i < 0) return;
  const [gone] = app.state.deals.splice(i, 1);
  const v = app.venues.find((x) => x.id === gone.venueId);
  if (v) audit(v, `Removed deal: ${gone.title}`);
  persist();
  rebuild();
  document.getElementById('deal-h')?.focus?.({ preventScroll: true });
  consoleList([document.querySelector(`#main li[data-key="${CSS.escape(id)}"]`)], () => document.getElementById('deal-h')?.focus?.({ preventScroll: true }));
  toast(`Deal removed: ${gone.title}`, { actionLabel: 'Undo', onAction: () => { app.state.deals.splice(i, 0, gone); persist(); rebuild(); consoleList(); announce('Deal restored'); } });
}

function audit(venue, summary) {
  app.state.audit.unshift({ at: now(), venueId: venue.id, summary });
  app.state.audit = app.state.audit.slice(0, 50);
}

/* ---------------- Business view (team build): a demo login as one venue, no account or server ---------------- */
const bizOn = () => !globalThis.__STORE__ && (LIVE ? app.venue.phase === 'ready' : app.state.business?.on === true);
/** Opening the console while Business view is on signs in as the chosen venue (as its door staff); leaving it lets go
 *  of any photos added to preview. */
function enterBusiness(r, prev) {
  if (LIVE) {
    if (r.name === 'console') enterVenue(r);
    if (prev?.name === 'console' && r.name !== 'console') { dropUploads(); dropCountPhoto(); }
    return;
  }
  if (r.name === 'console' && bizOn()) {
    const valid = (id) => Boolean(id) && app.venues.some((v) => v.id === id);
    const want = valid(r.query.venue) ? r.query.venue : app.state.business.venueId;
    if (valid(want)) {
      app.console.venueId = want;
      if (app.state.business.venueId !== want) { app.state.business.venueId = want; persist(); } // a link signs in as that venue
    }
    if (BIZ_SECTIONS.some(([k]) => k === r.query.s)) app.console.section = r.query.s;
    app.console.role = 'bouncer';
  }
  if (prev?.name === 'console' && r.name !== 'console') dropUploads();
}
function setBusiness(on, input) {
  dropUploads();
  // Sign in as the first of these that names a real bar (an old link can leave a bad id in app.console.venueId).
  const valid = (id) => Boolean(id) && app.venues.some((v) => v.id === id);
  const venueId = [app.state.business?.venueId, app.console.venueId, app.venues[0]?.id].find(valid) ?? null;
  app.state.business = { on, venueId };
  Object.assign(app.console, { role: on ? 'bouncer' : 'ambassador', section: 'tonight', codeDraft: '', codeResult: null, photo: null, heldPhotos: {}, ideasFirst: null });
  persist();
  const sr = input?.closest('.switch-row')?.querySelector('.sr-only');
  if (sr) sr.textContent = `(${on ? 'on' : 'off'})`;
  if (app.route.name === 'profile') rerenderPage();
  const v = app.venues.find((x) => x.id === venueId);
  announce(on ? `Business view on. Signed in as ${v?.name ?? 'a venue'}, a demo login.` : 'Business view off.');
}
function bizSection(s) {
  if (!BIZ_SECTIONS.some(([k]) => k === s)) return;
  if (LIVE && !venueSections(app.venue.staff?.role).some(([k]) => k === s)) return;
  app.console.section = s;
  if (LIVE) { app.venue.section = s; loadSection(); }
  app.console.ideasFirst = null;
  history.replaceState({ ...(history.state ?? {}), idx: histIdx() }, '', buildHash('console', {}, { venue: consoleVenue()?.id, s }));
  app.renderedHash = location.hash;
  // Tabs stuck under the top bar stay put: the new section starts just under them. Tabs still in place: top of page.
  const tabs = document.querySelector('#main .biz-tabs');
  const stickTop = tabs ? parseFloat(getComputedStyle(tabs).top) : NaN;
  const stuck = Number.isFinite(stickTop) && window.scrollY > 0 && tabs.getBoundingClientRect().top <= stickTop + 1;
  rerenderConsole();
  if (!stuck) { window.scrollTo({ top: 0, behavior: 'auto' }); }
  else {
    const grid = document.querySelector('#main .biz-grid');
    const t = document.querySelector('#main .biz-tabs');
    if (grid && t) window.scrollTo({ top: Math.max(0, window.scrollY + grid.getBoundingClientRect().top - t.getBoundingClientRect().bottom - 12), behavior: 'auto' });
  }
  announce(`${BIZ_SECTIONS.find(([k]) => k === s)[1]}`);
}
const rewardTitle = (id) => REWARDS.find((x) => x.id === id)?.title ?? 'Reward';
function checkRedeemCode(raw) {
  app.console.codeDraft = String(raw ?? '');
  const r = codeCheck(raw);
  app.console.codeResult = r;
  if (r.kind === 'valid') app.console.codeDraft = r.code;
  rerenderConsole();
  // One channel per outcome. Focus goes where the next step is, and a screen reader reads what it lands on: the result
  // itself (unknown, used) or the field it describes (malformed). Only "valid" lands on the Mark button, so it is announced.
  if (r.kind === 'invalid') document.getElementById('redeem-code')?.focus();
  else if (r.kind === 'valid') document.querySelector('#main [data-action="redeem-confirm"]')?.focus();
  else document.getElementById('redeem-result')?.focus();
  if (r.kind === 'valid') announce(`Valid: ${rewardTitle(r.voucher.rewardId)}.`);
}
const codeCheck = (raw) => checkCode(raw, { vouchers: app.state.vouchers, redemptions: app.state.redemptions, now: now(), night: app.state.clock.realStart });
function confirmRedemption(code) {
  const v = consoleVenue();
  const r = codeCheck(code);
  if (!v || r.kind !== 'valid') { checkRedeemCode(code); return; }
  const red = { id: `rd-${refCode(`${r.code}:${Date.now()}`).toLowerCase()}`, ref: r.code, rewardId: r.voucher.rewardId, venueId: v.id, at: now(), sample: Boolean(r.voucher.sample), night: app.state.clock.realStart };
  app.state.redemptions.unshift(red);
  app.state.redemptions = app.state.redemptions.slice(0, 200);
  audit(v, `Redeemed ${r.code}: ${rewardTitle(red.rewardId)}`);
  persist();
  Object.assign(app.console, { codeDraft: '', codeResult: { kind: 'done', code: r.code, rewardId: red.rewardId, at: red.at } });
  consoleList();
  document.getElementById('redeem-result')?.focus?.({ preventScroll: true });
  toast(`Redeemed ${rewardTitle(red.rewardId)} · ${r.code}`, { actionLabel: 'Undo', onAction: () => {
    app.state.redemptions = app.state.redemptions.filter((x) => x.id !== red.id);
    audit(v, `Undid: redeemed ${r.code}`);
    persist();
    if (app.console.codeResult?.code === r.code) app.console.codeResult = codeCheck(r.code); // a shown result ("Redeemed", "Already redeemed") is valid again
    if (app.route.name === 'console') consoleList();
    else if (app.route.name === 'points') patchPoints();
    announce(`${r.code} is valid again.`);
  } });
}
/** A file picker for photos to preview (no capture: the phone offers its library, camera or files). Outside #main. */
function uploadInput() {
  let el = document.getElementById('biz-upload');
  if (el) return el;
  el = document.createElement('input');
  Object.assign(el, { type: 'file', id: 'biz-upload', accept: 'image/*', multiple: true, tabIndex: -1 });
  el.setAttribute('aria-hidden', 'true');
  el.className = 'cam-input';
  el.addEventListener('change', () => {
    const files = [...(el.files ?? [])];
    el.value = '';
    const v = consoleVenue();
    if (!v || !files.length || app.route?.name !== 'console' || !bizOn()) return;
    const room = Math.max(0, MAX_UPLOADS - app.console.uploads.filter((u) => u.venueId === v.id).length);
    const pics = files.filter((f) => /^image\//.test(f.type));
    const added = pics.slice(0, room).map((f, i) => ({ id: `up-${Date.now().toString(36)}-${i}`, venueId: v.id, url: URL.createObjectURL(f), sample: false }));
    app.console.uploads.push(...added);
    consoleList();
    const skipped = files.length - pics.length;
    announce(`${added.length ? `${added.length} photo${added.length === 1 ? '' : 's'} added, not posted.` : ''}${skipped ? ` ${skipped} file${skipped === 1 ? ' isn’t a photo' : 's aren’t photos'}.` : ''}${pics.length > added.length ? ` Up to ${MAX_UPLOADS} photos.` : ''}`.trim() || 'No photo added.');
  });
  document.body.append(el);
  return el;
}
function addSamplePhoto() {
  const v = consoleVenue();
  const mine = app.console.uploads.filter((u) => u.venueId === v?.id);
  if (!v || mine.length >= MAX_UPLOADS) return;
  app.console.uploads.push({ id: `up-sample-${Date.now().toString(36)}`, venueId: v.id, url: samplePhoto(v, mine.length), sample: true });
  consoleList();
  announce('Sample photo added, not posted.');
}
function removeUpload(id) {
  const u = app.console.uploads.find((x) => x.id === id);
  if (!u) return;
  document.getElementById('photos-h')?.focus?.({ preventScroll: true });
  dropUploads((x) => x.id === id);
  consoleList([document.querySelector(`#main li[data-key="${CSS.escape(id)}"]`)], () => document.getElementById('photos-h')?.focus?.({ preventScroll: true }));
  announce('Photo removed.');
}
/** Let go of preview photos (all, or those matching): object URLs are revoked so the picture leaves memory. */
function dropUploads(match = () => true) {
  if (globalThis.__STORE__ || !app.console?.uploads?.length) return;
  for (const u of app.console.uploads) if (match(u) && !u.sample) URL.revokeObjectURL(u.url);
  app.console.uploads = app.console.uploads.filter((u) => !match(u));
}
function setPassOverride(venue, patch) {
  const o = app.state.overrides[venue.id] ?? (app.state.overrides[venue.id] = {});
  o.pass = { ...(o.pass ?? {}), ...patch, capacity: { ...(o.pass?.capacity ?? {}), ...(patch.capacity ?? {}) } };
}

/* ---------------- Business view, live team build: a venue account on the server ---------------- */
// Everything here runs only when LIVE (lib/backend.js) and goes through venueApi, never the guest's client. Human counts
// only: a number, −/+, and taps on a photo that never leaves the phone. Nothing counts heads automatically.
/** The bar Business view is on: one of the account's bars (an unlisted training bar too), with the public estimate
 *  when it is a listed bar. */
function venueBar() {
  const s = app.venue;
  const bars = s?.staff?.bars ?? [];
  const b = bars.find((x) => x.id === s.barId) ?? bars[0];
  if (!b) return null;
  const listed = app.venues.find((x) => x.id === b.id);
  return { ...(listed ?? { doors: [{ id: 'main', label: 'Door' }], queue: null, hours: null }), id: b.id, name: b.name, area: b.area ?? listed?.area ?? null, listed: Boolean(listed) && b.is_listed !== false };
}
/** No venue session (never signed in, signed out, or the server ended it): the sign-in panel names who it was and
 *  what waits for them. */
/** An open "sign out and delete N counts?" row follows the queue, and closes when nothing is left to lose. */
function syncConfirm(s = app.venue) {
  if (!s?.confirmOut) return;
  const n = venueApi.queued().length;
  Object.assign(s, n ? { queued: n } : { confirmOut: false });
}
function signedOutVenue(note = null) {
  const s = app.venue;
  const n = venueApi.queued().length;
  // What the account saw (its count and line photo, preview photos, the last code checked, deals, report, notices) goes:
  // the next person to sign in on this phone may be another account. The email, the note and the stored queue stay.
  dropCountPhoto();
  dropUploads();
  app.console.dealDraft = null;
  Object.assign(s, { phase: 'signin', staff: null, busy: false, error: null, errorField: null, email: s.email || venueApi.lastEmail(), note: n ? `Sign in again to send ${n} queued count${n === 1 ? '' : 's'}.` : note, ...accountState() });
}
function enterVenue(r) {
  const s = app.venue;
  if (BIZ_SECTIONS.some(([k]) => k === r.query.s)) s.section = r.query.s;
  // A link names a bar: taken once the account's bars are known (readVenueStaff checks it), never one it doesn't have.
  if (r.query.venue && (!s.staff || s.staff.bars.some((x) => x.id === r.query.venue))) s.barId = r.query.venue;
  if (!venueApi.signedIn()) { if (s.phase !== 'signin') signedOutVenue(); return; }
  if (s.phase === 'ready') { loadSection(); return; }
  if (s.phase !== 'totp') { s.phase = 'loading'; loadVenueStaff(); }
}
const onConsole = () => app.route?.name === 'console';
/** Redraw Business view after a phase change, landing focus on the field that needs fixing, else the panel's heading. */
function showVenuePhase(focusSel = null) {
  if (!onConsole()) return;
  rerenderPage();
  const el = (focusSel && document.querySelector(focusSel)) || document.querySelector('#main .biz-grid h2[tabindex]') || document.getElementById('page-h');
  el?.focus({ preventScroll: true });
}
/** A venue call failed in a way that changes where Business view is: signed out, or the second factor is needed.
 *  True when it moved (the caller just redraws). */
function venueMoved(e) {
  if (e?.code === 'signed_out') { signedOutVenue('You’ve been signed out. Sign in again.'); showVenuePhase('#venue-email'); return true; }
  if (e?.code === 'mfa_required') { Object.assign(app.venue, { phase: 'totp', error: null, busy: false }); showVenuePhase('#venue-code'); return true; }
  return false;
}
/** A server error (5xx, or an answer it couldn't read) is the server's problem, not the phone's connection. */
const serverTrouble = (e) => (e?.status >= 500 || e?.code === 'bad_response' ? 'The server had a problem. Try again in a minute.' : null);
/** Plain words for the other failures of a venue call. */
function venueText(e) {
  if (e?.pgCode === '42501') { loadVenueStaff(); return 'This bar isn’t on your account anymore.'; }
  if (e?.code === 'unknown_bar' || e?.pgCode === '22023') { loadVenueStaff(); return 'This bar isn’t in the system anymore.'; }
  if (e?.status === 0 && isOffline()) return 'You’re offline.';
  return serverTrouble(e) ?? friendlyError(e);
}
function refuseVenue(text) {
  const email = app.venue.email || venueApi.lastEmail();
  venueApi.signOut();
  dropCountPhoto();
  dropUploads();
  app.console.dealDraft = null; // an unsent deal is that account's
  app.venue = freshVenue();
  Object.assign(app.venue, { email, error: text, errorField: 'email' });
  announce(text);
}

let venueLoading = null;
function loadVenueStaff() { venueLoading ??= readVenueStaff().finally(() => { venueLoading = null; }); return venueLoading; }
/** The server decides what this account may do: admins and non-staff are refused here; a bar manager needs the
 *  second factor on this session; a counter counts. */
async function readVenueStaff() {
  const s = app.venue;
  let staff;
  try {
    staff = await venueApi.getMyStaff();
  } catch (e) {
    if (app.venue !== s) return; // signed out meanwhile
    if (venueMoved(e)) return;
    if (e?.pgCode === '42501') { refuseVenue('This account can’t use Business view.'); showVenuePhase('#venue-email'); return; }
    if (s.phase === 'ready') return; // keep working from what was loaded
    Object.assign(s, { phase: 'error', confirmOut: false, error: e?.code === 'not_deployed' ? 'Not available yet.' : serverTrouble(e) ?? friendlyError(e) });
    showVenuePhase();
    return;
  }
  if (app.venue !== s) return;
  if (!staff || !['counter', 'bar_manager'].includes(staff.role) || !Array.isArray(staff.bars)) {
    refuseVenue(staff?.role === 'admin' ? 'Admin accounts can’t use Business view in the app.' : 'This account can’t use Business view.');
    showVenuePhase('#venue-email');
    return;
  }
  if (!staff.bars.length) { refuseVenue('This account has no bar yet. Ask Night Out.'); showVenuePhase('#venue-email'); return; }
  if (staff.mfa?.required && !staff.mfa.ok) {
    if (!staff.mfa.enrolled) { refuseVenue('Two-step sign-in isn’t set up for this account yet. Ask Night Out.'); showVenuePhase('#venue-email'); return; }
    Object.assign(s, { phase: 'totp', staff: null, busy: false, confirmOut: false, error: s.verified ? 'That code didn’t unlock venue tools. Ask Night Out.' : null });
    showVenuePhase('#venue-code');
    return;
  }
  const first = s.phase !== 'ready';
  Object.assign(s, { phase: 'ready', staff, busy: false, error: null, errorField: null, note: null, confirmOut: false });
  if (!staff.bars.some((b) => b.id === s.barId)) s.barId = staff.bars[0].id;
  if (!venueSections(staff.role).some(([k]) => k === s.section)) s.section = 'tonight';
  if (s.section === 'offers') dealDraft();
  if (first && onConsole()) { showVenuePhase(); history.replaceState({ ...(history.state ?? {}), idx: histIdx() }, '', buildHash('console', {}, { venue: s.barId, s: s.section })); app.renderedHash = location.hash; }
  else if (onConsole()) rerenderConsole();
  flushCounts();
  loadSection();
}

/** Sign-in failures in words (GoTrue's codes; a shared campus network can hit the sign-in limit). */
function signInText(e) {
  if (!(e instanceof ApiError) || e.status === 0) return 'Can’t reach the server. Check your connection and try again.';
  const c = e.authCode ?? e.code;
  if (c === 'email_not_confirmed') return 'This account isn’t confirmed yet. Ask Night Out.';
  if (c === 'invalid_credentials' || c === 'invalid_grant') return 'Wrong email or password.';
  if (c === 'user_banned') return 'This account is turned off. Ask Night Out.';
  if (e.status === 429 || /rate_limit/.test(String(c))) return friendlyError(e);
  if (c === 'validation_failed') return 'Enter a valid email and your password.';
  if (c === 'anonymous') return 'This isn’t a venue account.';
  if (e.status >= 500) return 'The server had a problem. Try again in a minute.';
  return 'Couldn’t sign in. Try again.';
}
async function venueSignIn(form) {
  const s = app.venue;
  if (s.busy) return;
  const email = form.querySelector('#venue-email').value.trim().toLowerCase();
  const pw = form.querySelector('#venue-password');
  Object.assign(s, { email, note: null });
  // An error names the field that gets focus (aria-invalid, described by the error) and is announced once.
  if (!email || !pw.value) { Object.assign(s, { error: 'Enter your email and password.', errorField: email ? 'password' : 'email' }); patchPage(); form.querySelector(email ? '#venue-password' : '#venue-email')?.focus(); announce(s.error); return; }
  if (isOffline()) { Object.assign(s, { error: 'You’re offline. Connect, then sign in.', errorField: null }); patchPage(); announce(s.error); return; }
  Object.assign(s, { busy: true, error: null, errorField: null, verified: false });
  patchPage();
  try {
    await venueApi.signIn(email, pw.value);
  } catch (e) {
    if (app.venue !== s) return;
    Object.assign(s, { busy: false, error: signInText(e), errorField: 'password' });
    patchPage();
    document.getElementById('venue-password')?.focus();
    announce(s.error);
    return;
  }
  if (app.venue !== s) return; // signed out while it was on its way: never undone by the answer
  pw.value = ''; // never kept once it worked
  s.busy = false;
  s.phase = 'loading';
  showVenuePhase();
  await loadVenueStaff();
}
async function venueTotp(form) {
  const s = app.venue;
  if (s.busy) return;
  const code = form.querySelector('#venue-code').value.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(code)) { s.error = 'Enter the 6-digit code.'; patchPage(); document.getElementById('venue-code')?.focus(); announce(s.error); return; }
  Object.assign(s, { busy: true, error: null, confirmOut: false });
  patchPage();
  try {
    await venueApi.verifyTotp(code);
  } catch (e) {
    if (app.venue !== s) return; // signed out meanwhile ("Use another account")
    s.busy = false;
    if (venueMoved(e)) return;
    s.error = e?.code === 'no_factor' ? 'Two-step sign-in isn’t set up for this account yet. Ask Night Out.'
      : e?.status === 422 || /^mfa_/.test(String(e?.authCode)) ? 'That code didn’t work. Enter the newest one.' : signInText(e);
    patchPage();
    const f = document.getElementById('venue-code');
    if (f) { f.value = ''; f.focus(); }
    announce(s.error);
    return;
  }
  if (app.venue !== s) return;
  Object.assign(s, { busy: false, verified: true, phase: 'loading' });
  showVenuePhase();
  await loadVenueStaff();
}
/** Sign out (asks first when counts are still queued, from Business view, the code step or the error panel): session,
 *  queued counts and the mirror go; the server ends the session too. */
function venueSignOut({ confirmed = false } = {}) {
  const n = venueApi.queued().length;
  if (n && !confirmed && ['ready', 'totp', 'error'].includes(app.venue.phase)) {
    Object.assign(app.venue, { confirmOut: true, queued: n });
    rerenderConsole();
    document.querySelector('#main [data-action="venue-signout-confirm"]')?.focus();
    return;
  }
  venueApi.signOut();
  dropUploads();
  dropCountPhoto();
  app.console.dealDraft = null;
  app.venue = freshVenue();
  showVenuePhase('#venue-email');
  announce('Signed out.');
}
function venueSwitch(id) {
  const s = app.venue;
  if (!s.staff?.bars.some((b) => b.id === id)) return;
  dropCountPhoto();
  Object.assign(s, { barId: id, count: { ...freshCount(), door: s.count.door }, code: freshCode(), deals: null, report: null, confirmOut: false, withdrawAsk: null });
  history.replaceState({ idx: histIdx() }, '', buildHash('console', {}, { venue: id, s: s.section }));
  app.renderedHash = location.hash;
  rerenderConsole();
  loadSection();
}
/** The section's server data: deals for Offers, the report for Report and Redeem; Tonight sends what is queued. */
function loadSection() {
  const s = app.venue;
  if (s.phase !== 'ready') return;
  if (s.section === 'offers') { dealDraft(); loadDeals(); } // the draft first, so the form shows the night it is for
  if (s.section === 'report' || s.section === 'redeem') loadReport();
  if (s.section === 'tonight') flushCounts();
}

/* Tonight: count, then Publish. The count waits in the client's queue (offline, a timeout, a 5xx) and is sent with its
   own time; the 3 newest per bar wait at most 15 minutes, and a refused one is never sent again. */
const countInput = () => document.getElementById('count-people');
function countSet(n) {
  const c = app.venue.count;
  c.people = Math.max(0, Math.min(400, n));
  Object.assign(c, { raw: null, error: null });
  patchPage();
  const input = countInput();
  if (input) input.value = String(c.people);
  announce(`${c.people} counted.`);
}
let countPhotoEl = null;
/** The phone's photo picker (library or camera, its choice; no capture attribute). Outside #main. */
function countPhotoInput() {
  if (countPhotoEl) return countPhotoEl;
  const el = (countPhotoEl = document.createElement('input'));
  Object.assign(el, { type: 'file', id: 'count-photo', accept: 'image/*', tabIndex: -1 });
  el.setAttribute('aria-hidden', 'true');
  el.className = 'cam-input';
  el.addEventListener('change', () => {
    const file = el.files?.[0];
    el.value = '';
    if (!file || !/^image\//.test(file.type) || !onConsole() || !bizOn()) return;
    dropCountPhoto();
    Object.assign(app.venue.count, { photo: URL.createObjectURL(file), marks: [] });
    patchPage();
    document.querySelector('#main [data-action="count-mark"]')?.focus({ preventScroll: true });
    announce('Photo added. Tap each head to count it.');
  });
  document.body.append(el);
  return el;
}
/** Let go of the count photo (memory only: it was never saved or sent). */
function dropCountPhoto() {
  const c = app.venue?.count;
  if (c?.photo) URL.revokeObjectURL(c.photo);
  if (c) Object.assign(c, { photo: null, marks: [] });
}
function markHead(btn, e) {
  const c = app.venue.count;
  if (!c.photo || c.people >= 400) return;
  const r = btn.getBoundingClientRect();
  const x = e?.clientX && r.width ? ((e.clientX - r.left) / r.width) * 100 : 50;
  const y = e?.clientY && r.height ? ((e.clientY - r.top) / r.height) * 100 : 50;
  c.marks.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
  countSet(c.people + 1);
}
function setCountMsg(barId, m) {
  app.venue.msg[barId] = { ...m, at: Date.now() };
  if (m.until) startCountdown();
}
function notice(barId, text) {
  const s = app.venue;
  s.notices = [...s.notices.filter((n) => Date.now() - n.at < 10 * MIN_MS), { barId, text, at: Date.now() }].slice(-5);
  announce(text);
}
/** A refused live count: the status (a live region) says it once, in minutes; the seconds tick beside it, hidden from
 *  screen readers, so the wait isn't read out every second. */
const waitMsg = (until) => ({ kind: 'error', text: 'Too soon after the last count here.', sr: `Try again in about ${Math.max(1, Math.round((until - Date.now()) / 60_000))} min.`, until });
let countdownTimer = 0;
/** A refused live count says when the next one is taken, second by second (the ticking text node only). */
function startCountdown() {
  if (countdownTimer) return;
  countdownTimer = setInterval(() => {
    const el = document.querySelector('#count-status[data-until]');
    const left = Object.entries(app.venue?.msg ?? {}).filter(([, m]) => m.until);
    for (const [id, m] of left) if (m.until <= Date.now()) delete app.venue.msg[id];
    if (el) { const u = Number(el.dataset.until); const tick = el.querySelector('[data-tick]'); if (u > Date.now()) { if (tick) tick.textContent = ` ${countWait(u, Date.now())}`; } else if (onConsole()) patchPage(); }
    if (!left.some(([, m]) => m.until > Date.now())) { clearInterval(countdownTimer); countdownTimer = 0; }
  }, 1000);
}
function publishCount() {
  const s = app.venue;
  const v = venueBar();
  const c = s.count;
  if (!v) return;
  const typed = (countInput()?.value ?? String(c.people)).trim();
  const n = Number(typed);
  if (!/^\d+$/.test(typed) || n > 400) {
    c.error = n > 400 ? 'Over 400: check the count. One count can post up to 400.' : 'Enter the number of people, 0 to 400.';
    patchPage();
    countInput()?.focus();
    announce(c.error);
    return;
  }
  const { dropped } = venueApi.queueCount({ barId: v.id, barName: v.name, people: n, door: c.door, pace: ['paused', 'closed'].includes(c.door) ? null : c.pace });
  syncConfirm(s);
  for (const d of dropped) notice(d.bar_id, `Not sent: ${d.people} at ${d.bar_name} from ${formatTime(d.at)}. Only the 3 newest counts wait to send.`);
  dropCountPhoto();
  Object.assign(c, { people: 0, raw: null, error: null });
  setCountMsg(v.id, { kind: 'queued', text: isOffline() ? 'Offline. Queued, will send.' : 'Sending…' });
  patchPage();
  if (countInput()) countInput().value = '0';
  haptic('medium');
  flushCounts();
}
let flushing = null;
let flushTimer = 0;
let flushTries = 0;
function flushCounts() { if (!venueApi) return null; flushing ??= sendCounts().finally(() => { flushing = null; }); return flushing; }
const queuedText = (n) => `${n} count${n === 1 ? '' : 's'} queued, will send.`;
async function sendCounts() {
  const s = app.venue;
  clearTimeout(flushTimer);
  for (const q of venueApi.expireQueue()) {
    // tries > 0: a request went out, and the server may have taken it before the answer was lost.
    notice(q.bar_id, q.tries > 0 ? `Couldn’t confirm ${q.people} at ${q.bar_name} from ${formatTime(q.at)} was sent. It’s over 15 minutes old now. Count again.`
      : `Not sent: ${q.people} at ${q.bar_name} from ${formatTime(q.at)}. Over 15 minutes old, so it was dropped. Count again.`);
  }
  const waiting = venueApi.queued();
  if (!waiting.length) { flushTries = 0; return; }
  if (!venueApi.signedIn()) { if (s.phase !== 'signin') { signedOutVenue(); showVenuePhase('#venue-email'); } return; }
  if (s.phase !== 'ready') return;
  if (isOffline()) {
    for (const id of new Set(waiting.map((q) => q.bar_id))) setCountMsg(id, { kind: 'queued', text: `Offline. ${queuedText(waiting.filter((q) => q.bar_id === id).length)}` });
    if (onConsole()) patchPage();
    return;
  }
  const results = await venueApi.flush();
  // Signed out while it was sending: nothing here is this panel's any more. A count the next account published joined
  // this pass and was left for it: a fresh pass sends it (after this one has let go of `flushing`).
  if (app.venue !== s) { setTimeout(flushCounts, 0); return; }
  let again = false;
  for (const r of results) {
    const q = r.item;
    if (r.kind === 'sent') { flushTries = 0; setCountMsg(q.bar_id, { kind: 'ok', text: `Posted ${q.people} at ${formatTime(q.at)}.` }); announce(`Posted ${q.people}.`); continue; }
    if (r.kind === 'retry') { again = true; setCountMsg(q.bar_id, { kind: 'queued', text: r.error?.status >= 500 ? 'Server problem. Queued, will retry.' : 'Queued, will send.' }); continue; }
    if (r.kind === 'signed_out' || r.kind === 'mfa') { venueMoved(r.error); return; }
    // Refused: gone for good. A count just made gets its words (a wait gets a countdown, and the number goes back in);
    // a queued one that comes back refused leaves a notice.
    const e = r.error;
    const text = e?.code === 'rate_limited' ? null
      : e?.pgCode === '22023' && /counted_at|15 minutes/i.test(e.message) ? (q.tries > 0 ? 'Couldn’t confirm it was sent, and it’s now over 15 minutes old. Count again.' : 'Too old to send (over 15 minutes). Count again.')
        : e?.pgCode === '22023' || e?.pgCode === '22P02' ? 'The server didn’t accept this count. Check the number and post again.'
          : e?.code === 'not_deployed' ? 'Not available yet.' : venueText(e);
    if (!r.queued && q.bar_id === s.barId) {
      if (e?.code === 'rate_limited') {
        setCountMsg(q.bar_id, waitMsg(Date.now() + (Number(e.retryAfter) || 120) * 1000));
        if (!s.count.people) s.count.people = q.people;
      } else setCountMsg(q.bar_id, { kind: 'error', text });
    } else {
      notice(q.bar_id, e?.code === 'rate_limited' ? `Not sent: ${q.people} at ${q.bar_name} from ${formatTime(q.at)}. It came too soon after another count.` : `${q.bar_name}: ${text}`);
      delete s.msg[q.bar_id];
    }
  }
  const left = venueApi.queued();
  for (const id of new Set(left.map((q) => q.bar_id))) if (s.msg[id]?.kind !== 'error') setCountMsg(id, { kind: 'queued', text: s.msg[id]?.kind === 'queued' ? s.msg[id].text : queuedText(left.filter((q) => q.bar_id === id).length) });
  syncConfirm(s);
  // The field shows the count, unless it holds a number being typed (that stays as typed).
  if (onConsole()) { patchPage(); if (countInput() && document.activeElement !== countInput() && s.count.raw == null) countInput().value = String(s.count.people); }
  if (again && left.length) {
    flushTimer = setTimeout(flushCounts, Math.min(30_000, 5000 * 2 ** Math.min(flushTries, 3)));
    flushTries += 1;
  }
}

/* Redeem: check a code, then mark it redeemed, once. No Undo: a redemption can't be taken back. */
const focusResult = () => (document.querySelector('#main [data-action="redeem-confirm"]') ?? document.getElementById('redeem-result'))?.focus({ preventScroll: true });
function codeTrouble(e) {
  const m = Math.max(1, Math.ceil((Number(e?.retryAfter) || 600) / 60));
  if (e?.code === 'locked') return `Code checks are paused at this bar for about ${m} min (too many unknown codes).`;
  if (e?.code === 'rate_limited') return `Too many codes didn’t check out. Try again in about ${m} min.`;
  if (e?.code === 'not_deployed') return 'Not available yet.';
  return venueText(e);
}
async function checkCodeLive(raw) {
  const s = app.venue;
  const v = venueBar();
  const c = s.code;
  if (!v || c.busy || c.result?.busy) return; // never while a redemption is on its way
  c.draft = String(raw ?? '');
  const code = voucherCode(raw);
  if (!code) { c.result = { kind: 'invalid' }; rerenderConsole(); document.getElementById('redeem-code')?.focus(); return; }
  // The code of a redemption whose answer was lost: try that redemption again (its own id: "duplicate" if it went
  // through), never a fresh check, which would read this bar's own redemption as already used.
  if (c.lost?.code === code) { c.result = { kind: 'pending', code, reward: c.lost.reward }; redeemLive(code); return; }
  if (isOffline()) { c.result = { kind: 'error', text: 'You’re offline. Codes can’t be checked offline.' }; rerenderConsole(); focusResult(); return; }
  Object.assign(c, { busy: true, draft: code, result: null });
  rerenderConsole();
  let out;
  try {
    out = await venueApi.checkVoucher(v.id, code);
  } catch (e) {
    if (app.venue !== s) return;
    c.busy = false;
    if (venueMoved(e)) return;
    if (voucherCode(c.draft) !== code) { rerenderConsole(); return; } // the field moved on meanwhile
    c.result = e?.code === 'invalid_code' ? { kind: 'invalid' } : { kind: 'error', text: codeTrouble(e) };
    rerenderConsole();
    focusResult();
    return;
  }
  if (app.venue !== s) return;
  c.busy = false;
  // The field was changed to another code while this one was checked: its answer is for a code no longer shown.
  if (voucherCode(c.draft) !== code) { rerenderConsole(); return; }
  c.result = { kind: out?.kind ?? 'unknown', code, reward: out?.reward ?? null, expiresAt: out?.expires_at ?? null, usedHereAt: out?.used_here_at ? Date.parse(out.used_here_at) : null };
  // One redemption id per code; a retry after a timeout reuses it.
  if (c.result.kind === 'valid' && c.clientCode !== code) Object.assign(c, { clientId: uuid(), clientCode: code, lost: null });
  rerenderConsole();
  focusResult();
  if (c.result.kind === 'valid') announce(`Valid: ${c.result.reward?.title ?? 'reward'}.`);
}
async function redeemLive(code) {
  const s = app.venue;
  const v = venueBar();
  const c = s.code;
  const r = c.result;
  if (!v || !r || r.code !== code || !['valid', 'pending'].includes(r.kind) || r.busy) return;
  if (isOffline()) { c.result = { kind: 'error', text: 'You’re offline. Nothing was redeemed.' }; rerenderConsole(); focusResult(); return; }
  if (!c.clientId || c.clientCode !== code) Object.assign(c, { clientId: uuid(), clientCode: code });
  r.busy = true;
  rerenderConsole();
  // No answer (a timeout, a 5xx, or a 2xx that isn't the server's answer): it may have gone through. Trying again with
  // the same id answers "duplicate".
  const lostAnswer = () => { c.result = { ...r, kind: 'pending' }; c.lost = { code, reward: r.reward }; rerenderConsole(); focusResult(); };
  let out;
  try {
    out = await venueApi.redeemVoucher(v.id, code, c.clientId);
  } catch (e) {
    if (app.venue !== s) return;
    r.busy = false;
    if (venueMoved(e)) return;
    if (e?.retryable) { lostAnswer(); return; }
    if (['used', 'expired', 'not_offered_here', 'offer_limit', 'unknown'].includes(e?.code)) Object.assign(c, { result: { kind: e.code, code, reward: r.reward }, clientId: null, clientCode: null, lost: null });
    else c.result = { kind: 'error', text: codeTrouble(e) };
    rerenderConsole();
    focusResult();
    return;
  }
  if (app.venue !== s) return;
  r.busy = false;
  if (!(out?.ok === true && ['accepted', 'duplicate'].includes(out.status))) { lostAnswer(); return; }
  // accepted, or duplicate (this same redemption, answered again after a lost reply): redeemed either way.
  Object.assign(c, { result: { kind: 'done', code, reward: out.reward ?? r.reward, at: Date.parse(out.at) || Date.now() }, clientId: null, clientCode: null, lost: null, draft: '' });
  rerenderConsole();
  focusResult();
  haptic('success');
  announce(`Redeemed ${c.result.reward?.title ?? 'the reward'}.`);
  loadReport();
}
/** Typing in the code field: a result for another code goes (its Mark as redeemed would redeem that other code). A lost
 *  redemption keeps its id and code, so checking that code again tries it again. */
function codeEdited(input) {
  const c = app.venue.code;
  c.draft = input.value;
  if (!c.result || c.result.busy || voucherCode(input.value) === c.result.code) return;
  if (c.result.kind !== 'pending' && !c.lost) Object.assign(c, { clientId: null, clientCode: null });
  c.result = null;
  document.querySelector('#main #redeem-result')?.remove();
  input.removeAttribute('aria-invalid');
  input.setAttribute('aria-describedby', 'redeem-help');
}

/* Offers: a deal goes to Night Out for review ("Sent for review"); the list is the bar's own deals. */
const DEAL_FIELD_TEXT = {
  pick_kind: 'Pick a deal type.', pick_drink: 'Pick the drink.', price_range: 'Enter the price per drink, $1 to $50.',
  cost_not_confirmed: 'Confirm the price is at or above your cost.', title_required: 'Add a short headline.', title_too_short: 'Use at least 3 characters.',
  title_too_long: 'Keep it to 32 characters.', unsupported_characters: 'Use plain letters, numbers and punctuation. Emoji and hidden characters aren’t allowed.',
  banned_terms: 'New Jersey doesn’t allow unlimited, free-drink, upsized or gender-based deals.', multi_drink: 'New Jersey doesn’t allow 2-for-1 or multi-drink deals on alcohol.',
  alcohol_needs_drink_special: 'Alcohol prices go under “Drink special (21+)” so the price and size are checked.', time_required: 'Pick a start and end time.',
  end_before_start: 'The deal has to end after it starts.', already_ended: 'That end time has already passed.', too_far: 'A deal can start at most 7 days ahead.',
  one_night: 'A deal runs one night, 12 hours at most.',
};
function dealErrorsShown(errors) {
  patchPage();
  const first = ['kind', 'title', 'item', 'price', 'costOk', 'time'].find((k) => errors[k]);
  const id = { title: 'deal-title', item: 'deal-item', price: 'deal-price', costOk: 'deal-cost', time: 'deal-start' }[first];
  focusInvalid(document.getElementById(id), first === 'time' ? document.querySelector('#deal-form .field-pair') : null);
  announce(errors[first] ?? '');
}
async function postDealLive() {
  const s = app.venue;
  const v = venueBar();
  const d = dealDraft();
  if (!v || s.dealSending) return;
  const night = dealNight();
  // The form is for the night it was opened on. Past 2 AM that night is over: the times are reset for the coming night
  // and the deal isn't sent (never quietly moved to another night).
  if (d.night != null && d.night !== night) {
    app.console.dealDraft = { ...d, ...newDealDraftTimes(night), night };
    app.console.dealErrors = { time: 'That end time has already passed tonight.' };
    dealErrorsShown(app.console.dealErrors);
    return;
  }
  const { errors, title } = checkDeal(d);
  const startsAt = atNight(night, d.start[0], d.start[1]);
  const endsAt = atNight(night, d.end[0], d.end[1]);
  if (!errors.time && endsAt <= Date.now()) errors.time = 'That end time has already passed tonight.';
  app.console.dealErrors = errors;
  if (Object.keys(errors).length) { dealErrorsShown(errors); return; }
  if (isOffline()) { toast('You’re offline. Not sent.'); return; } // the draft stays as it is
  const drink = d.kind === 'drink';
  const args = { barId: v.id, kind: d.kind, title: drink ? null : title, drinkItem: drink ? d.item : null, priceCents: drink ? Math.round(Number(d.price) * 100) : null,
    costConfirmed: drink && Boolean(d.costOk), startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() };
  const sig = JSON.stringify(args);
  if (s.dealClient?.sig !== sig) s.dealClient = { sig, id: uuid() }; // the same deal sent again (a lost answer) keeps its id
  s.dealSending = true;
  patchPage();
  let out;
  try {
    out = await venueApi.submitDeal({ ...args, clientId: s.dealClient.id });
  } catch (e) {
    if (app.venue !== s) return;
    s.dealSending = false;
    if (venueMoved(e)) return;
    if (e?.code === 'invalid_deal') {
      app.console.dealErrors = Object.fromEntries(Object.entries(e.data?.fields ?? {}).map(([k, code]) => [k, DEAL_FIELD_TEXT[code] ?? 'Check this field.']));
      if (Object.keys(app.console.dealErrors).length) { dealErrorsShown(app.console.dealErrors); return; }
    }
    patchPage();
    toast(e?.code === 'too_many_deals' ? 'This bar already has 5 live or waiting deals. Withdraw one first.'
      : e?.code === 'rate_limited' ? `Too many deals sent today. Try again in about ${Math.max(1, Math.ceil((Number(e.retryAfter) || 3600) / 3600))} h.` : venueText(e));
    return;
  }
  if (app.venue !== s) return;
  s.dealSending = false;
  // A 2xx that isn't the server's answer (a proxy page, a cut-off body): nothing says it was stored. The draft and its
  // id stay, so sending again can't make a second deal.
  if (!(out?.ok === true && ['pending', 'duplicate'].includes(out.status))) { patchPage(); toast('Couldn’t confirm it was sent. Try again.'); return; }
  s.dealClient = null;
  app.console.dealDraft = { ...newDealDraft(night, now()), kind: d.kind, night };
  app.console.dealErrors = {};
  patchPage();
  toast(out.status === 'duplicate' ? 'Already sent for review' : 'Sent for review');
  loadDeals();
}
/** A new draft's start and end for a night (the rest of the draft stays as typed). */
const newDealDraftTimes = (night) => { const { start, end } = newDealDraft(night, now()); return { start, end }; };
async function loadDeals() {
  const s = app.venue;
  const v = venueBar();
  if (!v || s.staff?.role !== 'bar_manager') return;
  const prev = s.deals?.barId === v.id ? s.deals : null;
  // A reply for another bar (switched meanwhile) or another account (signed out meanwhile) is dropped.
  const stale = () => app.venue !== s || venueBar()?.id !== v.id;
  try {
    const out = await venueApi.deals(v.id);
    if (stale()) return;
    if (!Array.isArray(out?.deals)) throw new ApiError('Unreadable response', { status: 200, code: 'bad_response' });
    s.deals = { barId: v.id, list: out.deals, error: null };
  } catch (e) {
    if (app.venue !== s) return;
    if (venueMoved(e)) return;
    if (stale()) return;
    // A server problem or an unreadable answer keeps the last good list.
    s.deals = { barId: v.id, list: prev?.list ?? null, error: e?.code === 'not_deployed' ? 'Not available yet.' : prev?.list ? null : 'Couldn’t load your deals. Try again in a minute.' };
  }
  if (onConsole() && s.section === 'offers') rerenderConsole();
}
/** Withdraw: a deal guests can see now (live, or approved) asks first, since only a new review brings it back. One
 *  request per deal at a time. */
async function withdrawDeal(id, { confirmed = false } = {}) {
  const s = app.venue;
  const v = venueBar();
  if (!v || s.withdrawing.includes(id)) return;
  const d = (s.deals?.barId === v.id ? s.deals.list : null)?.find((x) => x.id === id);
  const seen = d && (d.review_state === 'approved' || (d.is_published && Date.parse(d.ends_at) > Date.now()));
  if (seen && !confirmed) {
    s.withdrawAsk = id;
    rerenderConsole();
    document.querySelector('#main [data-action="deal-withdraw-confirm"]')?.focus();
    return;
  }
  s.withdrawAsk = null;
  if (isOffline()) { rerenderConsole(); toast('You’re offline. Nothing changed.'); return; }
  s.withdrawing = [...s.withdrawing, id];
  rerenderConsole();
  try {
    const out = await venueApi.withdrawDeal(v.id, id);
    if (app.venue !== s) return;
    toast(out?.status === 'withdrawn' ? 'Deal withdrawn' : 'That deal was already off.');
  } catch (e) {
    if (app.venue !== s) return;
    s.withdrawing = s.withdrawing.filter((x) => x !== id);
    if (venueMoved(e)) return;
    toast(e?.code === 'not_found' ? 'That deal isn’t on this bar anymore.' : venueText(e));
  }
  s.withdrawing = s.withdrawing.filter((x) => x !== id);
  document.getElementById('deal-h')?.focus({ preventScroll: true });
  loadDeals();
}
async function loadReport() {
  const s = app.venue;
  const v = venueBar();
  if (!v || s.staff?.role !== 'bar_manager') return;
  const prev = s.report?.barId === v.id ? s.report : null;
  const stale = () => app.venue !== s || venueBar()?.id !== v.id;
  try {
    const out = await venueApi.report(v.id, 7);
    if (stale()) return;
    if (!Array.isArray(out?.nights)) throw new ApiError('Unreadable response', { status: 200, code: 'bad_response' });
    s.report = { barId: v.id, data: out, error: null };
  } catch (e) {
    if (app.venue !== s) return;
    if (venueMoved(e)) return;
    if (stale()) return;
    s.report = { barId: v.id, data: prev?.data ?? null, error: e?.code === 'not_deployed' ? 'Not available yet.' : prev?.data ? null : 'Couldn’t load the report. Try again in a minute.' };
  }
  if (onConsole() && ['report', 'redeem'].includes(s.section)) rerenderConsole();
}

/* ---------------- demo controls ---------------- */
function setDataset(kind) {
  app.state.dataset = kind;
  persist();
  rebuild();
  app.ui.mapSelected = null;
  if (app.route.name === 'about') { renderShell(); patchMain(); } // the Dataset thumb slides
  else preserveFocus(() => render({ focus: 'none' }));
  toast(kind === 'demo' ? 'Bars restored' : kind === 'worst' ? 'Worst-case data loaded' : 'Empty dataset loaded');
}
function resetDemo() {
  const snapshot = structuredClone(app.state);
  clear(storage);
  app.state = defaultState(Date.now());
  app.state.clock = normalizeClock(app.state.clock, Date.now());
  app.state.ageConfirmed = true;
  persist();
  rebuild();
  app.passFlow = null;
  if (!globalThis.__STORE__) dropUploads();
  app.console = freshConsole();
  app.ideaDraft = null;
  app.ideaErrors = {};
  resetScan();
  app.groupDraft = null;
  app.profileEdit = { editing: false, errors: {} };
  app.ui = { loading: false, refreshError: false, lastRefreshAt: now(), searchOpen: false, eventsView: 'tonight', eventsGenre: '', eventsTheme: '', eventsPrice: '', mapSelected: null, staleNotice: null, lastRemoved: null, clearedQueue: null, resetSnapshot: { state: snapshot, visit: app.visit } };
  render({ focus: 'heading' });
  toast('Reset'); // the inline row on About carries the Undo (one Undo per action, QA plan 9.6)
}
function undoReset() {
  const snap = app.ui.resetSnapshot?.state;
  if (!snap) return;
  dismissCurrentToast();
  app.state = snap;
  app.ui.resetSnapshot = null;
  persist();
  rebuild();
  render({ focus: 'heading' });
  toast('Reset undone.');
}

/** A pass changed status (cancel, restore): its card is patched where it is (QA plan 4.12), never re-sorted under the
 *  finger; the list re-sorts on the next visit. */
function patchPass(id) {
  const sel = `[data-key="${CSS.escape(id)}"]`;
  const live = document.querySelector(`#main ${sel}`);
  const tpl = document.createElement('template');
  tpl.innerHTML = mainHtml();
  const fresh = tpl.content.querySelector(sel);
  if (live && fresh) patchTree(live, fresh); else render({ focus: 'none' });
  updateBadge();
}
function restorePass(id) {
  const p = app.state.passes.find((x) => x.id === id);
  if (!p || !p.cancelledAt) return;
  dismissCurrentToast();
  const v = app.venues.find((x) => x.id === p.venueId);
  const w = v?.pass?.windows.find((x) => x.id === p.windowId);
  if (!w || w.remaining < p.party || now() >= p.windowEnd) { toast('Can’t restore: that window has ended or filled up.'); return; }
  p.cancelledAt = null; persist(); rebuild();
  if (['passes', 'passDetail'].includes(app.route.name)) {
    patchPass(p.id);
    (document.querySelector(`[data-action="cancel-pass"][data-id="${CSS.escape(p.id)}"]`) || pageHeading())?.focus({ preventScroll: true });
  } else render({ focus: 'heading' });
  toast(`Pass for ${p.venueName} restored.`);
}
function undoClear() {
  const c = app.ui.clearedQueue;
  if (!c) return;
  dismissCurrentToast();
  const o = { ...(app.state.overrides[c.venueId] ?? {}) };
  for (const k of ['queue', 'clearedAt']) { if (c.prevOverride && k in c.prevOverride) o[k] = c.prevOverride[k]; else delete o[k]; }
  if (Object.keys(o).length) app.state.overrides[c.venueId] = o; else delete app.state.overrides[c.venueId];
  app.ui.clearedQueue = null;
  const v = app.venues.find((x) => x.id === c.venueId);
  if (v) audit(v, 'Restored the previous estimate');
  persist(); rebuild(); rerenderConsole();
  toast('Previous estimate restored.');
}

/* ---------------- groups ---------------- */
function newGroupDraft() {
  const first = app.venues.find((v) => v.id === app.lastVenueId) ?? [...app.venues].sort((a, b) => a.name.localeCompare(b.name))[0];
  // Default meet time: the first slot after the demo time (falls back to the last slot late in the night).
  const slots = ['21:00', '21:30', '22:00', '22:30', '23:00', '23:30', '0:00', '0:30', '1:00', '1:30'];
  const time = slots.find((t) => { const [h, m] = t.split(':').map(Number); return atNight(app.state.clock.base, h, m) > now(); }) ?? '1:30';
  return { title: '', venueId: first?.id ?? '', time, spots: 4, note: '', handle: app.state.profile.handle || '', hop: false, stops: [] };
}
/** Next default stop: a different bar from the previous stop, an hour later (capped at the last time slot). */
function nextHopStop(d) {
  if (!app.venues.length) return null;
  const prev = d.stops[d.stops.length - 1] ?? { venueId: d.venueId, time: d.time };
  const names = [...app.venues].sort((a, b) => a.name.localeCompare(b.name));
  const i = names.findIndex((v) => v.id === prev.venueId);
  const venue = names[(i + 1) % names.length];
  const mins = Math.min(nightMinutes('1:30'), nightMinutes(prev.time) + 60);
  const h = (Math.floor(mins / 60) + 18) % 24;
  hopKeys += 1;
  return { venueId: venue.id, time: `${h}:${String(mins % 60).padStart(2, '0')}`, key: `stop-${hopKeys}` }; // the key keeps its row's node
}
let hopKeys = 0;
function postGroup() {
  const d = app.groupDraft ?? newGroupDraft();
  app.groupErrors = validateGroup(d);
  if (Object.keys(app.groupErrors).length) {
    patchPage(); // the error lines drop in; the fields keep their nodes (QA plan 8.3)
    const at = app.groupErrors.stopsAt;
    focusInvalid(document.querySelector(app.groupErrors.title ? '#g-title' : app.groupErrors.handle ? '#g-ig' : at ? `#hop-${at.field}-${at.index}` : '#hop-bar-0'));
    announce(app.groupErrors.title || app.groupErrors.handle || app.groupErrors.stops || '');
    return;
  }
  const [h, m] = d.time.split(':').map(Number);
  const group = {
    id: `u-${Date.now().toString(36)}`, title: d.title.trim(), venueId: d.venueId, startsAt: atNight(app.state.clock.base, h, m),
    spots: d.spots, going: 1, note: d.note.trim(), mine: true,
    host: { name: app.state.profile.name, handle: d.handle.replace(/^@/, ''), hue: 220 },
  };
  if (d.hop && d.stops.length) {
    group.stops = [{ venueId: d.venueId, time: d.time }, ...d.stops].map((st) => {
      const [sh, sm] = st.time.split(':').map(Number);
      return { venueId: st.venueId, startsAt: atNight(app.state.clock.base, sh, sm) };
    });
  }
  app.state.groups.created.unshift(group);
  persist();
  app.groupDraft = null;
  app.groupErrors = {};
  const moving = motionOK();
  go('#/groups', { replace: true });
  afterNav(() => revealGroup(group.id, moving));
  toast('Group posted.');
}
/** A newly posted group (QA plan 8.7): once the page has landed, its card scrolls to the middle (smoothly, for a pointer),
 *  its title takes focus, and the card pops in once (--spring-pop: .96 to 1, with the iOS cubic fallback). Reduced
 *  motion: an instant scroll and a short fade. */
function revealGroup(id, moving) {
  const card = document.querySelector(`#main [data-group="${CSS.escape(id)}"]`);
  if (!card) return;
  card.querySelector('.group-title-text')?.focus({ preventScroll: true });
  const rm = reducedMotion();
  const hold = moving && !rm ? card.animate({ opacity: [0, 0] }, { duration: T.morph * 4 }) : null; // hidden until it pops in
  const play = () => {
    if (!card.isConnected) return;
    hold?.cancel();
    if (rm) { card.animate({ opacity: [0, 1] }, { duration: T.rmIn, easing: 'linear' }); return; }
    if (!moving) return;
    card.animate({ scale: [0.96, 1] }, popTiming());
    card.animate({ opacity: [0, 1] }, { duration: T.fade, easing: T.easeOut });
  };
  const land = () => {
    if (!card.isConnected) { hold?.cancel(); return; }
    const r = card.getBoundingClientRect();
    const far = Math.abs(r.top + r.height / 2 - window.innerHeight / 2) > 40;
    if (!far) { play(); return; }
    if (!moving) { card.scrollIntoView({ block: 'center', behavior: 'auto' }); play(); return; }
    // Smooth: pop in once the scroll settles (scrollend, else after the longest smooth scroll).
    let played = false;
    const once = () => { if (played) return; played = true; window.removeEventListener('scrollend', once); clearTimeout(t); play(); };
    const t = setTimeout(once, T.morph * 3);
    window.addEventListener('scrollend', once);
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  land();
}
function toggleJoin(id) {
  const joined = app.state.groups.joined;
  const i = joined.indexOf(id);
  const g = app.groups.find((x) => x.id === id);
  if (i === -1) {
    joined.push(id);
    toast(`You joined ${g ? `${g.host.name.split(' ')[0]}’s group` : 'the group'}.`);
  } else {
    joined.splice(i, 1);
    toast('You left the group.');
  }
  persist();
  const card = document.querySelector(`#main [data-action="join-group"][data-id="${CSS.escape(id)}"]`)?.closest('.group-card');
  const group = allGroups(ctx()).find((x) => x.id === id);
  if (card && group) patchGroupCard(card, fragment(groupCard(group, ctx()))); else rerenderPage();
}
/** Join or leave (QA plan 4.6): the card is patched. Your face joins the end of the stack (it slides in from behind the
 *  others) while the text beside it glides over; leaving fades and shrinks it first. Counts roll; the button cross-fades. */
function patchGroupCard(card, fresh) {
  const stack = card.querySelector('.avatars'), stack1 = fresh.querySelector('.avatars');
  const text = card.querySelector('.gs-text');
  stack._settle?.(); // a face still leaving from the last tap goes now
  const a = [...stack.children], b = [...stack1.children];
  const n = Math.min(a.length, b.length);
  let k = 0;
  while (k < n && a[k].isEqualNode(b[k])) k += 1;
  if (k === n && b.length === a.length + 1) {
    const you = b[b.length - 1];
    flip([text], () => stack.append(you), { easing: T.easeOut }); // pushed aside by the arriving face, so it leads
    if (motionOK()) you.animate({ translate: ['-8px 0', '0 0'], scale: [0.9, 1], opacity: [0, 1] }, { duration: T.reveal, easing: T.easeOut });
    else enter(you);
  } else if (k === n && a.length === b.length + 1) {
    const gone = a[a.length - 1];
    const out = () => { stack._settle = null; if (gone.isConnected) flip([text], () => gone.remove()); };
    if (!motionOK()) out();
    else {
      const anim = gone.animate({ opacity: [1, 0], scale: [1, 0.96] }, { duration: T.toastOut, easing: T.easeOut, fill: 'forwards' });
      stack._settle = () => { anim.cancel(); out(); };
      anim.finished.then(out, () => {});
    }
  } else patchTree(stack, stack1);
  patchTree(card, fresh, { skip: (x) => x.classList.contains('avatars') });
}
/** Patch one card in place from its fresh HTML. False when the card isn't on screen. */
function patchCard(sel, html) {
  const card = html ? document.querySelector(sel) : null;
  if (!card) return false;
  patchTree(card, fragment(html));
  return true;
}

/* ---------------- community theme-night ideas (demo; nothing leaves this device) ---------------- */
function newIdeaDraft(venueId = null) {
  const byName = [...app.venues].sort((a, b) => a.name.localeCompare(b.name));
  const id = venueId ?? (app.venues.some((v) => v.id === app.lastVenueId) ? app.lastVenueId : byName[0]?.id ?? '');
  return { venueId: id, day: defaultNight(app.state.clock.base, id, [...app.events, ...app.ideas]), dayPicked: false, start: [21, 0], end: [0, 0], theme: 'Theme night', genre: '', title: '', pitch: '', ack: false };
}
function toggleIdea(key, id) {
  const x = app.ideas.find((i) => i.id === id);
  if (!x) return;
  const list = app.state.ideas[key];
  const on = !list.includes(id);
  app.state.ideas[key] = on ? [...list, id] : list.filter((i) => i !== id);
  persist();
  if (app.route.name !== 'events') rerenderPage();
  else if (!patchCard(`#event-results .idea-card[data-idea="${CSS.escape(id)}"]`, ideaCard(x, ctx()))) renderEventResults({ quiet: true });
  const bar = app.venues.find((v) => v.id === x.venueId)?.name ?? 'the bar';
  if (key === 'joined') {
    toast(on ? (x.status === 'approved' ? `You’re in for ${x.title} on ${nightLabel(x.startsAt).split(',')[0]}.` : `You’re in for ${x.title} if ${bar} approves it.`) : `You’re out of ${x.title}.`);
  } else {
    announce(on ? `Hyped ${x.title}. ${ideaCounts(x, app.state).hype} hype.` : `Hype removed from ${x.title}.`);
  }
}
function postIdea() {
  const d = app.ideaDraft ?? (app.ideaDraft = newIdeaDraft());
  const venue = app.venues.find((v) => v.id === d.venueId) ?? null;
  const existing = [...app.events, ...app.ideas.filter((x) => x.status !== 'declined')];
  let { errors, clean } = checkIdea(d, venue, existing);
  if (app.state.ideas.created.length >= 20) errors = { ...errors, limit: 'You can have up to 20 ideas. Reset in About to start over.' };
  if (Object.keys(errors).length) {
    app.ideaErrors = errors;
    patchPage(); // the error lines drop in; the fields keep their nodes (QA plan 8.3)
    const order = [['venue', '#idea-venue'], ['day', 'input[name="idea-night"]:checked'], ['time', '#idea-end'], ['theme', 'input[name="idea-theme"]'], ['title', '#idea-title'], ['pitch', '#idea-pitch'], ['ack', '#idea-ack'], ['limit', '[data-action="idea-post"]']];
    const first = order.find(([k]) => errors[k]);
    if (first) {
      focusInvalid(document.querySelector(first[1]) ?? (first[0] === 'day' ? document.querySelector('input[name="idea-night"]') : null), first[0] === 'time' ? document.querySelector('#idea-form .field-pair') : null);
      announce(errors[first[0]]);
    }
    return;
  }
  const base = app.state.clock.base;
  const idea = {
    id: `u-${Date.now().toString(36)}`, kind: 'community', venueId: d.venueId, day: d.day,
    startsAt: atNightOn(base, d.day, ...d.start), endsAt: atNightOn(base, d.day, ...d.end),
    title: clean.title, theme: d.theme, genres: clean.genre ? [clean.genre] : [], music: clean.genre || 'The bar’s usual playlist', pitch: clean.pitch,
    by: { name: app.state.profile.name }, joins: 0, hype: 0, postedAt: now(), mine: true,
  };
  app.state.ideas.created.unshift(idea);
  app.state.ideas.joined.push(idea.id);
  persist();
  rebuild();
  app.ideaDraft = null;
  app.ideaErrors = {};
  app.ui.eventsView = 'ideas';
  go('#/events?view=ideas', { replace: true });
  afterNav(() => document.querySelector(`[data-idea="${CSS.escape(idea.id)}"] .idea-link`)?.focus());
  toast(`Idea posted.`, bizOn() ? { actionLabel: 'Review as the bar', onAction: () => go(`#/console?venue=${encodeURIComponent(venue.id)}&s=offers`) } : {});
}
function decideIdea(id, status) {
  const x = app.ideas.find((i) => i.id === id);
  const v = app.venues.find((w) => w.id === x?.venueId);
  if (!x || !v) return;
  const cover = status === 'approved' ? (app.console.ideaCover[id] ?? defaultCover(v)) : null;
  app.state.ideas.decisions[id] = { status, at: now(), cover };
  const day = nightLabel(x.startsAt).split(',')[0];
  audit(v, status === 'approved' ? `Approved community idea: ${x.title} (${day} ${formatTime(x.startsAt)}, ${coverLabel(cover)})` : `Declined community idea: ${x.title} (${day} ${formatTime(x.startsAt)})`);
  persist(); rebuild();
  // The decided idea's card fades out of the queue, then the rest glide up and it lands in "Decided" (QA plan 8.1).
  document.getElementById('ideas-h')?.focus({ preventScroll: true });
  consoleList([document.querySelector(`#main .idea-review[data-idea="${CSS.escape(id)}"]`)], () => document.getElementById('ideas-h')?.focus({ preventScroll: true }));
  toast(status === 'approved' ? `Approved: ${x.title} is now ${day}’s theme event.` : `Declined: ${x.title}.`,
    { actionLabel: 'Undo', onAction: () => undoDecision(id) });
}
function undoDecision(id) {
  const x = app.ideas.find((i) => i.id === id);
  const v = app.venues.find((w) => w.id === x?.venueId);
  if (!x || !app.state.ideas.decisions[id]) return;
  dismissCurrentToast();
  delete app.state.ideas.decisions[id];
  if (v) audit(v, `Moved back to waiting: ${x.title}`);
  persist(); rebuild();
  if (app.route.name === 'console') {
    document.getElementById('ideas-h')?.focus({ preventScroll: true });
    consoleList([document.querySelector(`#main li[data-key="decided-${CSS.escape(id)}"]`)], () => document.getElementById('ideas-h')?.focus({ preventScroll: true }));
  } else rerenderPage();
  toast(`Back to waiting: ${x.title}.`);
}

/* ---------------- location (App Store build): only on request, only on the phone ---------------- */
async function useMyLocation({ quiet = false } = {}) {
  const r = await locate();
  if (r.error) {
    if (!quiet) toast(r.error === 'denied' ? (isNative() ? 'Location is off for this app. You can turn it on in Settings.' : 'Location is blocked for this site. You can allow it in your browser’s site settings.') : 'Couldn’t get your location. Try again in a moment.');
    if (r.error === 'denied') { app.state.prefs.useLocation = false; persist(); }
    return;
  }
  // Far from New Brunswick (a visitor, or App Review), distances from there would be meaningless: keep the campus spot.
  if ((milesBetween(DEMO_SPOT, r) ?? Infinity) > 15) {
    setOrigin(null);
    if (!quiet) toast('You’re not near New Brunswick, so distances stay from College Ave & Hamilton St.');
    return;
  }
  setOrigin(r);
  app.state.prefs.useLocation = true; // a yes/no only; the position itself is never saved
  persist();
  if (document.getElementById('picker')?.open) closePickerToOpener();
  rerenderPage();
  if (!quiet) { haptic('light'); toast('Distances are now from where you are.'); }
}

/* ---------------- store build: Delete my data ---------------- */
/** Reports this phone sent that its sign-in can't delete: all of them without a sign-in; with one, those sent under an
 *  earlier account (after the server refused to renew a sign-in, the next report signs in anew). Reports saved before
 *  the account was recorded count as this account's. */
function unreachableReports() {
  const sent = app.state.reports.filter((r) => r.serverId);
  if (!api.hasAccount()) return sent.length;
  const me = api.userId();
  return me ? sent.filter((r) => r.account && r.account !== me).length : 0;
}

/** Where to ask about reports this phone can't reach. The store build's Help links to support; a live team build's Help
 *  has no contact yet, so it names none. */
const supportFor = (what) => (!globalThis.__STORE__ && LIVE ? '' : `: contact support from Help to delete ${what}`);
/** friendlyError, minus the support route a live team build doesn't have yet. */
const liveError = (e) => (!globalThis.__STORE__ && LIVE && e?.code === 'not_allowed' ? 'Reports from this phone are paused.' : friendlyError(e));
async function deleteMyData() {
  if (!(globalThis.__STORE__ || LIVE) || app.ui.deleting) return;
  // What the confirm text promised: a server deletion when this phone had a sign-in.
  const wasLinked = api.hasAccount();
  const unreachableBefore = unreachableReports();
  app.ui.deleting = true;
  rerenderPage();
  let out;
  try {
    out = await api.deleteMyData();
  } catch (err) {
    app.ui.deleting = false;
    rerenderPage();
    toast(friendlyError(err));
    return;
  }
  // The confirm promised a server deletion, but the server refused to renew this phone's sign-in, so nothing could be
  // deleted there. Clear nothing yet: the confirm now says what Delete will do, and the person decides again.
  if (out?.nothing_on_server && wasLinked) {
    app.ui.deleting = false;
    rerenderPage();
    document.getElementById('delete-confirm-h')?.focus();
    toast('This phone’s sign-in has expired, so it can’t delete your reports from our server. Nothing was deleted. Read the updated note before you confirm again.', { timeout: 10_000 });
    return;
  }
  // No sign-in on this phone (never reported, or site data cleared): nothing here can reach a server copy. The confirm
  // text already said so; clear this phone and name what's left on the server.
  const unreachable = out?.nothing_on_server ? app.state.reports.filter((r) => r.serverId).length : unreachableBefore;
  // Server rows are gone; now everything this phone kept: reports, saved bars and their reminders, settings, the cached data.
  for (const r of Object.values(app.state.reminders ?? {})) cancelReminder(r.nid);
  clear(storage);
  try { storage?.removeItem(LIVE_KEY); } catch { /* ignore */ }
  app.ui.deleting = false;
  app.ui.confirmDelete = false;
  app.state = defaultState(Date.now());
  app.state.ageConfirmed = true;
  app.state.splashSeen = true;
  app.state.clock = { v: 2, realStart: Date.now(), base: nightAnchor(Date.now()), offsetMin: 0 };
  if (!globalThis.__STORE__ && LIVE) app.points = freshPoints(); // the reward codes went with the state; a venue sign-in stays
  persist();
  rebuild();
  rerenderPage();
  // Without a sign-in on this phone nothing could be sent to the server, so only claim what happened here.
  toast(!out?.nothing_on_server ? (unreachable
      ? `Your data was deleted, here and on our server, except ${unreachable === 1 ? 'one earlier report' : `${unreachable} earlier reports`} sent under an older sign-in${supportFor(unreachable === 1 ? 'it' : 'them')}.`
      : 'Your data was deleted, here and on our server.')
    : unreachable ? `Deleted from this phone. ${unreachable === 1 ? 'The report it sent is' : `The ${unreachable} reports it sent are`} still on our server, and this phone can’t reach ${unreachable === 1 ? 'it' : 'them'}${supportFor(unreachable === 1 ? 'it' : 'them')}.`
      : `Deleted from this phone. It has no sign-in on our server, so it can’t tell whether reports it sent earlier (before its data was cleared) are still there${supportFor('those')}.`, { timeout: 10_000 });
}

/* ---------------- scan: line reports ---------------- */
const MIN_MS = 60000;
const round5 = (n) => Math.max(0, Math.round(n / 5) * 5);
/** Store build: the report goes to the server (anonymous account on the first one). The estimate changes only when the
 *  server sees it corroborated, so nothing on this phone pretends otherwise. */
async function submitReportLive() {
  const f = app.scan;
  if (!f.bucket || f.sending) { if (!f.bucket) blockedScan(document.querySelector('[data-action="scan-submit"]')); return; }
  const v = app.venues.find((x) => x.id === f.venueId);
  if (!v) return;
  if (!app.state.termsAgreedAt) { openTermsSheet(); return; }
  // A report is about the line now, so it isn't queued: it stays filled in, to send once the phone is back online.
  if (isOffline()) { f.error = 'You’re offline. Not sent.'; rerenderPage(); return; }
  f.sending = true;
  f.error = null;
  f.clientId = f.clientId ?? uuid(); // a retry reuses it: never counted twice
  rerenderPage();
  let res;
  try {
    res = await api.submitReport({ barId: v.id, bucket: f.bucket, door: f.door ?? 'moving', inLine: f.inLine && f.bucket !== 'none', clientId: f.clientId, version: APP_VERSION });
  } catch (err) {
    f.sending = false;
    f.error = liveError(err);
    rerenderPage();
    if (err?.code === 'unknown_bar') liveRefresh({ quiet: true }); // the bar list is out of date: reload it
    return;
  }
  f.sending = false;
  const at = Date.now();
  const id = `r-${at.toString(36)}`;
  // account: the sign-in it was sent under, so Delete can tell which reports this phone can still reach.
  app.state.reports.unshift({ id, serverId: res?.report_id ?? null, account: api.userId(), venueId: v.id, at, night: app.state.clock.base, bucket: f.bucket, door: f.door ?? 'moving', inLine: f.inLine, gotInAt: null, waitMin: null });
  app.state.reports = app.state.reports.slice(0, 200);
  if (f.inLine && f.bucket !== 'none') app.state.activeWait = { reportId: id, venueId: v.id, startedAt: at };
  persist();
  // Sent: let go of the photo (it was only ever in this page's memory; the server gets the line size, not the picture).
  if (f.photo) { URL.revokeObjectURL(f.photo); f.photo = null; }
  f.step = 'done';
  scanStep(1);
  document.querySelector('#main [data-autofocus]')?.focus(); // the "Report sent" heading, read once
  haptic('success');
  liveRefresh({ quiet: true });
}

function submitReport() {
  if (globalThis.__STORE__ || LIVE) { submitReportLive(); return; }
  const f = app.scan;
  if (!f.bucket) { blockedScan(document.querySelector('[data-action="scan-submit"]')); return; }
  if (!app.state.termsAgreedAt) { openTermsSheet(); return; }
  const v = app.venues.find((x) => x.id === f.venueId);
  const b = LINE_BUCKETS.find((x) => x.id === f.bucket);
  const at = now();
  const id = `r-${Date.now().toString(36)}`;
  // The report is one input to this bar's estimate (src/lib/merge.js): it leads when no fresh line photo does,
  // otherwise it backs the photo up or, with another guest, flags it as uncertain.
  app.state.reports.unshift({ id, venueId: v.id, at, night: app.state.clock.realStart, bucket: b.id, door: f.door ?? 'moving', inLine: f.inLine, gotInAt: null, waitMin: null });
  app.state.points.push({ id: `p-${id}`, at, delta: POINTS.REPORT, label: `Line report: ${v.name}` });
  if (f.inLine && b.id !== 'none') app.state.activeWait = { reportId: id, venueId: v.id, startedAt: at }; // "No line": nothing to time
  persist();
  rebuild();
  f.outcome = scanOutcome(app.venues.find((x) => x.id === v.id), id);
  f.step = 'done';
  f.error = null;
  // The report is in: let go of the photo now (it was only ever in this page's memory).
  if (f.photo) { URL.revokeObjectURL(f.photo); f.photo = null; }
  scanStep(1);
  // "Report sent" (QA plan 8.5, a contribution): the points roll up from 0 while the heading and the outcome follow.
  const done = document.querySelector('#main .scan-done');
  const pts = done?.querySelector('.scan-pts .roll');
  if (pts && motionOK()) {
    pts.textContent = '0';
    delete pts.dataset.rollTo;
    rollText(pts, String(POINTS.REPORT), 1);
    [done.querySelector('h2'), done.querySelector('h2 + p')].forEach((el, i) => el?.animate({ opacity: [0, 1], translate: ['0 6px', '0 0'] }, { duration: T.reveal, delay: 60 * (i + 1), easing: T.easeOut, fill: 'backwards' }));
  }
  document.querySelector('#main [data-autofocus]')?.focus(); // the "Report added" heading
  announce(`Plus ${POINTS.REPORT} points.`);
}
/**
 * A new scan step (QA plan 8.5). The head, the progress segments and the waiting card are patched (a segment's fill
 * glides from .55 to full), and only the step itself is replaced: it comes in from the side it's coming from (12px,
 * --d-reveal; Change and Restart from the left), with no exit. The Send bar rises in once (CSS @starting-style).
 * Reduced motion: a short linear fade. Keyboard: instant.
 */
function scanStep(dir) {
  const main = document.getElementById('main');
  const live = main.querySelector('.scan-flow .scan-step');
  const tpl = document.createElement('template');
  tpl.innerHTML = mainHtml();
  const next = tpl.content.querySelector('.scan-flow .scan-step');
  if (!live || !next) { rerenderPage(); return; }
  const newStep = main.querySelector('.scan-flow')?.dataset.step !== next.closest('.scan-flow')?.dataset.step;
  const y = newStep ? 0 : window.scrollY;
  preserveFocus(() => {
    patchChildren(main, tpl.content, { skip: (n) => n === live });
    live.replaceChildren(...next.childNodes);
  });
  main.querySelector(':scope > .scan-submit')?.getAnimations().forEach((a) => { if (!(a instanceof CSSTransition)) a.cancel(); });
  window.scrollTo(0, y);
  if (reducedMotion()) live.animate({ opacity: [0, 1] }, { duration: T.rmIn, easing: 'linear' });
  else if (motionOK()) live.animate({ opacity: [0, 1], translate: [`${12 * dir}px 0`, '0 0'] }, { duration: T.reveal, easing: T.easeOut });
}
/* ---------------- scan: the camera (photo first) ---------------- */
/** Forget the report in progress and let go of its photo (an object URL; the app never saved or sent the picture. iOS may
 *  keep its own temporary copy in the app's private storage until it clears it). */
function resetScan(extra = {}) {
  if (app.scan?.photo) URL.revokeObjectURL(app.scan.photo);
  app.scan = { ...freshScan(), ...extra };
}
/** The phone's own camera, through a file input with capture (no plugin; iOS needs NSCameraUsageDescription). It lives
 *  outside #main so a re-render never drops it while the camera is up. */
function cameraInput() {
  let el = document.getElementById('scan-camera');
  if (el) return el;
  el = document.createElement('input');
  Object.assign(el, { type: 'file', id: 'scan-camera', accept: 'image/*', tabIndex: -1 });
  el.setAttribute('capture', 'environment');
  el.setAttribute('aria-hidden', 'true');
  el.className = 'cam-input';
  el.addEventListener('change', () => {
    settleCamera();
    const file = el.files?.[0];
    if (!file) { cameraClosed(); return; }
    const replaced = Boolean(app.scan.photo);
    if (replaced) URL.revokeObjectURL(app.scan.photo);
    Object.assign(app.scan, { photo: URL.createObjectURL(file), camera: null, manual: false, error: null });
    cameraDeclined = false;
    el.value = '';
    if (app.route?.name !== 'scan') { go('#/scan'); return; }
    scanStep(1);
    const f = app.scan;
    announce(`${replaced ? 'Photo replaced.' : 'Photo taken.'}${!f.venueId ? ' Now pick the bar you’re at.' : !f.bucket ? ' Now pick about how many people are in line.' : ''}`);
  });
  el.addEventListener('cancel', () => { cancelSeen = true; settleCamera(); cameraClosed(); });
  document.body.append(el);
  return el;
}
/** Each opening of the camera gets a token; its change or cancel (or the web fallback below) settles it once. */
let cameraToken = 0;
let cameraFallback = null;
/** This engine has sent a cancel event, so it needs no fallback. */
let cancelSeen = false;
/** The camera came back without a photo (closed, or access refused): until a photo is taken, Scan opens on its photo step
 *  instead of the camera, so a phone without camera access isn't shown a blank camera on every tap. Not stored. */
let cameraDeclined = false;
function settleCamera() {
  cameraToken += 1;
  if (cameraFallback) { window.removeEventListener('focus', cameraFallback); cameraFallback = null; }
}
/** Must run inside the tap that asked for it (iOS only opens the camera from a user gesture). */
function openCamera() {
  const el = cameraInput();
  el.value = '';
  settleCamera();
  const token = cameraToken;
  app.scan.camera = 'open';
  el.click();
  // The iOS app (iOS 17+) and current browsers send the input's cancel event. Only a web page in an engine that hasn't
  // sent one yet falls back to "came back with no photo", for this opening only, after the page has had focus back for
  // 1.5 s and again at 3 s with still no file (a slow photo must not read as a cancel).
  if (isNative() || cancelSeen) return;
  const stillEmpty = () => token === cameraToken && app.scan.camera === 'open' && !el.files?.length;
  cameraFallback = () => setTimeout(() => { if (stillEmpty()) setTimeout(() => { if (stillEmpty()) cameraClosed(); }, 1500); }, 1500);
  window.addEventListener('focus', cameraFallback, { once: true });
}
/** The camera was closed without a photo (or the phone refused it): Scan stays on its first step and says so. A retake
 *  that is cancelled keeps the photo it had. */
function cameraClosed() {
  if (app.scan.camera !== 'open') return;
  if (app.scan.photo) { app.scan.camera = null; announce('Kept your photo.'); return; }
  app.scan.camera = 'cancelled';
  cameraDeclined = true;
  if (app.route?.name === 'scan' && !app.scan.manual) patchPage();
  announce('No photo taken.');
}
/** Tapping Scan (or Report the line) on a phone goes straight to the camera, unless a report is already under way. */
function cameraFirst(href) {
  if (globalThis.__STORE__ || app.state.activeWait || cameraDeclined) return false; // the store build takes no photos (scripts/check-store.mjs)
  if (!(isNative() || window.matchMedia('(pointer: coarse)').matches)) return false;
  const t = parseHash(href);
  if (t.name !== 'scan') return false;
  return Boolean(t.query.venue) || !(app.scan.photo || app.scan.manual || app.scan.venueId || app.scan.step === 'done');
}

function blockedScan(btn) {
  const f = app.scan;
  if (f.sending) return; // a second tap while the report is on its way: nothing is missing, so say nothing
  f.error = 'Pick about how many people are in line.';
  patchPage();
  const target = document.querySelector('#main .scan-flow .bucket-row');
  shake(btn, ['0', '-6px', '5px', '-3px', '0']);
  if (!target) return;
  target.scrollIntoView({ block: 'center', behavior: motionOK() ? 'smooth' : 'auto' });
  if (reducedMotion()) target.animate({ opacity: [1, 0.5, 1] }, { duration: T.rmIn, easing: 'linear' });
  else if (motionOK()) target.animate({ scale: [1, 1.04, 1] }, { duration: T.reveal, easing: T.easeOut });
}
/** Bucket or door changed: patch the estimate panel and the Send button in place (no re-render, no re-flash). A bigger
 *  bucket rolls the range up; the level word swaps (QA plan 4.9). */
function patchScanEstimate() {
  const panel = document.getElementById('scan-estimate');
  if (panel) { const t = document.createElement('template'); t.innerHTML = scanEstimate(ctx(), app.scan); patchChildren(panel, t.content); }
  const send = document.querySelector('[data-action="scan-submit"]');
  if (send) { if (scanSubmitReady(app.scan)) send.removeAttribute('aria-disabled'); else send.setAttribute('aria-disabled', 'true'); }
  document.querySelector('#main .field-error')?.remove();
}
function gotIn() {
  const w = app.state.activeWait;
  if (!w) return;
  if (globalThis.__STORE__ || LIVE) { gotInLive(w); return; }
  const at = now();
  const waitMin = Math.max(1, Math.round((at - w.startedAt) / MIN_MS));
  const v = app.venues.find((x) => x.id === w.venueId);
  const r = app.state.reports.find((x) => x.id === w.reportId);
  // A measured wait feeds the bar's door pace (people ahead ÷ minutes waited), never the line size.
  if (r) { r.gotInAt = at; r.waitMin = waitMin; }
  app.state.points.push({ id: `p-in-${w.reportId}`, at, delta: POINTS.GOT_IN, label: `Got in: ${v?.name ?? 'bar'} (${waitMin} min wait)` });
  app.state.activeWait = null;
  persist();
  rebuild();
  closeWaiting(true);
  toast(`You got in after ${waitMin} min. +${POINTS.GOT_IN} points.`);
}
/** Store build: the server measures the wait from the report's own time; this phone just shows it. */
async function gotInLive(w) {
  const r = app.state.reports.find((x) => x.id === w.reportId);
  const localMin = Math.max(1, Math.round((Date.now() - w.startedAt) / MIN_MS));
  let waitMin = localMin;
  if (r?.serverId) {
    try { const out = await api.reportGotIn(r.serverId); if (Number.isFinite(out?.wait_min)) waitMin = out.wait_min; } catch { /* keep the local measure */ }
  }
  if (r) { r.gotInAt = Date.now(); r.waitMin = waitMin; }
  app.state.activeWait = null;
  persist();
  closeWaiting(true);
  haptic('success');
  toast(`You got in after ${waitMin} min. Thanks, that helps everyone.`);
}
function leftLine() {
  const w = app.state.activeWait;
  if (!w) return;
  const r = app.state.reports.find((x) => x.id === w.reportId);
  if (r) r.leftAt = now();
  app.state.activeWait = null;
  persist();
  closeWaiting(false);
  toast(globalThis.__STORE__ || LIVE ? 'Got it. Thanks for the report.' : 'Got it. You keep the points for your report.');
}
/** The waiting card closes (QA plan 8.5): "I'm in" draws its check first (--d-fade); then the card fades and shrinks to
 *  .96 (--d-toast-out) before the page updates, and what was below it glides up. Focus goes to the page heading at once. */
function closeWaiting(drawCheck) {
  pageHeading()?.focus({ preventScroll: true });
  const card = document.querySelector('#main .waiting-card');
  const visit = app.visit; // the check and the exit run first: skip the update if the user has left Scan by then
  const update = () => { if (app.visit === visit) updateList({ sel: '#main .scan-flow > *', render: patchPage, after: () => pageHeading()?.focus({ preventScroll: true }) }); };
  if (!card || !(motionOK() || reducedMotion())) { update(); return; }
  card.inert = true;
  const path = drawCheck && motionOK() ? card.querySelector('[data-action="scan-in"] .ic path') : null;
  drawStroke(path).then(() => (exitItems([card], { scale: 0.96 }) ?? Promise.resolve())).then(update);
}

/* ---------------- points ---------------- */
function redeem(id) {
  const r = REWARDS.find((x) => x.id === id);
  if (!r) return;
  if (balanceOf(app.state.points) < r.cost) { toast('Not enough points yet. Report a line to earn more.'); return; }
  const vid = `v-${Date.now().toString(36)}`;
  const voucher = { id: vid, rewardId: r.id, ref: refCode(vid), at: now() };
  const entry = { id: `p-${vid}`, at: now(), delta: -r.cost, label: `Redeemed: ${r.title}` };
  app.state.vouchers.push(voucher);
  app.state.points.push(entry);
  persist();
  patchPoints(); // the balance rolls down and the bar drains in place
  // The new code is on the page, not only in the toast: bring its row into view and mark it once.
  const row = document.querySelector(`#main [data-key="${vid}"]`);
  if (row) {
    row.scrollIntoView({ block: 'center', behavior: motionOK() ? 'smooth' : 'auto' }); // centered: the toast covers the bottom edge
    row.classList.add('is-new');
    row.addEventListener('animationend', () => row.classList.remove('is-new'), { once: true });
  }
  toast(`Redeemed ${r.title}. Code ${voucher.ref}.`, {
    actionLabel: 'Undo',
    onAction: () => {
      app.state.vouchers = app.state.vouchers.filter((x) => x.id !== vid);
      app.state.points = app.state.points.filter((x) => x.id !== entry.id);
      persist();
      if (app.route.name === 'points') patchPoints();
      announce(`${r.title} returned. Points restored.`);
    },
  });
}

/* ---------------- points, live team build: the server's points and reward codes ---------------- */
// Read with the sign-in this phone already has (a first report creates it); never a new account. Spending needs a
// Night Out account the app can't create yet: an anonymous one is refused by the server, and the app says so plainly.
let pointsLoading = null;
/** One read at a time. After a write (after: true), a read that may have started before it is followed by a new one. */
function loadPoints({ after = false } = {}) {
  if (pointsLoading && !after) return pointsLoading;
  const p = (pointsLoading && after ? pointsLoading.then(readPoints) : readPoints()).finally(() => { if (pointsLoading === p) pointsLoading = null; });
  pointsLoading = p;
  return p;
}
async function readPoints() {
  const p = app.points;
  const [cat, mine] = await Promise.allSettled([api.getRewards(), api.getMyPoints()]);
  if (cat.status === 'fulfilled' && Array.isArray(cat.value?.rewards)) Object.assign(p, { catalog: cat.value, catalogError: null });
  else if (cat.reason?.code === 'not_deployed') Object.assign(p, { catalog: null, catalogError: 'Not available yet.' });
  else if (!p.catalog) p.catalogError = 'Couldn’t load rewards. Try again in a minute.'; // a failure keeps the last good copy
  if (mine.status === 'fulfilled') {
    if (mine.value == null) Object.assign(p, { mine: null, mineError: null }); // no sign-in on this phone yet
    else if (mine.value.ok === true && Number.isFinite(mine.value.balance)) Object.assign(p, { mine: mine.value, mineError: null });
    else if (!p.mine) p.mineError = 'Couldn’t load your points. Try again in a minute.';
  } else {
    const e = mine.reason;
    if (e?.code === 'signed_out') Object.assign(p, { mine: null, mineError: null });
    else p.mineError = e?.code === 'not_deployed' ? 'Not available yet.' : e?.code === 'not_allowed' ? 'Points are paused for this account.' : p.mine ? null : 'Couldn’t load your points. Try again in a minute.';
  }
  p.loaded = true; // from here, no balance means no sign-in on this phone, not "still loading"
  if (app.route?.name === 'points') patchPage();
}
function rewardTrouble(e) {
  if (e?.code === 'account_required' || e?.code === 'signed_out') return 'Rewards need a Night Out account. Coming before launch.';
  if (e?.code === 'insufficient_points') { const need = Number(e.data?.need); return Number.isFinite(need) ? `You need ${fmtPts(need)} more points.` : 'Not enough points yet.'; }
  if (e?.code === 'too_many_open') return 'You have 3 open codes. Use one first.';
  if (e?.code === 'rate_limited') return 'Two codes a night at most. Try again tomorrow.';
  if (['reward_unavailable', 'unknown_reward'].includes(e?.code)) return 'That reward isn’t offered right now.';
  if (e?.code === 'not_open') return 'That code can’t be used anymore.';
  if (e?.code === 'rotation_limit') return 'This code can’t be shown again.';
  if (e?.code === 'not_found') return 'That reward isn’t on this phone’s account.';
  if (e?.code === 'not_allowed') return 'Rewards are paused for this account.'; // not "reports", and no support route the live Help lacks
  return friendlyError(e);
}
/** A code the server showed this phone: kept here (Delete my data clears it) so it can be shown at the bar. */
function rememberCode(v) {
  app.state.vouchers = [v, ...(app.state.vouchers ?? []).filter((x) => x.id !== v.id)].slice(0, 20);
  persist();
}
async function issueReward(id) {
  const p = app.points;
  const r = p.catalog?.rewards?.find((x) => x.id === id);
  if (!r || p.busy) return;
  p.pending[id] ??= uuid(); // a retry after a lost answer reuses it (the server answers duplicate, with a new code)
  Object.assign(p, { busy: id, note: null });
  patchPage();
  // The answer is written in the reward's own row (where the tap was), not below the list under the tab bar.
  const showNote = () => document.getElementById('reward-note')?.scrollIntoView({ block: 'center', behavior: motionOK() ? 'smooth' : 'auto' });
  let out;
  try {
    out = await api.issueVoucher(id, p.pending[id]);
  } catch (e) {
    if (!e?.retryable) delete p.pending[id];
    Object.assign(p, { busy: null, note: { id: 'issue', rewardId: id, text: rewardTrouble(e) } });
    patchPage();
    showNote();
    announce(p.note.text);
    return;
  }
  delete p.pending[id];
  if (out?.code) rememberCode({ id: out.voucher_id, code: out.code, title: out.reward?.title ?? r.title, expiresAt: out.expires_at ?? null });
  Object.assign(p, { busy: null, note: { id: 'issue', rewardId: id, text: out?.code ? `Your code: ${out.code}. Show it at the bar.` : 'That code was already issued: see Your rewards.' } });
  await loadPoints({ after: true }); // a read already running may predate the spend: read again after it
  // The new code's row in Your rewards comes into view, centered (the toast region covers the bottom edge), tinted once.
  const row = out?.voucher_id && document.querySelector(`#main [data-key="${CSS.escape(out.voucher_id)}"]`);
  if (row) {
    row.scrollIntoView({ block: 'center', behavior: motionOK() ? 'smooth' : 'auto' });
    row.classList.add('is-new');
    row.addEventListener('animationend', () => row.classList.remove('is-new'), { once: true });
  } else showNote();
  announce(p.note.text);
}
async function revealReward(id) {
  const p = app.points;
  const v = p.mine?.vouchers?.find((x) => x.id === id);
  if (!v || p.busy) return;
  Object.assign(p, { busy: id, note: null });
  patchPage();
  try {
    const out = await api.revealVoucher(id);
    rememberCode({ id, code: out.code, title: v.reward?.title ?? 'Reward', expiresAt: out.expires_at ?? v.expires_at ?? null });
    p.note = { id: 'reveal', text: `New code: ${out.code}. The old one no longer works.` };
  } catch (e) {
    p.note = { id: 'reveal', text: rewardTrouble(e) };
  }
  p.busy = null;
  await loadPoints();
  announce(p.note.text);
}
/** The server's app settings (live team build): a maintenance message from it is shown once. */
function applyConfig(cfg) {
  const msg = typeof cfg?.maintenance_banner === 'string' ? cfg.maintenance_banner.trim().slice(0, 200) : '';
  if (msg && msg !== app.ui.maintenanceShown) { app.ui.maintenanceShown = msg; toast(msg, { timeout: 10_000 }); }
}

/* ---------------- profile ---------------- */
function saveProfile(form) {
  const name = form.querySelector('#p-name').value.trim();
  const handle = form.querySelector('#p-ig').value.trim().replace(/^@/, '');
  const errors = {};
  if (!name) errors.name = 'Add a name so groups know who you are.';
  if (handle && !validHandle(handle)) errors.handle = 'Use letters, numbers, periods or underscores (up to 30).';
  if (Object.keys(errors).length) {
    // Keep what was typed (an emptied Name stays empty next to its error).
    app.profileEdit = { editing: true, errors, values: Object.fromEntries(new FormData(form)) };
    patchPage(); // the error lines drop in; what was typed stays in its field (QA plan 8.3)
    focusInvalid(document.querySelector(errors.name ? '#p-name' : '#p-ig'));
    return;
  }
  app.state.profile = { name, handle };
  persist();
  app.profileEdit = { editing: false, errors: {} };
  rerenderPage();
  document.querySelector('[data-action="edit-profile"]')?.focus();
  toast('Profile saved.');
}

/** Help FAQ (QA plan 7.5): the answer's wrapper opens from 0 to its height (--d-tray, in-out) as the text fades in, and
 *  folds shut (--d-tray-out) before [open] goes. A tap mid-way turns it around from where it is. Keyboard and reduced
 *  motion use the native toggle (instant). */
function disclose(d) {
  const wrap = d.querySelector(':scope > .how-a');
  const text = wrap.firstElementChild;
  const from = d.open ? wrap.getBoundingClientRect().height : 0;
  [wrap, text].forEach((n) => n?.getAnimations().forEach((a) => a.cancel()));
  const opening = !d.open || d.classList.contains('is-closing');
  d.classList.toggle('is-closing', !opening);
  if (opening) {
    d.open = true;
    wrap.animate({ height: [`${from}px`, `${wrap.scrollHeight}px`] }, { duration: T.tray, easing: T.easeInOut });
    text?.animate({ opacity: [0, 1] }, { duration: T.fade, easing: T.easeOut });
    return;
  }
  const fold = wrap.animate({ height: [`${from}px`, '0px'] }, { duration: T.trayOut, easing: T.easeInOut, fill: 'forwards' });
  text?.animate({ opacity: [1, 0] }, { duration: T.quick, easing: T.easeOut, fill: 'forwards' });
  fold.finished.then(() => {
    d.classList.remove('is-closing');
    d.open = false;
    [wrap, text].forEach((n) => n?.getAnimations().forEach((a) => a.cancel()));
  }, () => {});
}

/* ---------------- my account: settings, help, subscription, VIP cards (all simulated) ---------------- */
/** dir: 1 drills in (member → profile), -1 goes back; an open sheet glides to its new height (swapSheet). */
function openAccountSheet(html, focusSel, dir = 0) {
  const dlg = preparePicker();
  if (dlg.open) swapSheet(dlg, () => { dlg.innerHTML = html; }, dir);
  else { dlg.innerHTML = html; showPicker(dlg); }
  (dlg.querySelector(focusSel) || dlg.querySelector('.sheet-close'))?.focus();
}
function chooseSubscription(value) {
  const before = { ...app.state.subscription };
  app.state.subscription = value === 'none'
    ? { ...before, plan: 'none' }
    : { plan: 'plus', billing: value, since: before.plan === 'plus' && before.billing === value ? before.since : now() };
  persist();
  closePicker(() => document.querySelector('[data-action="manage-sub"]')?.focus({ preventScroll: true }));
  if (app.route.name === 'profile') rerenderPage();
  const plan = PLANS.find((x) => x.id === value);
  if (value === 'none') {
    toast('Night Out Plus canceled.', {
      actionLabel: 'Undo',
      onAction: () => { app.state.subscription = before; persist(); if (app.route.name === 'profile') rerenderPage(); announce('Night Out Plus restored.'); },
    });
  } else toast(`Night Out Plus · ${plan.label}.`);
}
function addVipCard() {
  const have = new Set(app.state.vipCards.map((c) => c.venueId));
  const sample = SAMPLE_BAR_CARDS.find((c) => !have.has(c.venueId));
  if (!sample) return;
  app.state.vipCards.push({ id: `vip-${sample.venueId}`, venueId: sample.venueId, title: sample.title, addedAt: now() });
  persist();
  profileList([], () => document.querySelector('[data-action="vip-add"]')?.focus({ preventScroll: true }));
  toast(`Added ${sample.title}.`);
}
/** Bar hop stops (QA plan 8.1): a stop that goes fades out, then the rows and the form below glide up; a new one rises
 *  in while the form below glides down. */
function hopList(leaving, after) {
  updateList({ sel: '#group-form > *, #group-form .hop-fields > :not(legend), #group-form .hop-edit-row', leaving, render: patchPage, after });
}
/** VIP cards (QA plan 8.1): a card that goes fades out, then everything below it on the page glides up; a new one rises
 *  in while the page below glides down to make room. */
function profileList(leaving, after) {
  updateList({ sel: '#main .page > *, #main .vip-list > li', leaving, render: () => patchPage(() => document.querySelector('[data-action="vip-add"]')), after });
}
function removeVipCard(id) {
  const i = app.state.vipCards.findIndex((c) => c.id === id);
  if (i < 0) return;
  const [card] = app.state.vipCards.splice(i, 1);
  persist();
  const li = document.querySelector(`#main .vip-list > li[data-key="${CSS.escape(card.id)}"]`);
  if (li?.contains(document.activeElement)) document.querySelector('[data-action="vip-add"]')?.focus({ preventScroll: true });
  profileList(li ? [li] : []);
  toast(`Removed ${card.title}.`, {
    actionLabel: 'Undo',
    onAction: () => {
      app.state.vipCards.splice(i, 0, card); persist();
      if (app.route.name === 'profile') {
        profileList([], () => {
          // The toast's Undo button is going away: focus moves to the restored card's own button.
          const btn = document.querySelector(`[data-action="vip-remove"][data-id="${CSS.escape(card.id)}"]`);
          btn?.focus({ preventScroll: true });
          btn?.scrollIntoView({ block: 'nearest' });
        });
      }
      announce(`${card.title} restored.`);
    },
  });
}

/* ---------------- map preview (QA plan 6.3) ---------------- */
/** The picked bar floats above the tab bar: it rises 8px in (--d-reveal), drops 6px out (--d-fade), and a pin-to-pin
 *  change keeps the card's place and cross-fades its content (--d-swap). Reduced motion: opacity only. */
function showMapPreview(box, v) {
  const html = v ? mapCard(v, now(), { saved: app.state.saved.includes(v.id) }) : '';
  const rm = reducedMotion(), moving = motionOK();
  box.getAnimations({ subtree: true }).forEach((a) => a.cancel());
  box.querySelectorAll(':scope > .is-leaving').forEach((n) => n.remove());
  const shown = !box.hidden && box.firstElementChild;
  box.inert = false;
  if (!v) {
    if (!shown || (!moving && !rm)) { box.hidden = true; box.replaceChildren(); liftToasts(); return; }
    box.inert = true; // its links can't be tapped while it leaves
    const out = box.animate(rm ? { opacity: [1, 0] } : { opacity: [1, 0], translate: ['0 0', '0 6px'] },
      { duration: rm ? T.rmOut : T.fade, easing: rm ? 'linear' : T.easeOut, fill: 'forwards' });
    out.finished.then(() => { if (app.ui.mapSelected) return; box.hidden = true; box.inert = false; box.replaceChildren(); out.cancel(); liftToasts(); }, () => {});
    return;
  }
  const card = fragment(html);
  if (!shown) {
    box.replaceChildren(card);
    box.hidden = false;
    liftToasts();
    if (rm) box.animate({ opacity: [0, 1] }, { duration: T.rmIn, easing: 'linear' });
    else if (moving) box.animate({ opacity: [0, 1], translate: ['0 8px', '0 0'] }, { duration: T.reveal, easing: T.easeOut });
    return;
  }
  const old = box.firstElementChild;
  if (!moving && !rm) { old.replaceWith(card); liftToasts(); return; }
  // Both cards share one grid cell (CSS) while the old one fades out over the new one fading in.
  old.classList.add('is-leaving');
  old.inert = true;
  box.append(card);
  const d = rm ? T.rmIn : T.swap, easing = rm ? 'linear' : T.easeOut;
  card.animate({ opacity: [0, 1] }, { duration: d, easing });
  old.animate({ opacity: [1, 0] }, { duration: d, easing, fill: 'forwards' }).finished.then(() => old.remove(), () => old.remove()).then(liftToasts);
}

/* ---------------- search (always on Bars; the condensed header's icon jumps to it) ---------------- */
function focusSearch() {
  if (app.route.name !== 'tonight') { go(app.lastExploreHash); }
  afterNav(() => {
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
    setSearchOpen(true);
  });
}
/** A state change that must not animate (keyboard, first placement): transitions are off for two frames. */
function instantly(el, fn) {
  el.classList.add('is-instant');
  fn();
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('is-instant')));
}
/** The search field opens in place of the sort row; Cancel clears the query and brings the row back (QA plan 6.1).
 *  With a pointer the field's pill grows out of the search button (--d-morph) while the row fades, and its text and
 *  Cancel fade in 60ms later; closing folds it back (--d-morph-out). The keyboard (and Escape) swap at once; reduced
 *  motion cross-fades (CSS). Focus moves in the same task, so iOS raises the keyboard. */
function setSearchOpen(open) {
  app.ui.searchOpen = open;
  const panel = document.getElementById('explore-search');
  if (!panel) return;
  const was = panel.classList.contains('is-open');
  const field = panel.querySelector('.search');
  const parts = [field, ...panel.querySelectorAll('.search-row *')].filter(Boolean);
  parts.forEach((n) => n.getAnimations().forEach((a) => { if (!(a instanceof CSSTransition)) a.cancel(); }));
  field?.getAnimations({ subtree: true }).forEach((a) => { if (a.effect?.pseudoElement === '::before') a.cancel(); });
  const morph = was !== open && motionOK();
  const flip = () => {
    panel.classList.toggle('is-open', open);
    panel.querySelector('.search-toggle')?.setAttribute('aria-expanded', String(open));
    if (open) document.getElementById('q')?.focus({ preventScroll: true });
    else panel.querySelector('.search-toggle')?.focus({ preventScroll: true });
  };
  if (!morph && !reducedMotion()) instantly(panel, flip); else flip();
  if (morph) morphSearch(panel, open);
}
/** The field's background pill (.search::before) travels between the search button's box and the field's box. */
function morphSearch(panel, open) {
  const field = panel.querySelector('.search'), toggle = panel.querySelector('.search-toggle');
  const f = field?.getBoundingClientRect(), t = toggle?.getBoundingClientRect();
  if (!f?.width || !t?.width) return;
  const at = `translateX(${t.left - f.left}px) scaleX(${t.width / f.width})`;
  const ink = [field.querySelector(':scope > .ic'), field.querySelector('input'), field.querySelector('.clear:not([hidden])'), panel.querySelector('.search-cancel')].filter(Boolean);
  // While the pill is narrow it hides under the (fading) round button: scaleX squares its ends, so it shows only once
  // it has grown past the button (and, closing, goes before it gets there).
  const pill = (keys, duration, fill, easing = T.easeOut) => field.animate(keys, { duration, easing, pseudoElement: '::before', fill });
  if (open) {
    pill({ transform: [at, 'none'] }, T.morph, 'none');
    pill([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1 }], T.morph, 'none', 'linear');
    ink.forEach((n) => n.animate({ opacity: [0, 1] }, { duration: T.swap, delay: 60, easing: T.easeOut, fill: 'backwards' }));
    return;
  }
  const runs = [
    pill({ transform: ['none', at] }, T.morphOut, 'forwards'),
    pill([{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], T.morphOut, 'forwards', 'linear'),
    ...ink.map((n) => n.animate({ opacity: [1, 0] }, { duration: T.quick, easing: T.easeOut, fill: 'forwards' })),
  ];
  // The row is hidden by the time these end; drop their held frames so the next open starts clean.
  Promise.all(runs.map((a) => a.finished)).then(() => { if (!panel.classList.contains('is-open')) runs.forEach((a) => a.cancel()); }, () => {});
}
let condenseObservers = [];
/** Condense or expand the masthead. The incoming pair rises 4px into place, the outgoing one lifts 3px as it fades (the
 *  fades and the visibility hand-off are CSS); a first placement or a page change swaps at once. */
function setCondensed(bar, on, animate) {
  if (bar.hasAttribute('data-condensed') === on) return;
  const swap = () => bar.toggleAttribute('data-condensed', on);
  if (!animate) { instantly(bar, swap); return; }
  swap();
  if (!motionOK()) return;
  const wordmark = bar.querySelector(':scope > .wordmark'), pair = [...bar.querySelectorAll(':scope > :is(.topbar-area, .top-search)')];
  const [ins, outs] = on ? [pair, [wordmark]] : [[wordmark], pair];
  ins.forEach((el) => { el?._tb?.cancel(); if (el) el._tb = el.animate({ translate: ['0 4px', '0 0'] }, { duration: T.select, easing: T.easeOut }); });
  outs.forEach((el) => { el?._tb?.cancel(); if (el) el._tb = el.animate({ translate: ['0 0', '0 -3px'] }, { duration: T.quick, easing: T.easeOut }); });
}
/** The masthead condenses to "New Brunswick ⌄ · search · points" once the area title scrolls away (Bars only), with
 *  hysteresis (QA plan 6.2): it condenses when the area row's bottom passes under the top bar, and expands only once the
 *  row is back 24px below it, so a scroll that hovers at the edge doesn't flicker. */
function watchMasthead() {
  condenseObservers.forEach((o) => o.disconnect());
  condenseObservers = [];
  const bar = document.querySelector('.topbar');
  const row = document.querySelector('.area-row');
  const label = document.querySelector('[data-area-label]');
  if (label) label.textContent = app.explore.area ? areaLabel(app.explore.area) : 'New Brunswick';
  if (!bar) return;
  if (!row || app.route?.name !== 'tonight' || !('IntersectionObserver' in window)) { setCondensed(bar, false, false); return; }
  const h = Math.round(bar.getBoundingClientRect().height) || 52;
  const watch = (margin, fn) => {
    let calls = 0; // the first call reports the state at once: no motion
    const o = new IntersectionObserver(([e]) => fn(e.isIntersecting, calls++ > 0), { rootMargin: `-${margin}px 0px 0px 0px` });
    o.observe(row);
    condenseObservers.push(o);
  };
  watch(h, (seen, animate) => { if (!seen) setCondensed(bar, true, animate); });
  watch(h + 24, (seen, animate) => { if (seen) setCondensed(bar, false, animate); });
}

/* ---------------- events ---------------- */
/** The event list patched in place (cards keep their nodes, so a card that goes can leave and the rest can glide). */
function patchEventResults() {
  const box = document.getElementById('event-results');
  if (!box) return;
  endNavMotion();
  const tpl = document.createElement('template');
  tpl.innerHTML = eventResults(ctx());
  preserveFocus(() => patchChildren(box, tpl.content));
}
function renderEventResults({ quiet = false } = {}) {
  const box = document.getElementById('event-results');
  if (!box) return;
  preserveFocus(() => { box.innerHTML = eventResults(ctx()); });
  if (quiet) return;
  const n = box.querySelectorAll('.ev-card, .idea-card').length;
  if (app.ui.eventsView === 'ideas') announce(`${n} idea${n === 1 ? '' : 's'} shown`);
  else announce(n ? `${n} event${n === 1 ? '' : 's'} shown` : 'No events shown');
}
function toggleEventList(key, id) {
  const list = app.state[key];
  const on = !list.includes(id);
  app.state[key] = on ? [...list, id] : list.filter((x) => x !== id);
  persist();
  const ev = app.events.find((e) => e.id === id);
  // Saved view: unsaving removes the card (QA plan 8.1): it fades out, then the cards after it glide up into its place.
  // Focus moves at once to the next card's Save, else the previous one's (the announcement says what happened).
  if (key === 'savedEvents' && app.ui.eventsView === 'saved' && !on) {
    const cards = [...document.querySelectorAll('#event-results .ev-list > li:not(.is-leaving)')];
    const gone = cards.find((c) => c.dataset.event === id);
    const i = cards.indexOf(gone), rest = cards.filter((c) => c !== gone);
    (rest[Math.min(Math.max(i, 0), rest.length - 1)]?.querySelector('[data-action="event-save"]') ?? document.getElementById('page-h'))?.focus({ preventScroll: true });
    updateList({ sel: '#event-results .ev-list > li', leaving: gone ? [gone] : [], render: patchEventResults });
  } else if (!patchCard(`#event-results .ev-card[data-event="${CSS.escape(id)}"]`, ev && eventCard(ev, ctx()))) renderEventResults({ quiet: true });
  const msg = key === 'savedEvents' ? (on ? `Saved ${ev?.title}.` : `Removed ${ev?.title} from saved.`) : (on ? `You’re going to ${ev?.title}.` : `Not going to ${ev?.title}.`);
  if (key === 'goingEvents') toast(msg); else announce(msg);
  const count = app.state.savedEvents.length;
  const savedNum = document.querySelector('[data-action="event-view"][data-view="saved"] .num');
  if (savedNum) swapText(savedNum, count ? String(count) : ''); // the segment survives, so its thumb and focus stay
}

/* ---------------- bar page: poll, directions, share ---------------- */
function castVote(venueId, vote) {
  const votes = (app.state.votes ??= {});
  const was = votes[venueId] ?? null;
  if (was === vote) delete votes[venueId]; else votes[venueId] = vote;
  persist();
  const v = app.venues.find((x) => x.id === venueId);
  const box = document.getElementById(`poll-${venueId}`);
  if (box && v) {
    // Patched in place (QA plan 4.10): the bars resize (CSS), the percentages roll, the check fades in its own slot, so
    // no label moves.
    patchTree(box, fragment(pollSection(v, votes[venueId] ?? null)));
    box.querySelector(`.poll-opt[data-vote="${CSS.escape(vote)}"]`)?.focus({ preventScroll: true });
  }
  const label = { going: 'Going', maybe: 'Maybe', no: 'Not tonight' }[vote];
  announce(votes[venueId] ? `Your answer: ${label}.` : 'Your answer was cleared.');
}
function openDirections(id) {
  const v = app.venues.find((x) => x.id === id);
  if (!v?.address) return;
  const dlg = preparePicker();
  dlg.innerHTML = directionsSheet(v);
  showPicker(dlg);
  dlg.querySelector('.dir-links a')?.focus();
}
/* ---------------- terms (App Store build): asked once, before the first report ---------------- */
function openTermsSheet() {
  const dlg = preparePicker('[data-action="scan-submit"]');
  dlg.innerHTML = termsSheet();
  showPicker(dlg);
  dlg.querySelector('#picker-title')?.focus({ preventScroll: true });
}
function agreeToTerms() {
  if (!document.getElementById('picker')?.open) return; // only from the open sheet: never a second send
  app.state.termsAgreedAt = Date.now();
  persist();
  haptic('light');
  // The sheet hands focus back when it has closed: to the report's result (its heading), not to the Send button the
  // result replaced (that would leave focus on the page body).
  closePicker(() => document.querySelector('#main [data-autofocus]')?.focus({ preventScroll: true }));
  submitReport();
}

/* ---------------- reminders (App Store build): Saved > bell ---------------- */
function openReminder(id) {
  const v = app.venues.find((x) => x.id === id);
  if (!v) return;
  const existing = activeReminders(app.state.reminders, now())[id] ?? null;
  app.remindFlow = { venueId: id, ...defaultChoice(existing, now()), error: null, busy: false };
  const dlg = preparePicker(`[data-action="remind"][data-id="${CSS.escape(id)}"]`);
  dlg.innerHTML = reminderSheet(v, app.remindFlow, existing, now());
  showPicker(dlg);
  dlg.querySelector('input[name="remind-day"]:checked')?.focus();
}
function renderReminderSheet(focusName) {
  const f = app.remindFlow;
  const dlg = document.getElementById('picker');
  const v = app.venues.find((x) => x.id === f?.venueId);
  if (!v || !dlg.open) return;
  const body = dlg.querySelector('.sheet-body');
  const y = body?.scrollTop ?? 0;
  dlg.innerHTML = reminderSheet(v, f, activeReminders(app.state.reminders, now())[v.id] ?? null, now());
  const nb = dlg.querySelector('.sheet-body');
  if (nb) nb.scrollTop = y;
  if (focusName) dlg.querySelector(`input[name="${focusName}"]:checked`)?.focus();
}
function pickReminder(change, focusName) {
  const f = app.remindFlow;
  if (!f) return;
  Object.assign(f, change, { error: null });
  // A night with fewer hours left (tonight) keeps the chosen time if it's still open, else 10 PM, else its first hour.
  const hours = reminderDays(now()).find((d) => d.key === f.day)?.hours ?? [];
  if (!hours.includes(f.hour)) f.hour = hours.includes(22) ? 22 : hours[0] ?? null;
  haptic('selection');
  renderReminderSheet(focusName);
}
async function setReminder() {
  const f = app.remindFlow;
  const v = app.venues.find((x) => x.id === f?.venueId);
  if (!f || !v || f.busy) return;
  const at = reminderAt(f.day, f.hour);
  if (!(at > now() + 60_000)) { f.error = { text: 'That time has passed. Pick another.' }; renderReminderSheet(); return; }
  const nid = reminderId(v.id);
  // In the iOS app: ask for notifications (first time only) and schedule one. In a browser (the team build) there is no
  // notification to schedule, so the reminder is only saved and shown.
  if (canRemind()) {
    f.busy = true; f.error = null; renderReminderSheet();
    const perm = await notificationPermission({ ask: true });
    if (perm !== 'granted') {
      f.busy = false;
      f.error = perm === 'denied'
        ? { text: 'Notifications are off for this app. Turn them on in Settings, then try again.', settings: true }
        : { text: 'Reminders aren’t available on this device.' };
      haptic('warning');
      renderReminderSheet();
      return;
    }
    const ok = await scheduleReminder({ id: nid, at, ...reminderText(v), extra: { venueId: v.id } });
    f.busy = false;
    if (!ok) { f.error = { text: 'Couldn’t set the reminder. Try again.' }; haptic('error'); renderReminderSheet(); return; }
  }
  app.state.reminders = { ...app.state.reminders, [v.id]: { at, nid } };
  persist();
  haptic('success');
  closePickerToOpener();
  refreshCurrent();
  toast(`Reminder set for ${reminderPhrase(at, now())}`, { key: `remind:${v.id}` });
}
function clearReminder() {
  const f = app.remindFlow;
  const rem = f && app.state.reminders?.[f.venueId];
  if (!rem) { closePickerToOpener(); return; }
  cancelReminder(rem.nid);
  const { [f.venueId]: _gone, ...rest } = app.state.reminders;
  app.state.reminders = rest;
  persist();
  haptic('light');
  closePickerToOpener();
  refreshCurrent();
  toast('Reminder removed', { key: `remind:${f.venueId}` });
}
function pruneReminders() {
  const live = activeReminders(app.state.reminders, now());
  if (Object.keys(live).length === Object.keys(app.state.reminders ?? {}).length) return;
  app.state.reminders = live;
  persist();
  if (app.route.name === 'saved') refreshCurrent();
}
/** Drop reminders that fired or that iOS no longer holds (e.g. notifications turned off and back on). */
async function syncReminders() {
  if (!(globalThis.__STORE__ || LIVE) || !canRemind()) return;
  const live = activeReminders(app.state.reminders, now());
  const pending = await pendingReminderIds();
  const keep = pending ? Object.fromEntries(Object.entries(live).filter(([, r]) => pending.includes(r.nid))) : live;
  if (JSON.stringify(keep) === JSON.stringify(app.state.reminders ?? {})) return;
  app.state.reminders = keep;
  persist();
  if (app.route.name === 'saved') refreshCurrent();
}

async function shareVenue(id) {
  const v = app.venues.find((x) => x.id === id);
  if (!v) return;
  // In the App Store app the link is the download page; in a browser (the web app itself) it's this bar's page. The team
  // iPhone build has no page anyone else can open (its origin is the app itself), so it shares the name alone. The text
  // never carries an estimate: a wait or crowd level for a real bar would travel without the sample-data context.
  const url = globalThis.__STORE__ && isNative() ? `${(globalThis.__SITE__ ?? '').replace(/\/+$/, '')}/get` : isNative() ? undefined : `${location.href.split('#')[0]}#/venue/${encodeURIComponent(v.id)}`;
  const text = `${v.name} on ${APP_NAME}`;
  const result = await nativeShare({ title: `${v.name} · ${APP_NAME}`, text, url });
  if (result === 'copied') toast(url ? 'Link copied.' : 'Copied.');
  else if (result === 'failed') toast(url ? `Couldn’t share. Link: ${url}` : 'Couldn’t share.');
}

/* ---------------- dialogs: exit the way they entered ---------------- */
/** Add .is-closing, wait for the sheet's own transform/opacity transition (or a timeout), then close() and run focusAfter.
 *  focusAfter runs after close(), so the browser's own focus restore can't override it. Reopening cancels a pending close. */
function closeDialogAnimated(dlg, focusAfter) {
  if (!dlg?.open || dlg.classList.contains('is-closing')) return;
  let done = false;
  const stop = () => { done = true; clearTimeout(timer); dlg.removeEventListener('transitionend', onEnd); dlg._cancelClose = null; };
  const finish = () => { if (done) return; stop(); dlg.classList.remove('is-closing'); if (dlg.open) dlg.close(); focusAfter?.(); };
  const onEnd = (e) => { if (e.target === dlg && !e.pseudoElement && (e.propertyName === 'transform' || e.propertyName === 'opacity')) finish(); };
  dlg.addEventListener('transitionend', onEnd);
  const timer = setTimeout(finish, T.sheetOut + 80);
  dlg._cancelClose = () => { if (!done) { stop(); dlg.classList.remove('is-closing'); } };
  // Released from a drag: the exit starts from the finger's offset (the inline offset goes in the same frame).
  dlg.getAnimations().forEach((a) => { if (!(a instanceof CSSTransition)) a.cancel(); });
  dlg.classList.remove('is-dragging');
  dlg.style.transform = '';
  dlg.classList.add('is-closing');
}
/** The picker sheet (area, directions, account, check-in). */
function closePicker(focusAfter) {
  const g = gesture; // a keyboard close keeps the held balance change instant too
  closeDialogAnimated(document.getElementById('picker'), () => { withGesture(g, releasePoints); focusAfter?.(); });
}
/** Close paths without their own target (X, Escape, backdrop) return focus to the sheet's opener when it was re-rendered. */
function closePickerToOpener() {
  const sel = app.pickerReturn;
  app.pickerReturn = null;
  closePicker(sel ? () => document.querySelector(sel)?.focus({ preventScroll: true }) : undefined);
}
/** Open the picker with fresh content: cancel a close still in flight, and forget the last sheet's opener. */
function preparePicker(returnSel = null) {
  const dlg = document.getElementById('picker');
  dlg._cancelClose?.();
  dlg.classList.remove('is-closing');
  app.pickerReturn = returnSel;
  return dlg;
}
/** Open the picker; drags wait for its slide in to finish (--d-sheet-lock). */
function showPicker(dlg) {
  if (dlg.open) return;
  dlg.showModal();
  dlg._openedAt = performance.now();
}
/**
 * A sheet's content changes to a new step (QA plan 7.2): its height glides from the old to the new (--d-tray, in-out),
 * and the new body fades in after 60ms, from the side for a drill-in (dir 1) or a Back (dir -1), else rising 4px.
 * Height is layout, once per step. Keyboard: instant. Reduced motion: instant height, a short linear fade.
 */
function swapSheet(dlg, swap, dir = 0, { body = true } = {}) {
  if (!dlg.open) { swap(); return; }
  // A glide still running: read the height it shows now, then stop it, so the next glide starts from what is on screen
  // (and the instant paths end at the natural height with no stale keyframes) (MJ7).
  const gliding = dlg.getAnimations().filter((a) => !(a instanceof CSSTransition) && a.effect?.getKeyframes().some((k) => 'height' in k));
  const h0 = dlg.offsetHeight;
  gliding.forEach((a) => a.cancel());
  if (reducedMotion()) {
    swap();
    dlg.querySelector('.sheet-body')?.animate({ opacity: [0, 1] }, { duration: T.rmIn, easing: 'linear' });
    return;
  }
  if (!motionOK()) { swap(); return; }
  swap();
  const h1 = dlg.offsetHeight;
  if (Math.abs(h1 - h0) >= 8) dlg.animate({ height: [`${h0}px`, `${h1}px`] }, { duration: T.tray, easing: T.easeInOut });
  if (body) dlg.querySelector('.sheet-body')?.animate({ opacity: [0, 1], translate: [dir ? `${12 * dir}px 0` : '0 4px', '0 0'] }, { duration: T.reveal, delay: 60, easing: T.easeOut, fill: 'backwards' });
}

/* ---------------- points: daily login and door check-ins (simulated QR) ---------------- */
/** +5 once per demo night, after the age check. */
function dailyLogin() {
  if (globalThis.__STORE__ || LIVE) return;
  const night = app.state.clock.base;
  if (!app.state.ageConfirmed || app.state.lastDaily === night) return;
  app.state.lastDaily = night;
  app.state.points.push({ id: `daily-${night}`, at: now(), delta: POINTS.DAILY, label: 'Daily login' });
  persist();
  toast(`Daily login: +${POINTS.DAILY} points.`);
  if (app.route?.name === 'points') patchPoints();
}
const focusCheckin = (dlg) => (dlg.querySelector('[data-autofocus]') || dlg.querySelector('.pick-row:not([aria-disabled="true"])') || dlg.querySelector('.sheet-close'))?.focus();
/** A new check-in step: the sheet glides to its height (7.2); dir 1 = on to the scan, -1 = back to the list. */
function renderCheckin(dir = 0) {
  const dlg = document.getElementById('picker');
  swapSheet(dlg, () => { dlg.innerHTML = checkinSheet(ctx(), app.checkin); }, dir);
  focusCheckin(dlg);
}
function openCheckin() {
  app.checkin = { step: 'pick', venueId: null };
  // Checking in re-renders Points, which replaces this button: every close path puts focus back on the new one.
  const dlg = preparePicker('[data-action="open-checkin"]');
  dlg.innerHTML = checkinSheet(ctx(), app.checkin);
  showPicker(dlg);
  focusCheckin(dlg);
}
function checkIn() {
  const v = app.venues.find((x) => x.id === app.checkin.venueId);
  if (!v) return;
  if (checkedInTonight(app.state.checkins, v.id, app.state.clock.base)) { toast(`You already checked in at ${v.name} tonight.`); return; }
  const id = `ci-${refCode(`${v.id}${Date.now()}`).toLowerCase()}`;
  app.state.checkins.push({ id, venueId: v.id, at: now() });
  app.state.points.push({ id: `p-${id}`, at: now(), delta: POINTS.CHECKIN, label: `Check-in: ${v.name}` });
  app.ui.holdPoints = true; // Points and the chip change once the sheet closes, in view (closePicker → releasePoints)
  persist();
  app.checkin = { step: 'done', venueId: v.id };
  renderCheckin();
  announce(`Checked in at ${v.name}. Plus ${POINTS.CHECKIN} points.`);
}

/* ---------------- area picker ---------------- */
function openAreaPicker() {
  const dlg = preparePicker();
  dlg.innerHTML = areaSheet(app.explore.area, app.venues);
  showPicker(dlg);
  dlg.querySelector('input:checked')?.focus();
}
/** QA plan 7.3: the radio's check is instant; with a pointer the picked row holds its fill for a beat (--d-flash-pick,
 *  kept under reduced motion: it's a color), then the sheet closes. The list and the title change at once, under the
 *  scrim: the cards are patched in place and the title swaps its text. */
function chooseArea(id, row) {
  app.explore.area = id;
  updateExploreUrl();
  const name = id ? areaLabel(id) : 'New Brunswick';
  const pill = document.querySelector('.area-pill');
  if (pill) {
    swapText(pill.querySelector(':scope > span'), name);
    pill.setAttribute('aria-label', `Area: ${areaLabel(id)}. Change area`);
    document.title = `${name} · ${APP_NAME}`;
  }
  const label = document.querySelector('[data-area-label]');
  if (label) label.textContent = name;
  renderResultsOnly({ announceCount: false });
  const close = () => closePicker(() => document.querySelector('.area-pill')?.focus({ preventScroll: true }));
  if (row && !fromKeys(gesture)) { row.classList.add('is-picked'); setTimeout(close, T.pick); } else close();
  const { total } = exploreList(app.venues, app.explore, now(), savedSet());
  announce(`${total} bar${total === 1 ? '' : 's'} shown`);
}

/* ---------------- events ---------------- */
const onClick = (e) => withGesture(e, () => handleClick(e));
function handleClick(e) {
  if (e.target.closest('a.skip')) { e.preventDefault(); document.getElementById('main').focus(); return; }
  const summary = e.target.closest('details.how > summary');
  if (summary && summary.parentElement.querySelector(':scope > .how-a') && motionOK(e)) { e.preventDefault(); disclose(summary.parentElement); return; }
  const nav = e.target.closest('a[href^="#/"]');
  const actEl = e.target.closest('[data-action]');
  // A blocked Send report says why instead of a dead tap (QA plan 8.3).
  if (actEl?.dataset.action === 'scan-submit' && actEl.getAttribute('aria-disabled') === 'true') { e.preventDefault(); blockedScan(actEl); return; }
  if (!globalThis.__STORE__ && ['biz-upload', 'biz-art-photo'].includes(actEl?.dataset.action) && actEl.getAttribute('aria-disabled') === 'true') { e.preventDefault(); toast(`Up to ${MAX_UPLOADS} photos. Remove one first.`); return; } // the toast region announces it
  // So does a blocked Publish on the line photo ("Count the line first."), which used to be a dead tap.
  if (!(globalThis.__STORE__ || LIVE) && actEl?.dataset.action === 'photo-publish' && actEl.getAttribute('aria-disabled') === 'true') { e.preventDefault(); publishPhoto(actEl); return; }
  if (actEl && !actEl.disabled && actEl.getAttribute('aria-disabled') !== 'true') {
    const a = actEl.dataset.action;
    const handled = handleAction(a, actEl, e);
    if (handled !== false) { e.preventDefault(); return; }
  }
  if (nav && !e.defaultPrevented && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
    e.preventDefault();
    const href = nav.getAttribute('href');
    // Re-tapping the tab you're on scrolls to the top instead of rebuilding the page (QA plan 5.4). From a child page
    // (Saved under Profile) it still pops to the tab's root.
    if (nav.matches('.tab[aria-current="page"]') && parseHash(href).name === app.route?.name) {
      window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
      return;
    }
    if (!globalThis.__STORE__ && cameraFirst(href)) openCamera(); // in the tap itself: iOS opens the camera only from a gesture
    app.navFrom = nav; // the navigation flies the photo that was actually tapped
    // Back to this list morphs into the same card photo: remember which one (and for which bar) on this list's entry.
    const target = parseHash(href);
    if (LIST_ROUTES.has(app.route?.name) && target.name === 'venue') {
      history.replaceState({ ...(history.state ?? {}), navFrom: { id: target.params.id, sel: thumbSelector(nav) } }, '');
    }
    if (nav.closest('#sheet') && href.startsWith('#/passes')) {
      // Leaving the sheet for a pass: replace the sheet entry so Back returns to the venue.
      app.passFlow = null;
      closeSheetAnimated();
      go(href, { replace: true });
      return;
    }
    go(href);
  }
}

function handleAction(a, el, e) {
  switch (a) {
    case 'toggle-save': toggleSave(el.dataset.id); return true;
    case 'toggle-filter': {
      const f = el.dataset.filter;
      const set = new Set(app.explore.filters);
      if (set.has(f)) set.delete(f); else set.add(f);
      app.explore.filters = FILTER_IDS.filter((x) => set.has(x));
      app.ui.staleNotice = null;
      updateExploreUrl();
      renderResultsOnly();
      return true;
    }
    case 'clear-filters':
      app.explore.filters = [];
      app.ui.staleNotice = null;
      updateExploreUrl();
      renderResultsOnly();
      document.querySelector('[data-action="quick-view"][aria-pressed="true"]')?.focus();
      return true;
    case 'quick-view': {
      // Nearest / Shortest line / Deals: one choice. Other filters from older links are kept.
      const v = el.dataset.view;
      const others = app.explore.filters.filter((f) => f !== 'deals');
      app.explore.sort = v === 'wait' ? 'wait' : 'near';
      app.explore.filters = v === 'deals' ? FILTER_IDS.filter((x) => x === 'deals' || others.includes(x)) : others;
      app.ui.staleNotice = null;
      // The ink starts gliding now; a pointer tap rebuilds the list a frame later, so the rebuild never eats its first frame.
      const seg = document.querySelector('#explore-search .sort-seg');
      const animate = motionOK(e);
      seg?.querySelectorAll('button[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === quickViewOf(app.explore))));
      placeSegInk(seg, animate);
      const apply = () => {
        updateExploreUrl();
        renderResultsOnly();
        document.querySelector(`#explore-search [data-action="quick-view"][data-view="${v}"]`)?.focus({ preventScroll: true });
        announce({ near: 'Nearest first', wait: 'Shortest line first', deals: 'Bars with a deal now' }[v] ?? '');
      };
      if (animate) requestAnimationFrame(() => setTimeout(apply, 0)); else apply();
      return true;
    }
    case 'clear-search': {
      app.explore.q = '';
      const input = document.getElementById('q');
      if (input) { input.value = ''; input.focus(); }
      updateExploreUrl();
      renderResultsOnly();
      return true;
    }
    case 'set-view':
      app.explore.view = el.dataset.view;
      updateExploreUrl();
      renderResultsOnly();
      return true;
    case 'focus-search': focusSearch(); return true;
    case 'open-search': setSearchOpen(true); return true;
    case 'close-search':
      if (app.explore.q) { app.explore.q = ''; const input = document.getElementById('q'); if (input) input.value = ''; updateExploreUrl(); renderResultsOnly(); }
      setSearchOpen(false);
      return true;
    case 'clear-all':
      app.explore.q = '';
      app.explore.filters = [];
      app.ui.staleNotice = null;
      updateExploreUrl();
      { const input = document.getElementById('q'); if (input) input.value = ''; }
      renderResultsOnly();
      listHeading()?.focus({ preventScroll: true });
      announce('Search and filters cleared');
      return true;
    case 'map-select': {
      app.ui.mapSelected = app.ui.mapSelected === el.dataset.id ? null : el.dataset.id;
      document.querySelectorAll('.map-pin-btn[data-action="map-select"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === app.ui.mapSelected)));
      const preview = document.querySelector('.map-preview');
      const v = app.venues.find((x) => x.id === app.ui.mapSelected);
      if (preview) showMapPreview(preview, v);
      announce(v ? `${v.name}: ${estimateFor(v, now()).headline}. Preview below the map.` : 'Selection cleared');
      return true;
    }
    case 'map-open': go(buildHash('venue', { id: el.dataset.id })); return true;
    case 'refresh': if (!app.ui.loading) simulateFetch(); return true;
    case 'go-online':
      app.state.sim.offline = false;
      persist();
      if (navigator.onLine === false) { toast('Your device still reports no connection.'); return true; }
      simulateFetch();
      return true;
    case 'go-online-retry': if (!(globalThis.__STORE__ || LIVE)) { // the pass flow's retry (team build)
      app.state.sim.offline = false;
      persist();
      if (navigator.onLine === false) { toast('Your device still reports no connection.'); return true; }
      runPassRequest();
      return true;
    } return false;
    case 'apply-stale': app.ui.staleNotice = null; renderResultsOnly(); return true;
    case 'undo-remove': undoRemove(); return true;
    case 'undo-reset': if (!(globalThis.__STORE__ || LIVE)) {
      undoReset(); return true;
    } return false;
    case 'back': goBack(el.getAttribute('href') || '#/'); return true;
    case 'close-sheet': requestCloseSheet(); return true;
    case 'party': if (!(globalThis.__STORE__ || LIVE)) {
      {
      const f = app.passFlow;
      const v = app.venues.find((x) => x.id === f.venueId);
      const win = v.pass.windows.find((w) => w.id === f.windowId);
      const max = win ? maxPartyFor(win) : 4;
      f.party = Math.max(1, Math.min(max, f.party + Number(el.dataset.delta)));
      renderSheet();
      announce(`Party size ${f.party}`);
      return true;
    }
    } return false;
    case 'submit-pass': if (!(globalThis.__STORE__ || LIVE)) {
      submitPass(); return true;
    } return false;
    case 'retry-pass': if (!(globalThis.__STORE__ || LIVE)) {
      runPassRequest(); return true;
    } return false;
    case 'back-to-review': if (!(globalThis.__STORE__ || LIVE)) {
      app.passFlow.step = 'review'; renderSheet(); return true;
    } return false;
    case 'view-pass': if (!(globalThis.__STORE__ || LIVE)) {
      return false; // handled as navigation
    } return false;
    case 'cancel-pass': if (!(globalThis.__STORE__ || LIVE)) {
      {
      const p = app.state.passes.find((x) => x.id === el.dataset.id);
      if (!p) return true;
      p.cancelledAt = now();
      persist(); rebuild(); patchPass(p.id);
      (document.querySelector(`[data-action="restore-pass"][data-id="${CSS.escape(p.id)}"]`) || pageHeading())?.focus({ preventScroll: true });
      toast(`Pass for ${p.venueName} cancelled.`, { actionLabel: 'Undo', onAction: () => restorePass(p.id) });
      return true;
    }
    } return false;
    case 'restore-pass': if (!(globalThis.__STORE__ || LIVE)) {
      restorePass(el.dataset.id); return true;
    } return false;
    case 'biz-section': if (!globalThis.__STORE__) {
      bizSection(el.dataset.s); return true;
    } return false;
    case 'redeem-pick': if (!globalThis.__STORE__) {
      checkRedeemCode(el.dataset.code); return true;
    } return false;
    case 'redeem-confirm': if (!globalThis.__STORE__) {
      if (LIVE) redeemLive(el.dataset.code); else confirmRedemption(el.dataset.code);
      return true;
    } return false;
    case 'biz-upload': if (!globalThis.__STORE__) {
      { const input = uploadInput(); input.value = ''; input.click(); } return true; // inside the tap: phones open pickers only from a gesture
    } return false;
    case 'biz-art-photo': if (!globalThis.__STORE__) {
      addSamplePhoto(); return true;
    } return false;
    case 'biz-photo-remove': if (!globalThis.__STORE__) {
      removeUpload(el.dataset.id); return true;
    } return false;
    case 'console-role': if (!(globalThis.__STORE__ || LIVE)) {
      app.console.role = el.dataset.role === 'bouncer' ? 'bouncer' : 'ambassador';
      rerenderConsole();
      announce(`${ROLE_NAME[app.console.role]} selected`);
      return true;
    } return false;
    case 'photo-snap': case 'photo-retake': if (!(globalThis.__STORE__ || LIVE)) {
      snapPhoto(); return true;
    } return false;
    case 'photo-mark': case 'photo-step': if (!(globalThis.__STORE__ || LIVE)) {
      {
      const v = consoleVenue();
      const p = app.console.photo;
      if (!v || !p || p.venueId !== v.id) return true;
      const delta = el.dataset.action === 'photo-mark' ? 1 : Number(el.dataset.delta);
      const next = Math.max(0, Math.min(400, p.count + delta));
      Object.assign(p, { count: next, touched: true, filled: false, newest: delta > 0 && next <= DRAW_MAX ? next - 1 : -1 });
      // Patched in place per tap (MJ8): the count rolls only its changed digits and a new mark fades in; the scene,
      // steps and buttons keep their nodes.
      patchPhoto();
      countAnnounce(v, p);
      return true;
    }
    } return false;
    case 'photo-fill': if (!(globalThis.__STORE__ || LIVE)) {
      fillPhoto(); return true;
    } return false;
    case 'photo-publish': if (!(globalThis.__STORE__ || LIVE)) {
      publishPhoto(el); return true;
    } return false;
    case 'console-clear': if (!(globalThis.__STORE__ || LIVE)) {
      {
      const v = consoleVenue();
      const prevOverride = app.state.overrides[v.id] ? structuredClone(app.state.overrides[v.id]) : null;
      app.state.overrides[v.id] = { ...(app.state.overrides[v.id] ?? {}), queue: null, clearedAt: now() };
      app.ui.clearedQueue = { venueId: v.id, prevOverride };
      app.console.photo = null;
      audit(v, 'Cleared the estimate (guests see “Wait unknown”)');
      persist(); rebuild(); rerenderConsole();
      toast(`${v.name} now shows “Wait unknown”.`, { actionLabel: 'Undo', onAction: undoClear });
      return true;
    }
    } return false;
    case 'console-undo-clear': if (!(globalThis.__STORE__ || LIVE)) {
      undoClear(); return true;
    } return false;
    case 'deal-post': if (!globalThis.__STORE__) {
      postDeal(); return true;
    } return false;
    case 'deal-remove': if (!(globalThis.__STORE__ || LIVE)) {
      removeDeal(el.dataset.id); return true;
    } return false;
    case 'console-price': if (!(globalThis.__STORE__ || LIVE)) {
      {
      const v = consoleVenue();
      const next = Math.max(100, Math.min(5000, v.pass.basePrice + Number(el.dataset.delta)));
      setPassOverride(v, { basePrice: next });
      audit(v, `Priority price → ${money(next)} per person (+ fee)`);
      persist(); rebuild(); rerenderConsole();
      announce(`Price ${money(next)} per person`);
      return true;
    }
    } return false;
    case 'console-cap': if (!(globalThis.__STORE__ || LIVE)) {
      {
      const v = consoleVenue();
      const w = v.pass.windows.find((x) => x.id === el.dataset.window);
      const next = Math.max(w.sold, Math.min(50, w.capacity + Number(el.dataset.delta)));
      setPassOverride(v, { capacity: { [w.id]: next } });
      audit(v, `Capacity ${formatTime(w.start)} window → ${next}`);
      persist(); rebuild(); rerenderConsole();
      announce(`Capacity ${next} for the ${formatTime(w.start)} window`);
      return true;
    }
    } return false;
    case 'dataset': if (!(globalThis.__STORE__ || LIVE)) {
      setDataset(el.dataset.kind); return true;
    } return false;
    case 'fast-forward': if (!(globalThis.__STORE__ || LIVE)) {
      app.state.clock = advance(app.state.clock, 10);
      persist();
      rebuild();
      tick();
      if (app.route.name === 'about') rerenderConsole();
      toast('Clock moved forward 10 minutes.');
      return true;
    } return false;
    case 'reset-demo': if (!(globalThis.__STORE__ || LIVE)) {
      resetDemo(); return true;
    } return false;
    case 'reload-app': location.reload(); return true;
    case 'use-location': useMyLocation(); return true;
    case 'terms-agree': agreeToTerms(); return true;
    case 'remind': openReminder(el.dataset.id); return true;
    case 'remind-set': setReminder(); return true;
    case 'remind-clear': clearReminder(); return true;
    case 'open-ios-settings': if (globalThis.__STORE__ || LIVE) { window.location.href = 'app-settings:'; } return true;
    case 'delete-data-ask': app.ui.confirmDelete = true; rerenderPage(); document.getElementById('delete-confirm-h')?.focus(); return true;
    case 'delete-data-cancel': app.ui.confirmDelete = false; rerenderPage(); document.querySelector('[data-action="delete-data-ask"]')?.focus(); return true;
    case 'delete-data-confirm': deleteMyData(); return true;
    case 'age-ok':
      app.state.ageConfirmed = true; persist();
      closeDialogAnimated(document.getElementById('age-gate'), () => pageHeading()?.focus());
      dailyLogin();
      return true;
    case 'open-checkin': if (!(globalThis.__STORE__ || LIVE)) {
      openCheckin(); return true;
    } return false;
    case 'checkin-pick': if (!(globalThis.__STORE__ || LIVE)) {
      app.checkin = { step: 'scan', venueId: el.dataset.id }; renderCheckin(1); return true;
    } return false;
    case 'checkin-back': if (!(globalThis.__STORE__ || LIVE)) {
      app.checkin = { step: 'pick', venueId: null }; renderCheckin(-1); return true;
    } return false;
    case 'checkin-scan': if (!(globalThis.__STORE__ || LIVE)) {
      checkIn(); return true;
    } return false;
    case 'age-no':
      document.getElementById('age-body').innerHTML = '<h2 id="age-title" class="page-title age-title" tabindex="-1">' + esc(APP_NAME) + ' is for adults 21+</h2><p class="page-sub age-sub" id="age-sub">It describes bars and nightlife, so it isn’t available to you. ' + (isNative() ? `You can close ${esc(APP_NAME)}.` : 'You can close this tab.') + '</p>';
      document.getElementById('age-title').focus();
      return true;
    case 'open-area': openAreaPicker(); return true;
    case 'close-picker': closePickerToOpener(); return true;
    case 'vote': if (!(globalThis.__STORE__ || LIVE)) {
      castVote(el.dataset.id, el.dataset.vote); return true;
    } return false;
    case 'event-view': {
      
      app.ui.eventsView = el.dataset.view;
      document.querySelectorAll('.ev-views [data-action="event-view"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === app.ui.eventsView)));
      const hash = buildHash('events', {}, app.ui.eventsView === 'tonight' ? {} : { view: app.ui.eventsView });
      history.replaceState(history.state, '', hash);
      app.renderedHash = hash;
      renderEventResults();
      
      return true;
    }
    case 'idea-hype': if (!(globalThis.__STORE__ || LIVE)) {
      toggleIdea('hyped', el.dataset.id); return true;
    } return false;
    case 'idea-join': if (!(globalThis.__STORE__ || LIVE)) {
      toggleIdea('joined', el.dataset.id); return true;
    } return false;
    case 'idea-post': if (!(globalThis.__STORE__ || LIVE)) {
      return false; // the form's submit handles it
    } return false;
    case 'idea-approve': if (!(globalThis.__STORE__ || LIVE)) {
      decideIdea(el.dataset.id, 'approved'); return true;
    } return false;
    case 'idea-decline': if (!(globalThis.__STORE__ || LIVE)) {
      decideIdea(el.dataset.id, 'declined'); return true;
    } return false;
    case 'idea-undo': if (!(globalThis.__STORE__ || LIVE)) {
      undoDecision(el.dataset.id); return true;
    } return false;
    case 'event-clear': app.ui.eventsGenre = ''; app.ui.eventsTheme = ''; app.ui.eventsPrice = ''; rerenderPage(); return true;
    case 'event-save': toggleEventList('savedEvents', el.dataset.id); return true;
    case 'event-going': if (!(globalThis.__STORE__ || LIVE)) {
      toggleEventList('goingEvents', el.dataset.id); return true;
    } return false;
    case 'directions': openDirections(el.dataset.id); return true;
    case 'share': shareVenue(el.dataset.id); return true;
    case 'scroll-to': { const t = document.getElementById(el.dataset.target); if (t) { t.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }); t.focus({ preventScroll: true }); } return true; }
    case 'join-group': if (!(globalThis.__STORE__ || LIVE)) {
      toggleJoin(el.dataset.id); return true;
    } return false;
    case 'group-members': if (!(globalThis.__STORE__ || LIVE)) {
      {
      const g = [...app.state.groups.created, ...app.groups].find((x) => x.id === el.dataset.id);
      const fromProfile = el.classList.contains('sheet-back') ? document.querySelector('#picker .member-profile')?.dataset.index : null;
      if (g) openAccountSheet(membersSheet(g, ctx()), fromProfile != null ? `[data-action="member-profile"][data-index="${fromProfile}"]` : '.sheet-close', fromProfile != null ? -1 : 0);
      return true;
    }
    } return false;
    case 'member-profile': if (!(globalThis.__STORE__ || LIVE)) {
      {
      const g = [...app.state.groups.created, ...app.groups].find((x) => x.id === el.dataset.group);
      if (g) {
        openAccountSheet(memberProfileSheet(g, Number(el.dataset.index), ctx()), '#picker-title', 1);
        document.querySelector('#picker .member-profile')?.setAttribute('data-index', el.dataset.index);
      }
      return true;
    }
    } return false;
    case 'hop-add': if (!(globalThis.__STORE__ || LIVE)) {
      {
      const d = app.groupDraft ?? (app.groupDraft = newGroupDraft());
      if (d.stops.length >= MAX_STOPS - 1) return true;
      const st = nextHopStop(d);
      if (!st) return true;
      d.stops.push(st);
      // QA plan 8.1: the new row rises in while the rest of the form glides down; its bar select takes focus at once.
      hopList([], () => document.getElementById(`hop-bar-${d.stops.length - 1}`)?.focus());
      announce(`Stop ${d.stops.length + 1} added`);
      return true;
    }
    } return false;
    case 'hop-remove': if (!(globalThis.__STORE__ || LIVE)) {
      {
      const d = app.groupDraft ?? (app.groupDraft = newGroupDraft());
      const i = Number(el.dataset.index);
      const row = el.closest('.hop-edit-row');
      d.stops.splice(i, 1);
      if (!d.stops.length) d.hop = false;
      app.groupErrors = {};
      const next = () => (d.hop ? document.querySelector('#group-form [data-action="hop-add"]') : null) || document.getElementById('g-hop');
      next()?.focus({ preventScroll: true });
      hopList(row ? [row] : [], () => next()?.focus({ preventScroll: true }));
      announce('Stop removed');
      return true;
    }
    } return false;
    case 'group-spots': if (!(globalThis.__STORE__ || LIVE)) {
      {
      const d = app.groupDraft ?? (app.groupDraft = newGroupDraft());
      d.spots = Math.max(2, Math.min(12, d.spots + Number(el.dataset.delta)));
      patchPage();
      announce(`Group size ${d.spots}`);
      return true;
    }
    } return false;
    case 'post-group': if (!(globalThis.__STORE__ || LIVE)) {
      return false; // the form's submit handles it
    } return false;
    case 'scan-pick':
      Object.assign(app.scan, { venueId: el.dataset.id, bucket: null, error: null });
      scanStep(1);
      document.querySelector('input[name="bucket"]')?.focus();
      return true;
    case 'scan-change':
      Object.assign(app.scan, { venueId: null, bucket: null, error: null });
      scanStep(-1);
      document.getElementById('scan-q')?.focus();
      return true;
    case 'scan-camera': case 'scan-retake': if (!globalThis.__STORE__) { openCamera(); return true; } return false; // the store build has no camera
    case 'scan-manual':
      Object.assign(app.scan, { manual: true, camera: null, error: null });
      scanStep(1);
      // The bar picker, or (Report the line from a bar page) straight to the line size.
      (document.getElementById('scan-q') ?? document.querySelector('#main input[name="bucket"]'))?.focus();
      return true;
    case 'scan-submit': submitReport(); return true;
    case 'scan-see': {
      // Back to the bar page that opened Scan, or on to the bar in place of the finished report (never a loop back to it).
      const id = app.scan.venueId;
      resetScan();
      if (app.scanReturn && app.scanOpener?.name === 'venue' && app.scanOpener.params.id === id) history.back();
      else go(el.getAttribute('href'), { replace: true });
      return true;
    }
    case 'scan-close':
      resetScan(); // closing discards the report and its photo
      if (app.scanReturn) history.back();
      else go('#/', { replace: true });
      return true;
    case 'scan-in': gotIn(); return true;
    case 'scan-left': leftLine(); return true;
    case 'scan-restart':
      resetScan();
      scanStep(-1);
      (document.querySelector('#main [data-action="scan-camera"]') ?? document.getElementById('scan-q'))?.focus();
      return true;
    case 'redeem': if (!(globalThis.__STORE__ || LIVE)) {
      redeem(el.dataset.id); return true;
    } return false;
    case 'edit-profile': if (!globalThis.__STORE__) {
      app.profileEdit = { editing: !app.profileEdit.editing, errors: {} };
      rerenderPage();
      (app.profileEdit.editing ? document.getElementById('p-name') : document.querySelector('[data-action="edit-profile"]'))?.focus();
      return true;
    } return false;
    case 'open-settings': if (!globalThis.__STORE__) {
      openAccountSheet(settingsSheet(), '[data-action="use-location"]'); return true;
    } return false;
    case 'open-help': if (!globalThis.__STORE__) {
      openAccountSheet(helpSheet(), 'summary'); return true;
    } return false;
    case 'help-about': if (!globalThis.__STORE__) {
      closePicker(() => go('#/about')); return true;
    } return false;
    case 'manage-sub': if (!(globalThis.__STORE__ || LIVE)) {
      openAccountSheet(manageSubSheet(ctx()), 'input:checked'); return true;
    } return false;
    case 'vip-add': if (!(globalThis.__STORE__ || LIVE)) {
      addVipCard(); return true;
    } return false;
    case 'vip-remove': if (!(globalThis.__STORE__ || LIVE)) {
      removeVipCard(el.dataset.id); return true;
    } return false;
    // Live team build: Business view on the server, and Points.
    case 'venue-signout': if (!globalThis.__STORE__ && LIVE) { venueSignOut(); return true; } return false;
    case 'venue-signout-confirm': if (!globalThis.__STORE__ && LIVE) { venueSignOut({ confirmed: true }); return true; } return false;
    case 'venue-signout-cancel': if (!globalThis.__STORE__ && LIVE) { app.venue.confirmOut = false; rerenderConsole(); document.querySelector('#main [data-action="venue-signout"]')?.focus(); return true; } return false;
    case 'venue-retry': if (!globalThis.__STORE__ && LIVE) { Object.assign(app.venue, { phase: 'loading', confirmOut: false }); rerenderPage(); loadVenueStaff(); return true; } return false;
    case 'count-step': if (!globalThis.__STORE__ && LIVE) {
      // From what the field shows: a typed number (over 400 counts as 400), else the count.
      countSet(countBase(app.venue.count) + Number(el.dataset.delta));
      return true;
    } return false;
    case 'count-photo': if (!globalThis.__STORE__ && LIVE) { const input = countPhotoInput(); input.value = ''; input.click(); return true; } return false; // inside the tap
    case 'count-photo-remove': if (!globalThis.__STORE__ && LIVE) { dropCountPhoto(); patchPage(); document.querySelector('#main [data-action="count-photo"]')?.focus(); announce('Photo removed.'); return true; } return false;
    case 'count-mark': if (!globalThis.__STORE__ && LIVE) { markHead(el, e); return true; } return false;
    case 'count-send': if (!globalThis.__STORE__ && LIVE) { publishCount(); return true; } return false;
    case 'deal-withdraw': if (!globalThis.__STORE__ && LIVE) { withdrawDeal(el.dataset.id); return true; } return false;
    case 'deal-withdraw-confirm': if (!globalThis.__STORE__ && LIVE) { withdrawDeal(el.dataset.id, { confirmed: true }); return true; } return false;
    case 'deal-withdraw-cancel': if (!globalThis.__STORE__ && LIVE) { const id = app.venue.withdrawAsk; app.venue.withdrawAsk = null; rerenderConsole(); document.querySelector(`#main [data-action="deal-withdraw"][data-id="${CSS.escape(id ?? '')}"]`)?.focus(); return true; } return false;
    case 'reward-issue': if (!globalThis.__STORE__ && LIVE) { issueReward(el.dataset.id); return true; } return false;
    case 'reward-reveal': if (!globalThis.__STORE__ && LIVE) { revealReward(el.dataset.id); return true; } return false;
    case 'noop': return true;
    default: return false;
  }
}

let searchTimer = null;
function onInput(e) {
  const t = e.target;
  switch (t.dataset.input) {
    case 'search':
      clearTimeout(searchTimer);
      app.explore.q = t.value;
      searchTimer = setTimeout(() => { updateExploreUrl(); renderResultsOnly(); }, 120);
      document.querySelector('[data-action="clear-search"].clear')?.toggleAttribute('hidden', !t.value);
      break;
    case 'deal-field': if (!globalThis.__STORE__) {
      if (t.tagName === 'INPUT') dealDraft()[t.dataset.key] = t.value; break;
    } break;
    case 'redeem-code': if (!globalThis.__STORE__) {
      if (LIVE) { codeEdited(t); break; }
      app.console.codeDraft = t.value;
      if (app.console.codeResult && normalizeCode(t.value) !== app.console.codeResult.code) {
        app.console.codeResult = null;
        document.querySelector('#main #redeem-result')?.remove();
        t.removeAttribute('aria-invalid');
        t.setAttribute('aria-describedby', 'redeem-help');
      }
      break;
    } break;
    case 'idea-field': if (!(globalThis.__STORE__ || LIVE)) {
      if (t.tagName !== 'SELECT' && app.ideaDraft) app.ideaDraft[t.dataset.key] = t.value;
      break;
    } break;
    case 'hop-field': if (!(globalThis.__STORE__ || LIVE)) {
      {
      const d = app.groupDraft ?? (app.groupDraft = newGroupDraft());
      const st = d.stops[Number(t.dataset.index)];
      if (st) st[t.dataset.key] = t.value;
      break;
    }
    } break;
    case 'group-field': if (!(globalThis.__STORE__ || LIVE)) {
      {
      const d = app.groupDraft ?? (app.groupDraft = newGroupDraft());
      d[t.dataset.key] = t.value;
      break;
    }
    } break;
    case 'count-people': if (!globalThis.__STORE__ && LIVE) {
      const c = app.venue.count;
      const n = typedCount(t.value);
      c.raw = t.value;
      if (n != null) c.people = n; // a number Publish can't take leaves the count as it was, and Publish names none
      document.querySelector('#main [data-action="count-send"]')?.lastChild?.replaceWith(n == null ? 'Publish' : `Publish ${n}`);
      if (c.error) { c.error = null; document.getElementById('count-error')?.remove(); t.removeAttribute('aria-invalid'); t.removeAttribute('aria-describedby'); }
      break;
    } break;
    case 'scan-q': {
      app.scan.q = t.value;
      const list = document.getElementById('scan-list');
      if (list) list.innerHTML = pickListItems(ctx(), t.value);
      break;
    }
    default: break;
  }
}

const onChange = (e) => withGesture(e, () => handleChange(e));
function handleChange(e) {
  const t = e.target;
  switch (t.dataset.input) {
    case 'event-filter':
      app.ui[{ genre: 'eventsGenre', theme: 'eventsTheme', price: 'eventsPrice' }[t.dataset.key]] = t.value;
      t.closest('.select')?.classList.toggle('is-set', !!t.value);
      renderEventResults();
      break;
    case 'pass-window': if (!(globalThis.__STORE__ || LIVE)) {
      app.passFlow.windowId = t.value; app.passFlow.errors = {}; renderSheet(); break;
    } break;
    case 'pass-ack': if (!(globalThis.__STORE__ || LIVE)) {
      app.passFlow.ack = t.checked; if (t.checked && app.passFlow.errors.ack) { delete app.passFlow.errors.ack; renderSheet(); } break;
    } break;
    case 'console-venue': if (!globalThis.__STORE__) {
      if (LIVE) { venueSwitch(t.value); break; }
      app.console.venueId = t.value;
      // A count in progress isn't thrown away by a venue switch: it waits at its venue until you come back.
      if (app.console.photo?.touched) app.console.heldPhotos[app.console.photo.venueId] = app.console.photo;
      app.console.photo = app.console.heldPhotos[t.value] ?? null;
      delete app.console.heldPhotos[t.value];
      app.console.ideasFirst = null;
      if (bizOn()) {
        app.state.business.venueId = t.value;
        Object.assign(app.console, { codeDraft: '', codeResult: null });
        persist();
      }
      history.replaceState({ idx: histIdx() }, '', buildHash('console', {}, { venue: t.value, ...(bizOn() ? { s: app.console.section } : {}) }));
      app.renderedHash = location.hash;
      rerenderConsole();
      break;
    } break;
    case 'door-status': if (!(globalThis.__STORE__ || LIVE)) {
      setDoor(t, 'status'); break;
    } break;
    case 'door-pace': if (!(globalThis.__STORE__ || LIVE)) {
      setDoor(t, 'pace'); break;
    } break;
    case 'deal-kind': if (!globalThis.__STORE__) {
      dealDraft().kind = t.value; app.console.dealErrors = {}; rerenderConsole(); break;
    } break;
    case 'deal-cost': if (!globalThis.__STORE__) {
      dealDraft().costOk = t.checked; break;
    } break;
    case 'deal-field': if (!globalThis.__STORE__) {
      if (t.tagName === 'SELECT') {
        const d = dealDraft();
        if (t.dataset.key === 'item') d.item = t.value;
        else d[t.dataset.key] = t.value.split(':').map(Number);
      }
      break;
    } break;
    case 'console-pause': if (!(globalThis.__STORE__ || LIVE)) {
      {
      const v = consoleVenue();
      setPassOverride(v, { paused: t.checked });
      audit(v, t.checked ? 'Paused priority passes' : 'Resumed priority passes');
      persist(); rebuild(); rerenderConsole();
      toast(t.checked ? `Priority passes paused for ${v.name}.` : `Priority passes resumed for ${v.name}.`);
      break;
    }
    } break;
    case 'group-field': if (!(globalThis.__STORE__ || LIVE)) {
      {
      const d = app.groupDraft ?? (app.groupDraft = newGroupDraft());
      d[t.dataset.key] = t.value;
      break;
    }
    } break;
    case 'idea-field': if (!(globalThis.__STORE__ || LIVE)) {
      {
      if (t.tagName !== 'SELECT') break;
      const d = app.ideaDraft ?? (app.ideaDraft = newIdeaDraft());
      const k = t.dataset.key;
      if (k === 'venueId') {
        d.venueId = t.value;
        if (!d.dayPicked) d.day = defaultNight(app.state.clock.base, t.value, [...app.events, ...app.ideas]);
        rerenderPage();
      } else if (k === 'start' || k === 'end') d[k] = t.value.split(':').map(Number);
      else d[k] = t.value;
      break;
    }
    } break;
    case 'idea-night': if (!(globalThis.__STORE__ || LIVE)) {
      { const d = app.ideaDraft ?? (app.ideaDraft = newIdeaDraft()); d.day = Number(t.value); d.dayPicked = true; break; }
    } break;
    case 'idea-theme': if (!(globalThis.__STORE__ || LIVE)) {
      { const d = app.ideaDraft ?? (app.ideaDraft = newIdeaDraft()); d.theme = t.value; break; }
    } break;
    case 'idea-ack': if (!(globalThis.__STORE__ || LIVE)) {
      { const d = app.ideaDraft ?? (app.ideaDraft = newIdeaDraft()); d.ack = t.checked; break; }
    } break;
    case 'idea-cover': if (!(globalThis.__STORE__ || LIVE)) {
      app.console.ideaCover[t.dataset.id] = Number(t.value); break;
    } break;
    case 'area': chooseArea(t.value, t.closest('.option-row')); break;
    case 'remind-day': pickReminder({ day: t.value }, t.name); break;
    case 'remind-hour': pickReminder({ hour: Number(t.value) }, t.name); break;
    case 'group-hop': if (!(globalThis.__STORE__ || LIVE)) {
      {
      const d = app.groupDraft ?? (app.groupDraft = newGroupDraft());
      d.hop = t.checked;
      if (d.hop && !d.stops.length) { const st = nextHopStop(d); if (st) d.stops.push(st); else d.hop = false; }
      app.groupErrors = {};
      patchPage(); // the switch keeps its node (its knob glides) and the stops open in place below it (QA plan 8.2)
      document.getElementById('g-hop')?.focus();
      announce(d.hop ? 'Bar hop on. Stop 2 added below.' : 'Bar hop off');
      break;
    }
    } break;
    case 'hop-field': if (!(globalThis.__STORE__ || LIVE)) {
      {
      const d = app.groupDraft ?? (app.groupDraft = newGroupDraft());
      const st = d.stops[Number(t.dataset.index)];
      if (st) st[t.dataset.key] = t.value;
      break;
    }
    } break;
    case 'count-door': if (!globalThis.__STORE__ && LIVE) { app.venue.count.door = t.value; if (['paused', 'closed'].includes(t.value)) app.venue.count.pace = null; patchPage(); break; } break;
    case 'count-pace': if (!globalThis.__STORE__ && LIVE) { app.venue.count.pace = Number(t.value); break; } break;
    case 'scan-bucket': app.scan.bucket = t.value; app.scan.error = null; patchScanEstimate(); break;
    case 'scan-door': app.scan.door = t.value; patchScanEstimate(); break;
    case 'scan-inline': app.scan.inLine = t.checked; break;
    case 'business': if (!(globalThis.__STORE__ || LIVE)) {
      setBusiness(t.checked, t); break;
    } break;
    case 'sub-plan': if (!(globalThis.__STORE__ || LIVE)) {
      chooseSubscription(t.value); break;
    } break;
    case 'sim': if (!(globalThis.__STORE__ || LIVE)) {
      // the switch itself says it (no toast restating it, QA plan 9.6)
      app.state.sim[t.dataset.key] = t.checked;
      persist();
      break;
    } break;
    default: break;
  }
}

const onSubmit = (e) => withGesture(e, () => handleSubmit(e));
function handleSubmit(e) {
  e.preventDefault();
  if (!globalThis.__STORE__) { // these forms exist only in the team build
    if (e.target.id === 'pass-form') submitPass();
    if (e.target.id === 'deal-form') postDeal();
    if (e.target.id === 'group-form') postGroup();
    if (e.target.id === 'idea-form') postIdea();
    if (e.target.id === 'profile-form') saveProfile(e.target);
    if (e.target.id === 'redeem-form') { if (LIVE) checkCodeLive(e.target.querySelector('#redeem-code')?.value); else checkRedeemCode(e.target.querySelector('#redeem-code')?.value); }
    if (LIVE && e.target.id === 'venue-signin') venueSignIn(e.target);
    if (LIVE && e.target.id === 'venue-totp') venueTotp(e.target);
  }
}

/* sheet: Escape, backdrop click, drag-to-dismiss (with button alternatives) */
/** A click on the scrim, not a press that started on the sheet and was released elsewhere (that click lands on the dialog too). */
const isBackdropClick = (e, dlg) => {
  if (e.target !== dlg) return false;
  const r = dlg.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
};
/** Progressive resistance past the edge (Apple-style rubber band). */
const rubber = (o, d = 600, k = 0.55) => -((Math.abs(o) * d * k) / (d + k * Math.abs(o)));

/**
 * Drag to dismiss, the same on every sheet (QA plan 1.12, 7.1): the grabber or the head is the handle (other controls in
 * the head keep their taps); nothing starts while the sheet is still sliding in (--d-sheet-lock); pointer capture waits
 * for a 4px move, so a tap is still a tap; a quick flick (whole-drag average over 0.4 px/ms) or a pull past
 * max(120px, 25%) that isn't flicking back closes it. Otherwise it snaps back. The close buttons stay the single-pointer
 * alternative (WCAG 2.5.7).
 */
function wireDrag(dlg, { onDismiss, canDismiss = () => true }) {
  let drag = null;
  let snap = null;
  let suppressClickUntil = 0;
  dlg.addEventListener('click', (ev) => { if (performance.now() < suppressClickUntil) { ev.stopPropagation(); ev.preventDefault(); } }, true);
  // Capture waits for a 4px move, so a release over a node the sheet replaced (or after it closed) can be missed. A new
  // primary press means the last one ended: drop a stale drag instead of ignoring every later one.
  const dropStale = () => { if (!drag) return; drag = null; if (!snap) { dlg.classList.remove('is-dragging'); dlg.style.transform = ''; } };
  dlg.addEventListener('close', dropStale);
  dlg.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) return;
    dropStale();
    if (!e.target.closest('.sheet-grabber, .sheet-head') || e.target.closest('a, input, button:not(.sheet-grabber)')) return;
    if (dlg.classList.contains('is-closing') || performance.now() - (dlg._openedAt ?? 0) < T.sheetLock) return; // still sliding
    // Grab mid-flight: read where the sheet is right now (e.g. a snap-back spring), then hold it there.
    const base = new DOMMatrix(getComputedStyle(dlg).transform).m42 || 0;
    if (snap) { snap.cancel(); snap = null; }
    dlg.classList.add('is-dragging');
    dlg.style.transform = `translateY(${base}px)`;
    const t = performance.now();
    drag = { id: e.pointerId, y0: e.clientY, t0: t, base, dy: base, moved: false, captured: false, samples: [{ y: e.clientY, t }] };
  });
  dlg.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const raw = drag.base + (e.clientY - drag.y0);
    drag.dy = raw < 0 ? rubber(raw) : raw; // upward pulls rubber-band instead of hitting a wall
    if (Math.abs(e.clientY - drag.y0) > 4) {
      drag.moved = true;
      if (!drag.captured) { drag.captured = true; try { dlg.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ } }
    }
    const t = performance.now();
    drag.samples.push({ y: e.clientY, t });
    while (drag.samples.length > 2 && t - drag.samples[0].t > 50) drag.samples.shift(); // the last ~50ms
    dlg.style.transform = `translateY(${drag.dy}px)`;
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { dy, base, moved, t0, samples } = drag;
    drag = null;
    if (!moved) { dlg.style.transform = ''; dlg.classList.remove('is-dragging'); return; }
    if (e.type === 'pointerup') suppressClickUntil = performance.now() + 350;
    // Release velocity over the last 50ms (0 if the finger stopped), and the whole drag's average (Vaul's rule).
    const now = performance.now();
    const tail = [...samples.filter((x) => now - x.t <= 50), { y: e.clientY, t: now }];
    const vTail = tail.length > 1 && now - tail[0].t > 0 ? (e.clientY - tail[0].y) / (now - tail[0].t) : 0;
    const avg = (dy - base) / Math.max(1, now - t0);
    const H = dlg.offsetHeight;
    // A quick flick down, or pulled far and not flicking back up. A slow short pull snaps back.
    const dismiss = e.type === 'pointerup' && canDismiss() && (avg > 0.4 || (dy > Math.max(120, 0.25 * H) && vTail > -0.05));
    if (dismiss) { onDismiss(); return; } // the exit transition starts from the current drag offset
    // iOS runs linear() springs on the main thread: it gets the composited cubic instead.
    const easing = CSS.supports('-webkit-touch-callout', 'none') ? T.easeSheet : T.springDrawer;
    snap = dlg.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: reducedMotion() ? 0 : T.springDrawerMs, easing });
    dlg.style.transform = '';
    snap.finished.then(() => { snap = null; dlg.classList.remove('is-dragging'); }).catch(() => {});
  };
  dlg.addEventListener('pointerup', end);
  dlg.addEventListener('pointercancel', end);
}
function wireSheet() {
  const dlg = document.getElementById('sheet');
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); requestCloseSheet(); });
  // Chromium may force-close a modal on a repeated Escape. Never let that hide an in-flight pass request.
  dlg.addEventListener('close', () => {
    if (sheetClosing || app.route?.name !== 'pass' || app.passFlow?.step !== 'pending') return;
    dlg.showModal();
    dlg.querySelector('.sheet-foot button')?.focus();
  });
  dlg.addEventListener('click', (e) => { if (isBackdropClick(e, dlg)) requestCloseSheet(); });
  wireDrag(dlg, { onDismiss: requestCloseSheet, canDismiss: () => app.passFlow?.step !== 'pending' });
}

/* ---------------- boot ---------------- */
function boot() {
  readTokens();
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', readTokens);
  init();
  history.scrollRestoration = 'manual';
  if (history.state?.idx == null) history.replaceState({ idx: 0 }, '', location.hash || '#/');
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  // Escape in the Bars search closes it (and clears the query), like Cancel.
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && e.target.id === 'q') { e.preventDefault(); withGesture(e, () => handleAction('close-search', e.target)); } });
  document.addEventListener('change', onChange);
  document.addEventListener('submit', onSubmit);
  if (!globalThis.__STORE__) {
    window.addEventListener('pagehide', () => { dropUploads(); if (LIVE) dropCountPhoto(); }); // preview and count photos never outlive the page
    window.addEventListener('pageshow', (e) => { if (e.persisted && app.route?.name === 'console') rerenderConsole(); }); // restored from the back/forward cache: redraw without them
  }
  // A toast shown before the page was scrolled can end up over the map card or the line-photo button: re-place it once
  // the scroll settles (one layout read per gesture, no scroll-driven motion). Engines without scrollend keep the place
  // it got when it appeared.
  window.addEventListener('scrollend', reliftToasts, { passive: true });
  // A bar photo or logo that fails to load (moved, blocked, offline) falls back to the drawn night art or the initials
  // badge instead of an empty box. Capture phase: image errors don't bubble. (Inline onerror is blocked by the CSP.)
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || img.dataset.fallback) return;
    const id = img.closest('[data-thumb], [data-hero], [data-venue-row]')?.dataset;
    const v = app.venues.find((x) => x.id === (id?.thumb ?? id?.hero ?? id?.venueRow ?? (app.route?.name === 'venue' ? app.route.params.id : null)));
    if (!v) return;
    const tpl = document.createElement('template');
    if (img.classList.contains('real-photo')) tpl.innerHTML = venuePhoto({ ...v, photo: null }, { title: img.alt !== '' });
    else if (img.closest('.bar-logo, .logo, .mc-logo, .hero-logo')) tpl.innerHTML = venueLogo({ ...v, logo: null });
    else return;
    const next = tpl.content.firstElementChild;
    if (next) { next.dataset.fallback = '1'; img.replaceWith(next); }
  }, true);
  // Keyboard users get instant thumbs and highlights (.kbd); a pointer press clears it.
  document.addEventListener('keydown', (e) => { if (/^(Tab|Enter| |Arrow)/.test(e.key)) document.documentElement.classList.add('kbd'); });
  document.addEventListener('pointerdown', () => document.documentElement.classList.remove('kbd'), { passive: true });
  // Without a touch listener, iOS Safari may never apply :active (press feedback).
  document.addEventListener('touchstart', () => {}, { passive: true });
  // A press, a wheel or a key during a navigation's motion ends it at once, so whatever is pressed or scrolled is where
  // it will stay (QA plan 5.3, rubric I6). The moving layers never take taps (pointer-events: none), so the tap itself
  // always lands. Except the bar page's Back while its photo is still flying in: that Back turns the photo around from
  // where it is (route), so the flight must still be there when the Back arrives.
  const endOnInput = (e) => {
    if (!activeNav) return;
    if (e.type === 'pointerdown' && activeNav.flight && e.target instanceof Element && e.target.closest('.detail-hero [data-action="back"]')) return;
    endNavMotion();
  };
  // pointercancel: a press on that Back which turns into a scroll will never be its click, so it ends the motion too.
  ['pointerdown', 'pointercancel', 'wheel', 'keydown'].forEach((type) => document.addEventListener(type, endOnInput, { capture: true, passive: true }));
  window.addEventListener('popstate', () => { rememberScroll(); route({ viaPop: true }); });
  window.addEventListener('hashchange', () => {
    const h = location.hash;
    if (h && h !== '#' && !h.startsWith('#/')) return; // e.g. #main from the skip link
    if ((h || '#/') !== app.renderedHash) { rememberScroll(); route({ viaPop: true }); }
  });
  window.addEventListener('online', () => { if (app.route.name === 'tonight' || app.route.name === 'venue') simulateFetch(); if (!globalThis.__STORE__ && LIVE) flushCounts(); });
  window.addEventListener('offline', () => renderResultsOnly());
  wireSheet();
  const picker = document.getElementById('picker');
  picker.addEventListener('cancel', (e) => { e.preventDefault(); closePickerToOpener(); });
  picker.addEventListener('click', (e) => { if (isBackdropClick(e, picker)) closePickerToOpener(); });
  wireDrag(picker, { onDismiss: closePickerToOpener });
  // The 21+ gate is wired before the first route, so nothing a screen does can leave the app open past it.
  const splash = runSplash();
  if (!app.state.ageConfirmed) {
    const gate = document.getElementById('age-gate');
    gate.addEventListener('cancel', (e) => e.preventDefault());
    // Chromium may close a modal opened without user activation on Escape; reopen until confirmed.
    gate.addEventListener('close', () => { if (!app.state.ageConfirmed) gate.showModal(); });
    splash.then(() => { if (!app.state.ageConfirmed && !gate.open) gate.showModal(); });
  }
  try { route(); } catch (err) { document.getElementById('main').innerHTML = errorHtml(err); }
  if (isNative()) {
    document.documentElement.classList.add('is-native'); // app-only CSS: no text selection or link callouts on chrome
    styleStatusBar();
    hideKeyboardBar();
    requestAnimationFrame(() => hideSplash()); // the native launch screen hands off to our first painted frame
    onResume(() => { tick(); if (globalThis.__STORE__ || LIVE) { liveRefresh({ quiet: true }); syncReminders(); if (app.state.prefs.useLocation) useMyLocation({ quiet: true }); } if (!globalThis.__STORE__ && LIVE) flushCounts(); });
    if (globalThis.__STORE__ || LIVE) {
      syncReminders();
      // Tapping a reminder opens that bar's page.
      onReminderTap(({ venueId }) => { if (typeof venueId === 'string' && app.venues.some((v) => v.id === venueId)) go(buildHash('venue', { id: venueId })); });
    }
    if ((globalThis.__STORE__ || LIVE) && app.state.prefs.useLocation) useMyLocation({ quiet: true });
    // Web pages (privacy, terms, support) open in an in-app Safari view instead of leaving the app.
    document.addEventListener('click', (e) => {
      const a = e.target.closest?.('a[target="_blank"][href^="http"]');
      if (!a) return;
      e.preventDefault();
      // Maps links hand off to the Maps app (iOS opens maps.apple.com / Google Maps links in their apps); other pages
      // open in an in-app Safari view.
      if (/^https:\/\/(maps\.apple\.com|www\.google\.com\/maps)\//.test(a.href)) window.location.href = a.href;
      else openExternal(a.href);
    }, true);
  }
  dailyLogin();
  setInterval(() => { if (!document.hidden) tick(); }, 15_000); // a hidden page catches up on visibilitychange below
  // Live data: refresh every 45 s while the app is in front, and at once when it comes back.
  if (globalThis.__STORE__ || LIVE) {
    setInterval(() => { if (!document.hidden) liveRefresh({ quiet: true }); }, POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) liveRefresh({ quiet: true }); });
    // JavaScript errors would never reach Xcode's crash reports: send them (no user ID) so we can fix them.
    window.addEventListener('error', (e) => api.logClientError({ message: e.message, stack: e.error?.stack, version: APP_VERSION }));
    window.addEventListener('unhandledrejection', (e) => api.logClientError({ message: String(e.reason?.message ?? e.reason), stack: e.reason?.stack, version: APP_VERSION }));
  }
  document.addEventListener('visibilitychange', () => {
    document.documentElement.toggleAttribute('data-hidden', document.hidden);
    // A toast's clock stops while nobody can read it, and starts over when the page is back (each toast its own).
    const live = [...document.querySelectorAll('#toasts .toast:not(.is-leaving)')];
    if (document.hidden) { live.forEach((t) => clearTimeout(t._timer)); return; }
    live.forEach((t) => { if (!t.matches(':hover, :focus-within')) armToast(t, t._timeout); });
    tick();
  });
  // Which input the person last used: touch hides keyboard focus rings (styles/app.css), any key brings them back.
  document.addEventListener('pointerdown', (e) => { document.documentElement.dataset.modality = e.pointerType === 'touch' || e.pointerType === 'pen' ? 'touch' : 'pointer'; }, { capture: true, passive: true });
  document.addEventListener('keydown', (e) => { const k = typeof e.key === 'string' ? e.key : ''; if (!k) return; if (k === 'Tab' || k.startsWith('Arrow') || (!e.metaKey && !e.ctrlKey && !e.altKey)) document.documentElement.dataset.modality = 'keyboard'; }, { capture: true });
  document.documentElement.dataset.ready = 'true';
  if (!(globalThis.__STORE__ || LIVE) && new URLSearchParams(location.search).has('qa')) {
    // QA-only hook (used by app/QA.md checks): age estimates while a page stays open.
    window.__doorlineQA = {
      advance: (min) => { app.state.clock = advance(app.state.clock, min); persist(); rebuild(); tick(); },
      queue: (id) => structuredClone(app.venues.find((v) => v.id === id)?.queue ?? null),
      motion: { motionOK, swapText, rollText, flip, shake }, // shared helpers that later motion batches call
    };
  }
}

/* ---------------- splash: a nib writes the mark (about 2.1 s, tap to skip, a short fade under reduced motion) ---------------- */
function runSplash() {
  const el = document.getElementById('splash');
  const shell = document.querySelector('.app');
  if (!el) return Promise.resolve();
  const prevFocus = document.activeElement;
  const remove = () => {
    el.remove();
    shell?.removeAttribute('inert');
    // inert dropped the focus route() set; put it back (the age gate takes focus itself on a first visit).
    if (app.state.ageConfirmed && (!document.activeElement || document.activeElement === document.body)) {
      (prevFocus?.isConnected && prevFocus !== document.body ? prevFocus : document.querySelector('#main .is-target') || pageHeading())?.focus({ preventScroll: true });
    }
  };
  if (new URLSearchParams(location.search).has('qa')) { remove(); return Promise.resolve(); } // QA runs skip it
  if (globalThis.__STORE__ && app.state.splashSeen) { remove(); return Promise.resolve(); } // first launch only
  // A link to a bar, an event or a page opens that page at once: the splash is for opening the app, not following a link.
  if (location.hash && !['#', '#/'].includes(location.hash)) { remove(); return Promise.resolve(); }
  // Team web build: once per browser session, so a reload doesn't replay it (the App Store build shows it once ever).
  const SESSION_SPLASH = 'doorline:splash-shown';
  if (!globalThis.__STORE__) { try { if (sessionStorage.getItem(SESSION_SPLASH)) { remove(); return Promise.resolve(); } sessionStorage.setItem(SESSION_SPLASH, '1'); } catch { /* storage blocked: play it */ } }
  shell?.setAttribute('inert', '');
  return new Promise((resolve) => {
    let finished = false;
    const onKey = () => finish();
    const finish = () => {
      if (finished) return;
      finished = true;
      document.removeEventListener('keydown', onKey, true);
      if (globalThis.__STORE__ && !app.state.splashSeen) { app.state.splashSeen = true; persist(); }
      el.classList.add('is-out');
      setTimeout(() => { remove(); resolve(); }, reducedMotion() ? 160 : 240);
    };
    el.addEventListener('pointerdown', finish, { once: true });
    document.addEventListener('keydown', onKey, true); // any key skips it too (it was pointer-only)
    // If the CSS safety net hid the splash first (slow boot), clean up at once so the app is never stuck inert.
    el.addEventListener('animationend', (e) => { if (e.target === el && e.animationName === 'splash-safety') finish(); });
    // No font to wait for: the mark is vector art. Start on the next frame so the first painted frame is black.
    requestAnimationFrame(() => {
      el.classList.add('is-playing');
      setTimeout(finish, reducedMotion() ? 600 : 2300); // reduced motion: the mark fades in (.45 s), then the app
    });
  });
}

// Inside the iOS app, restore saved state from native storage first if iOS cleared the web view's copy.
if (isNative()) restoreStorage(webStorage).finally(boot); else boot();
