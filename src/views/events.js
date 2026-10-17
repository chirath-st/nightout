// Events tab: what's on at the bars tonight and this week. Every event, count and price is a sample
// (no bar has announced these). Save and "I'm going" stay on this device; no one is notified.
import { esc, venuePhoto, venueLogo } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { formatTime } from '../lib/clock.js';
import { eventList, isLive, PRICE_BANDS } from '../lib/events.js';
import { GENRES, THEMES } from '../data/events.js';
import { allGroups } from './groups.js';

export const EVENT_VIEWS = Object.freeze([['tonight', 'Tonight'], ['week', 'This week'], ['saved', 'Saved']]);
const dayName = (ms) => new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(ms);

function filterSelect(key, label, options, value) {
  return `<div class="select chip-select${value ? ' is-set' : ''}"><label for="ev-${key}" class="sr-only">${label}</label>
    <select id="ev-${key}" data-input="event-filter" data-key="${key}"><option value="">${label}: any</option>${options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${icon('chevronDown', { size: 14 })}</div>`;
}

export function eventCard(ev, ctx) {
  const venue = ctx.venues.find((v) => v.id === ev.venueId);
  const saved = ctx.state.savedEvents.includes(ev.id);
  const going = ctx.state.goingEvents.includes(ev.id);
  const live = isLive(ev, ctx.now);
  const when = `${ctx.ui.eventsView === 'tonight' || live ? (live ? 'Now' : 'Tonight') : dayName(ev.startsAt)} · ${formatTime(ev.startsAt)}${ev.endsAt ? `–${formatTime(ev.endsAt)}` : ' till late'}`;
  return `<li class="ev-card" data-event="${esc(ev.id)}">
    <a class="ev-link" href="#/venue/${encodeURIComponent(ev.venueId)}" data-nav-venue="${esc(ev.venueId)}">
      <span class="ev-photo">${venue ? venuePhoto(venue, { anchor: 'bottom' }) : ''}${live ? '<span class="live-chip ev-live">Live</span>' : ''}<span class="ev-sample">Sample event</span></span>
      <span class="ev-body">
        <span class="ev-bar">${venue ? `<span class="bar-logo ev-logo" aria-hidden="true">${venueLogo(venue)}</span>` : ''}<span>${esc(venue?.name ?? 'Bar not in this dataset')}</span></span>
        <span class="ev-title">${esc(ev.title)}</span>
        <span class="ev-meta">${icon('clock', { size: 15 })}<span class="num">${esc(when)}</span></span>
        <span class="ev-meta">${icon('users', { size: 15 })}<span class="num" data-going="${esc(ev.id)}">${ev.going + (going ? 1 : 0)} going</span><span class="sep" aria-hidden="true">•</span><span>21+</span><span class="sep" aria-hidden="true">•</span><span class="num">${ev.cover ? `$${ev.cover} cover` : 'Free entry'}</span></span>
        <span class="ev-meta">${icon('music', { size: 15 })}<span>${esc(ev.music)}</span></span>
      </span>
    </a>
    <div class="ev-actions">
      <button type="button" class="btn btn-sm" data-action="event-save" data-id="${esc(ev.id)}" aria-pressed="${saved}" aria-label="Save ${esc(ev.title)}">${icon(saved ? 'heartFill' : 'heart', { size: 16 })}${saved ? 'Saved' : 'Save'}</button>
      <button type="button" class="btn btn-sm ${going ? '' : 'btn-primary'}" data-action="event-going" data-id="${esc(ev.id)}" aria-pressed="${going}">${going ? `${icon('check', { size: 16 })}Going` : 'I’m going'}</button>
    </div>
  </li>`;
}

export function eventResults(ctx) {
  const ui = ctx.ui;
  const list = eventList(ctx.events, { view: ui.eventsView, genre: ui.eventsGenre, theme: ui.eventsTheme, price: ui.eventsPrice }, ctx.now, ctx.state.clock.base, new Set(ctx.state.savedEvents));
  const filtered = ui.eventsGenre || ui.eventsTheme || ui.eventsPrice;
  if (!list.length) {
    const msg = ui.eventsView === 'saved' ? 'Tap Save on an event to keep it here.' : filtered ? 'No events match these filters.' : 'No events listed for this time.';
    return `<div class="state ev-empty"><div class="state-icon">${icon('calendar')}</div><h2>${ui.eventsView === 'saved' ? 'No saved events' : 'Nothing here yet'}</h2><p>${esc(msg)}</p>${filtered ? '<div class="actions"><button type="button" class="btn btn-primary" data-action="event-clear">Clear filters</button></div>' : ''}</div>`;
  }
  return `<p class="summary-line">${list.length} event${list.length === 1 ? '' : 's'} · sample listings, not announced by the bars</p><ul class="ev-list">${list.map((e) => eventCard(e, ctx)).join('')}</ul>`;
}

export function renderEvents(ctx) {
  const ui = ctx.ui;
  const groups = allGroups(ctx).filter((g) => ctx.now < g.startsAt + 3 * 60 * 60_000).length;
  return `<div class="page">
    <h1 class="page-title" id="page-h" tabindex="-1">Events</h1>
    <p class="page-sub">${icon('pinFill', { size: 14 })} New Brunswick</p>
    <div class="segmented ev-views" role="group" aria-label="When">${EVENT_VIEWS.map(([id, label]) => `<button type="button" data-action="event-view" data-view="${id}" aria-pressed="${ui.eventsView === id}">${label}${id === 'saved' && ctx.state.savedEvents.length ? ` <span class="num">${ctx.state.savedEvents.length}</span>` : ''}</button>`).join('')}</div>
    <div class="chips ev-filters" role="group" aria-label="Filters">
      ${filterSelect('genre', 'Music', GENRES.map((g) => [g, g]), ui.eventsGenre)}
      ${filterSelect('theme', 'Theme', THEMES.map((t) => [t, t]), ui.eventsTheme)}
      ${filterSelect('price', 'Price', PRICE_BANDS.map((b) => [b.id, b.label]), ui.eventsPrice)}
    </div>
    <a class="list-link groups-link" href="#/groups">${icon('users', { size: 20 })}<span>Groups heading out<small>${groups} plan${groups === 1 ? '' : 's'} tonight · join people going together</small></span>${icon('chevronRight', { size: 18 })}</a>
    <div id="event-results">${eventResults(ctx)}</div>
  </div>`;
}
