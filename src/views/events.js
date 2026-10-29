// Events tab: what's on at the bars tonight and this week. Every event, count and price is a sample
// (no bar has announced these). Save and "I'm going" stay on this device; no one is notified.
import { esc, venuePhoto, venueLogo, stateBox, heartStack, lblStack } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { formatTime } from '../lib/clock.js';
import { eventList, isLive, PRICE_BANDS } from '../lib/events.js';
import { GENRES, THEMES } from '../data/events.js';
import { allGroups } from './groups.js';
import { groupEndsAt } from '../data/social.js';
import { ideaCard } from './ideas.js';
import { ideaList } from '../lib/ideas.js';
import { LIVE } from '../lib/backend.js';

// Ideas (community theme nights) need moderation tools the App Store app doesn't have yet: team build only.
export const EVENT_VIEWS = (globalThis.__STORE__ || LIVE)
  ? Object.freeze([['tonight', 'Tonight'], ['week', 'This week'], ['saved', 'Saved']])
  : Object.freeze([['tonight', 'Tonight'], ['week', 'This week'], ['ideas', 'Ideas'], ['saved', 'Saved']]);
const dayName = (ms) => new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(ms);

function filterSelect(key, label, options, value) {
  return `<div class="select chip-select${value ? ' is-set' : ''}"><label for="ev-${key}" class="sr-only">${label}</label>
    <select id="ev-${key}" data-input="event-filter" data-key="${key}"><option value="">${label}</option>${options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${icon('chevronDown', { size: 14 })}</div>`;
}

/** Store build: a cover the bar didn't give is unknown, not free. */
const coverText = (c) => (c == null ? 'Cover not listed' : c === 0 ? 'Free entry' : `$${c} cover`);

export function eventCard(ev, ctx) {
  const venue = ctx.venues.find((v) => v.id === ev.venueId);
  const saved = ctx.state.savedEvents.includes(ev.id);
  const going = ctx.state.goingEvents.includes(ev.id);
  const live = isLive(ev, ctx.now);
  const when = `${ctx.ui.eventsView === 'tonight' || live ? (live ? 'Now' : 'Tonight') : dayName(ev.startsAt)} · ${formatTime(ev.startsAt)}${ev.endsAt ? `–${formatTime(ev.endsAt)}` : ' till late'}`;
  return `<li class="ev-card" data-event="${esc(ev.id)}" data-starts="${ev.startsAt}">
    <a class="ev-link" href="#/venue/${encodeURIComponent(ev.venueId)}" data-nav-venue="${esc(ev.venueId)}">
      <span class="ev-photo" data-thumb-ev="${esc(ev.id)}">${venue ? venuePhoto(venue, { anchor: 'bottom' }) : ''}${live ? '<span class="live-chip ev-live">Live</span>' : ''}</span>
      <span class="ev-body">
        <span class="ev-bar">${venue ? `<span class="bar-logo ev-logo" aria-hidden="true">${venueLogo(venue)}</span>` : ''}<span>${esc(venue?.name ?? (globalThis.__STORE__ || LIVE ? '' : 'Bar not in this dataset'))}</span></span>
        <span class="ev-title">${esc(ev.title)}</span>
        <span class="ev-meta">${icon('clock', { size: 15 })}<span class="num">${esc(when)}</span></span>
        ${(globalThis.__STORE__ || LIVE)
    ? `<span class="ev-meta">${icon('ticket', { size: 15 })}<span class="num">21+</span><span class="sep" aria-hidden="true">•</span><span class="num">${coverText(ev.cover)}</span></span>
        ${ev.music ? `<span class="ev-meta">${icon('info', { size: 15 })}<span>${esc(ev.music)}</span></span>` : ''}`
    : `<span class="ev-meta">${icon('users', { size: 15 })}<span class="num" data-going="${esc(ev.id)}"><span class="roll">${ev.going + (going ? 1 : 0)}</span> going</span><span class="sep" aria-hidden="true">•</span><span class="num">21+</span><span class="sep" aria-hidden="true">•</span><span class="num">${ev.cover ? `$${ev.cover} cover` : 'Free entry'}</span></span>
        <span class="ev-meta">${icon('music', { size: 15 })}<span>${esc(ev.music)}</span></span>`}
      </span>
    </a>
    <div class="ev-actions">
      <button type="button" class="btn btn-sm" data-action="event-save" data-id="${esc(ev.id)}" aria-pressed="${saved}">${heartStack(16)}${lblStack('Save', 'Saved', saved)}<span class="sr-only"> ${esc(ev.title)}</span></button>
      ${(globalThis.__STORE__ || LIVE) ? '' : `<button type="button" class="btn btn-sm ${going ? '' : 'btn-primary'}" data-action="event-going" data-id="${esc(ev.id)}" aria-pressed="${going}">${lblStack('I’m going', `${icon('check', { size: 16 })}Going`, going)}</button>`}
    </div>
  </li>`;
}

export function eventResults(ctx) {
  const ui = ctx.ui;
  const filters = { genre: ui.eventsGenre, theme: ui.eventsTheme, price: ui.eventsPrice };
  const filtered = ui.eventsGenre || ui.eventsTheme || ui.eventsPrice;
  const clearBtn = '<div class="actions"><button type="button" class="btn btn-primary" data-action="event-clear">Clear filters</button></div>';
  if (!(globalThis.__STORE__ || LIVE) && ui.eventsView === 'ideas') {
    const list = ideaList(ctx.ideas, filters, ctx.now, ctx.state.clock.base, ctx.state);
    
    const head = `<div class="ideas-head">${ctx.venues.length ? `<a class="btn btn-primary btn-block" href="#/events/new">${icon('plus', { size: 18 })}Propose a theme night</a>` : ''}</div>`;
    if (!list.length) {
      const body = !ctx.venues.length ? stateBox({ iconName: 'calendar', title: 'No ideas yet', body: 'No bars to show. Restore them in About.' })
        : filtered ? `<div class="state ev-empty"><div class="state-icon">${icon('calendar')}</div><h2>Nothing here yet</h2><p>No ideas match these filters.</p>${clearBtn}</div>`
        : stateBox({ iconName: 'bolt', title: 'No ideas yet', body: 'Be the first to propose a theme night.' });
      return head + body;
    }
    return `${head}<ul class="ev-list">${list.map((x) => ideaCard(x, ctx)).join('')}</ul>`;
  }
  const items = [...ctx.events, ...ctx.ideas.filter((x) => x.status !== 'declined')];
  const list = eventList(items, { view: ui.eventsView, ...filters }, ctx.now, ctx.state.clock.base, new Set(ctx.state.savedEvents));
  if (!list.length) {
    if ((globalThis.__STORE__ || LIVE) && (ctx.loadFailed || ctx.eventsMissing) && ui.eventsView !== 'saved' && !filtered) {
      return `<div class="state ev-empty"><div class="state-icon">${icon('alert')}</div><h2>Couldn’t load events</h2><p>Try again in a minute.</p><div class="actions"><button type="button" class="btn" data-action="refresh">Try again</button></div></div>`;
    }
    const msg = ui.eventsView === 'saved' ? 'Tap Save on an event to keep it here.' : filtered ? 'No events match these filters.' : 'No events listed for this time.';
    return `<div class="state ev-empty"><div class="state-icon">${icon('calendar')}</div><h2>${ui.eventsView === 'saved' ? 'No saved events' : 'Nothing here yet'}</h2><p>${esc(msg)}</p>${filtered ? clearBtn : ''}</div>`;
  }
  return `<ul class="ev-list">${list.map((e) => (e.kind === 'community' ? ideaCard(e, ctx) : eventCard(e, ctx))).join('')}</ul>`;
}

export function renderEvents(ctx) {
  const ui = ctx.ui;
  const pendingIdeas = ctx.ideas.filter((x) => x.status === 'pending' && x.endsAt > ctx.now).length;
  const groups = allGroups(ctx).filter((g) => ctx.now < groupEndsAt(g)).length;
  return `<div class="page">
    <h1 class="page-title" id="page-h" tabindex="-1">Events</h1>
    <div class="segmented ev-views" role="group" aria-label="Show" style="--n:${EVENT_VIEWS.length}">${EVENT_VIEWS.map(([id, label]) => `<button type="button" data-action="event-view" data-view="${id}" aria-pressed="${ui.eventsView === id}">${label}${id === 'saved' ? ` <span class="num">${ctx.state.savedEvents.length || ''}</span>` : ''}${id === 'ideas' && pendingIdeas ? ` <span class="num">${pendingIdeas}</span>` : ''}</button>`).join('')}</div>
    <div class="chips ev-filters" role="group" aria-label="Filters">
      ${(globalThis.__STORE__ || LIVE) ? '' : filterSelect('genre', 'Music', GENRES.map((g) => [g, g]), ui.eventsGenre)}
      ${(globalThis.__STORE__ || LIVE) ? '' : filterSelect('theme', 'Theme', THEMES.map((t) => [t, t]), ui.eventsTheme)}
      ${filterSelect('price', 'Price', PRICE_BANDS.map((b) => [b.id, b.label]), ui.eventsPrice)}
    </div>
    ${(globalThis.__STORE__ || LIVE) ? '' : `<a class="groups-link" href="#/groups">${icon('users', { size: 18 })}<span>Groups heading out</span>${groups ? `<b class="num"><span aria-hidden="true">${groups}</span><span class="sr-only">${groups} tonight</span></b>` : ''}${icon('chevronRight', { size: 16 })}</a>
    <a class="groups-link create-link" href="#/events/new">${icon('plus', { size: 18 })}<span>Propose an event</span>${icon('chevronRight', { size: 16 })}</a>`}
    <div id="event-results">${eventResults(ctx)}</div>
  </div>`;
}
