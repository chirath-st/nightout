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
import { estimateCompact, estimateBlock, estimateRing, estimateFor, pointsChip, esc, mapCard, cardStatus, cardFresh, srSummary, dealTag, venueStatus, factStrip } from './ui/components.js';
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
import { DRAW_MAX } from './ui/lineart.js';
import { checkDeal } from './lib/deals.js';

const FILTER_IDS = FILTERS.map((f) => f.id);
const EXPLORE_KEYS = ['q', 'f', 'sort', 'view', 'area'];
const SORT_IDS = SORTS.map((s) => s.id);
const storage = (() => { try { return window.localStorage; } catch { return null; } })();
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
function freshConsole() { return { venueId: null, dealDraft: null, dealErrors: {}, ideaCover: {}, role: 'ambassador', photo: null, snaps: 0, busyUntil: 0, filling: false }; }
const freshScan = () => ({ step: 'pick', venueId: null, captured: false, bucket: null, door: 'moving', inLine: true, q: '', error: null });
app.scan = freshScan();
app.checkin = { step: 'pick', venueId: null };

/* ---------------- state ---------------- */
function init() {
  const realNow = Date.now();
  app.state = load(storage, realNow);
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
  if (!nightIsOver(app.state.clock, Date.now())) return false;
  app.state.clock = normalizeClock(null, Date.now());
  clearNightState();
  persist();
  rebuild();
  render({ focus: 'none' });
  toast('A new night started at midnight.');
  return true;
}
const now = () => demoNow(app.state.clock, Date.now());
function persist() { save(storage, app.state); updatePointsChip(); }
function rebuild() {
  // Report ages count back from the last simulated refresh; before the first one, from the demo's start (midnight).
  const base = buildDataset(app.state.dataset, app.state.clock.base, app.state.syncAt ?? app.state.clock.base + START_OFFSET_MIN * 60_000);
  const n = now();
  // This device's photo counts, guest reports and door state merge into each bar's queue (src/lib/merge.js).
  app.venues = resolveVenues(base, app.state.overrides, app.state.passes, app.state.deals).map((v) => withObservations(v, app.state, n, { since: app.state.clock.base, night: app.state.clock.realStart }));
  app.groups = buildGroups(app.state.clock.base);
  app.events = buildEvents(app.state.clock.base);
  app.ideas = resolveIdeas(buildIdeas(app.state.clock.base, app.events), app.state.ideas.created, app.state.ideas.decisions, new Set(app.venues.map((v) => v.id)), app.state.clock.base);
}
const isOffline = () => app.state.sim.offline || navigator.onLine === false;
const savedSet = () => new Set(app.state.saved);

function ctx(extra = {}) {
  return {
    venues: app.venues, now: now(), state: app.state, explore: app.explore, ui: app.ui, savedSet: savedSet(),
    offline: isOffline(), console: app.console, visit: app.visit, groups: app.groups, events: app.events, ideas: app.ideas,
    backHref: app.venueBack?.href ?? app.lastExploreHash, backLabel: app.venueBack?.label ?? 'Bars', passesFrom: app.passesFrom, ...extra,
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
const cssMs = (name, fallback) => {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
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
  if (el && el._action && !actionLabel && !(key != null && el._key === key)) {
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
/** The map preview floats where toasts sit (QA plan 6.3): when a card would be under them, toasts rise above it. */
function liftToasts() {
  const region = document.getElementById('toasts');
  if (!region) return;
  const card = app.route?.name === 'tonight' ? document.querySelector('#main .map-preview:not([hidden])') : null;
  region.style.removeProperty('--toast-lift');
  if (!card) return;
  const floor = region.getBoundingClientRect().bottom; // the toasts' bottom edge without a lift
  const r = card.getBoundingClientRect();
  if (Math.min(r.bottom, floor) - Math.max(r.top, floor - 52) > 4) region.style.setProperty('--toast-lift', `${Math.ceil(floor - r.top + 8)}px`);
}
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
const LIVE_CLASSES = new Set(['is-target', 'is-rolling', 'is-flash', 'no-slide', 'is-pending']);
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
  const attrs = ['data-action', 'data-input', 'data-id', 'data-delta', 'data-window', 'data-filter', 'data-view', 'data-kind', 'data-key', 'data-role', 'data-nav-venue'];
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
const TABS = ['bars', 'events', 'scan', 'points', 'profile'];
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
  const seg = document.querySelector('.sort-seg');
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
  const fresh = [], moved = [];
  document.querySelectorAll(sel).forEach((n) => {
    const k = itemKey(n);
    if (!before.has(k)) { if (typeof k === 'string') fresh.push(n); return; }
    const r0 = first.get(k);
    if (!r0) return;
    const r = n.getBoundingClientRect();
    let dx = r0.left - r.left, dy = r0.top - r.top;
    const outer = moved.findLast((m) => m.n.contains(n));
    if (outer) { dx -= outer.dx; dy -= outer.dy; }
    moved.push({ n, dx: dx + (outer?.dx ?? 0), dy: dy + (outer?.dy ?? 0) });
    if (motionOK() && Math.abs(dx) + Math.abs(dy) > 0.5) n.animate({ translate: [`${dx}px ${dy}px`, '0 0'] }, { duration: T.flip, easing: T.easeInOut, composite: 'add' });
  });
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
const TAB_OF = { tonight: 'bars', venue: 'bars', pass: 'bars', events: 'events', ideaNew: 'events', groups: 'events', groupNew: 'events', scan: 'scan', points: 'points', passes: 'points', passDetail: 'points', profile: 'profile', saved: 'profile', console: 'profile', about: 'profile' };
function renderShell() {
  const r = app.route;
  const tabFor = TAB_OF;
  document.querySelectorAll('[data-tab]').forEach((a) => {
    if (a.dataset.tab === tabFor[r.name]) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  placeTabIndicator(TABS.indexOf(tabFor[r.name]));
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
    case 'passes': return renderPasses(c);
    case 'passDetail': return renderPassDetail(c, r.params.id);
    case 'console': return renderConsole(c);
    case 'about': return renderAbout(c);
    case 'events': return renderEvents(c);
    case 'groups': return renderGroups(c);
    case 'groupNew': return renderGroupNew(c, app.groupDraft ?? newGroupDraft(), app.groupErrors);
    case 'ideaNew': return renderIdeaNew(c, app.ideaDraft ?? newIdeaDraft(), app.ideaErrors);
    case 'scan': return renderScan(c, app.scan);
    case 'points': return renderPoints(c);
    case 'profile': return renderProfile(c, app.profileEdit);
    default:
      return `<div class="page"><div class="state"><div class="state-icon">${icon('help')}</div><h1 id="page-h" tabindex="-1">Page not found</h1><p>That link doesn’t match anything.</p><div class="actions"><a class="btn btn-primary" href="#/">Go to bars</a></div></div></div>`;
  }
}

/** A screen that failed to draw shows a way out instead of a blank page (and the error goes to the console). */
function errorHtml(err) {
  console.error(err);
  return `<div class="page"><div class="state"><div class="state-icon">${icon('help')}</div><h1 id="page-h" tabindex="-1">Something went wrong</h1><p>This screen couldn’t load. Your saved bars and points are safe.</p><div class="actions"><a class="btn btn-primary" href="#/">Go to bars</a><button type="button" class="btn" data-action="reload-app">Reload</button></div></div></div>`;
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
  document.body.dataset.route = ['venue', 'pass'].includes(app.route?.name) ? 'venue' : app.route?.name ?? '';
  watchMasthead();
  watchSortSeg();
  liftToasts();
  const banners = document.getElementById('explore-banners');
  if (banners) banners.dataset.sig = exploreBanners(ctx());
  const h1 = main.querySelector('h1');
  document.title = `${h1 ? `${h1.textContent.trim()} · ` : ''}Night Out`;
  syncSheet();
  if (scroll === 'restore') window.scrollTo(0, app.scroll.get(app.renderedHash) ?? 0);
  else if (scroll === 'top') window.scrollTo(0, 0);
  const dealTarget = app.route?.name === 'venue' && app.route.query.deal ? document.getElementById(`deal-${app.route.query.deal}`) : null;
  if (dealTarget) {
    // Opened from a deal tile: land on that deal's details on the bar page. Never scroll during a view transition
    // (WebKit 285400, 288795): wait for it to finish.
    dealTarget.classList.add('is-target');
    const land = () => requestAnimationFrame(() => dealTarget.isConnected && dealTarget.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' }));
    if (activeVT) activeVT.finished.catch(() => {}).finally(land); else land();
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
      mapBtn.setAttribute('aria-label', onMap ? 'Show list' : 'Show map'); // both glyphs are drawn; aria-pressed picks one (CSS)
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
    if (wasSk && !isSk) {
      if (reducedMotion()) box.animate({ opacity: [0, 1] }, { duration: T.rmIn, easing: 'linear' });
      else if (motionOK()) box.animate({ opacity: [0, 1] }, { duration: T.fade, easing: T.easeOut });
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
let activeVT = null;
/** Lists whose cards morph their photo into the bar page's hero, and back (QA plan 5.2). */
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
/** Elements named for the running view transition; cleared when it ends or the next one starts. */
const vtNamed = new Set();
function vtName(el, name) { if (!el) return null; el.style.viewTransitionName = name; vtNamed.add(el); return el; }
function vtClear() {
  vtNamed.forEach((el) => { el.style.viewTransitionName = ''; });
  vtNamed.clear();
  delete document.documentElement.dataset.nav;
  delete document.documentElement.dataset.vtPair;
}
const HERO_CHROME = [['.hero-scrim', 'hero-scrim'], ['.hero-title', 'hero-title'], ['.back-link.hero-btn', 'hero-back'], ['.save-detail', 'hero-save'], ['.hero-caption', 'hero-cap']];
const nameHeroChrome = (hero) => hero && HERO_CHROME.forEach(([sel, name]) => vtName(hero.querySelector(`:scope > ${sel}`), name));
/** The card photo a list link opens from, as a selector that finds it again on Back (stored on the list's history entry). */
function thumbSelector(link) {
  const holder = link?.querySelector(':is([data-thumb], [data-thumb-ev])');
  if (holder?.dataset.thumbEv) return `[data-thumb-ev="${CSS.escape(holder.dataset.thumbEv)}"]`;
  if (holder?.dataset.thumb) return `[data-thumb="${CSS.escape(holder.dataset.thumb)}"]`;
  return null;
}
/** Run fn once the current navigation has rendered (a view transition renders in its update callback, a frame later). */
const afterNav = (fn) => (activeVT ? activeVT.updateCallbackDone.catch(() => {}).then(fn) : fn());
function route({ viaPop = false } = {}) {
  const prev = app.route;
  const navFrom = viaPop ? null : app.navFrom;
  app.navFrom = null;
  app.visit += 1;
  // Record the rendered hash now: a view transition renders asynchronously, and the hashchange that
  // follows a popstate must not route a second time.
  app.renderedHash = location.hash || '#/';
  app.route = parseHash(location.hash);
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
    if (!isListRoute(prev.name)) {
      const labels = { saved: 'Saved', passes: 'Passes', passDetail: 'Pass', console: 'Console', about: 'About', events: 'Events' };
      app.venueBack = labels[prev.name] ? { label: labels[prev.name], href: buildHash(prev.name, prev.params, prev.query) } : null;
    } else if (prev.name === 'tonight') app.venueBack = null;
  }
  if (isListRoute(r.name)) history.replaceState({ ...(history.state ?? {}), idx: histIdx(), back: r.name === 'tonight' ? null : app.venueBack ?? null, explore: { ...app.explore } }, '');
  if (r.name === 'console' && r.query.venue) app.console.venueId = r.query.venue;
  // Passes sits under Points but opens from Profile too: its Back names where it came from (kept on its history entry).
  if (r.name === 'passes') {
    app.passesFrom = !viaPop && prev ? (TAB_OF[prev.name] === 'profile' ? 'profile' : 'points') : entry.from ?? app.passesFrom ?? 'points';
    history.replaceState({ ...(history.state ?? {}), from: app.passesFrom }, '');
  }
  if (r.name === 'groupNew' && !app.groupDraft) { app.groupDraft = newGroupDraft(); app.groupErrors = {}; }
  if (r.name === 'events' && ['tonight', 'week', 'ideas', 'saved'].includes(r.query.view)) app.ui.eventsView = r.query.view;
  if (r.name === 'ideaNew') {
    const valid = r.query.venue && app.venues.some((v) => v.id === r.query.venue);
    if (!app.ideaDraft) { app.ideaDraft = newIdeaDraft(valid ? r.query.venue : null); app.ideaErrors = {}; }
    else if (valid && app.ideaDraft.venueId !== r.query.venue) {
      app.ideaDraft.venueId = r.query.venue;
      if (!app.ideaDraft.dayPicked) app.ideaDraft.day = defaultNight(app.state.clock.base, r.query.venue, [...app.events, ...app.ideas]);
    }
  }
  if (r.name !== 'profile') app.profileEdit = { editing: false, errors: {} };
  if (r.name === 'scan' && prev?.name !== 'scan') app.scanReturn = !!prev; // close returns to where Scan was opened
  if (r.name === 'scan' && r.query.venue && app.venues.some((v) => v.id === r.query.venue) && !app.state.activeWait) {
    app.scan = { ...freshScan(), venueId: r.query.venue };
    history.replaceState({ ...(history.state ?? {}), idx: histIdx() }, '', '#/scan');
    app.renderedHash = '#/scan';
  }
  if (r.name === 'pass') {
    if (!app.passFlow || app.passFlow.venueId !== r.params.id || app.passFlow.step === 'done') startPassFlow(r.params.id);
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
  const needsFirstFetch = ['tonight', 'venue', 'pass'].includes(r.name) && !app.firstFetchStarted;
  if (needsFirstFetch) app.firstFetchStarted = true;
  if (firstRoute) {
    firstRoute = false;
    doRender();
    if (needsFirstFetch) simulateFetch({ initial: true });
    return;
  }
  if (needsFirstFetch) queueMicrotask(() => simulateFetch({ initial: true }));
  if (!document.startViewTransition) { doRender(); return; }
  const rm = reducedMotion();
  // The photo that was tapped (a deals-rail tile has no data-thumb, so the id lookup would pick the grid card instead).
  const tapped = navFrom?.isConnected ? navFrom.querySelector(':is(.rail-photo, [data-thumb], [data-thumb-ev]) > :is(img, svg)') : null;
  // List <-> bar page morphs the photo (QA plan 5.1, 5.2). Reduced motion: no shared photo, so it's the short cross-fade.
  // A deal link lands scrolled to the deal, far from the hero: no photo morph, the page pushes in instead.
  const shared = (toDetail || backToList) && !rm && !r.query.deal && !(backToList && prev.query?.deal);
  const id = app.lastVenueId;
  const art = (sel) => (shared && sel ? document.querySelector(`${sel} > :is(img, svg)`) : null);
  const from = !shared ? null : toDetail ? tapped ?? art(`[data-thumb="${CSS.escape(id)}"]`) : art(`[data-hero="${CSS.escape(id)}"]`);
  const dir = from ? 'venue' : navDirection(prev, r, viaPop);
  // A newer navigation supersedes a running transition: end it now, and its update callback (if still queued) renders nothing.
  const prevVT = activeVT;
  activeVT = null;
  if (prevVT) { prevVT.skipTransition(); vtClear(); }
  if (!dir) { doRender(); return; }
  if (from) {
    // Freeze the card's press scale so the snapshot isn't taken mid-transition (WebKit's stale-transform bug), then name it.
    // The walk stays inside the card (a list item, or the map preview's card, which has no <li>): it never reaches #main
    // or the shell, which outlive the render and would keep the inline styles.
    const main = document.getElementById('main');
    if (toDetail) for (let el = from; el && el !== main && el !== document.body; el = el.parentElement) { el.style.transition = 'none'; el.style.transform = 'none'; if (el.matches('li, .map-card')) break; }
    vtName(from, 'venue-art');
    if (backToList) nameHeroChrome(from.closest('.detail-hero')); // named after the photo, so it fades out above it
  } else {
    document.documentElement.dataset.nav = dir;
  }
  if (!rm) { vtName(document.querySelector('.tabbar'), 'tabbar'); if (!from) vtName(document.querySelector('.topbar'), 'topbar'); }
  const backSel = !backToList ? null : entry.navFrom?.id === id ? entry.navFrom.sel : `[data-thumb="${CSS.escape(id)}"]`;
  const t = document.startViewTransition(async () => {
    if (activeVT !== t) return; // superseded before it rendered: the newer navigation renders
    if (from) { from.style.viewTransitionName = ''; vtNamed.delete(from); }
    doRender();
    if (!from) return;
    const to = toDetail ? art(`[data-hero="${CSS.escape(id)}"]`) : art(backSel);
    if (!to) return; // nothing to land on: the photo fades out where it was
    to.classList.remove('is-pending'); // the morph lands on it: no fade-in of its own (6.6)
    vtName(to, 'venue-art');
    document.documentElement.dataset.vtPair = '';
    if (toDetail) {
      nameHeroChrome(to.closest('.detail-hero'));
      // Render before reveal: the hero photo is eager; give it up to 100ms to decode so the morph never lands on a blank.
      if (to.decode) await Promise.race([to.decode().catch(() => {}), new Promise((res) => setTimeout(res, 100))]);
    } else {
      vtName(to.parentElement.querySelector(':scope > .card-scrim'), 'card-scrim');
      vtName(to.parentElement.querySelector(':scope > .card-top'), 'card-top');
      vtName(to.parentElement.querySelector(':scope > .bar-id'), 'card-id');
    }
  });
  activeVT = t;
  t.ready.catch(() => {}); // a skipped transition (e.g. superseded or tab hidden) is fine: the DOM still updates
  t.finished.catch(() => {}).finally(() => {
    if (activeVT !== t) return;
    activeVT = null;
    vtClear();
  });
}

/* ---------------- simulated fetch (loading / error / offline) ---------------- */
let fetchTimer = null;
function simulateFetch({ initial = false } = {}) {
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
    if (hadFocus) fresh.querySelector('summary')?.focus({ preventScroll: true });
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
  const v = app.venues.find((x) => x.id === id);
  const idx = app.state.saved.indexOf(id);
  if (idx === -1) {
    app.state.saved.push(id);
    persist();
    refreshCurrent();
    toast(`Saved ${v?.name ?? 'venue'}`, { key: `save:${id}` });
  } else {
    app.state.saved.splice(idx, 1);
    persist();
    app.ui.lastRemoved = { id, idx, name: v?.name ?? 'Venue', visit: app.visit };
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
  const id = app.console.venueId && app.venues.some((v) => v.id === app.console.venueId) ? app.console.venueId : app.venues[0]?.id;
  return app.venues.find((v) => v.id === id);
}
function rerenderPage(fallback) {
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
}
/** Console lists (QA plan 8.1, 8.6): ideas, posted deals and inputs leave and arrive with FLIP; the panels after the
 *  change glide to their new places. A new input row drops in from above; anything else rises in. */
const CONSOLE_ITEMS = '#main .console-grid > section, #main .idea-reviews > article, #main .console-grid li[data-key], #main .console-grid h3[data-key]';
function consoleList(leaving = [], after) {
  updateList({ sel: CONSOLE_ITEMS, leaving: leaving.filter(Boolean), render: rerenderConsole, after, rise: (n) => (n.closest('.feed') ? '0 -8px' : '0 8px') });
}
/** Re-render only the line photo panel (counting taps), keeping focus on the control that was used. */
function rerenderPhoto(fallback) {
  const el = document.getElementById('line-photo');
  const v = consoleVenue();
  if (!el || !v) { rerenderConsole(); return; }
  preserveFocus(() => { el.outerHTML = photoPanel(v, ctx()); }, fallback ?? (() => document.querySelector('#line-photo .scene-btn')));
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
  stopFill();
  const seed = `${v.id}:${app.console.snaps}`;
  app.console.photo = { venueId: v.id, seed, heads: headsFor(seed, around), count: 0, newest: -1, touched: false, filled: false, readyAt: performance.now() + 400 };
  app.console.busyUntil = 0;
  app.console.filling = false;
  const el = document.getElementById('line-photo');
  if (el) el.outerHTML = photoPanel(v, ctx()); else rerenderConsole();
  flashView(document.querySelector('#line-photo .lp-view'));
  document.getElementById('line-photo')?.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
  document.querySelector('#line-photo .scene-btn')?.focus({ preventScroll: true });
  announce('Photo taken. Tap each head, or use the buttons.');
}
let fillTimer = null;
let fillSteps = [];
const stopFill = () => { clearTimeout(fillTimer); fillSteps.forEach(clearTimeout); fillSteps = []; };
/** Patch the line photo panel in place (a running count roll keeps going; the math and "Publish N" swap). */
function patchPhoto() {
  const el = document.getElementById('line-photo');
  const v = consoleVenue();
  if (!el || !v) { rerenderConsole(); return; }
  preserveFocus(() => patchTree(el, fragment(photoPanel(v, ctx()))), () => document.querySelector('#line-photo .scene-btn'));
}
function fillPhoto() {
  const v = consoleVenue();
  const p = app.console.photo;
  if (!v || !p || p.venueId !== v.id || performance.now() < app.console.busyUntil) return;
  stopFill();
  const before = p.count;
  const from = Math.min(p.count, DRAW_MAX);
  Object.assign(p, { count: p.heads, newest: -1, touched: true, filled: true });
  const drawn = Math.min(p.heads, DRAW_MAX);
  const step = Math.min(40, 1200 / Math.max(1, drawn - from));
  const ms = reducedMotion() ? 0 : Math.round(step * Math.max(0, drawn - from)) + 200;
  // The visible count steps with each mark as it appears and rolls into the final number (QA plan 4.7). A keyboard
  // fill shows the final number at once.
  const stepping = ms > 0 && motionOK();
  app.console.busyUntil = performance.now() + ms;
  app.console.filling = ms > 0 ? { from, step, before, shown: stepping ? before : p.count } : false;
  rerenderPhoto();
  if (stepping) {
    const n = drawn - from;
    for (let k = 1; k <= n; k += 1) {
      fillSteps.push(setTimeout(() => {
        const vis = document.querySelector('#line-photo .pc-vis');
        if (!vis || app.console.photo !== p) return;
        if (k === n) { rollText(vis, String(p.count), dirOf(vis.textContent, p.count)); return; }
        delete vis.dataset.rollTo;
        vis.textContent = String(from + k);
      }, Math.round((k - 1) * step)));
    }
  }
  const done = () => {
    if (app.console.photo !== p) return;
    app.console.filling = false;
    app.console.busyUntil = 0;
    patchPhoto();
    document.querySelector('#line-photo [data-action="photo-publish"]')?.focus({ preventScroll: true });
    announce(`${p.count} people counted. Ready to publish.`);
  };
  if (ms) fillTimer = setTimeout(done, ms); else done();
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
  if (btn?.getAttribute('aria-disabled') === 'true' || performance.now() < p.readyAt || performance.now() < app.console.busyUntil) return;
  const role = app.console.role;
  const id = `count-${refCode(`${v.id}${p.seed}${Date.now()}`).toLowerCase()}`;
  app.state.counts.unshift({ id, venueId: v.id, at: now(), night: app.state.clock.realStart, by: role, heads: p.count, seed: p.seed, method: p.filled && p.count === p.heads ? 'demo-fill' : 'tap' });
  app.state.counts = app.state.counts.slice(0, 100);
  audit(v, `${ROLE_NAME[role]} photo count: ${p.count}`);
  app.console.photo = null;
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
  toast(`Published ${p.count}`);
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
const dealDraft = () => (app.console.dealDraft ??= newDealDraft(app.state.clock.base, now()));
function postDeal() {
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
  consoleList(); // the new row rises into "Posted from this console"; the panels below glide down
  toast('Deal posted');
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
function setPassOverride(venue, patch) {
  const o = app.state.overrides[venue.id] ?? (app.state.overrides[venue.id] = {});
  o.pass = { ...(o.pass ?? {}), ...patch, capacity: { ...(o.pass?.capacity ?? {}), ...(patch.capacity ?? {}) } };
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
  app.console = freshConsole();
  app.ideaDraft = null;
  app.ideaErrors = {};
  app.scan = freshScan();
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
  // Never scroll during a view transition (WebKit 285400, 288795): wait for it to finish.
  if (activeVT) activeVT.finished.catch(() => {}).finally(land); else land();
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
  toast(`Idea posted.`, { actionLabel: 'Review as the bar', onAction: () => go(`#/console?venue=${encodeURIComponent(venue.id)}`) });
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

/* ---------------- scan: line reports ---------------- */
const MIN_MS = 60000;
const round5 = (n) => Math.max(0, Math.round(n / 5) * 5);
function submitReport() {
  const f = app.scan;
  if (!f.captured || !f.bucket) { blockedScan(document.querySelector('[data-action="scan-submit"]')); return; }
  const v = app.venues.find((x) => x.id === f.venueId);
  const b = LINE_BUCKETS.find((x) => x.id === f.bucket);
  const at = now();
  const id = `r-${Date.now().toString(36)}`;
  // The report is one input to this bar's estimate (src/lib/merge.js): it leads when no fresh line photo does,
  // otherwise it backs the photo up or, with another guest, flags it as uncertain.
  app.state.reports.unshift({ id, venueId: v.id, at, night: app.state.clock.realStart, bucket: b.id, door: f.door ?? 'moving', inLine: f.inLine, gotInAt: null, waitMin: null });
  app.state.points.push({ id: `p-${id}`, at, delta: POINTS.REPORT, label: `Line report: ${v.name}` });
  if (f.inLine) app.state.activeWait = { reportId: id, venueId: v.id, startedAt: at };
  persist();
  rebuild();
  f.outcome = scanOutcome(app.venues.find((x) => x.id === v.id), id);
  f.step = 'done';
  f.error = null;
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
  document.querySelector('#main [data-autofocus]')?.focus();
  announce(`Report sent. Plus ${POINTS.REPORT} points.`);
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
  const y = window.scrollY;
  preserveFocus(() => {
    patchChildren(main, tpl.content, { skip: (n) => n === live });
    live.replaceChildren(...next.childNodes);
  });
  main.querySelector(':scope > .scan-submit')?.getAnimations().forEach((a) => { if (!(a instanceof CSSTransition)) a.cancel(); });
  window.scrollTo(0, y);
  if (reducedMotion()) live.animate({ opacity: [0, 1] }, { duration: T.rmIn, easing: 'linear' });
  else if (motionOK()) live.animate({ opacity: [0, 1], translate: [`${12 * dir}px 0`, '0 0'] }, { duration: T.reveal, easing: T.easeOut });
}
/**
 * The shutter (QA plan 8.5, after 1.8): the viewfinder is patched in place. It turns captured, the shutter fades out
 * where it is (CSS), the photo comes up under the capture flash, and "Photo taken" and Retake rise 4px in; the rest of
 * the page is patched, so the line-size and door choices fade up from .4 as they turn on (CSS). Keyboard: no motion.
 */
function captureScan() {
  const f = app.scan;
  f.captured = true;
  f.error = null;
  const main = document.getElementById('main');
  const vf = main.querySelector('.scan-flow .viewfinder');
  const tpl = document.createElement('template');
  tpl.innerHTML = mainHtml();
  const vf1 = tpl.content.querySelector('.scan-flow .viewfinder');
  if (!vf || !vf1) { rerenderPage(); return; }
  const moving = motionOK(), rm = reducedMotion();
  const y = window.scrollY;
  patchChildren(main, tpl.content, { skip: (n) => n === vf });
  const shutter = vf.querySelector('.shutter');
  vf.className = vf1.className; // .is-captured: the shutter fades (CSS)
  [...vf.children].forEach((n) => { if (n !== shutter) n.remove(); });
  const [photo, ...chrome] = [...vf1.children];
  vf.prepend(photo);
  chrome.forEach((n) => vf.insertBefore(n, shutter));
  window.scrollTo(0, y);
  if (shutter) {
    shutter.inert = true;
    if (!moving && !rm) shutter.remove(); else setTimeout(() => shutter.remove(), (rm ? T.rmOut : T.toastOut) + 40);
  }
  if (rm) chrome.forEach((n) => n.animate({ opacity: [0, 1] }, { duration: T.rmIn, easing: 'linear' }));
  else if (moving) chrome.forEach((n) => n.animate({ opacity: [0, 1], translate: ['0 4px', '0 0'] }, { duration: T.reveal, delay: 60, easing: T.easeOut, fill: 'backwards' }));
  flashView(vf);
}
/**
 * "Send report" while it can't be sent (QA plan 8.3): it says so instead of a dead tap. The button shakes, the missing
 * piece (the photo, else the line size) scrolls into view and nods once, and the existing alert text drops in.
 * Reduced motion: no shake or scroll motion; the missing piece pulses its opacity once.
 */
function blockedScan(btn) {
  const f = app.scan;
  f.error = !f.captured ? 'Take a photo of the line first.' : 'Pick about how many people are in line.';
  patchPage();
  const target = document.querySelector(!f.captured ? '#main .scan-flow .viewfinder' : '#main .scan-flow .bucket-row');
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
function leftLine() {
  const w = app.state.activeWait;
  if (!w) return;
  const r = app.state.reports.find((x) => x.id === w.reportId);
  if (r) r.leftAt = now();
  app.state.activeWait = null;
  persist();
  closeWaiting(false);
  toast('Got it. You keep the points for your report.');
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
async function shareVenue(id) {
  const v = app.venues.find((x) => x.id === id);
  if (!v) return;
  const url = `${location.href.split('#')[0]}#/venue/${encodeURIComponent(v.id)}`;
  const est = estimateFor(v, now());
  const text = `${v.name}: ${est.headline} on Night Out`;
  try {
    if (navigator.share) { await navigator.share({ title: `${v.name} · Night Out`, text, url }); return; }
    await navigator.clipboard.writeText(url);
    toast('Link copied.');
  } catch (err) {
    if (err?.name === 'AbortError') return; // the person closed the share sheet
    toast(`Couldn’t share. Link: ${url}`);
  }
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
  if (reducedMotion()) {
    swap();
    dlg.querySelector('.sheet-body')?.animate({ opacity: [0, 1] }, { duration: T.rmIn, easing: 'linear' });
    return;
  }
  if (!motionOK()) { swap(); return; }
  dlg.getAnimations().forEach((a) => { if (!(a instanceof CSSTransition) && a.effect?.getKeyframes().some((k) => 'height' in k)) a.cancel(); });
  const h0 = dlg.offsetHeight;
  swap();
  const h1 = dlg.offsetHeight;
  if (Math.abs(h1 - h0) >= 8) dlg.animate({ height: [`${h0}px`, `${h1}px`] }, { duration: T.tray, easing: T.easeInOut });
  if (body) dlg.querySelector('.sheet-body')?.animate({ opacity: [0, 1], translate: [dir ? `${12 * dir}px 0` : '0 4px', '0 0'] }, { duration: T.reveal, delay: 60, easing: T.easeOut, fill: 'backwards' });
}

/* ---------------- points: daily login and door check-ins (simulated QR) ---------------- */
/** +5 once per demo night, after the age check. */
function dailyLogin() {
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
/** "Scan QR code" (QA plan 7.4): with a pointer the corners close in (.92) under the capture flash, and the sheet moves
 *  on once the flash is done (--d-flash). Reduced motion: the flash only. Keyboard and scripted clicks: at once. */
function captureCheckin() {
  if (app.checkin.busy) return;
  const dlg = document.getElementById('picker');
  const finder = dlg.querySelector('.qr-finder');
  if (!finder || fromKeys(gesture) || document.hidden) { checkIn(); return; }
  const flow = app.checkin;
  flow.busy = true;
  if (!reducedMotion()) finder.querySelector('.vf-corners')?.animate({ scale: [1, 0.92] }, { duration: T.select, easing: T.easeOut, fill: 'forwards' });
  flashView(finder);
  setTimeout(() => {
    flow.busy = false;
    if (app.checkin === flow && dlg.open && flow.step === 'scan') checkIn();
  }, reducedMotion() ? T.rmIn : T.flash);
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
    document.title = `${name} · Night Out`;
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
    app.navFrom = nav; // the view transition morphs from the photo that was actually tapped
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
    case 'go-online-retry':
      app.state.sim.offline = false;
      persist();
      if (navigator.onLine === false) { toast('Your device still reports no connection.'); return true; }
      runPassRequest();
      return true;
    case 'apply-stale': app.ui.staleNotice = null; renderResultsOnly(); return true;
    case 'undo-remove': undoRemove(); return true;
    case 'undo-reset': undoReset(); return true;
    case 'back': goBack(el.getAttribute('href') || '#/'); return true;
    case 'close-sheet': requestCloseSheet(); return true;
    case 'party': {
      const f = app.passFlow;
      const v = app.venues.find((x) => x.id === f.venueId);
      const win = v.pass.windows.find((w) => w.id === f.windowId);
      const max = win ? maxPartyFor(win) : 4;
      f.party = Math.max(1, Math.min(max, f.party + Number(el.dataset.delta)));
      renderSheet();
      announce(`Party size ${f.party}`);
      return true;
    }
    case 'submit-pass': submitPass(); return true;
    case 'retry-pass': runPassRequest(); return true;
    case 'back-to-review': app.passFlow.step = 'review'; renderSheet(); return true;
    case 'view-pass': return false; // handled as navigation
    case 'cancel-pass': {
      const p = app.state.passes.find((x) => x.id === el.dataset.id);
      if (!p) return true;
      p.cancelledAt = now();
      persist(); rebuild(); patchPass(p.id);
      (document.querySelector(`[data-action="restore-pass"][data-id="${CSS.escape(p.id)}"]`) || pageHeading())?.focus({ preventScroll: true });
      toast(`Pass for ${p.venueName} cancelled.`, { actionLabel: 'Undo', onAction: () => restorePass(p.id) });
      return true;
    }
    case 'restore-pass': restorePass(el.dataset.id); return true;
    case 'console-role':
      app.console.role = el.dataset.role === 'bouncer' ? 'bouncer' : 'ambassador';
      rerenderConsole();
      announce(`${ROLE_NAME[app.console.role]} selected`);
      return true;
    case 'photo-snap': case 'photo-retake': snapPhoto(); return true;
    case 'photo-mark': case 'photo-step': {
      const v = consoleVenue();
      const p = app.console.photo;
      if (!v || !p || p.venueId !== v.id || performance.now() < app.console.busyUntil) return true;
      const delta = el.dataset.action === 'photo-mark' ? 1 : Number(el.dataset.delta);
      const next = Math.max(0, Math.min(400, p.count + delta));
      Object.assign(p, { count: next, touched: true, filled: false, newest: delta > 0 && next <= DRAW_MAX ? next - 1 : -1 });
      rerenderPhoto();
      // The panel is rebuilt per tap, so the new count settles in (--d-quick); the next tap starts a fresh one.
      const vis = document.querySelector('#line-photo .pc-vis');
      if (vis && reducedMotion()) vis.animate({ opacity: [0.4, 1] }, { duration: T.rmIn, easing: 'linear' });
      else if (vis && motionOK()) vis.animate({ opacity: [0.6, 1], filter: ['blur(2px)', 'blur(0)'] }, { duration: T.quick, easing: T.easeOut });
      countAnnounce(v, p);
      return true;
    }
    case 'photo-fill': fillPhoto(); return true;
    case 'photo-publish': publishPhoto(el); return true;
    case 'console-clear': {
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
    case 'console-undo-clear': undoClear(); return true;
    case 'deal-post': postDeal(); return true;
    case 'deal-remove': removeDeal(el.dataset.id); return true;
    case 'console-price': {
      const v = consoleVenue();
      const next = Math.max(100, Math.min(5000, v.pass.basePrice + Number(el.dataset.delta)));
      setPassOverride(v, { basePrice: next });
      audit(v, `Priority price → ${money(next)} per person (+ fee)`);
      persist(); rebuild(); rerenderConsole();
      announce(`Price ${money(next)} per person`);
      return true;
    }
    case 'console-cap': {
      const v = consoleVenue();
      const w = v.pass.windows.find((x) => x.id === el.dataset.window);
      const next = Math.max(w.sold, Math.min(50, w.capacity + Number(el.dataset.delta)));
      setPassOverride(v, { capacity: { [w.id]: next } });
      audit(v, `Capacity ${formatTime(w.start)} window → ${next}`);
      persist(); rebuild(); rerenderConsole();
      announce(`Capacity ${next} for the ${formatTime(w.start)} window`);
      return true;
    }
    case 'dataset': setDataset(el.dataset.kind); return true;
    case 'fast-forward':
      app.state.clock = advance(app.state.clock, 10);
      persist();
      rebuild();
      tick();
      if (app.route.name === 'about') rerenderConsole();
      toast('Clock moved forward 10 minutes.');
      return true;
    case 'reset-demo': resetDemo(); return true;
    case 'reload-app': location.reload(); return true;
    case 'age-ok':
      app.state.ageConfirmed = true; persist();
      closeDialogAnimated(document.getElementById('age-gate'), () => pageHeading()?.focus());
      dailyLogin();
      return true;
    case 'open-checkin': openCheckin(); return true;
    case 'checkin-pick': app.checkin = { step: 'scan', venueId: el.dataset.id }; renderCheckin(1); return true;
    case 'checkin-back': app.checkin = { step: 'pick', venueId: null }; renderCheckin(-1); return true;
    case 'checkin-scan': captureCheckin(); return true;
    case 'age-no':
      document.getElementById('age-body').innerHTML = '<h2 id="age-title" class="page-title age-title" tabindex="-1">Night Out is for adults 21+</h2><p class="page-sub age-sub">It describes bars and nightlife, so it isn’t available to you. You can close this tab.</p>';
      document.getElementById('age-title').focus();
      return true;
    case 'open-area': openAreaPicker(); return true;
    case 'close-picker': closePickerToOpener(); return true;
    case 'vote': castVote(el.dataset.id, el.dataset.vote); return true;
    case 'event-view': {
      
      app.ui.eventsView = el.dataset.view;
      document.querySelectorAll('.ev-views [data-action="event-view"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === app.ui.eventsView)));
      const hash = buildHash('events', {}, app.ui.eventsView === 'tonight' ? {} : { view: app.ui.eventsView });
      history.replaceState(history.state, '', hash);
      app.renderedHash = hash;
      renderEventResults();
      
      return true;
    }
    case 'idea-hype': toggleIdea('hyped', el.dataset.id); return true;
    case 'idea-join': toggleIdea('joined', el.dataset.id); return true;
    case 'idea-post': return false; // the form's submit handles it
    case 'idea-approve': decideIdea(el.dataset.id, 'approved'); return true;
    case 'idea-decline': decideIdea(el.dataset.id, 'declined'); return true;
    case 'idea-undo': undoDecision(el.dataset.id); return true;
    case 'event-clear': app.ui.eventsGenre = ''; app.ui.eventsTheme = ''; app.ui.eventsPrice = ''; rerenderPage(); return true;
    case 'event-save': toggleEventList('savedEvents', el.dataset.id); return true;
    case 'event-going': toggleEventList('goingEvents', el.dataset.id); return true;
    case 'directions': openDirections(el.dataset.id); return true;
    case 'share': shareVenue(el.dataset.id); return true;
    case 'scroll-to': { const t = document.getElementById(el.dataset.target); if (t) { t.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }); t.focus({ preventScroll: true }); } return true; }
    case 'join-group': toggleJoin(el.dataset.id); return true;
    case 'group-members': {
      const g = [...app.state.groups.created, ...app.groups].find((x) => x.id === el.dataset.id);
      const fromProfile = el.classList.contains('sheet-back') ? document.querySelector('#picker .member-profile')?.dataset.index : null;
      if (g) openAccountSheet(membersSheet(g, ctx()), fromProfile != null ? `[data-action="member-profile"][data-index="${fromProfile}"]` : '.sheet-close', fromProfile != null ? -1 : 0);
      return true;
    }
    case 'member-profile': {
      const g = [...app.state.groups.created, ...app.groups].find((x) => x.id === el.dataset.group);
      if (g) {
        openAccountSheet(memberProfileSheet(g, Number(el.dataset.index), ctx()), '#picker-title', 1);
        document.querySelector('#picker .member-profile')?.setAttribute('data-index', el.dataset.index);
      }
      return true;
    }
    case 'hop-add': {
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
    case 'hop-remove': {
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
    case 'ig-link': {
      // Instagram links are off in the prototype, for seeded handles and your own.
      const msg = 'Instagram links aren’t available yet.';
      const note = el.closest('dialog')?.querySelector('[data-ig-note]');
      if (note) note.textContent = msg; else toast(msg);
      return true;
    }
    case 'group-spots': {
      const d = app.groupDraft ?? (app.groupDraft = newGroupDraft());
      d.spots = Math.max(2, Math.min(12, d.spots + Number(el.dataset.delta)));
      patchPage();
      announce(`Group size ${d.spots}`);
      return true;
    }
    case 'post-group': return false; // the form's submit handles it
    case 'scan-pick':
      Object.assign(app.scan, { venueId: el.dataset.id, captured: false, bucket: null, error: null });
      scanStep(1);
      document.querySelector('.shutter')?.focus();
      return true;
    case 'scan-change':
      Object.assign(app.scan, { venueId: null, captured: false, bucket: null, error: null });
      scanStep(-1);
      document.getElementById('scan-q')?.focus();
      return true;
    case 'scan-shutter':
      captureScan();
      document.querySelector('input[name="bucket"]')?.focus();
      announce('Photo captured. Now pick about how many people are in line.');
      return true;
    case 'scan-retake':
      app.scan.captured = false;
      patchPage();
      document.querySelector('.shutter')?.focus();
      return true;
    case 'scan-submit': submitReport(); return true;
    case 'scan-close':
      if (app.scanReturn) history.back();
      else go('#/', { replace: true });
      return true;
    case 'scan-in': gotIn(); return true;
    case 'scan-left': leftLine(); return true;
    case 'scan-restart':
      app.scan = freshScan();
      scanStep(-1);
      document.getElementById('scan-q')?.focus();
      return true;
    case 'redeem': redeem(el.dataset.id); return true;
    case 'edit-profile':
      app.profileEdit = { editing: !app.profileEdit.editing, errors: {} };
      rerenderPage();
      (app.profileEdit.editing ? document.getElementById('p-name') : document.querySelector('[data-action="edit-profile"]'))?.focus();
      return true;
    case 'open-settings': openAccountSheet(settingsSheet(ctx()), 'input[role="switch"]'); return true;
    case 'open-help': openAccountSheet(helpSheet(), 'summary'); return true;
    case 'help-about': closePicker(() => go('#/about')); return true;
    case 'manage-sub': openAccountSheet(manageSubSheet(ctx()), 'input:checked'); return true;
    case 'vip-wallet': toast('Adding to Wallet isn’t available yet.'); return true;
    case 'vip-add': addVipCard(); return true;
    case 'vip-remove': removeVipCard(el.dataset.id); return true;
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
    case 'deal-field': if (t.tagName === 'INPUT') dealDraft()[t.dataset.key] = t.value; break;
    case 'idea-field':
      if (t.tagName !== 'SELECT' && app.ideaDraft) app.ideaDraft[t.dataset.key] = t.value;
      break;
    case 'hop-field': {
      const d = app.groupDraft ?? (app.groupDraft = newGroupDraft());
      const st = d.stops[Number(t.dataset.index)];
      if (st) st[t.dataset.key] = t.value;
      break;
    }
    case 'group-field': {
      const d = app.groupDraft ?? (app.groupDraft = newGroupDraft());
      d[t.dataset.key] = t.value;
      break;
    }
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
    case 'pass-window': app.passFlow.windowId = t.value; app.passFlow.errors = {}; renderSheet(); break;
    case 'pass-ack': app.passFlow.ack = t.checked; if (t.checked && app.passFlow.errors.ack) { delete app.passFlow.errors.ack; renderSheet(); } break;
    case 'console-venue':
      app.console.venueId = t.value;
      app.console.photo = null;
      history.replaceState({ idx: histIdx() }, '', buildHash('console', {}, { venue: t.value }));
      app.renderedHash = location.hash;
      rerenderConsole();
      break;
    case 'door-status': setDoor(t, 'status'); break;
    case 'door-pace': setDoor(t, 'pace'); break;
    case 'deal-kind': dealDraft().kind = t.value; app.console.dealErrors = {}; rerenderConsole(); break;
    case 'deal-cost': dealDraft().costOk = t.checked; break;
    case 'deal-field':
      if (t.tagName === 'SELECT') {
        const d = dealDraft();
        if (t.dataset.key === 'item') d.item = t.value;
        else d[t.dataset.key] = t.value.split(':').map(Number);
      }
      break;
    case 'console-pause': {
      const v = consoleVenue();
      setPassOverride(v, { paused: t.checked });
      audit(v, t.checked ? 'Paused priority passes' : 'Resumed priority passes');
      persist(); rebuild(); rerenderConsole();
      toast(t.checked ? `Priority passes paused for ${v.name}.` : `Priority passes resumed for ${v.name}.`);
      break;
    }
    case 'group-field': {
      const d = app.groupDraft ?? (app.groupDraft = newGroupDraft());
      d[t.dataset.key] = t.value;
      break;
    }
    case 'idea-field': {
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
    case 'idea-night': { const d = app.ideaDraft ?? (app.ideaDraft = newIdeaDraft()); d.day = Number(t.value); d.dayPicked = true; break; }
    case 'idea-theme': { const d = app.ideaDraft ?? (app.ideaDraft = newIdeaDraft()); d.theme = t.value; break; }
    case 'idea-ack': { const d = app.ideaDraft ?? (app.ideaDraft = newIdeaDraft()); d.ack = t.checked; break; }
    case 'idea-cover': app.console.ideaCover[t.dataset.id] = Number(t.value); break;
    case 'area': chooseArea(t.value, t.closest('.option-row')); break;
    case 'group-hop': {
      const d = app.groupDraft ?? (app.groupDraft = newGroupDraft());
      d.hop = t.checked;
      if (d.hop && !d.stops.length) { const st = nextHopStop(d); if (st) d.stops.push(st); else d.hop = false; }
      app.groupErrors = {};
      patchPage(); // the switch keeps its node (its knob glides) and the stops open in place below it (QA plan 8.2)
      document.getElementById('g-hop')?.focus();
      announce(d.hop ? 'Bar hop on. Stop 2 added below.' : 'Bar hop off');
      break;
    }
    case 'hop-field': {
      const d = app.groupDraft ?? (app.groupDraft = newGroupDraft());
      const st = d.stops[Number(t.dataset.index)];
      if (st) st[t.dataset.key] = t.value;
      break;
    }
    case 'scan-bucket': app.scan.bucket = t.value; app.scan.error = null; patchScanEstimate(); break;
    case 'scan-door': app.scan.door = t.value; patchScanEstimate(); break;
    case 'scan-inline': app.scan.inLine = t.checked; break;
    case 'pref':
      app.state.prefs[t.dataset.key] = t.checked;
      persist();
      { // the switch itself says it (no toast restating it, QA plan 9.6)
        const sr = t.closest('.switch-row')?.querySelector('.sr-only');
        if (sr) sr.textContent = `(${t.checked ? 'on' : 'off'})`;
      }
      if (app.route.name === 'profile') rerenderPage();
      break;
    case 'sub-plan': chooseSubscription(t.value); break;
    case 'sim': // the switch itself says it (no toast restating it, QA plan 9.6)
      app.state.sim[t.dataset.key] = t.checked;
      persist();
      break;
    default: break;
  }
}

const onSubmit = (e) => withGesture(e, () => handleSubmit(e));
function handleSubmit(e) {
  e.preventDefault();
  if (e.target.id === 'pass-form') submitPass();
  if (e.target.id === 'deal-form') postDeal();
  if (e.target.id === 'group-form') postGroup();
  if (e.target.id === 'idea-form') postIdea();
  if (e.target.id === 'profile-form') saveProfile(e.target);
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
  // Keyboard users get instant thumbs and highlights (.kbd); a pointer press clears it.
  document.addEventListener('keydown', (e) => { if (/^(Tab|Enter| |Arrow)/.test(e.key)) document.documentElement.classList.add('kbd'); });
  document.addEventListener('pointerdown', () => document.documentElement.classList.remove('kbd'), { passive: true });
  // Without a touch listener, iOS Safari may never apply :active (press feedback).
  document.addEventListener('touchstart', () => {}, { passive: true });
  // A view transition's overlay swallows taps: a press during one ends it at once, so the tap lands (QA plan 5.3, rubric I6).
  // A touch tap is hit-tested again when it ends; a mouse press that began on the overlay clicks <html>, so re-aim that
  // click at whatever is now under the pointer.
  let vtSkippedAt = -Infinity;
  document.addEventListener('pointerdown', () => { if (activeVT) { activeVT.skipTransition(); vtSkippedAt = performance.now(); } }, { capture: true, passive: true });
  document.addEventListener('click', (e) => {
    if (e.target !== document.documentElement || !e.detail || performance.now() - vtSkippedAt > 1000) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === document.documentElement || el === document.body) return;
    vtSkippedAt = -Infinity;
    e.stopImmediatePropagation();
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, view: window, detail: e.detail, clientX: e.clientX, clientY: e.clientY }));
  }, true);
  window.addEventListener('popstate', () => { rememberScroll(); route({ viaPop: true }); });
  window.addEventListener('hashchange', () => {
    const h = location.hash;
    if (h && h !== '#' && !h.startsWith('#/')) return; // e.g. #main from the skip link
    if ((h || '#/') !== app.renderedHash) { rememberScroll(); route({ viaPop: true }); }
  });
  window.addEventListener('online', () => { if (app.route.name === 'tonight' || app.route.name === 'venue') simulateFetch(); });
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
  dailyLogin();
  setInterval(tick, 15_000);
  document.addEventListener('visibilitychange', () => {
    document.documentElement.toggleAttribute('data-hidden', document.hidden);
    // A toast's clock stops while nobody can read it, and starts over when the page is back (each toast its own).
    const live = [...document.querySelectorAll('#toasts .toast:not(.is-leaving)')];
    if (document.hidden) { live.forEach((t) => clearTimeout(t._timer)); return; }
    live.forEach((t) => { if (!t.matches(':hover, :focus-within')) armToast(t, t._timeout); });
    tick();
  });
  document.documentElement.dataset.ready = 'true';
  if (new URLSearchParams(location.search).has('qa')) {
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
  shell?.setAttribute('inert', '');
  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      el.classList.add('is-out');
      setTimeout(() => { remove(); resolve(); }, reducedMotion() ? 160 : 420);
    };
    el.addEventListener('pointerdown', finish, { once: true });
    // If the CSS safety net hid the splash first (slow boot), clean up at once so the app is never stuck inert.
    el.addEventListener('animationend', (e) => { if (e.target === el && e.animationName === 'splash-safety') finish(); });
    // No font to wait for: the mark is vector art. Start on the next frame so the first painted frame is black.
    requestAnimationFrame(() => {
      el.classList.add('is-playing');
      setTimeout(finish, reducedMotion() ? 1100 : 2300);
    });
  });
}

boot();
