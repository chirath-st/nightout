import { esc, estimateBlock, saveButton, stateBox, windowLabel, coverText, venuePhoto, venueLogo, distanceText, factStrip, howItWorks } from '../ui/components.js';
import { formatTime } from '../lib/clock.js';
import { VIBE, POLL } from '../data/events.js';
import { eventWindow, isLive, pollResult } from '../lib/events.js';
import { POINTS } from '../data/social.js';
import { DEMO_SPOT } from '../lib/geo.js';
import { dealsTonight, dealState, DEAL_KINDS } from '../lib/deals.js';
import { dealWhen } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { isOpenAt } from '../lib/explore.js';
import { offerSummary, money, dollars } from '../lib/pass.js';
import { TYPICAL_LABELS } from '../lib/queue.js';
import { TYPICAL_HOURS } from '../data/venues.js';

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
    <h2 class="qb-label" id="typ-h">Typical weekend night (model)</h2>
    <p class="hint" style="margin-top:2px">Simulated pattern, not this bar’s real traffic and not the current wait.</p>
    <div class="typical-bars" aria-hidden="true">${venue.typical.map((n, i) => `<span class="${i === idx ? 'is-now' : ''}" style="height:${10 + n * 22}%"></span>`).join('')}</div>
    <div class="typical-axis" aria-hidden="true">${TYPICAL_HOURS.map((h) => `<span>${h}</span>`).join('')}</div>
    <p class="hint">Usually ${esc(TYPICAL_LABELS[venue.typical[peak]].toLowerCase())} around ${TYPICAL_HOURS[peak]}. ${idx >= 0 ? `Highlighted bar = now on the demo clock (${esc(TYPICAL_LABELS[venue.typical[idx]].toLowerCase())}).` : ''}</p>
  </section>`;
}

function passCta(venue, now) {
  if (!venue.pass) {
    return `<section class="pass-cta" aria-labelledby="pass-h"><h2 id="pass-h">Priority entry</h2><p>Night Out doesn’t simulate a priority pass for this bar. Use the estimate above to decide when to go.</p></section>`;
  }
  const s = offerSummary(venue.pass, now);
  const per = money(venue.pass.basePrice + venue.pass.serviceFee);
  const why = {
    available: `Simulated windows and capped inventory, ${per} per person all-in. ${esc(venue.name)} isn’t affiliated with Night Out and doesn’t sell passes here; no payment is taken and the pass isn’t valid for entry.`,
    paused: 'Simulated state: priority passes are paused. In a real product the venue could resume them.',
    soldout: 'Every remaining window is sold out (simulated inventory).',
    passed: 'All of tonight’s priority windows have ended.',
    unavailable: 'Not offered tonight.',
  }[s.state];
  // Only the available state gets a control; other states are plain status text, not a dead button.
  const btn = s.state === 'available'
    ? `<a class="btn btn-primary btn-lg btn-block" href="#/venue/${encodeURIComponent(venue.id)}/pass" data-nav="pass">${icon('ticket')}Review priority pass (demo)</a>`
    : `<p class="pass-state">${icon('ticket')}<span>${esc(s.label)}</span></p>`;
  return `<section class="pass-cta" aria-labelledby="pass-h">
    <div class="pass-cta-head"><h2 id="pass-h">Priority entry</h2><span class="demo-tag">Simulated, not affiliated</span></div>
    <p>${why}</p>${btn}</section>`;
}

export function renderVenue(ctx, id) {
  const venue = ctx.venues.find((v) => v.id === id);
  if (!venue) {
    return `<div class="page">${stateBox({ iconName: 'help', title: 'Venue not found', body: 'This link points to a venue that isn’t in the current demo dataset.', actions: `<a class="btn btn-primary" href="${ctx.backHref}">Back to ${esc(ctx.backLabel)}</a>`, headingLevel: 1 })}</div>`;
  }
  const now = ctx.now;
  const open = isOpenAt(venue, now);
  const hours = venue.closedTonight ? 'Closed tonight (simulated)' : venue.hours ? `${to12(venue.hours.open)}–${to12(venue.hours.close)} (simulated)` : 'Not listed';
  const openText = open === true ? 'Open now' : open === false ? 'Closed now' : 'Hours not listed';
  const cover = venue.cover === 0 ? 'No cover (simulated)' : venue.cover == null ? 'Not listed' : `${dollars(venue.cover)} at the door (simulated)`;
  const saved = ctx.savedSet.has(venue.id);
  const windows = venue.pass?.enabled ? venue.pass.windows.map((w) => windowLabel(w.start, w.end)).join(', ') : 'Not offered';
  const kind = [coverText(venue), venue.tags?.join(' · ')].filter(Boolean).join(' | ');
  const hoursShort = venue.closedTonight ? 'Closed tonight' : venue.hours ? `${to12(venue.hours.open)}–${to12(venue.hours.close)}` : null;
  const ev = tonightEvent(ctx, venue);
  const eyebrow = [venue.area, venue.tags?.[0]].filter(Boolean).join(' · ');
  return `<div class="page detail">
    <div class="detail-hero" data-hero="${esc(venue.id)}">${venuePhoto(venue, { title: true })}
      <a class="back-link hero-btn" href="${ctx.backHref}" data-action="back" aria-label="Back to ${esc(ctx.backLabel)}">${icon('chevronLeft', { size: 22 })}</a>
      <span class="hero-caption">${icon('info', { size: 13 })}<span>${venue.photo ? esc(venue.photoCredit ? `Photo: ${venue.photoCredit}` : 'Photo used with permission') : 'Illustration, not a photo'}</span></span>
      ${saveButton(venue, saved, 'save-detail hero-btn')}
      <div class="hero-title">
        <span class="hero-meta"><span class="bar-logo hero-logo" aria-hidden="true">${venueLogo(venue)}</span><span class="eyebrow">${esc(eyebrow)}</span></span>
        <h1 class="hero-name" id="page-h" tabindex="-1">${esc(venue.name)}</h1>
        ${distanceText(venue) ? `<p class="hero-sub">${icon('nav', { size: 12 })}<span>New Brunswick · ${esc(distanceText(venue))} away</span></p>` : ''}
      </div>
    </div>
    <p class="affiliation">${icon('info', { size: 14 })}<span>Independent listing. Not affiliated with the bar. Waits, events, deals, prices and polls here are simulated.</span></p>
    ${estimateBlock(venue, now, { showHow: false })}
    <div class="venue-actions">
      <a class="act act-primary" href="#/scan?venue=${encodeURIComponent(venue.id)}">${icon('report', { size: 22 })}<span>Report the line</span><span class="act-pts" aria-hidden="true">+${POINTS.REPORT}</span><span class="sr-only">, earn ${POINTS.REPORT} demo points</span></a>
      <button type="button" class="act" data-action="directions" data-id="${esc(venue.id)}" ${venue.address ? '' : 'aria-disabled="true"'}>${icon('directions', { size: 22 })}<span>Directions</span></button>
      <button type="button" class="act" data-action="share" data-id="${esc(venue.id)}">${icon('share', { size: 22 })}<span>Share</span></button>
      <a class="act" href="#/groups/new?venue=${encodeURIComponent(venue.id)}">${icon('users', { size: 22 })}<span>Group</span></a>
    </div>
    ${factStrip(venue, now)}
    ${tonightSection(ev, now)}
    ${vibeSection(venue)}
    ${dealsSection(venue, now)}
    ${foodSection(venue)}
    ${pollSection(venue, ctx.state.votes?.[venue.id] ?? null)}
    ${howItWorks()}
    ${typicalStrip(venue, now)}
    ${passCta(venue, now)}
    <div class="section-head"><h2>Entry details</h2><span class="eyebrow">Simulated</span></div>
    <dl class="facts">
      <div><dt>Cover</dt><dd>${esc(cover)}</dd></div>
      <div><dt>Age policy</dt><dd>21+ with valid physical ID</dd></div>
      <div><dt>Hours tonight</dt><dd>${esc(hours)}</dd></div>
      <div><dt>Status</dt><dd>${esc(openText)}</dd></div>
      <div><dt>Priority windows</dt><dd>${esc(windows)}</dd></div>
      <div><dt>Address</dt><dd>${esc([venue.address, venue.area].filter(Boolean).join(' · ') || 'Not listed')}</dd></div>
      ${distanceText(venue) ? `<div><dt>Distance</dt><dd>${esc(distanceText(venue))} from ${esc(DEMO_SPOT.label)} (demo spot, straight line)</dd></div>` : ''}
      ${venue.source ? `<div><dt>Name &amp; address from</dt><dd>${esc(venue.source)}</dd></div>` : ''}
    </dl>
    <div class="section-head"><h2 id="menu" tabindex="-1">Illustrative menu</h2><span class="eyebrow">Not this bar’s</span></div>
    ${venue.menu?.length ? venue.menu.map((s) => `<div class="menu-section"><h3>${esc(s.title)}</h3>${s.items.map((it) => `<div class="menu-item"><span>${esc(it.name)}</span><span class="num">${it.price === 0 ? 'Free' : dollars(it.price)}</span></div>`).join('')}</div>`).join('') : '<p class="hint">No sample menu for this venue.</p>'}
    <p class="hint" style="margin-top:12px">Menus are for browsing only. This prototype has no drink ordering, pre-payment or redemption.</p>
    <section class="pass-cta" aria-labelledby="idpc-h" style="margin-top:var(--s-6)">
      <h2 id="idpc-h" style="display:flex;gap:8px;align-items:center">${icon('id')}About a future ID pre-check</h2>
      <p>A future version might help you check, ahead of time, that you’re bringing an accepted ID. It could never guarantee entry or replace the venue’s own ID check at the door. New Jersey also limits keeping data from scanned IDs. This prototype collects no ID information.</p>
    </section>
    <p class="demo-caption">Night Out isn’t affiliated with ${esc(venue.name)}. Everything on this page except the name and address is simulated. 21+ with physical ID.</p>
  </div>`;
}

/** Tonight's deals as tickets: live first, then later, then ended. Every one is a demo deal. */
function dealsSection(venue, now) {
  const deals = dealsTonight(venue, now);
  if (!deals.length) return '';
  const mins = (ms) => Math.max(0, Math.round(ms / 60000));
  const left = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`);
  return `<section class="deals" aria-labelledby="deals-h">
    <div class="section-head"><h2 id="deals-h">Deals &amp; drink specials</h2><span class="eyebrow">Demo deals</span></div>
    <ul class="deal-list">${deals.map((d) => {
      const st = dealState(d, now);
      const kind = DEAL_KINDS[d.kind] ?? DEAL_KINDS.food;
      const at = st === 'soon' ? d.startsAt : d.endsAt;
      const [t, ap] = formatTime(at).split(/\s+/);
      const frac = st === 'live' ? Math.max(0, Math.min(1, (d.endsAt - now) / (d.endsAt - d.startsAt))) : 0;
      const sub = st === 'live' ? `${left(mins(d.endsAt - now))} left` : st === 'soon' ? `starts in ${left(mins(d.startsAt - now))}` : 'ended';
      const sr = st === 'live' ? `Live now until ${formatTime(d.endsAt)}, ${left(mins(d.endsAt - now))} left.` : st === 'soon' ? `Starts at ${formatTime(d.startsAt)}.` : 'Ended.';
      return `<li class="deal-row" data-state="${st}">
        <span class="deal-icon">${icon(kind.icon, { size: 20 })}</span>
        <span class="deal-main"><span class="eyebrow">${esc(kind.adults ? `${kind.short} · 21+` : `Demo deal · ${kind.short}`)}</span><span class="deal-title">${esc(d.title)}</span><span class="deal-meta">Simulated, not offered by the bar</span></span>
        <span class="deal-stub" aria-hidden="true"><span class="deal-state">${st === 'live' ? 'Live' : st === 'soon' ? 'Soon' : 'Ended'}</span><span class="deal-time num">${esc(t)}<small>${esc(ap ?? '')}</small></span><span class="deal-left"><i style="--left:${(frac * 100).toFixed(0)}%"></i></span><span class="deal-sub">${esc(sub)}</span></span>
        <span class="sr-only">${esc(sr)}</span>
      </li>`;
    }).join('')}</ul>
    <p class="hint">${esc(venue.name)} isn’t offering these. In the real app each deal is set by the bar and valid only there; drink specials are 21+ and never below the bar’s cost.</p>
  </section>`;
}

/** Tonight's event at this bar (live or later tonight); otherwise the next one this week. */
function tonightEvent(ctx, venue) {
  const mine = (ctx.events ?? []).filter((e) => e.venueId === venue.id).sort((a, b) => a.startsAt - b.startsAt);
  const night = ctx.state.clock.base;
  const tonight = mine.find((e) => eventWindow(e, ctx.now, night) === 'tonight');
  if (tonight) return { ev: tonight, when: 'tonight' };
  const next = mine.find((e) => eventWindow(e, ctx.now, night) === 'week');
  return next ? { ev: next, when: 'week' } : null;
}

const dayName = (ms) => new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(ms);

function tonightSection(found, now) {
  const head = (title) => `<div class="section-head"><h2 id="tonight-h">${title}</h2><span class="eyebrow">Sample event</span></div>`;
  if (!found) return `<section class="tonight" aria-labelledby="tonight-h">${head('Tonight')}<p class="hint">No event listed this week.</p></section>`;
  const { ev, when } = found;
  const time = `${when === 'week' ? `${dayName(ev.startsAt)} ` : ''}${formatTime(ev.startsAt)}${ev.endsAt ? `–${formatTime(ev.endsAt)}` : ' till late'}`;
  return `<section class="tonight" aria-labelledby="tonight-h">${head(when === 'tonight' ? 'Tonight' : 'Next event')}
    <article class="event-card">
      <span class="event-icon">${icon('music', { size: 22 })}</span>
      <div class="event-main">
        <h3 class="event-title">${esc(ev.title)}${isLive(ev, now) ? '<span class="live-chip">Live</span>' : ''}</h3>
        <p class="event-time num">${esc(time)}</p>
      </div>
      <dl class="event-facts">
        <div><dt>Music</dt><dd>${esc(ev.music)}</dd></div>
        ${ev.host ? `<div><dt>Host</dt><dd>${esc(ev.host)}</dd></div>` : ''}
        <div><dt>Cover</dt><dd>${ev.cover ? `$${ev.cover}` : 'Free'}</dd></div>
        <div><dt>Age</dt><dd>21+</dd></div>
      </dl>
    </article>
  </section>`;
}

function vibeSection(venue) {
  const v = VIBE[venue.id];
  if (!v) return '';
  return `<section class="vibe" aria-labelledby="vibe-h">
    <div class="section-head"><h2 id="vibe-h">The vibe</h2><span class="eyebrow">Sample</span></div>
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
    <div class="section-head"><h2 id="food-h">Food</h2><span class="eyebrow">Sample menu</span></div>
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
    <div class="section-head"><h2 id="poll-h">Who’s going?</h2><span class="eyebrow">Sample poll</span></div>
    <div class="poll-options" role="group" aria-label="Are you going tonight?">
      ${VOTES.map(([k, label]) => `<button type="button" class="poll-opt" data-action="vote" data-id="${esc(venue.id)}" data-vote="${k}" aria-pressed="${vote === k}" style="--pf:${(r.pct[k] / 100).toFixed(2)}">
        <span class="poll-label">${vote === k ? icon('check', { size: 16 }) : ''}${label}</span><span class="poll-pct num">${r.pct[k]}%</span></button>`).join('')}
    </div>
    <p class="hint">${r.total} answers${vote ? ', including yours' : ''} (sample). Tap your answer again to clear it. Your vote stays on this device.</p>
  </section>`;
}

/** Directions sheet: the address and links that open the phone's maps app (the link carries only the address). */
export function directionsSheet(venue) {
  const q = encodeURIComponent(`${venue.address}, New Brunswick, NJ 08901`);
  return `<div class="sheet-head"><h2 class="sheet-title" id="picker-title">Directions to ${esc(venue.name)}</h2>
      <button type="button" class="icon-btn sheet-close" data-action="close-picker" aria-label="Close">${icon('x')}</button></div>
    <div class="sheet-body">
      <p class="dir-address">${icon('pinFill', { size: 18 })}<span>${esc(venue.address)}, New Brunswick, NJ</span></p>
      ${distanceText(venue) ? `<p class="hint">${esc(distanceText(venue))} in a straight line from the demo spot (${esc(DEMO_SPOT.label)}).</p>` : ''}
      <div class="dir-links">
        <a class="btn btn-primary btn-lg btn-block" href="https://maps.apple.com/?daddr=${q}&amp;dirflg=w" target="_blank" rel="noopener noreferrer">Open in Apple Maps</a>
        <a class="btn btn-lg btn-block" href="https://www.google.com/maps/dir/?api=1&amp;destination=${q}&amp;travelmode=walking" target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
      </div>
      <p class="hint">Opens your maps app with walking directions. Night Out never sees your location.</p>
    </div>`;
}
