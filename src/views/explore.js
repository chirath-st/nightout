import { exploreList, FILTERS, SORTS, AREAS, areaLabel } from '../lib/explore.js';
import { esc, venueRow, venueCard, stateBox, banner, estimateFor } from '../ui/components.js';
import { icon, TONE_LABEL } from '../ui/icons.js';
import { formatTime } from '../lib/clock.js';

// Schematic positions (percent of the map box), roughly by street. Not to scale; no distances implied.
// Laid out in columns at least 80 px apart at 320 px so no two pins overlap.
const PIN_POS = {
  // Easton Ave, two columns along the avenue
  'hueys-knight-club': [84, 7], 'scarlet-pub': [56, 14], 'olde-queens': [84, 21], 'pitch-social': [56, 28], evelyns: [84, 35], 'knights-public-house': [56, 42],
  // College Ave area (Hamilton St)
  'ale-n-wich': [18, 26],
  // Downtown: George, Paterson, Liberty, Dennis and Albany Streets
  'destination-dogs': [18, 56], 'tavern-on-george': [50, 56], 'fat-cactus': [82, 56],
  'esquina-latina': [18, 67], 'frog-and-peach': [50, 67], deltas: [82, 67],
  'glass-woods-tavern': [18, 78], 'batch-bin-barrel': [50, 78], 'old-man-raffertys': [82, 78],
  roosterspin: [50, 89],
  // Worst-case fixture rows get their own spots so no pin hides another.
  'worst-long-name': [18, 89], 'worst-one': [82, 89], 'worst-missing': [18, 42],
};
/** Unknown ids get a deterministic spot from their id instead of all stacking on one point. */
function pinPos(id) {
  if (PIN_POS[id]) return PIN_POS[id];
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return [15 + (h % 70), 15 + ((h >>> 8) % 70)];
}

export function exploreControls(ctx) {
  const { q, filters, sort, view } = ctx.explore;
  const chips = FILTERS.map((f) => `<button type="button" class="chip" data-action="toggle-filter" data-filter="${f.id}" aria-pressed="${filters.includes(f.id)}">${filters.includes(f.id) ? icon('check') : ''}${esc(f.label)}</button>`).join('');
  const clear = filters.length ? `<button type="button" class="chip chip-clear" data-action="clear-filters">Clear all (${filters.length})</button>` : '';
  return `
    <div class="search" role="search">
      ${icon('search')}
      <label for="q" class="sr-only">Search venues, areas or vibes</label>
      <input id="q" type="search" inputmode="search" enterkeyhint="search" autocomplete="off" spellcheck="false" name="q" placeholder="Venue, area or vibe…" value="${esc(q)}" data-input="search">
      <button type="button" class="icon-btn clear" data-action="clear-search" aria-label="Clear search" ${q ? '' : 'hidden'}>${icon('x')}</button>
    </div>
    <div class="chips">
      <div class="select chip-select"><label for="sort" class="sr-only">Sort</label><select id="sort" data-input="sort">${SORTS.map((s) => `<option value="${s.id}" ${sort === s.id ? 'selected' : ''}>Sort: ${esc(s.label)}</option>`).join('')}</select>${icon('chevronDown', { size: 14 })}</div>
      <span class="chip-divider" aria-hidden="true"></span>
      <span class="chip-group" role="group" aria-label="Filters">${chips}${clear}</span>
    </div>
    ${viewFab(view)}`;
}

/** Floating List/Map pill (mobile). data-view is the view it switches TO. */
export function viewFab(view) {
  const to = view === 'map' ? 'list' : 'map';
  return `<button type="button" class="fab" data-action="set-view" data-view="${to}" aria-label="Show ${to} view">${icon(to, { size: 20 })}<span>${to === 'map' ? 'Map' : 'List'}</span></button>`;
}

export function exploreBanners(ctx) {
  const out = [];
  if (ctx.offline) {
    out.push(banner('warn', 'wifiOff', `<p><strong>You’re offline (simulated).</strong></p><p>Showing estimates from ${ctx.ui.lastRefreshAt ? formatTime(ctx.ui.lastRefreshAt) : 'the last refresh'}. They keep aging; nothing new will arrive until you reconnect.</p>`,
      `<button type="button" class="btn" data-action="go-online">Reconnect</button>`));
  }
  if (ctx.ui.refreshError && !ctx.offline) {
    out.push(banner('error', 'alert', `<p><strong>Couldn’t refresh estimates.</strong></p><p>Still showing the last update from ${ctx.ui.lastRefreshAt ? formatTime(ctx.ui.lastRefreshAt) : 'earlier'}.</p>`,
      `<button type="button" class="btn" data-action="refresh">Try again</button>`));
  }
  if (ctx.ui.staleNotice) {
    out.push(banner('info', 'aging', `<p>${esc(ctx.ui.staleNotice)}</p>`, `<button type="button" class="btn" data-action="apply-stale">Update list</button>`));
  }
  return out.join('');
}

export function exploreResults(ctx) {
  const { venues, now, explore, savedSet, ui } = ctx;
  if (ui.loading && !ui.lastRefreshAt) {
    return `<p class="summary-line" aria-hidden="true">Loading estimates…</p><div class="bar-grid sk-group" aria-hidden="true">${'<div class="sk-card"><div class="sk sk-photo"></div><div class="sk sk-l1"></div><div class="sk sk-l2"></div></div>'.repeat(6)}</div>`;
  }
  if (venues.length === 0) {
    return stateBox({ iconName: 'help', title: 'No venues in this dataset', body: 'The demo dataset is empty. Restore the sample venues to continue.', actions: '<button type="button" class="btn btn-primary" data-action="dataset" data-kind="demo">Restore demo venues</button>' });
  }
  const { results, unknown, total, excludedStale } = exploreList(venues, explore, now, savedSet);
  const sortLabel = explore.sort === 'name' ? 'A–Z' : 'shortest wait first';
  if (total === 0) {
    const bits = [];
    if (explore.q) bits.push(`“${esc(explore.q)}”`);
    for (const f of explore.filters) bits.push(esc(FILTERS.find((x) => x.id === f)?.label));
    const actions = [
      explore.filters.length ? '<button type="button" class="btn btn-primary" data-action="clear-filters">Clear filters</button>' : '',
      explore.q ? '<button type="button" class="btn" data-action="clear-search">Clear search</button>' : '',
    ].join('');
    const staleNote = excludedStale ? ` ${excludedStale} venue${excludedStale === 1 ? ' has' : 's have'} out-of-date estimates, so ${excludedStale === 1 ? 'it doesn’t' : 'they don’t'} count as under 20 min.` : '';
    return stateBox({ iconName: 'search', title: 'No venues match', body: `Nothing matches ${bits.join(' + ')}.${staleNote}`, actions });
  }
  const refreshed = ui.loading ? '<span>Refreshing…</span>' : ui.lastRefreshAt ? `<span>Refreshed ${formatTime(ui.lastRefreshAt)}</span>` : '';
  const summary = `<p class="summary-line"><span>${total} venue${total === 1 ? '' : 's'} · ${sortLabel}</span>${refreshed ? `<span aria-hidden="true">·</span>${refreshed}` : ''}${excludedStale ? `<span aria-hidden="true">·</span><span>${excludedStale} with out-of-date estimate${excludedStale === 1 ? '' : 's'} hidden</span>` : ''}</p>`;
  if (explore.view === 'map' && !ctx.isDesktop) return summary + mapView(ctx, results.concat(unknown));
  const sel = ctx.selectedId;
  const list = (rows) => `<ul class="bar-grid">${rows.map((r) => venueCard(r.venue, now, { saved: savedSet.has(r.venue.id), selected: r.venue.id === sel })).join('')}</ul>`;
  return `${summary}
    ${results.length ? `<h2 class="group-title">Estimated waits <small>${results.length}</small></h2>${list(results)}` : ''}
    ${unknown.length ? `<h2 class="group-title">No current wait estimate <small>${unknown.length}</small></h2>${list(unknown)}` : ''}`;
}

/** Pin class, accessible name and content for one venue (also used by the live tick to patch pins in place). */
export function pinParts(venue, est, action) {
  const short = { closed: '—', capacity: 'Full', paused: 'Paused', stale: '?', unknown: '?' }[est.tone] ?? (est.waitLow != null ? `${est.waitLow}–${est.waitHigh}` : '?');
  const unit = est.waitLow != null && !['stale', 'unknown', 'closed', 'capacity', 'paused'].includes(est.tone) ? ' min' : '';
  const toneWords = est.headline === TONE_LABEL[est.tone] ? '' : `, ${TONE_LABEL[est.tone]}`;
  return {
    cls: `map-pin-btn tone-pin-${est.tone}`,
    label: `${venue.name}: ${est.headline}${toneWords}${action === 'map-open' ? '. Open details' : ''}`,
    html: `${esc(short)}<span aria-hidden="true">${unit}</span>`,
  };
}

function mapView(ctx, rows, { action = 'map-select', preview = true } = {}) {
  const { now, ui, savedSet } = ctx;
  const pins = rows.map(({ venue }) => {
    const [x, y] = pinPos(venue.id);
    const est = estimateFor(venue, now);
    const parts = pinParts(venue, est, action);
    const selected = action === 'map-select' && ui.mapSelected === venue.id;
    const pressed = action === 'map-select' ? ` aria-pressed="${selected}"` : '';
    // clamp() keeps pins up to 112px wide (e.g. "125–190 min") inside the map at 320px.
    return `<button type="button" class="${parts.cls}" style="left:clamp(56px, ${x}%, calc(100% - 56px));top:clamp(20px, ${y}%, calc(100% - 20px))" data-action="${action}" data-id="${esc(venue.id)}" data-pin-tone="${est.tone}"${pressed} aria-label="${esc(parts.label)}">${parts.html}</button>`;
  }).join('');
  const selectedVenue = rows.find((r) => r.venue.id === ui.mapSelected)?.venue;
  return `<div class="map-wrap">
      <div class="map-stage">
        ${mapSvg()}
        ${pins}
      </div>
      <p class="map-caption"><span>Schematic map, not to scale. Positions are approximate.</span><span>Dashed outline: may have changed or uncertain. “?”: unknown or out of date. “—”: closed.</span></p>
    </div>
    ${preview ? `<div class="map-preview">
      ${selectedVenue ? `<ul class="venue-list">${venueRow(selectedVenue, now, { saved: savedSet.has(selectedVenue.id) })}</ul>` : '<p class="hint">Select a pin to preview a venue. The list view shows the same venues.</p>'}
    </div>` : ''}`;
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
  // Desktop split: the list keeps its own heading id; with a venue open, the venue is the page's h1.
  const id = ctx.isDesktop ? 'list-h' : 'page-h';
  const tag = ctx.isDesktop && ctx.selectedId ? 'h2' : 'h1';
  return `
    <div class="title-row home-title">
      <div class="home-title-text">
        <p class="eyebrow">${icon('pin', { size: 14 })}Tonight in</p>
        <${tag} class="page-title" id="${id}" tabindex="-1"><button type="button" class="area-btn" data-action="open-area" aria-haspopup="dialog" aria-label="Area: ${esc(areaLabel(ctx.explore.area))}. Change area">${esc(ctx.explore.area ? areaLabel(ctx.explore.area) : 'New Brunswick')}${icon('chevronDown', { size: 22 })}</button></${tag}>
      </div>
      <button type="button" class="icon-btn refresh-btn" data-action="refresh" aria-label="Refresh estimates" aria-disabled="${ctx.ui.loading}">${icon('refresh', { size: 22 })}</button>
    </div>
    <p class="page-sub">Real bar names. Every wait, price and pass is simulated; no bar is affiliated.</p>
    <div id="explore-banners">${exploreBanners(ctx)}</div>
    ${exploreControls(ctx)}
    <div id="results" aria-busy="${ctx.ui.loading}">${exploreResults(ctx)}</div>`;
}

/** Desktop right pane when no venue is selected: same filtered venues on the schematic map. */
export function desktopMapPanel(ctx) {
  const { results, unknown, total } = exploreList(ctx.venues, ctx.explore, ctx.now, ctx.savedSet);
  return `<div class="page">
    <h2 class="section-title" style="margin-top:0">Map of tonight’s ${total} venue${total === 1 ? '' : 's'}</h2>
    ${total ? mapView(ctx, results.concat(unknown), { action: 'map-open', preview: false }) : '<p class="hint">No venues match the current filters.</p>'}
    <p class="hint" style="margin-top:12px">Select a pin or a venue in the list to see its estimated wait, entry details and illustrative menu.</p>
  </div>`;
}

/** Area picker sheet (no GPS: Night Out never asks for your location). */
export function areaSheet(current) {
  return `<div class="sheet-head"><h2 class="sheet-title" id="picker-title">Choose an area</h2>
      <button type="button" class="icon-btn sheet-close" data-action="close-picker" aria-label="Close">${icon('x')}</button></div>
    <div class="sheet-body"><fieldset><legend class="sr-only">Area</legend><div class="option-list">
      ${AREAS.map((a) => `<label class="option-row"><input type="radio" name="area" value="${a.id}" data-input="area" ${a.id === (current || '') ? 'checked' : ''}><span>${esc(a.label)}</span>${icon('check', { size: 18, cls: 'option-check' })}</label>`).join('')}
    </div></fieldset>
    <p class="hint">${icon('pin', { size: 14 })} Night Out doesn’t use your location. Pick the area you’re heading to.</p></div>`;
}
