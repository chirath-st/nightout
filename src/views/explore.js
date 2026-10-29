import { exploreList, FILTERS, AREAS, areaLabel, isOpenAt } from '../lib/explore.js';
import { esc, mapCard, venueCard, stateBox, banner, estimateFor, venuePhoto, promoLabel, promoItem, meter, crowdStatus } from '../ui/components.js';
import { icon, TONE_LABEL } from '../ui/icons.js';
import { formatTime } from '../lib/clock.js';
import { distanceTo, originLabel, usingDeviceLocation } from '../lib/geo.js';
import { dealState } from '../lib/deals.js';
import { monogram } from '../ui/art.js';
import { LIVE } from '../lib/backend.js';

// Schematic positions (percent of the map box), roughly by street. Not to scale; no distances implied.
// Laid out in columns at least 80 px apart at 320 px so no two pins overlap.
const PIN_POS = {
  // Easton Ave runs top right (low numbers, near the station) to bottom left on this sketch.
  'thirty-burgers': [84, 12], evelyns: [62, 22], 'stuff-yer-face': [84, 32], 'pitch-social': [62, 42],
  'olde-queens': [84, 52], 'scarlet-pub': [62, 62], 'hueys-knight-club': [40, 72],
  // Side streets
  'olive-branch': [18, 40], 'the-vine': [18, 56], 'ale-n-wich': [18, 84],
  // Worst-case fixture rows get their own spots so no pin hides another.
  'worst-long-name': [40, 90], 'worst-one': [84, 90], 'worst-missing': [40, 22],
};
/** Unknown ids get a deterministic spot from their id instead of all stacking on one point. */
function pinPos(id) {
  if (PIN_POS[id]) return PIN_POS[id];
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return [15 + (h % 70), 15 + ((h >>> 8) % 70)];
}

/** Sort row (team ask, 2026-10-17: "cleaner and simplified"): one segmented control, no counts. "Deals" shows only
 * bars with a live deal, nearest first. A filter or A–Z order set by an older link shows as one removable chip. */
export const QUICK_VIEWS = Object.freeze([['near', 'Nearest'], ['wait', 'Shortest line'], ['deals', 'Deals']]);
export const quickViewOf = ({ sort, filters }) => (filters.includes('deals') ? 'deals' : sort === 'wait' ? 'wait' : sort === 'name' ? null : 'near');

/** The switch itself. The ink layer repeats the labels in black on white and is clipped to the selected segment, so the
 *  pill glides over unequal widths with its labels exactly inverted (main.js placeSegInk). */
export function sortSeg(ctx) {
  const current = quickViewOf(ctx.explore);
  return `<div class="sort-seg" role="group" aria-label="Show bars">${QUICK_VIEWS.map(([id, label]) => `<button type="button" data-action="quick-view" data-view="${id}" aria-pressed="${current === id}">${label}</button>`).join('')}<span class="seg-ink" aria-hidden="true">${QUICK_VIEWS.map(([, label]) => `<span>${label}</span>`).join('')}</span></div>`;
}
/** A filter or A–Z order from an older link: one removable chip each, after the switch. */
export function extraChips(ctx) {
  const extra = FILTERS.filter((f) => f.id !== 'deals' && ctx.explore.filters.includes(f.id))
    .map((f) => `<button type="button" class="chip chip-x" data-action="toggle-filter" data-filter="${f.id}" aria-label="Remove filter: ${esc(f.label)}">${esc(f.label)}${icon('x', { size: 14 })}</button>`);
  if (ctx.explore.sort === 'name') extra.push(`<button type="button" class="chip chip-x" data-action="quick-view" data-view="near" aria-label="Remove A–Z order">A–Z${icon('x', { size: 14 })}</button>`);
  return extra.join('');
}
export const exploreChips = (ctx) => sortSeg(ctx) + extraChips(ctx);

/** One compact row (team ask, 2026-10-18: "smaller, take up less space"): the sort switch, a search button and the
 *  Map toggle. Search opens in place of the row and stays open while there is a query. Both rows share one grid cell
 *  and stay in layout (hidden with visibility), so the field can grow out of the search button (QA plan 6.1). */
export function exploreControls(ctx) {
  const { q, view } = ctx.explore;
  const open = !!(ctx.ui.searchOpen || q);
  return `<div id="explore-search" class="search-panel${open ? ' is-open' : ''}">
    <div class="chips">${exploreChips(ctx)}</div>
    <button type="button" class="tool-btn search-toggle" data-action="open-search" aria-label="Search bars" aria-expanded="${open}" aria-controls="q">${icon('search')}</button>
    <button type="button" class="tool-btn map-btn" id="map-toggle" data-action="set-view" data-view="${view === 'map' ? 'list' : 'map'}" aria-pressed="${view === 'map'}" aria-label="Map view"><span class="ic-stack" aria-hidden="true">${icon('map', { cls: 'ic-map' })}${icon('list', { cls: 'ic-list' })}</span></button>
    <div class="search-row">
      <div class="search" role="search">
        ${icon('search')}
        <label for="q" class="sr-only">Search bars by name or street</label>
        <input id="q" type="search" inputmode="search" enterkeyhint="search" autocomplete="off" spellcheck="false" name="q" placeholder="Search bars" value="${esc(q)}" data-input="search">
        <button type="button" class="icon-btn clear" data-action="clear-search" aria-label="Clear search" ${q ? '' : 'hidden'}>${icon('x')}</button>
      </div>
      <button type="button" class="search-cancel" data-action="close-search">Cancel</button>
    </div>
  </div>`;
}

/** Count and freshness on the left, Refresh on the right. */
function resultsBar(ctx, { total, excludedStale }) {
  const { ui } = ctx;
  const refreshed = ui.loading ? 'Refreshing…' : ui.lastRefreshAt ? `Updated ${formatTime(ui.lastRefreshAt)}` : '';
  return `<div class="results-bar">
      <p class="summary-line"><span class="sl-main">${total} bar${total === 1 ? '' : 's'}</span>${refreshed ? `<span class="sl-upd">${refreshed}</span>` : ''}${excludedStale ? `<span>${excludedStale} out of date hidden</span>` : ''}</p>
      <button type="button" class="icon-btn refresh-btn" data-action="refresh" aria-label="Refresh estimates" aria-disabled="${ui.loading}">${icon('refresh', { size: 18 })}</button>
    </div>`;
}

export function exploreBanners(ctx) {
  const out = [];
  if (ctx.offline) {
    out.push(banner('warn', 'wifiOff', `<p><strong>You’re offline.</strong></p><p>${ctx.ui.lastRefreshAt ? `Showing estimates from ${formatTime(ctx.ui.lastRefreshAt)}.` : 'Estimates load when you’re back online.'}</p>`,
      `<button type="button" class="btn" data-action="go-online">Reconnect</button>`));
  }
  // With no bars to show, the empty state below says it (and offers the retry): no second box on top of it.
  if (ctx.ui.refreshError && !ctx.offline && ctx.venues.length) {
    out.push(banner('error', 'alert', (globalThis.__STORE__ || LIVE) && !ctx.ui.lastRefreshAt
      ? `<p><strong>Couldn’t load live estimates.</strong></p><p>${ctx.ui.refreshErrorKind === 'bad' ? 'The server sent data we couldn’t read. Try again in a minute.' : ctx.ui.refreshErrorKind === 'server' ? 'The server didn’t answer. Try again in a minute.' : 'Check your connection and try again.'}</p>`
      : `<p><strong>Couldn’t refresh estimates.</strong></p><p>Still showing the last update from ${ctx.ui.lastRefreshAt ? formatTime(ctx.ui.lastRefreshAt) : 'earlier'}.</p>`,
      `<button type="button" class="btn" data-action="refresh">Try again</button>`));
  }
  // The estimates refreshed but another part didn't: name it. Shown only while the last refresh's estimates are current.
  const kept = ctx.ui.partialStale ?? [];
  const missing = ctx.ui.partialMissing ?? [];
  if ((kept.length || missing.length) && !ctx.ui.refreshError && !ctx.offline) {
    const head = [kept.length && `Couldn’t refresh ${kept.join(' or ')}.`, missing.length && `Couldn’t load ${missing.join(' or ')}.`].filter(Boolean).join(' ');
    out.push(banner('info', 'aging', `<p><strong>${esc(head)}</strong></p><p>${kept.length ? 'Estimates are current; showing the last copy of the rest.' : 'Estimates are current.'}</p>`,
      `<button type="button" class="btn" data-action="refresh">Try again</button>`));
  }
  if (ctx.ui.staleNotice) {
    out.push(banner('info', 'aging', `<p>${esc(ctx.ui.staleNotice)}</p>`, `<button type="button" class="btn" data-action="apply-stale">Update list</button>`));
  }
  return out.join('');
}

export function exploreResults(ctx) {
  const { venues, now, explore, savedSet, ui } = ctx;
  if (ui.loading && !ui.lastRefreshAt) return exploreSkeleton(ctx);
  if (venues.length === 0) {
    if (globalThis.__STORE__ || LIVE) return stateBox({ iconName: 'wifiOff', title: 'Couldn’t load bars', body: ui.refreshErrorKind === 'bad' ? 'The server sent data we couldn’t read. Try again in a minute.' : ui.refreshErrorKind === 'server' ? 'The server didn’t answer. Try again in a minute.' : 'Check your connection and try again.', actions: '<button type="button" class="btn btn-primary" data-action="refresh">Try again</button>' });
    return stateBox({ iconName: 'help', title: 'No bars to show', body: 'Restore the bar list to continue.', actions: '<button type="button" class="btn btn-primary" data-action="dataset" data-kind="demo">Restore bars</button>' });
  }
  const { results, unknown, total, excludedStale } = exploreList(venues, explore, now, savedSet);
  if (total === 0) {
    const bits = [];
    if (explore.q) bits.push(`“${esc(explore.q)}”`);
    for (const f of explore.filters) bits.push(esc(FILTERS.find((x) => x.id === f)?.label));
    // A query alone needs no button here: the field's ✕ and Cancel already clear it (QA plan 9.1).
    const actions = [
      explore.filters.length ? '<button type="button" class="btn btn-primary" data-action="clear-filters">Clear filters</button>' : '',
      explore.q && explore.filters.length ? '<button type="button" class="btn" data-action="clear-search">Clear search</button>' : '',
    ].join('');
    const staleNote = excludedStale ? ` ${excludedStale} out of date hidden.` : '';
    return stateBox({ iconName: 'search', title: 'No bars match', body: `Nothing matches ${bits.join(' + ')}.${staleNote}`, actions, cls: 'state-sm' });
  }
  const summary = resultsBar(ctx, { total, excludedStale });
  if (explore.view === 'map') return summary + mapView(ctx, results.concat(unknown));
  const rail = !explore.q && !explore.filters.length && explore.sort === 'near' ? dealsRail(ctx) : '';
  const list = (rows) => `<ul class="bar-grid">${rows.map((r) => venueCard(r.venue, now, { saved: savedSet.has(r.venue.id) })).join('')}</ul>`;
  if (explore.sort !== 'wait') return `${rail}${summary}${list(results)}`;
  return `${summary}
    ${results.length ? `${unknown.length ? `<h2 class="group-title">Line reports <small>${results.length}</small></h2>` : ''}${list(results)}` : ''}
    ${unknown.length ? `<h2 class="group-title">Closed or no recent report <small>${unknown.length}</small></h2>${list(unknown)}` : ''}`;
}

/** First load (QA plan 6.5): placeholders shaped like what arrives (the deals row, the results bar and the cards), so
 *  nothing below them moves when the content fades in. The loading words are for screen readers only. */
function exploreSkeleton(ctx) {
  const { explore } = ctx;
  const rail = explore.view !== 'map' && !explore.q && !explore.filters.length && explore.sort === 'near' && dealsRail(ctx)
    ? `<div class="deals-rail sk-rail" aria-hidden="true"><div class="rail-head"><span class="sk sk-h"></span></div><div class="rail-list">${'<span class="sk-tile"><span class="sk rail-photo"></span><span class="sk sk-l1"></span><span class="sk sk-l2"></span></span>'.repeat(2)}</div></div>`
    : '';
  return `<div class="sk-group">${rail}<div class="results-bar"><p class="summary-line sr-only">Loading estimates…</p></div><div class="bar-grid" aria-hidden="true">${'<div class="sk-card"><div class="sk sk-photo"></div><div class="sk sk-l1"></div><div class="sk sk-l2"></div></div>'.repeat(6)}</div></div>`;
}

/** "Deals right now": a delivery-app style row of live promos (badge on the photo); a tile opens that deal on the bar page. */
export function dealsRail(ctx) {
  const live = ctx.venues.filter((v) => isOpenAt(v, ctx.now) !== false).flatMap((v) => (v.deals ?? []).filter((d) => dealState(d, ctx.now) === 'live').map((d) => ({ v, d })))
    .sort((a, b) => (distanceTo(a.v) ?? 99) - (distanceTo(b.v) ?? 99) || a.d.endsAt - b.d.endsAt);
  if (globalThis.__STORE__ || LIVE ? live.length < 2 : !live.length) return '';
  return `<section class="deals-rail" aria-labelledby="rail-h" data-rail-sig="${esc(live.map(({ d }) => d.id).join(','))}">
    <div class="rail-head"><h2 id="rail-h">Deals right now</h2><button type="button" class="rail-all" data-action="quick-view" data-view="deals">See all${icon('chevronRight', { size: 16 })}</button></div>
    <ul class="rail-list">${live.map(({ v, d }) => `<li data-key="${esc(d.id)}"><a class="rail-tile" href="#/venue/${encodeURIComponent(v.id)}?deal=${encodeURIComponent(d.id)}" aria-label="${esc(`${promoLabel(d)}: ${promoItem(d)} at ${v.name}, until ${formatTime(d.endsAt)}`)}">
      <span class="rail-photo">${venuePhoto(v)}<span class="promo-badge" data-type="${esc(d.promo?.type ?? 'price')}">${icon('tag', { size: 12 })}${esc(promoLabel(d))}</span></span>
      <span class="rail-name">${esc(v.name)}</span>
      <span class="rail-item">${esc(promoItem(d))} · until ${esc(formatTime(d.endsAt))}</span>
    </a></li>`).join('')}</ul>
  </section>`;
}

/** Pin class, accessible name and content for one venue (also used by the live tick to patch pins in place). */
export function pinParts(venue, est, action) {
  const short = { closed: '—', capacity: 'Full', paused: 'Paused', stale: '?', unknown: '?' }[est.tone] ?? (est.waitLow != null ? `${est.waitLow}–${est.waitHigh}` : '?');
  const unit = est.waitLow != null && !['stale', 'unknown', 'closed', 'capacity', 'paused'].includes(est.tone) ? ' min' : '';
  const toneWords = est.headline === TONE_LABEL[est.tone] ? '' : `, ${TONE_LABEL[est.tone]}`;
  const level = crowdStatus(est).level;
  return {
    cls: `map-pin-btn tone-pin-${est.tone}`,
    label: `${venue.name}: ${est.headline}${toneWords}${action === 'map-open' ? '. Open details' : ''}`,
    // The bar's monogram (the same letters as its logo fallback) says which bar a pin is without a tap (finding CR8).
    // A three-bar level meter (shape and count, in the level's colour) for a pin that has a level: the wait is beside it.
    html: `${['quiet', 'lively', 'packed', 'capacity'].includes(level) ? meter(level) : ''}<b class="pin-mono">${esc(monogram(venue))}</b>${esc(short)}<span aria-hidden="true">${unit}</span>`,
  };
}

/** The caption explains only the pin marks this map is showing (it used to list "?" and "—" whatever was on screen). */
function pinKey(rows, now) {
  const tones = new Set(rows.map(({ venue }) => estimateFor(venue, now).tone));
  const key = [(tones.has('aging') || tones.has('uncertain')) && 'Dashed: may have changed', (tones.has('stale') || tones.has('unknown')) && '? no recent report', tones.has('closed') && '— closed'].filter(Boolean);
  return key.length ? `<span>${key.join(' · ')}</span>` : '';
}

function mapView(ctx, rows, { action = 'map-select', preview = true } = {}) {
  const { now, ui, savedSet } = ctx;
  const pins = rows.map(({ venue }) => {
    const [x, y] = pinPos(venue.id);
    const est = estimateFor(venue, now);
    const parts = pinParts(venue, est, action);
    const selected = action === 'map-select' && ui.mapSelected === venue.id;
    const pressed = action === 'map-select' ? ` aria-pressed="${selected}"` : '';
    // clamp() keeps pins up to 132px wide (e.g. "SY 125–190 min") inside the map at 320px.
    return `<button type="button" class="${parts.cls}" style="left:clamp(66px, ${x}%, calc(100% - 66px));top:clamp(20px, ${y}%, calc(100% - 20px))" data-action="${action}" data-id="${esc(venue.id)}" data-pin-tone="${est.tone}"${pressed} aria-label="${esc(parts.label)}">${parts.html}</button>`;
  }).join('');
  const selectedVenue = rows.find((r) => r.venue.id === ui.mapSelected)?.venue;
  return `<div class="map-wrap">
      <div class="map-stage">
        ${mapSvg()}
        ${pins}
      </div>
      <p class="map-caption"><span>Not to scale</span>${pinKey(rows, now)}</p>
    </div>
    ${preview ? `<div class="map-preview"${selectedVenue ? '' : ' hidden'}>${selectedVenue ? mapCard(selectedVenue, now, { saved: savedSet.has(selectedVenue.id) }) : ''}</div>` : ''}`;
}

function mapSvg() {
  return `<svg class="map-svg" viewBox="0 0 400 440" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <rect width="400" height="440" style="fill:var(--surface)"/>
    <path d="M0 395 C 80 375, 140 420, 220 400 S 340 380, 400 405 V440 H0Z" style="fill:var(--accent-soft)"/>
    <g style="stroke:var(--line-strong);fill:none" stroke-width="10" stroke-linecap="round">
      <path d="M72 0 V220"/><path d="M0 114 H180"/><path d="M392 0 L224 220"/><path d="M200 220 V400"/><path d="M120 295 H400"/><path d="M0 343 H400"/>
    </g>
    <g style="fill:var(--ink-2);font-family:var(--font-sans)" font-size="11" font-weight="600" letter-spacing=".04em">
      <text x="80" y="14">College Ave</text>
      <text x="6" y="106">Hamilton St</text>
      <text x="262" y="30">Easton Ave</text>
      <text x="206" y="236">George St</text>
      <text x="6" y="336">Albany St</text>
      <text x="16" y="428">Raritan River</text>
    </g>
  </svg>`;
}

export function renderExplore(ctx) {
  const area = ctx.explore.area ? areaLabel(ctx.explore.area) : 'New Brunswick';
  return `
    <div class="area-row">
      <h1 class="area-title" id="page-h" tabindex="-1"><button type="button" class="area-pill" data-action="open-area" aria-haspopup="dialog" aria-label="Area: ${esc(areaLabel(ctx.explore.area))}. Change area"><span>${esc(area)}</span>${icon('chevronDown', { size: 28, cls: 'ic-chev' })}</button></h1>
    </div>
    ${exploreControls(ctx)}
    <div id="explore-banners">${exploreBanners(ctx)}</div>
    <div id="results" aria-busy="${ctx.ui.loading}">${exploreResults(ctx)}</div>
    `;
}

/** Area picker sheet (no GPS: Night Out never asks for your location). Counts are bars in each area. */
export function areaSheet(current, venues = []) {
  const n = (a) => (a.match ? venues.filter((v) => v.area === a.match).length : venues.length);
  return `<div class="sheet-head"><span class="sheet-grabber" aria-hidden="true"></span><h2 class="sheet-title" id="picker-title">Choose an area</h2>
      <button type="button" class="icon-btn sheet-close" data-action="close-picker" aria-label="Close">${icon('x')}</button></div>
    <div class="sheet-body"><fieldset><legend class="sr-only">Area</legend><div class="option-list">
      ${AREAS.map((a) => `<label class="option-row"><input type="radio" name="area" value="${a.id}" data-input="area" ${a.id === (current || '') ? 'checked' : ''}><span class="rd" aria-hidden="true">${icon('check')}</span><span>${esc(a.label)}</span><span class="n" aria-hidden="true">${n(a)}</span></label>`).join('')}
    </div></fieldset>
    <p class="hint">${icon('pin', { size: 14 })} Distances from ${esc(originLabel())}</p>
    ${!usingDeviceLocation() ? `<button type="button" class="btn btn-block" data-action="use-location">${icon('nav', { size: 18 })}Use my location</button><p class="hint">Only used on your phone to measure distances. Never saved or sent.</p>` : ''}</div>`;
}

/** Sort sheet (replaces the native select so the chip matches the filters). */
