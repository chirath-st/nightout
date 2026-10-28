import { esc, estimateBlock, saveButton, stateBox, windowLabel, coverText, venuePhoto, venueLogo, distanceText, factStrip, howItWorks, promoLabel, promoItem } from '../ui/components.js';
import { formatTime } from '../lib/clock.js';
import { VIBE, POLL } from '../data/events.js';
import { eventWindow, isLive, pollResult } from '../lib/events.js';
import { POINTS } from '../data/social.js';
import { originLabel, usingDeviceLocation } from '../lib/geo.js';
import { dealsTonight, dealState, DEAL_KINDS } from '../lib/deals.js';
import { dealWhen } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { isOpenAt } from '../lib/explore.js';
import { offerSummary, money, dollars } from '../lib/pass.js';
import { TYPICAL_LABELS } from '../lib/queue.js';
import { TYPICAL_HOURS } from '../data/venues.js';
import { ideasSection } from './ideas.js';
import { coverLabel } from '../lib/ideas.js';

function to12(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: m ? '2-digit' : undefined }).format(d);
}

function typicalStrip(venue, now) {
  if (!venue.typical?.some((n) => n > 0)) return '';
  const hour = new Date(now).getHours();
  const idx = hour >= 20 ? hour - 20 : hour <= 2 ? hour + 4 : -1;
  const peak = venue.typical.indexOf(Math.max(...venue.typical));
  return `<section class="typical" aria-labelledby="typ-h">
    <div class="section-head"><h2 id="typ-h">Typical weekend night</h2></div>
    
    <div class="typical-bars" aria-hidden="true">${venue.typical.map((n, i) => `<span class="${i === idx ? 'is-now' : ''}" style="height:${10 + n * 22}%"></span>`).join('')}</div>
    <div class="typical-axis" aria-hidden="true">${TYPICAL_HOURS.map((h) => `<span>${h}</span>`).join('')}</div>
    <p class="hint">Usually ${esc(TYPICAL_LABELS[venue.typical[peak]].toLowerCase())} around ${TYPICAL_HOURS[peak]}.</p>
  </section>`;
}

/** Store build: what our counts showed last time this bar was busy (from the server; never a made-up "typical" night). */
function lastNightSection(venue) {
  const h = venue.lastNight;
  if (!h || !Number.isFinite(h.peakPeople)) return '';
  const when = h.label ?? 'Last night';
  return `<section class="typical" aria-labelledby="ln-h">
    <div class="section-head"><h2 id="ln-h">${esc(when)}</h2></div>
    <p class="hint">Busiest around ${esc(h.peakAt ?? '')}: about ${h.peakLow != null && h.peakLow !== h.peakPeople ? `${h.peakLow}–${h.peakPeople}` : h.peakPeople} in line, from ${esc(h.source)}.</p>
  </section>`;
}

function passCta(venue, now) {
  if (!venue.pass) {
    return '';
  }
  const s = offerSummary(venue.pass, now);
  const per = money(venue.pass.basePrice + venue.pass.serviceFee);
  const why = {
    available: `Skip the general line during a set window. ${per} per person, all-in.`,
    paused: 'Priority passes are paused for now.',
    soldout: 'Every window is sold out tonight.',
    passed: 'All of tonight’s priority windows have ended.',
    unavailable: 'Not offered tonight.',
  }[s.state];
  // Only the available state gets a control; other states are plain status text, not a dead button.
  const btn = s.state === 'available'
    ? `<a class="btn btn-primary btn-lg btn-block" href="#/venue/${encodeURIComponent(venue.id)}/pass" data-nav="pass">${icon('ticket')}Review priority pass</a>`
    : `<p class="pass-state">${icon('ticket')}<span>${esc(s.label)}</span></p>`;
  return `<section class="pass-cta" aria-labelledby="pass-h">
    <div class="section-head"><h2 id="pass-h">Priority entry</h2></div>
    <p>${why}</p>${btn}</section>`;
}

export function renderVenue(ctx, id) {
  const venue = ctx.venues.find((v) => v.id === id);
  if (!venue) {
    return `<div class="page">${stateBox({ iconName: 'help', title: 'Venue not found', body: 'This bar isn’t listed.', actions: `<a class="btn btn-primary" href="${ctx.backHref}">Back to ${esc(ctx.backLabel)}</a>`, headingLevel: 1 })}</div>`;
  }
  const now = ctx.now;
  const open = isOpenAt(venue, now);
  const hours = venue.closedTonight ? 'Closed tonight' : venue.hours ? `${to12(venue.hours.open)}–${to12(venue.hours.close)}` : globalThis.__STORE__ ? 'Not confirmed yet' : 'Not listed';
  const openText = open === true ? 'Open now' : open === false ? 'Closed now' : 'Hours not listed';
  const cover = venue.cover === 0 ? 'No cover' : venue.cover == null ? 'Not listed' : `${dollars(venue.cover)} at the door`;
  const saved = ctx.savedSet.has(venue.id);
  const windows = venue.pass?.enabled ? venue.pass.windows.map((w) => windowLabel(w.start, w.end)).join(', ') : 'Not offered';
  const kind = [coverText(venue), venue.tags?.join(' · ')].filter(Boolean).join(' | ');
  const hoursShort = venue.closedTonight ? 'Closed tonight' : venue.hours ? `${to12(venue.hours.open)}–${to12(venue.hours.close)}` : null;
  const ev = tonightEvent(ctx, venue);
  const eyebrow = [venue.area, venue.tags?.[0]].filter(Boolean).join(' · ');
  return `<div class="page detail">
    <div class="detail-hero" data-hero="${esc(venue.id)}">${venuePhoto(venue, { title: true })}<span class="hero-scrim" aria-hidden="true"></span>
      <a class="back-link hero-btn" href="${ctx.backHref}" data-action="back" aria-label="Back to ${esc(ctx.backLabel)}">${icon('chevronLeft', { size: 22 })}</a>
      ${venue.photo ? `<span class="hero-caption">${icon('info', { size: 13 })}<span>${esc(`Photo: ${venue.photoCredit ?? 'the bar'}`)}</span></span>` : ''}
      ${saveButton(venue, saved, 'save-detail hero-btn')}
      <div class="hero-title">
        <span class="hero-meta"><span class="bar-logo hero-logo" aria-hidden="true">${venueLogo(venue)}</span><span class="eyebrow">${esc(eyebrow)}</span></span>
        <h1 class="hero-name" id="page-h" tabindex="-1">${esc(venue.name)}</h1>
        ${distanceText(venue) ? (globalThis.__STORE__ && !usingDeviceLocation()
          ? `<p class="hero-sub"><span>${esc(distanceText(venue))} from ${esc(originLabel())}</span></p>`
          : `<p class="hero-sub">${icon('nav', { size: 12 })}<span>New Brunswick · ${esc(distanceText(venue))} away</span></p>`) : ''}
      </div>
    </div>
    
    ${estimateBlock(venue, now, { showHow: false })}
    ${howItWorks()}
    <div class="venue-actions">
      <a class="act act-primary" href="#/scan?venue=${encodeURIComponent(venue.id)}">${icon('report', { size: 22 })}<span>Report the line</span>${globalThis.__STORE__ ? '' : `<span class="act-pts" aria-hidden="true">+${POINTS.REPORT}</span><span class="sr-only">, earn ${POINTS.REPORT} points</span>`}</a>
      <button type="button" class="act" data-action="directions" data-id="${esc(venue.id)}" ${venue.address ? '' : 'aria-disabled="true"'}>${icon('directions', { size: 22 })}<span>Directions</span></button>
      <button type="button" class="act" data-action="share" data-id="${esc(venue.id)}">${icon('share', { size: 22 })}<span>Share</span></button>
      ${globalThis.__STORE__ ? '' : `<a class="act" href="#/groups/new?venue=${encodeURIComponent(venue.id)}">${icon('users', { size: 22 })}<span>Group</span></a>`}
    </div>
    ${factStrip(venue, now)}
    ${tonightSection(ev, now, ctx.loadFailed || ctx.eventsMissing)}
    ${globalThis.__STORE__ ? '' : ideasSection(venue, ctx)}
    ${globalThis.__STORE__ ? '' : vibeSection(venue)}
    ${dealsSection(venue, now)}
    ${globalThis.__STORE__ ? '' : foodSection(venue)}
    ${globalThis.__STORE__ ? '' : pollSection(venue, ctx.state.votes?.[venue.id] ?? null)}
    ${globalThis.__STORE__ ? lastNightSection(venue) : typicalStrip(venue, now)}
    ${globalThis.__STORE__ ? '' : passCta(venue, now)}
    <div class="section-head"><h2>Entry details</h2></div>
    <dl class="facts">
      <div><dt>Cover</dt><dd>${esc(cover)}</dd></div>
      <div><dt>Age policy</dt><dd>21+ with valid physical ID</dd></div>
      <div><dt>Hours tonight</dt><dd>${esc(hours)}</dd></div>
      <div><dt>Status</dt><dd>${esc(openText)}</dd></div>
      ${globalThis.__STORE__ ? '' : `<div><dt>Priority windows</dt><dd>${esc(windows)}</dd></div>`}
      <div><dt>Address</dt><dd>${esc([venue.address, venue.area].filter(Boolean).join(' · ') || 'Not listed')}</dd></div>
      ${distanceText(venue) ? `<div><dt>Distance</dt><dd>${esc(distanceText(venue))} from ${esc(originLabel())}</dd></div>` : ''}
      ${venue.source ? `<div><dt>Name &amp; address from</dt><dd>${esc(venue.source)}</dd></div>` : ''}
    </dl>
    ${globalThis.__STORE__ ? '' : `<div class="section-head"><h2 id="menu" tabindex="-1">Menu</h2></div>`}
    ${globalThis.__STORE__ ? '' : venue.menu?.length ? venue.menu.map((s) => `<div class="menu-section"><h3>${esc(s.title)}</h3>${s.items.map((it) => `<div class="menu-item"><span>${esc(it.name)}</span><span class="num">${it.price === 0 ? 'Free' : dollars(it.price)}</span></div>`).join('')}</div>`).join('') : '<p class="hint">No menu listed.</p>'}
    
    
  </div>`;
}

/** Tonight's deals as tickets: live first, then later, then ended. Every one is a demo deal. The live tick re-renders it (data-deals). */
export function dealsSection(venue, now) {
  const deals = dealsTonight(venue, now);
  if (!deals.length) return '';
  const mins = (ms) => Math.max(0, Math.round(ms / 60000));
  const left = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`);
  return `<section class="deals" data-deals="${esc(venue.id)}" aria-labelledby="deals-h">
    <div class="section-head"><h2 id="deals-h">Deals tonight</h2></div>
    <ul class="deal-list">${deals.map((d) => {
      const st = dealState(d, now);
      const kind = DEAL_KINDS[d.kind] ?? DEAL_KINDS.food;
      const frac = st === 'live' ? Math.max(0, Math.min(1, (d.endsAt - now) / (d.endsAt - d.startsAt))) : 0;
      const when = st === 'live' ? `Now until ${formatTime(d.endsAt)} · ${left(mins(d.endsAt - now))} left` : st === 'soon' ? `${formatTime(d.startsAt)}–${formatTime(d.endsAt)} · starts in ${left(mins(d.startsAt - now))}` : 'Ended';
      return `<li class="deal-row promo-row" id="deal-${esc(d.id)}" tabindex="-1" data-state="${st}">
        <span class="promo-head"><span class="promo-badge is-lg" data-type="${esc(d.promo?.type ?? 'price')}">${icon('tag', { size: 14 })}${esc(promoLabel(d))}</span><span class="deal-state-word">${st === 'live' ? 'Live' : st === 'soon' ? 'Later tonight' : 'Ended'}</span></span>
        <span class="promo-on"><span class="eyebrow">Applies to</span><b>${esc(promoItem(d))}</b></span>
        <span class="deal-title">${esc(d.title)}</span>
        <span class="deal-meta num">${esc(when)}</span>
        ${st === 'live' ? `<span class="deal-left" aria-hidden="true"><i style="--left:${frac.toFixed(3)}"></i></span>` : ''}
        <span class="promo-terms">${icon('info', { size: 14 })}<span>${esc(d.terms ?? (kind.adults ? '21+.' : ''))} ${kind.adults ? '' : 'Not valid on alcohol.'}</span></span>
      </li>`;
    }).join('')}</ul>
    
  </section>`;
}

/** Tonight's event at this bar (live or later tonight); otherwise the next one this week. */
function tonightEvent(ctx, venue) {
  // Approved community ideas count as events; pending and declined ones never do.
  const mine = [...(ctx.events ?? []), ...(ctx.ideas ?? []).filter((x) => x.status === 'approved')].filter((e) => e.venueId === venue.id).sort((a, b) => a.startsAt - b.startsAt);
  const night = ctx.state.clock.base;
  const tonight = mine.find((e) => eventWindow(e, ctx.now, night) === 'tonight');
  if (tonight) return { ev: tonight, when: 'tonight' };
  const next = mine.find((e) => eventWindow(e, ctx.now, night) === 'week');
  return next ? { ev: next, when: 'week' } : null;
}

const dayName = (ms) => new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(ms);

function tonightSection(found, now, loadFailed = false) {
  const head = (title, community = false) => `<div class="section-head"><h2 id="tonight-h">${title}</h2>${community ? '<span class="eyebrow">Community idea</span>' : ''}</div>`;
  if (!found) return `<section class="tonight" aria-labelledby="tonight-h">${head('Tonight')}<p class="hint">${globalThis.__STORE__ ? (loadFailed ? 'Events not loaded.' : 'No event listed tonight.') : 'No event listed this week.'}</p></section>`;
  const { ev, when } = found;
  const time = `${when === 'week' ? `${dayName(ev.startsAt)} ` : ''}${formatTime(ev.startsAt)}${ev.endsAt ? `–${formatTime(ev.endsAt)}` : ' till late'}`;
  const community = ev.kind === 'community';
  return `<section class="tonight" aria-labelledby="tonight-h">${head(when === 'tonight' ? 'Tonight' : 'Next event', community)}
    <article class="event-card">
      <span class="event-icon">${icon('music', { size: 22 })}</span>
      <div class="event-main">
        <h3 class="event-title">${esc(ev.title)}${isLive(ev, now) ? '<span class="live-chip">Live</span>' : ''}</h3>
        <p class="event-time num">${esc(time)}</p>
      </div>
      <dl class="event-facts">
        ${globalThis.__STORE__ ? (ev.music ? `<div><dt>Details</dt><dd>${esc(ev.music)}</dd></div>` : '') : `<div><dt>Music</dt><dd>${esc(ev.music)}</dd></div>`}
        ${community ? `<div><dt>Idea by</dt><dd>${esc(ev.by.name)}</dd></div>` : ev.host ? `<div><dt>Host</dt><dd>${esc(ev.host)}</dd></div>` : ''}
        <div><dt>Cover</dt><dd>${community ? esc(coverLabel(ev.cover)) : globalThis.__STORE__ ? (ev.cover == null ? 'Not listed' : ev.cover === 0 ? 'Free' : `$${ev.cover}`) : ev.cover ? `$${ev.cover}` : 'Free'}</dd></div>
        <div><dt>Age</dt><dd>21+</dd></div>
      </dl>
    </article>
  </section>`;
}

function vibeSection(venue) {
  const v = VIBE[venue.id];
  if (!v) return '';
  return `<section class="vibe" aria-labelledby="vibe-h">
    <div class="section-head"><h2 id="vibe-h">The vibe</h2></div>
    <dl class="fact-strip">
      <div><dt>Entry</dt><dd>21+<span class="fact-sub">Physical ID</span></dd></div>
      <div><dt>Crowd age</dt><dd>${v.typicalAge[0]}–${v.typicalAge[1]}<span class="fact-sub">Most people’s age</span></dd></div>
      <div><dt>Drinks</dt><dd>$${v.drinks[0]}–${v.drinks[1]}<span class="fact-sub">Typical price</span></dd></div>
    </dl>
  </section>`;
}

function foodSection(venue) {
  const food = venue.menu?.find((s) => s.title === 'Food');
  if (!food?.items.length) return '';
  return `<section class="food" aria-labelledby="food-h">
    <div class="section-head"><h2 id="food-h">Food</h2></div>
    <div class="food-row"><span class="event-icon">${icon('food', { size: 22 })}</span><div class="food-main"><p class="food-title">Bar food available</p><p class="hint" style="margin:0">${esc(food.items.map((i) => i.name.replace(/\s*\(.*\)$/, '')).join(' · '))}</p></div>
      <button type="button" class="btn btn-sm" data-action="scroll-to" data-target="menu">View menu</button></div>
  </section>`;
}

const VOTES = [['going', 'Going'], ['maybe', 'Maybe'], ['no', 'Not tonight']];
export function pollSection(venue, vote) {
  const base = POLL[venue.id];
  if (!base) return '';
  const r = pollResult(base, vote);
  return `<section class="poll" id="poll-${esc(venue.id)}" aria-labelledby="poll-h">
    <div class="section-head"><h2 id="poll-h">Who’s going?</h2></div>
    <div class="poll-options" role="group" aria-label="Are you going tonight?">
      ${VOTES.map(([k, label]) => `<button type="button" class="poll-opt" data-action="vote" data-id="${esc(venue.id)}" data-vote="${k}" aria-pressed="${vote === k}" style="--pf:${(r.pct[k] / 100).toFixed(2)}">
        <span class="poll-label"><span class="poll-check" aria-hidden="true">${icon('check', { size: 16 })}</span>${label}</span><span class="poll-pct num roll">${r.pct[k]}%</span></button>`).join('')}
    </div>
    <p class="hint">${r.total} answers${vote ? ', including yours' : ''}</p>
  </section>`;
}

/** Directions sheet: the address and links that open the phone's maps app (the link carries only the address). */
export function directionsSheet(venue) {
  const q = encodeURIComponent(`${venue.address}, New Brunswick, NJ 08901`);
  return `<div class="sheet-head"><span class="sheet-grabber" aria-hidden="true"></span><h2 class="sheet-title" id="picker-title">Directions to ${esc(venue.name)}</h2>
      <button type="button" class="icon-btn sheet-close" data-action="close-picker" aria-label="Close">${icon('x')}</button></div>
    <div class="sheet-body">
      <p class="dir-address">${icon('pinFill', { size: 18 })}<span>${esc(venue.address)}, New Brunswick, NJ</span></p>
      ${distanceText(venue) ? `<p class="hint">${esc(distanceText(venue))} from ${esc(originLabel())}</p>` : ''}
      <div class="dir-links">
        <a class="btn btn-primary btn-lg btn-block" href="https://maps.apple.com/?daddr=${q}&amp;dirflg=w" target="_blank" rel="noopener noreferrer">Open in Apple Maps</a>
        <a class="btn btn-lg btn-block" href="https://www.google.com/maps/dir/?api=1&amp;destination=${q}&amp;travelmode=walking" target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
      </div>
      
    </div>`;
}
