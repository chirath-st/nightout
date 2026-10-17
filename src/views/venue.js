import { esc, estimateBlock, estimateRing, saveButton, stateBox, windowLabel, coverText, venuePhoto, venueLogo, distanceText } from '../ui/components.js';
import { DEMO_SPOT } from '../lib/geo.js';
import { icon } from '../ui/icons.js';
import { venueArt } from '../ui/art.js';
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
  return `<div class="page detail">
    <div class="detail-hero" data-hero="${esc(venue.id)}">${venuePhoto(venue, { title: true })}
      <a class="back-link hero-btn" href="${ctx.backHref}" data-action="back" aria-label="Back to ${esc(ctx.backLabel)}">${icon('chevronLeft', { size: 22 })}</a>
      ${saveButton(venue, saved, 'save-detail hero-btn')}
      <span class="hero-caption">${icon('info', { size: 14, cls: 'hero-caption-icon' })}<span>${venue.photo ? esc(venue.photoCredit ? `Photo: ${venue.photoCredit}` : 'Photo used with permission') : 'Illustration, not a photo'}</span></span>
      <div class="hero-title"><span class="bar-logo hero-logo" aria-hidden="true">${venueLogo(venue)}</span><h1 class="hero-name" id="page-h" tabindex="-1">${esc(venue.name)}</h1></div>
      ${estimateRing(venue, now, { size: 72 })}
    </div>
    <div class="detail-head">
      <p class="detail-kind">${esc(kind)}</p>
      <p class="detail-line">${esc([venue.address, venue.area].filter(Boolean).join(' · ') || 'Address not listed')}</p>
      ${distanceText(venue) ? `<p class="detail-line detail-dist">${icon('pinFill', { size: 16 })}<span><strong>${esc(distanceText(venue))}</strong> from ${esc(DEMO_SPOT.label)} (demo starting spot, straight line)</span></p>` : ''}
      <p class="detail-line"><strong>${esc(openText)}</strong>${hoursShort ? `<span class="sep" aria-hidden="true">•</span>${esc(hoursShort)} (simulated)` : ''}</p>
      <p class="affiliation">${icon('info', { size: 14 })}<span>Not affiliated with Night Out. Wait, price and pass details on this page are simulated.</span></p>
      ${venue.blurb ? `<p class="detail-blurb">${esc(venue.blurb)}</p>` : ''}
    </div>
    ${estimateBlock(venue, now)}
    ${typicalStrip(venue, now)}
    ${passCta(venue, now)}
    <h2 class="section-title">Entry details (simulated)</h2>
    <dl class="facts">
      <div><dt>Cover</dt><dd>${esc(cover)}</dd></div>
      <div><dt>Age policy</dt><dd>21+ with valid physical ID</dd></div>
      <div><dt>Hours tonight</dt><dd>${esc(hours)}</dd></div>
      <div><dt>Priority windows</dt><dd>${esc(windows)}</dd></div>
      ${venue.source ? `<div><dt>Name &amp; address from</dt><dd>${esc(venue.source)}</dd></div>` : ''}
    </dl>
    <h2 class="section-title">Illustrative menu</h2>
    <p class="hint">Not this bar’s menu or prices.</p>
    ${venue.menu?.length ? venue.menu.map((s) => `<div class="menu-section"><h3>${esc(s.title)}</h3>${s.items.map((it) => `<div class="menu-item"><span>${esc(it.name)}</span><span>${it.price === 0 ? 'Free' : dollars(it.price)}</span></div>`).join('')}</div>`).join('') : '<p class="hint">No sample menu for this venue.</p>'}
    <p class="hint" style="margin-top:12px">Menus are for browsing only. This prototype has no drink ordering, pre-payment or redemption.</p>
    <section class="pass-cta" aria-labelledby="idpc-h" style="margin-top:var(--s-6)">
      <h2 id="idpc-h" style="display:flex;gap:8px;align-items:center">${icon('id')}About a future ID pre-check</h2>
      <p>A future version might help you check, ahead of time, that you’re bringing an accepted ID. It could never guarantee entry or replace the venue’s own ID check at the door. New Jersey also limits keeping data from scanned IDs. This prototype collects no ID information.</p>
    </section>
  </div>`;
}
