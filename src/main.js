// Night Out prototype controller (codename in storage and QA hook: doorline). Local only: no network requests, no payments, no ID data.
import { load, save, clear, defaultState } from './lib/store.js';
import { normalizeClock, demoNow, advance, formatTime } from './lib/clock.js';
import { buildDataset, atNight } from './data/venues.js';
import { buildGroups, POINTS, LINE_BUCKETS, REWARDS, balanceOf, validHandle } from './data/social.js';
import { resolveVenues, diffQueue } from './lib/model.js';
import { parseHash, buildHash, exploreStateFromQuery, exploreQuery } from './lib/router.js';
import { FILTERS, SORTS, exploreList } from './lib/explore.js';
import { windowState, purchasable, createPass, maxPartyFor, passStatus, money, refCode } from './lib/pass.js';
import { estimateCompact, estimateBlock, estimateRing, estimateFor, demoChip, esc, venueRow, cardStatus, srSummary, dealTag, venueStatus } from './ui/components.js';
import { icon } from './ui/icons.js';
import { renderExplore, exploreResults, exploreBanners, pinParts, areaSheet } from './views/explore.js';
import { renderGroups, renderGroupNew, validateGroup } from './views/groups.js';
import { renderScan, pickListItems } from './views/scan.js';
import { renderPoints } from './views/points.js';
import { renderProfile } from './views/profile.js';
import { renderVenue, directionsSheet, pollSection } from './views/venue.js';
import { buildEvents } from './data/events.js';
import { renderPassSheet } from './views/passSheet.js';
import { renderSaved, renderPasses, renderPassDetail, renderConsole, renderAbout, draftFrom, rangeFor, consoleHint, draftReady, newDealDraft } from './views/pages.js';
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
  ui: { loading: true, refreshError: false, lastRefreshAt: null, searchOpen: false, mapSelected: null, staleNotice: null, lastRemoved: null, resetSnapshot: null, clearedQueue: null },
  firstFetchStarted: false,
  console: { venueId: null, drafts: {}, dealDraft: null, dealErrors: {} },
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
};
const freshScan = () => ({ step: 'pick', venueId: null, captured: false, bucket: null, inLine: true, q: '', error: null });
app.scan = freshScan();

/* ---------------- state ---------------- */
function init() {
  const realNow = Date.now();
  app.state = load(storage, realNow);
  app.state.clock = normalizeClock(app.state.clock, realNow);
  persist();
  rebuild();
}
const now = () => demoNow(app.state.clock, Date.now());
function persist() { save(storage, app.state); }
function rebuild() {
  const base = buildDataset(app.state.dataset, app.state.clock.base, app.state.syncAt ?? app.state.clock.base);
  app.venues = resolveVenues(base, app.state.overrides, app.state.passes, app.state.deals);
  app.groups = buildGroups(app.state.clock.base);
  app.events = buildEvents(app.state.clock.base);
}
const isOffline = () => app.state.sim.offline || navigator.onLine === false;
const savedSet = () => new Set(app.state.saved);

function ctx(extra = {}) {
  return {
    venues: app.venues, now: now(), state: app.state, explore: app.explore, ui: app.ui, savedSet: savedSet(),
    offline: isOffline(), console: app.console, visit: app.visit, groups: app.groups, events: app.events,
    backHref: app.venueBack?.href ?? app.lastExploreHash, backLabel: app.venueBack?.label ?? 'Bars', ...extra,
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
let toastTimer = null;
const cssMs = (name, fallback) => {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
};
function toast(message, { actionLabel, onAction, timeout = actionLabel ? 15000 : 6000 } = {}) {
  const region = document.getElementById('toasts');
  clearTimeout(toastTimer);
  region.querySelectorAll('.toast.is-leaving').forEach((n) => n.remove());
  let el = region.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.addEventListener('pointerenter', () => clearTimeout(toastTimer));
    el.addEventListener('pointerleave', () => armToast(el, el._timeout));
    el.addEventListener('focusin', () => clearTimeout(toastTimer));
    el.addEventListener('focusout', () => armToast(el, el._timeout));
    region.append(el);
  }
  el._timeout = timeout;
  el.innerHTML = `<p>${esc(message)}</p>${actionLabel ? `<button type="button" class="btn" data-toast-action>${esc(actionLabel)}</button>` : ''}`;
  if (actionLabel) el.querySelector('[data-toast-action]').addEventListener('click', () => { dismissToast(el); onAction?.(); });
  armToast(el, timeout);
}
function armToast(el, timeout) { clearTimeout(toastTimer); toastTimer = setTimeout(() => dismissToast(el), timeout); }
function dismissToast(el) {
  if (!el.isConnected || el.classList.contains('is-leaving')) return;
  el.classList.add('is-leaving');
  const done = () => el.remove();
  el.addEventListener('transitionend', done, { once: true });
  setTimeout(done, cssMs('--d-toast', 220) + 80);
}
/** An inline Undo makes the matching toast stale, so close it. */
function dismissCurrentToast() { const el = document.querySelector('#toasts .toast:not(.is-leaving)'); if (el) dismissToast(el); }
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
  const attrs = ['data-action', 'data-input', 'data-id', 'data-delta', 'data-window', 'data-filter', 'data-view', 'data-kind', 'data-key'];
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

/* ---------------- rendering ---------------- */
function renderShell() {
  const r = app.route;
  const tabFor = { tonight: 'bars', venue: 'bars', pass: 'bars', groups: 'groups', groupNew: 'groups', scan: 'scan', points: 'points', passes: 'points', passDetail: 'points', profile: 'profile', saved: 'profile', console: 'profile', about: 'profile' };
  document.querySelectorAll('[data-tab]').forEach((a) => {
    if (a.dataset.tab === tabFor[r.name]) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const tonightTab = document.querySelector('[data-tab="bars"]');
  if (tonightTab) tonightTab.setAttribute('href', app.lastExploreHash);
  updateBadge();
  syncSearchButton();
  const slot = document.getElementById('demo-slot');
  if (!slot.firstElementChild) slot.innerHTML = demoChip(now());
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
    case 'groups': return renderGroups(c);
    case 'groupNew': return renderGroupNew(c, app.groupDraft ?? newGroupDraft(), app.groupErrors);
    case 'scan': return renderScan(c, app.scan);
    case 'points': return renderPoints(c);
    case 'profile': return renderProfile(c, app.profileEdit);
    default:
      return `<div class="page"><div class="state"><div class="state-icon">${icon('help')}</div><h1 id="page-h" tabindex="-1">Page not found</h1><p>That link doesn’t match anything in this demo.</p><div class="actions"><a class="btn btn-primary" href="#/">Go to bars</a></div></div></div>`;
  }
}

/** scroll: 'restore' (Back/Forward), 'top' (new navigation) or 'keep' (in-place refresh). */
function render({ focus = 'heading', scroll = 'keep' } = {}) {
  renderShell();
  const main = document.getElementById('main');
  main.innerHTML = mainHtml();
  app.renderedHash = location.hash || '#/';
  const banners = document.getElementById('explore-banners');
  if (banners) banners.dataset.sig = exploreBanners(ctx());
  const h1 = main.querySelector('h1');
  document.title = `${h1 ? `${h1.textContent.trim()} · ` : ''}Night Out (demo)`;
  syncSheet();
  if (scroll === 'restore') window.scrollTo(0, app.scroll.get(app.renderedHash) ?? 0);
  else if (scroll === 'top') window.scrollTo(0, 0);
  if (focus === 'heading') {
    pageHeading()?.focus({ preventScroll: true });
  } else if (focus === 'venue' && app.lastVenueId) {
    const link = document.querySelector(`[data-nav-venue="${CSS.escape(app.lastVenueId)}"]`);
    (link ?? pageHeading())?.focus({ preventScroll: true });
  }
}

function updateBanners() {
  const banners = document.getElementById('explore-banners');
  if (!banners) return;
  const html = exploreBanners(ctx());
  // Only replace when the content changes, so role="alert" banners aren't re-announced on every keystroke.
  if (banners.dataset.sig !== html) { banners.innerHTML = html; banners.dataset.sig = html; }
}
const listHeading = () => document.getElementById('page-h');
function renderResultsOnly({ announceCount = true } = {}) {
  const results = document.getElementById('results');
  if (!results) return;
  preserveFocus(() => {
    results.innerHTML = exploreResults(ctx());
    results.setAttribute('aria-busy', String(app.ui.loading));
    updateBanners();
    const clearBtn = document.querySelector('[data-action="clear-search"].clear');
    if (clearBtn) clearBtn.hidden = !app.explore.q;
    document.querySelectorAll('[data-action="toggle-filter"]').forEach((b) => {
      const on = app.explore.filters.includes(b.dataset.filter);
      b.setAttribute('aria-pressed', String(on));
      b.innerHTML = `${on ? icon('check') : ''}${esc(FILTERS.find((f) => f.id === b.dataset.filter).label)}`;
    });
    const chips = document.querySelector('.chips');
    const clearAll = chips?.querySelector('.chip-clear');
    if (app.explore.filters.length) {
      if (clearAll) clearAll.textContent = `Clear all (${app.explore.filters.length})`;
      else chips.insertAdjacentHTML('beforeend', `<button type="button" class="chip chip-clear" data-action="clear-filters">Clear all (${app.explore.filters.length})</button>`);
    } else clearAll?.remove();
  }, listHeading);
  if (announceCount && !app.ui.loading) {
    const { total } = exploreList(app.venues, app.explore, now(), savedSet());
    announce(total ? `${total} venue${total === 1 ? '' : 's'} shown` : 'No venues match');
  }
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
function route({ viaPop = false } = {}) {
  const prev = app.route;
  app.visit += 1;
  // Record the rendered hash now: a view transition renders asynchronously, and the hashchange that
  // follows a popstate must not route a second time.
  app.renderedHash = location.hash || '#/';
  app.route = parseHash(location.hash);
  const r = app.route;
  const entry = history.state ?? {};
  const isListRoute = (name) => ['tonight', 'venue', 'pass'].includes(name);
  const hasExploreQuery = EXPLORE_KEYS.some((k) => r.query[k]);
  if (r.name === 'tonight' || (isListRoute(r.name) && hasExploreQuery)) {
    app.explore = exploreStateFromQuery(r.query, FILTER_IDS, SORT_IDS);
    if (app.explore.q || app.explore.filters.length) app.ui.searchOpen = true;
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
      const labels = { saved: 'Saved', passes: 'Passes', passDetail: 'Pass', console: 'Console', about: 'About' };
      app.venueBack = labels[prev.name] ? { label: labels[prev.name], href: buildHash(prev.name, prev.params, prev.query) } : null;
    } else if (prev.name === 'tonight') app.venueBack = null;
  }
  if (isListRoute(r.name)) history.replaceState({ ...(history.state ?? {}), idx: histIdx(), back: r.name === 'tonight' ? null : app.venueBack ?? null, explore: { ...app.explore } }, '');
  if (r.name === 'console' && r.query.venue) app.console.venueId = r.query.venue;
  if (r.name === 'groupNew' && !app.groupDraft) { app.groupDraft = newGroupDraft(); app.groupErrors = {}; }
  if (r.name !== 'profile') app.profileEdit = { editing: false, errors: {} };
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

  const backToList = viaPop && r.name === 'tonight' && prev?.name === 'venue';
  const toDetail = !viaPop && r.name === 'venue' && prev?.name === 'tonight';
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
  if ((toDetail || backToList) && document.startViewTransition && !reducedMotion()) {
    const id = app.lastVenueId;
    const art = (sel) => document.querySelector(`${sel} > svg`);
    const from = toDetail ? art(`[data-thumb="${CSS.escape(id)}"]`) : art(`[data-hero="${CSS.escape(id)}"]`);
    if (from) from.style.viewTransitionName = 'venue-art';
    let to = null;
    const t = document.startViewTransition(() => {
      if (from) from.style.viewTransitionName = '';
      doRender();
      to = toDetail ? art(`[data-hero="${CSS.escape(id)}"]`) : art(`[data-thumb="${CSS.escape(id)}"]`);
      if (to) to.style.viewTransitionName = 'venue-art';
    });
    activeVT = t;
    t.ready.catch(() => {}); // a skipped transition (e.g. superseded or tab hidden) is fine: the DOM still updates
    t.finished.catch(() => {}).finally(() => {
      if (activeVT !== t) return;
      activeVT = null;
      [from, to].forEach((el) => { if (el) el.style.viewTransitionName = ''; });
    });
  } else {
    doRender();
  }
}

/* ---------------- simulated fetch (loading / error / offline) ---------------- */
let fetchTimer = null;
function simulateFetch({ initial = false } = {}) {
  if (isOffline()) {
    app.ui.loading = false;
    if (initial) app.ui.lastRefreshAt = app.ui.lastRefreshAt ?? app.state.syncAt ?? null;
    renderResultsOnly();
    if (!initial) toast('You’re offline (simulated). Showing the last estimates; they keep aging.');
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
function tick() {
  const n = now();
  document.querySelectorAll('[data-demo-time]').forEach((el) => { el.textContent = formatTime(n); });
  document.querySelectorAll('[data-elapsed]').forEach((el) => { el.textContent = String(Math.max(0, Math.floor((n - Number(el.dataset.elapsed)) / 60000))); });
  const byId = new Map(app.venues.map((v) => [v.id, v]));
  document.querySelectorAll('[data-est]').forEach((el) => {
    const v = byId.get(el.dataset.est);
    if (!v) return;
    const before = el.dataset.tone;
    const variant = el.dataset.variant;
    const html = variant === 'status' ? cardStatus(v, n) : variant === 'vstatus' ? venueStatus(v, n) : variant === 'sr' ? srSummary(v, n)
      : variant === 'ring' ? estimateRing(v, n, { size: Number(el.dataset.size) || 56 })
      : el.dataset.variant === 'block'
      ? estimateBlock(v, n, { headingId: el.getAttribute('aria-labelledby') || 'qb-h', showHow: !!el.querySelector('details.how'), headingLevel: Number(el.dataset.level) || 2 })
      : estimateCompact(v, n);
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    const fresh = tpl.content.firstElementChild;
    const ringMoved = el.dataset.variant === 'ring' && el.innerHTML !== fresh.innerHTML; // the arc empties as the update ages
    if (ringMoved || fresh.dataset.tone !== before || el.textContent.replace(/\s+/g, ' ') !== fresh.textContent.replace(/\s+/g, ' ')) {
      const openDetails = el.querySelector('details.how')?.open;
      const hadFocus = el.contains(document.activeElement);
      el.replaceWith(fresh);
      if (openDetails) fresh.querySelector('details.how')?.setAttribute('open', '');
      if (hadFocus) fresh.querySelector('summary')?.focus({ preventScroll: true });
    }
  });
  document.querySelectorAll('[data-deal-for]').forEach((slot) => {
    const v = byId.get(slot.dataset.dealFor);
    const html = v ? dealTag(v, n) : '';
    if (slot.innerHTML !== html) slot.innerHTML = html;
  });
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

let sheetDrag = null;
function syncSheet() {
  const dlg = document.getElementById('sheet');
  const wantOpen = app.route?.name === 'pass' && app.passFlow;
  if (!wantOpen) {
    if (dlg.open) closeSheetAnimated();
    return;
  }
  if (sheetClosing) {
    clearTimeout(sheetClosing.t);
    dlg.removeEventListener('animationend', sheetClosing.onEnd);
    sheetClosing = null;
    dlg.classList.remove('is-closing');
    dlg.style.transform = '';
  }
  renderSheet();
  if (!dlg.open) {
    dlg.classList.remove('is-closing');
    dlg.showModal();
    const auto = dlg.querySelector('[data-autofocus]') || dlg.querySelector('input:checked:not(:disabled)') || dlg.querySelector('input:not(:disabled), button:not(:disabled)');
    auto?.focus();
  }
}
function renderSheet() {
  const dlg = document.getElementById('sheet');
  const { title, body, foot } = renderPassSheet(ctx(), app.passFlow);
  const prevScroll = dlg.querySelector('.sheet-body')?.scrollTop ?? 0;
  preserveFocus(() => {
    dlg.innerHTML = `<div class="sheet-head">
        <button type="button" class="sheet-grabber" data-action="close-sheet" aria-label="Close (or drag down)"></button>
        <h2 class="sheet-title" id="sheet-title">${esc(title)}</h2>
        <button type="button" class="icon-btn sheet-close" data-action="close-sheet" aria-label="Close">${icon('x')}</button>
      </div>
      <div class="sheet-body">${body}</div>
      <div class="sheet-foot">${foot}</div>`;
    dlg.setAttribute('aria-labelledby', 'sheet-title');
  }, () => (dlg.open ? dlg.querySelector('[data-autofocus]') || dlg.querySelector('input[name="win"]:checked:not(:disabled)') || dlg.querySelector('input:not(:disabled), button:not(:disabled)') : null));
  const sb = dlg.querySelector('.sheet-body');
  if (sb) sb.scrollTop = prevScroll;
}
let sheetClosing = null;
function closeSheetAnimated() {
  const dlg = document.getElementById('sheet');
  if (!dlg.open || sheetClosing) return;
  const finish = () => {
    if (!sheetClosing) return;
    clearTimeout(sheetClosing.t);
    dlg.removeEventListener('animationend', sheetClosing.onEnd);
    sheetClosing = null;
    dlg.classList.remove('is-closing');
    dlg.style.transform = '';
    if (dlg.open) dlg.close();
    dlg.innerHTML = '';
    // Desktop re-renders the detail pane under the sheet, so the trigger may be gone: put focus back on it.
    if (!document.activeElement || document.activeElement === document.body) {
      (document.querySelector('#main [data-nav="pass"]') || pageHeading())?.focus({ preventScroll: true });
    }
  };
  const onEnd = (e) => { if (e.target === dlg) finish(); };
  sheetClosing = { t: setTimeout(finish, cssMs('--d-sheet-out', 220) + 60), onEnd };
  dlg.addEventListener('animationend', onEnd);
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
  if (!f.ack) f.errors.ack = 'Check the box to confirm this is a demo pass.';
  if (Object.keys(f.errors).length) {
    renderSheet();
    const first = document.querySelector(f.errors.window ? '#sheet input[name="win"]:not(:disabled)' : '#sheet [data-input="pass-ack"]');
    first?.focus();
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
  setTimeout(() => {
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
    if (isOffline() || app.state.sim.failNextPass) {
      f.errorKind = isOffline() ? 'offline' : 'server';
      if (f.errorKind === 'server') { app.state.sim.failNextPass = false; persist(); }
      f.step = 'error';
      if (inSheet()) { renderSheet(); focusSheetResult(); } else finishAway(`The demo pass for ${v?.name ?? 'that venue'} wasn’t created (simulated failure). Nothing was charged.`);
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
      } else finishAway('That priority window filled up before the demo pass was created. Nothing was charged.');
      return;
    }
    const pass = createPass({ opId: f.opId, venue: v, win, party: f.party, now: now() });
    app.state.passes.push(pass);
    persist();
    rebuild();
    f.passId = pass.id;
    f.step = 'done';
    updateBadge();
    if (inSheet()) { renderSheet(); focusSheetResult(); return; }
    finishAway(`Demo pass created for ${v.name}. No charge. Not valid for entry.`, { actionLabel: 'View pass', onAction: () => go(buildHash('passDetail', { id: pass.id })) });
    if (app.route.name === 'passes') render({ focus: 'none' });
  }, 900);
}
function focusSheetResult() { document.querySelector('#sheet [data-autofocus]')?.focus(); }

/* ---------------- saves ---------------- */
function toggleSave(id) {
  const v = app.venues.find((x) => x.id === id);
  const idx = app.state.saved.indexOf(id);
  if (idx === -1) {
    app.state.saved.push(id);
    persist();
    refreshCurrent();
    toast(`Saved ${v?.name ?? 'venue'}`);
  } else {
    app.state.saved.splice(idx, 1);
    persist();
    app.ui.lastRemoved = { id, idx, name: v?.name ?? 'Venue', visit: app.visit };
    refreshCurrent({ removedId: id });
    toast(`Removed ${v?.name ?? 'venue'} from Saved`, { actionLabel: 'Undo', onAction: () => undoRemove() });
  }
}
function undoRemove() {
  const r = app.ui.lastRemoved;
  if (!r) return;
  app.ui.lastRemoved = null;
  dismissCurrentToast();
  if (!app.state.saved.includes(r.id)) app.state.saved.splice(Math.min(r.idx, app.state.saved.length), 0, r.id);
  persist();
  refreshCurrent();
  document.querySelector(`[data-action="toggle-save"][data-id="${CSS.escape(r.id)}"]`)?.focus();
  announce(`${r.name} restored to Saved`);
}
function refreshCurrent({ removedId } = {}) {
  const r = app.route.name;
  if (r === 'saved') {
    const rows = [...document.querySelectorAll('[data-venue-row]')].map((el) => el.dataset.venueRow);
    const i = removedId ? rows.indexOf(removedId) : -1;
    const y = window.scrollY;
    render({ focus: 'none' });
    window.scrollTo(0, y);
    if (removedId) {
      const remaining = [...document.querySelectorAll('[data-venue-row] [data-nav-venue]')];
      (remaining[Math.min(i, remaining.length - 1)] ?? document.getElementById('page-h'))?.focus({ preventScroll: true });
    }
    return;
  }
  // Update save buttons in place everywhere else.
  document.querySelectorAll('[data-action="toggle-save"]').forEach((b) => {
    const on = app.state.saved.includes(b.dataset.id);
    const name = app.venues.find((v) => v.id === b.dataset.id)?.name ?? '';
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', `Save ${name}`);
    b.innerHTML = icon(on ? 'bookmarkFill' : 'bookmark');
  });
  const listVisible = r === 'tonight';
  if (listVisible && app.explore.filters.includes('saved')) renderResultsOnly();
}

/* ---------------- console ---------------- */
function consoleVenue() {
  const id = app.console.venueId && app.venues.some((v) => v.id === app.console.venueId) ? app.console.venueId : app.venues[0]?.id;
  return app.venues.find((v) => v.id === id);
}
function consoleDraft() {
  const v = consoleVenue();
  // Unsaved door edits are kept per venue, so switching venues doesn't discard them.
  return (app.console.drafts[v.id] ??= draftFrom(v));
}
function rerenderPage(fallback) {
  preserveFocus(() => {
    const y = window.scrollY;
    document.getElementById('main').innerHTML = mainHtml();
    window.scrollTo(0, y);
  }, fallback);
}
function rerenderConsole() {
  preserveFocus(() => {
    const y = window.scrollY;
    document.getElementById('main').innerHTML = mainHtml();
    window.scrollTo(0, y);
  });
}
function updateConsoleHint() {
  const d = consoleDraft();
  const el = document.getElementById('console-hint');
  if (el) el.textContent = consoleHint(d, now());
  document.querySelector('[data-action="console-publish"]')?.setAttribute('aria-disabled', String(!draftReady(d)));
}
/* ---------------- deals posted from the console ---------------- */
const dealDraft = () => (app.console.dealDraft ??= newDealDraft());
function postDeal() {
  const v = consoleVenue();
  const d = dealDraft();
  const { errors, title } = checkDeal(d);
  const startsAt = atNight(app.state.clock.base, d.start[0], d.start[1]);
  const endsAt = atNight(app.state.clock.base, d.end[0], d.end[1]);
  if (!errors.time && endsAt <= now()) errors.time = 'That end time has already passed tonight (demo time).';
  app.console.dealErrors = errors;
  if (Object.keys(errors).length) {
    rerenderConsole();
    const first = ['kind', 'title', 'item', 'price', 'costOk', 'time'].find((k) => errors[k]);
    const id = { title: 'deal-title', item: 'deal-item', price: 'deal-price', costOk: 'deal-cost', time: 'deal-start' }[first];
    document.getElementById(id)?.focus();
    announce(errors[first]);
    return;
  }
  const deal = { id: `deal-${refCode(`${v.id}${Date.now()}`).toLowerCase()}`, venueId: v.id, kind: d.kind, title, startsAt, endsAt, postedAt: now(), ...(d.kind === 'drink' ? { item: d.item, price: Number(d.price) } : {}) };
  app.state.deals.unshift(deal);
  audit(v, `Posted deal: ${title} (${formatTime(startsAt)}–${formatTime(endsAt)})`);
  persist();
  rebuild();
  app.console.dealDraft = { ...newDealDraft(), kind: d.kind };
  rerenderConsole();
  toast(`Deal posted for ${v.name} (demo). Guests see it on the card while it runs.`);
}
function removeDeal(id) {
  const i = app.state.deals.findIndex((x) => x.id === id);
  if (i < 0) return;
  const [gone] = app.state.deals.splice(i, 1);
  const v = app.venues.find((x) => x.id === gone.venueId);
  if (v) audit(v, `Removed deal: ${gone.title}`);
  persist();
  rebuild();
  rerenderConsole();
  document.getElementById('deal-h')?.focus?.();
  toast(`Deal removed: ${gone.title}`, { actionLabel: 'Undo', onAction: () => { app.state.deals.splice(i, 0, gone); persist(); rebuild(); rerenderConsole(); announce('Deal restored'); } });
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
  preserveFocus(() => render({ focus: 'none' }));
  toast(kind === 'demo' ? 'Demo venues restored' : kind === 'worst' ? 'Worst-case data loaded' : 'Empty dataset loaded');
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
  app.console = { venueId: null, drafts: {}, dealDraft: null, dealErrors: {} };
  app.scan = freshScan();
  app.groupDraft = null;
  app.profileEdit = { editing: false, errors: {} };
  app.ui = { loading: false, refreshError: false, lastRefreshAt: now(), searchOpen: false, mapSelected: null, staleNotice: null, lastRemoved: null, clearedQueue: null, resetSnapshot: { state: snapshot, visit: app.visit } };
  render({ focus: 'heading' });
  toast('Demo reset: saved venues, passes, console changes and the demo clock are back to the start.', { actionLabel: 'Undo', onAction: undoReset });
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
  toast('Reset undone. Your demo data is back.');
}

function restorePass(id) {
  const p = app.state.passes.find((x) => x.id === id);
  if (!p || !p.cancelledAt) return;
  dismissCurrentToast();
  const v = app.venues.find((x) => x.id === p.venueId);
  const w = v?.pass?.windows.find((x) => x.id === p.windowId);
  if (!w || w.remaining < p.party || now() >= p.windowEnd) { toast('Can’t restore: that window has ended or filled up.'); return; }
  p.cancelledAt = null; persist(); rebuild(); render({ focus: 'heading' });
  toast(`Demo pass for ${p.venueName} restored.`);
}
function undoClear() {
  const c = app.ui.clearedQueue;
  if (!c) return;
  dismissCurrentToast();
  const o = { ...(app.state.overrides[c.venueId] ?? {}) };
  if (c.prevOverride && 'queue' in c.prevOverride) o.queue = c.prevOverride.queue; else delete o.queue;
  if (Object.keys(o).length) app.state.overrides[c.venueId] = o; else delete app.state.overrides[c.venueId];
  app.ui.clearedQueue = null;
  const v = app.venues.find((x) => x.id === c.venueId);
  if (v) audit(v, 'Restored the previous estimate');
  persist(); rebuild(); delete app.console.drafts[c.venueId]; rerenderConsole();
  toast('Previous estimate restored.');
}

/* ---------------- groups ---------------- */
function newGroupDraft() {
  const first = app.venues.find((v) => v.id === app.lastVenueId) ?? [...app.venues].sort((a, b) => a.name.localeCompare(b.name))[0];
  return { title: '', venueId: first?.id ?? '', time: '22:30', spots: 4, note: '', handle: app.state.profile.handle || '' };
}
function postGroup() {
  const d = app.groupDraft ?? newGroupDraft();
  app.groupErrors = validateGroup(d);
  if (Object.keys(app.groupErrors).length) {
    rerenderPage();
    document.querySelector(app.groupErrors.title ? '#g-title' : '#g-ig')?.focus();
    return;
  }
  const [h, m] = d.time.split(':').map(Number);
  const group = {
    id: `u-${Date.now().toString(36)}`, title: d.title.trim(), venueId: d.venueId, startsAt: atNight(app.state.clock.base, h, m),
    spots: d.spots, going: 1, note: d.note.trim(), mine: true,
    host: { name: app.state.profile.name, handle: d.handle.replace(/^@/, ''), hue: 220 },
  };
  app.state.groups.created.unshift(group);
  persist();
  app.groupDraft = null;
  app.groupErrors = {};
  go('#/groups', { replace: true });
  toast('Group posted. Demo: it stays on this device and no one else sees it.');
}
function toggleJoin(id) {
  const joined = app.state.groups.joined;
  const i = joined.indexOf(id);
  const g = app.groups.find((x) => x.id === id);
  if (i === -1) {
    joined.push(id);
    toast(`You joined ${g ? `${g.host.name.split(' ')[0]}’s group` : 'the group'}. Demo: no one is notified.`);
  } else {
    joined.splice(i, 1);
    toast('You left the group.');
  }
  persist();
  rerenderPage();
}

/* ---------------- scan: line reports ---------------- */
const MIN_MS = 60000;
const round5 = (n) => Math.max(0, Math.round(n / 5) * 5);
function submitReport() {
  const f = app.scan;
  if (!f.captured || !f.bucket) {
    f.error = !f.captured ? 'Take a photo of the line first.' : 'Pick about how many people are in line.';
    rerenderPage();
    return;
  }
  const v = app.venues.find((x) => x.id === f.venueId);
  const b = LINE_BUCKETS.find((x) => x.id === f.bucket);
  const at = now();
  const id = `r-${Date.now().toString(36)}`;
  app.state.reports.unshift({ id, venueId: v.id, at, bucket: b.id, inLine: f.inLine, gotInAt: null, waitMin: null });
  // The report becomes this bar's crowd estimate (demo). A known door pace is kept; otherwise the wait stays unknown.
  const prev = v.queue;
  const rate = Number.isFinite(prev?.admitPerMin) && prev.admitPerMin > 0 ? prev.admitPerMin : null;
  const recentCrowd = prev?.sourceType === 'crowd' && prev.observedAt != null && at - prev.observedAt < 20 * MIN_MS;
  app.state.overrides[v.id] = { ...(app.state.overrides[v.id] ?? {}), queue: {
    sourceType: 'crowd', observedAt: at, reportCount: recentCrowd ? (prev.reportCount ?? 0) + 1 : 1,
    peopleLow: b.low, peopleHigh: b.high, admitPerMin: rate, doorStatus: 'moving',
  } };
  app.state.points.push({ id: `p-${id}`, at, delta: POINTS.REPORT, label: `Line report: ${v.name}` });
  if (f.inLine) app.state.activeWait = { reportId: id, venueId: v.id, startedAt: at };
  persist();
  rebuild();
  f.step = 'done';
  f.error = null;
  rerenderPage();
  document.querySelector('#main [data-autofocus]')?.focus();
  announce(`Report sent. Plus ${POINTS.REPORT} points.`);
}
function gotIn() {
  const w = app.state.activeWait;
  if (!w) return;
  const at = now();
  const waitMin = Math.max(1, Math.round((at - w.startedAt) / MIN_MS));
  const v = app.venues.find((x) => x.id === w.venueId);
  const r = app.state.reports.find((x) => x.id === w.reportId);
  if (r) { r.gotInAt = at; r.waitMin = waitMin; }
  // A measured wait from this guest refreshes the estimate (demo): a range around what they actually waited.
  const q = app.state.overrides[w.venueId]?.queue;
  if (q && q.sourceType === 'crowd') {
    app.state.overrides[w.venueId].queue = { ...q, observedAt: at, waitLow: Math.max(0, round5(waitMin) - 5), waitHigh: round5(waitMin) + 5 };
  }
  app.state.points.push({ id: `p-in-${w.reportId}`, at, delta: POINTS.GOT_IN, label: `Got in: ${v?.name ?? 'bar'} (${waitMin} min wait)` });
  app.state.activeWait = null;
  persist();
  rebuild();
  rerenderPage();
  pageHeading()?.focus({ preventScroll: true });
  toast(`You got in after ${waitMin} min. +${POINTS.GOT_IN} points.`);
}
function leftLine() {
  const w = app.state.activeWait;
  if (!w) return;
  const r = app.state.reports.find((x) => x.id === w.reportId);
  if (r) r.leftAt = now();
  app.state.activeWait = null;
  persist();
  rerenderPage();
  pageHeading()?.focus({ preventScroll: true });
  toast('Got it. You keep the points for your report.');
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
  rerenderPage();
  toast(`Redeemed ${r.title}. Demo code ${voucher.ref}: not valid anywhere.`, {
    actionLabel: 'Undo',
    onAction: () => {
      app.state.vouchers = app.state.vouchers.filter((x) => x.id !== vid);
      app.state.points = app.state.points.filter((x) => x.id !== entry.id);
      persist();
      if (app.route.name === 'points') rerenderPage();
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
    app.profileEdit = { editing: true, errors };
    rerenderPage();
    form.ownerDocument.querySelector(errors.name ? '#p-name' : '#p-ig')?.focus();
    return;
  }
  app.state.profile = { name, handle };
  persist();
  app.profileEdit = { editing: false, errors: {} };
  rerenderPage();
  document.querySelector('[data-action="edit-profile"]')?.focus();
  toast('Profile saved.');
}

/* ---------------- search panel (opened from the header icon) ---------------- */
function toggleSearch(open = !app.ui.searchOpen) {
  if (app.route.name !== 'tonight') { app.ui.searchOpen = true; go(app.lastExploreHash); return; }
  app.ui.searchOpen = open;
  const panel = document.getElementById('explore-search');
  if (panel) panel.hidden = !open;
  syncSearchButton();
  renderResultsOnly({ announceCount: false });
  if (open) document.getElementById('q')?.focus();
}
function syncSearchButton() {
  const btn = document.querySelector('[data-action="toggle-search"]');
  if (!btn) return;
  const onList = app.route?.name === 'tonight';
  btn.hidden = !onList;
  btn.setAttribute('aria-expanded', onList && app.ui.searchOpen ? 'true' : 'false');
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
    const tpl = document.createElement('template');
    tpl.innerHTML = pollSection(v, votes[venueId] ?? null).trim();
    box.replaceWith(tpl.content.firstElementChild);
    document.querySelector(`[data-action="vote"][data-id="${CSS.escape(venueId)}"][data-vote="${CSS.escape(vote)}"]`)?.focus();
  }
  const label = { going: 'Going', maybe: 'Maybe', no: 'Not tonight' }[vote];
  announce(votes[venueId] ? `Your answer: ${label}. Sample poll.` : 'Your answer was cleared.');
}
function openDirections(id) {
  const v = app.venues.find((x) => x.id === id);
  if (!v?.address) return;
  const dlg = document.getElementById('picker');
  dlg.innerHTML = directionsSheet(v);
  dlg.showModal();
  dlg.querySelector('.dir-links a')?.focus();
}
async function shareVenue(id) {
  const v = app.venues.find((x) => x.id === id);
  if (!v) return;
  const url = `${location.href.split('#')[0]}#/venue/${encodeURIComponent(v.id)}`;
  const est = estimateFor(v, now());
  const text = `${v.name}: ${est.headline} (Night Out demo, simulated wait)`;
  try {
    if (navigator.share) { await navigator.share({ title: `${v.name} · Night Out (demo)`, text, url }); return; }
    await navigator.clipboard.writeText(url);
    toast('Link copied.');
  } catch (err) {
    if (err?.name === 'AbortError') return; // the person closed the share sheet
    toast(`Couldn’t share. Link: ${url}`);
  }
}

/* ---------------- area picker ---------------- */
function openAreaPicker() {
  const dlg = document.getElementById('picker');
  dlg.innerHTML = areaSheet(app.explore.area);
  dlg.showModal();
  dlg.querySelector('input:checked')?.focus();
}
function chooseArea(id) {
  app.explore.area = id;
  updateExploreUrl();
  document.getElementById('picker').close();
  render({ focus: 'none' });
  document.querySelector('.area-pill')?.focus({ preventScroll: true });
  const { total } = exploreList(app.venues, app.explore, now(), savedSet());
  announce(`${total} bar${total === 1 ? '' : 's'} shown`);
}

/* ---------------- events ---------------- */
function onClick(e) {
  if (e.target.closest('a.skip')) { e.preventDefault(); document.getElementById('main').focus(); return; }
  const nav = e.target.closest('a[href^="#/"]');
  const actEl = e.target.closest('[data-action]');
  if (actEl && !actEl.disabled && actEl.getAttribute('aria-disabled') !== 'true') {
    const a = actEl.dataset.action;
    const handled = handleAction(a, actEl, e);
    if (handled !== false) { e.preventDefault(); return; }
  }
  if (nav && !e.defaultPrevented && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
    e.preventDefault();
    const href = nav.getAttribute('href');
    if (nav.closest('#sheet') && href.startsWith('#/passes')) {
      // Leaving the sheet for a pass: replace the sheet entry so Back returns to the venue.
      app.passFlow = null;
      document.getElementById('sheet').close();
      go(href, { replace: true });
      return;
    }
    go(href);
  }
}

function handleAction(a, el) {
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
      document.querySelector('[data-action="toggle-filter"]')?.focus();
      return true;
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
    case 'toggle-search': toggleSearch(); return true;
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
      if (preview) preview.innerHTML = v ? `<ul class="venue-list">${venueRow(v, now(), { saved: app.state.saved.includes(v.id) })}</ul>` : '<p class="hint">Select a pin to preview a venue. The list view shows the same venues.</p>';
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
      persist(); rebuild(); render({ focus: 'none' });
      (document.querySelector(`[data-action="restore-pass"][data-id="${CSS.escape(p.id)}"]`) || pageHeading())?.focus({ preventScroll: true });
      toast(`Demo pass for ${p.venueName} cancelled. Its spot went back to the venue’s inventory.`, { actionLabel: 'Undo', onAction: () => restorePass(p.id) });
      return true;
    }
    case 'restore-pass': restorePass(el.dataset.id); return true;
    case 'console-people': {
      const d = consoleDraft();
      d.people = Math.max(0, Math.min(400, (d.people ?? 0) + Number(el.dataset.delta)));
      Object.assign(d, rangeFor(d.people));
      rerenderConsole();
      announce(`About ${d.people} people in line. ${consoleHint(d, now())}`);
      return true;
    }
    case 'console-publish': {
      const v = consoleVenue();
      const d = consoleDraft();
      if (!draftReady(d)) {
        toast('Set the line size and door pace before publishing a wait.');
        document.querySelector(d.people == null ? '[data-action="console-people"][data-delta="5"]' : '#admit')?.focus();
        return true;
      }
      const before = v.queue;
      const queue = { sourceType: 'venue', observedAt: now(), peopleLow: d.peopleLow, peopleHigh: d.peopleHigh, admitPerMin: d.admitPerMin, doorStatus: d.doorStatus, note: d.note.trim() || undefined };
      app.state.overrides[v.id] = { ...(app.state.overrides[v.id] ?? {}), queue };
      const changes = diffQueue(before, queue);
      audit(v, `Published door update${changes.length ? `: ${changes.join('; ')}` : ' (no changes, timestamp refreshed)'}`);
      app.ui.clearedQueue = null;
      persist(); rebuild(); delete app.console.drafts[v.id]; rerenderConsole();
      toast(`Published. Guests now see “Venue update · just now” for ${v.name}.`);
      return true;
    }
    case 'console-clear': {
      const v = consoleVenue();
      const prevOverride = app.state.overrides[v.id] ? structuredClone(app.state.overrides[v.id]) : null;
      app.state.overrides[v.id] = { ...(app.state.overrides[v.id] ?? {}), queue: null };
      app.ui.clearedQueue = { venueId: v.id, prevOverride };
      audit(v, 'Cleared the estimate (guests see “Wait unknown”)');
      persist(); rebuild(); delete app.console.drafts[v.id]; rerenderConsole();
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
      toast('Demo clock moved forward 10 minutes. Estimates aged accordingly.');
      return true;
    case 'reset-demo': resetDemo(); return true;
    case 'age-ok':
      app.state.ageConfirmed = true; persist();
      document.getElementById('age-gate').close();
      pageHeading()?.focus();
      return true;
    case 'age-no':
      document.getElementById('age-body').innerHTML = '<h2 id="age-title" class="page-title age-title" tabindex="-1">This demo is for adults 21+</h2><p class="page-sub age-sub">It describes bars and nightlife, so it isn’t available to you. You can close this tab.</p>';
      document.getElementById('age-title').focus();
      return true;
    case 'open-area': openAreaPicker(); return true;
    case 'close-picker': document.getElementById('picker').close(); return true;
    case 'vote': castVote(el.dataset.id, el.dataset.vote); return true;
    case 'directions': openDirections(el.dataset.id); return true;
    case 'share': shareVenue(el.dataset.id); return true;
    case 'scroll-to': { const t = document.getElementById(el.dataset.target); if (t) { t.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }); t.focus({ preventScroll: true }); } return true; }
    case 'join-group': toggleJoin(el.dataset.id); return true;
    case 'ig-link': toast(`Opens instagram.com/${el.dataset.handle} in the real app. Links are off in this demo.`); return true;
    case 'group-spots': {
      const d = app.groupDraft ?? (app.groupDraft = newGroupDraft());
      d.spots = Math.max(2, Math.min(12, d.spots + Number(el.dataset.delta)));
      rerenderPage();
      announce(`Group size ${d.spots}`);
      return true;
    }
    case 'post-group': return false; // the form's submit handles it
    case 'scan-pick':
      Object.assign(app.scan, { venueId: el.dataset.id, captured: false, bucket: null, error: null });
      rerenderPage();
      document.querySelector('.shutter')?.focus();
      return true;
    case 'scan-change':
      Object.assign(app.scan, { venueId: null, captured: false, bucket: null, error: null });
      rerenderPage();
      document.getElementById('scan-q')?.focus();
      return true;
    case 'scan-shutter':
      app.scan.captured = true;
      app.scan.error = null;
      rerenderPage();
      document.querySelector('input[name="bucket"]')?.focus();
      announce('Photo captured (simulated). Now pick about how many people are in line.');
      return true;
    case 'scan-retake':
      app.scan.captured = false;
      rerenderPage();
      document.querySelector('.shutter')?.focus();
      return true;
    case 'scan-submit': submitReport(); return true;
    case 'scan-in': gotIn(); return true;
    case 'scan-left': leftLine(); return true;
    case 'scan-restart':
      app.scan = freshScan();
      rerenderPage();
      document.getElementById('scan-q')?.focus();
      return true;
    case 'redeem': redeem(el.dataset.id); return true;
    case 'edit-profile':
      app.profileEdit = { editing: !app.profileEdit.editing, errors: {} };
      rerenderPage();
      (app.profileEdit.editing ? document.getElementById('p-name') : document.querySelector('[data-action="edit-profile"]'))?.focus();
      return true;
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
    case 'console-admit': {
      const d = consoleDraft();
      d.admitPerMin = Number(t.value);
      t.removeAttribute('aria-valuetext');
      t.closest('.range-row').querySelector('output').textContent = String(d.admitPerMin);
      updateConsoleHint();
      break;
    }
    case 'console-note': consoleDraft().note = t.value; break;
    case 'deal-field': if (t.tagName === 'INPUT') dealDraft()[t.dataset.key] = t.value; break;
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

function onChange(e) {
  const t = e.target;
  switch (t.dataset.input) {
    case 'sort': app.explore.sort = t.value; updateExploreUrl(); renderResultsOnly(); break;
    case 'pass-window': app.passFlow.windowId = t.value; app.passFlow.errors = {}; renderSheet(); break;
    case 'pass-ack': app.passFlow.ack = t.checked; if (t.checked && app.passFlow.errors.ack) { delete app.passFlow.errors.ack; renderSheet(); } break;
    case 'console-venue':
      app.console.venueId = t.value;
      history.replaceState({ idx: histIdx() }, '', buildHash('console', {}, { venue: t.value }));
      app.renderedHash = location.hash;
      rerenderConsole();
      break;
    case 'console-door': consoleDraft().doorStatus = t.value; updateConsoleHint(); break;
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
    case 'area': chooseArea(t.value); break;
    case 'scan-bucket': app.scan.bucket = t.value; app.scan.error = null; rerenderPage(); break;
    case 'scan-inline': app.scan.inLine = t.checked; break;
    case 'pref':
      app.state.prefs[t.dataset.key] = t.checked;
      persist();
      toast(t.checked ? 'Wait-drop alerts on (demo: nothing is sent).' : 'Wait-drop alerts off.');
      break;
    case 'sim': {
      app.state.sim[t.dataset.key] = t.checked;
      persist();
      const labels = { offline: ['Offline simulation on', 'Back online (simulation off)'], failNextRefresh: ['Next refresh will fail', 'Refresh failure cleared'], failNextPass: ['Next pass request will fail', 'Pass failure cleared'] };
      toast(labels[t.dataset.key][t.checked ? 0 : 1]);
      break;
    }
    default: break;
  }
}

function onSubmit(e) {
  e.preventDefault();
  if (e.target.id === 'pass-form') submitPass();
  if (e.target.id === 'door-form') handleAction('console-publish', e.target);
  if (e.target.id === 'deal-form') postDeal();
  if (e.target.id === 'group-form') postGroup();
  if (e.target.id === 'profile-form') saveProfile(e.target);
}

/* sheet: Escape, backdrop click, drag-to-dismiss (with button alternatives) */
function wireSheet() {
  const dlg = document.getElementById('sheet');
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); requestCloseSheet(); });
  // Chromium may force-close a modal on a repeated Escape. Never let that hide an in-flight pass request.
  dlg.addEventListener('close', () => {
    if (sheetClosing || app.route?.name !== 'pass' || app.passFlow?.step !== 'pending') return;
    dlg.showModal();
    dlg.querySelector('.sheet-foot button')?.focus();
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) requestCloseSheet(); });
  // Drag-to-dismiss on the grabber (mobile). Buttons remain the primary, single-pointer way to close.
  let snap = null;
  let suppressClickUntil = 0;
  dlg.addEventListener('click', (ev) => { if (performance.now() < suppressClickUntil) { ev.stopPropagation(); ev.preventDefault(); } }, true);
  dlg.addEventListener('pointerdown', (e) => {
    if (sheetDrag || !e.target.closest('.sheet-grabber')) return;
    let base = 0;
    if (snap) { base = new DOMMatrix(getComputedStyle(dlg).transform).m42; snap.cancel(); snap = null; dlg.style.transform = `translateY(${base}px)`; }
    const t = performance.now();
    sheetDrag = { id: e.pointerId, y0: e.clientY, base, dy: base, moved: false, last: { y: e.clientY, t, v: 0 } };
    e.target.setPointerCapture(e.pointerId);
  });
  dlg.addEventListener('pointermove', (e) => {
    if (!sheetDrag || e.pointerId !== sheetDrag.id) return;
    const raw = sheetDrag.base + (e.clientY - sheetDrag.y0);
    sheetDrag.dy = raw < 0 ? raw * 0.2 : raw; // resist dragging upward
    if (Math.abs(raw - sheetDrag.base) > 4) sheetDrag.moved = true;
    const t = performance.now();
    sheetDrag.last = { y: e.clientY, t, v: (e.clientY - sheetDrag.last.y) / Math.max(1, t - sheetDrag.last.t) };
    dlg.style.transform = `translateY(${sheetDrag.dy}px)`;
  });
  const end = (e) => {
    if (!sheetDrag || e.pointerId !== sheetDrag.id) return;
    const { dy, moved, last } = sheetDrag;
    sheetDrag = null;
    if (!moved) { dlg.style.transform = ''; return; }
    if (e.type === 'pointerup') suppressClickUntil = performance.now() + 350;
    const dismiss = e.type === 'pointerup' && (dy > 120 || last.v > 0.11) && app.passFlow?.step !== 'pending';
    if (dismiss) { requestCloseSheet(); return; } // exit animation starts from the current drag offset
    snap = dlg.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: reducedMotion() ? 0 : cssMs('--d-sheet-out', 220), easing: getComputedStyle(document.documentElement).getPropertyValue('--ease-sheet').trim() || 'ease-out' });
    dlg.style.transform = '';
    snap.finished.then(() => { snap = null; }).catch(() => {});
  };
  dlg.addEventListener('pointerup', end);
  dlg.addEventListener('pointercancel', end);
}

/* ---------------- boot ---------------- */
function boot() {
  init();
  history.scrollRestoration = 'manual';
  if (history.state?.idx == null) history.replaceState({ idx: 0 }, '', location.hash || '#/');
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
  document.addEventListener('submit', onSubmit);
  window.addEventListener('popstate', () => { rememberScroll(); route({ viaPop: true }); });
  window.addEventListener('hashchange', () => {
    const h = location.hash;
    if (h && h !== '#' && !h.startsWith('#/')) return; // e.g. #main from the skip link
    if ((h || '#/') !== app.renderedHash) { rememberScroll(); route({ viaPop: true }); }
  });
  window.addEventListener('online', () => { if (app.route.name === 'tonight' || app.route.name === 'venue') simulateFetch(); });
  window.addEventListener('offline', () => renderResultsOnly());
  wireSheet();
  route();
  setInterval(tick, 15_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  if (!app.state.ageConfirmed) {
    const gate = document.getElementById('age-gate');
    gate.addEventListener('cancel', (e) => e.preventDefault());
    // Chromium may close a modal opened without user activation on Escape; reopen until confirmed.
    gate.addEventListener('close', () => { if (!app.state.ageConfirmed) gate.showModal(); });
    gate.showModal();
  }
  document.documentElement.dataset.ready = 'true';
  if (new URLSearchParams(location.search).has('qa')) {
    // QA-only hook (used by app/QA.md checks): age estimates while a page stays open.
    window.__doorlineQA = { advance: (min) => { app.state.clock = advance(app.state.clock, min); persist(); rebuild(); tick(); } };
  }
}

boot();
