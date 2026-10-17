// Shared HTML builders. The queue estimate is rendered ONLY through estimateCompact/estimateBlock so the
// same venue reads identically on cards, map preview, detail, Saved and the operator preview
// (Tim Gabe: one consistent pattern for the same situation).
import { describeEstimate, FRESHNESS_MINUTES, ageMinutes } from '../lib/queue.js';
import { isOpenAt } from '../lib/explore.js';
import { passStatus, PASS_STATUS_COPY, money, dollars } from '../lib/pass.js';
import { formatTime } from '../lib/clock.js';
import { icon, TONE_ICON, TONE_LABEL } from './icons.js';
import { facadeArt, monogram } from './art.js';
import { distanceTo, formatMiles, DEMO_SPOT } from '../lib/geo.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function estimateFor(venue, now) {
  const open = isOpenAt(venue, now);
  return describeEstimate(venue, now, { isOpen: open !== false });
}

const toneBadge = (tone) => `<span class="tone tone-${tone}">${icon(TONE_ICON[tone])}${TONE_LABEL[tone]}</span>`;

const SEP = '<span class="sep" aria-hidden="true">•</span>';
const RANGE_TONES = ['fresh', 'aging', 'uncertain'];

/**
 * The wait ring: Night Out's signature badge (the slot a score circle takes in list apps). It shows a
 * RANGE with a MIN unit, or a state word, never a rating. The arc is how fresh the update is: it
 * empties as the report ages, and its color means freshness only (green fresh, amber needs care).
 * Stale and unknown estimates show "?" and no number. Purely visual: the text twin is in estimateCompact.
 */
export function estimateRing(venue, now, { size = 56 } = {}) {
  const est = estimateFor(venue, now);
  const q = venue.queue;
  const stale = q?.sourceType ? FRESHNESS_MINUTES[q.sourceType]?.stale : null;
  const age = q?.observedAt != null ? ageMinutes(q.observedAt, now) : null;
  const life = RANGE_TONES.includes(est.tone) && stale && age != null ? Math.max(0.06, Math.min(1, 1 - age / stale)) : 1;
  let center;
  if (RANGE_TONES.includes(est.tone) && est.waitLow != null) {
    const range = `${est.waitLow}–${est.waitHigh}`;
    const text = range.length > 7 ? `${est.waitLow}+` : range;
    center = `<b class="ring-num" data-len="${text.length}">${esc(text)}</b><small>min</small>`;
  } else {
    const word = { capacity: 'Full', paused: 'Paused', closed: 'Closed' }[est.tone];
    center = word ? `<small class="ring-word">${word}</small>` : '<b class="ring-q">?</b>';
  }
  const arc = ['stale', 'unknown', 'closed'].includes(est.tone) ? ''
    : `<circle class="ring-arc" cx="30" cy="30" r="27" pathLength="100" stroke-dasharray="${(life * 100).toFixed(1)} 100" transform="rotate(-90 30 30)"/>`;
  return `<span class="ring" data-est="${esc(venue.id)}" data-variant="ring" data-size="${size}" data-tone="${est.tone}" style="--ring:${size}px" aria-hidden="true">
    <svg viewBox="0 0 60 60" width="${size}" height="${size}" focusable="false"><circle class="ring-track" cx="30" cy="30" r="27"/>${arc}</svg>
    <span class="ring-text">${center}</span><span class="ring-tag">Demo</span>
  </span>`;
}

/** The text twin of the ring: one meta line for rows, map preview and Saved, plus the full screen-reader summary. */
export function estimateCompact(venue, now) {
  const est = estimateFor(venue, now);
  const showPeople = est.peopleLabel && !['stale', 'unknown', 'closed'].includes(est.tone);
  const srSummary = `${est.headline}. ${showPeople ? `${est.peopleLabel}. ` : ''}${est.detail ? `${est.detail}. ` : ''}${est.observedAt != null ? `${est.sourceLabel}, ${est.ageLabel}.` : ''} Demo data.`;
  const parts = [`<span class="tone-word tw-${est.tone}">${icon(TONE_ICON[est.tone], { size: 14 })}${TONE_LABEL[est.tone]}</span>`];
  if (!RANGE_TONES.includes(est.tone) && est.tone !== 'capacity' && est.detail && est.tone !== 'stale') parts.push(`<span>${esc(est.detail)}</span>`);
  if (est.observedAt != null && est.tone !== 'closed') parts.push(`<span>${esc(est.shortSource)}</span>`, `<span><time datetime="${new Date(est.observedAt).toISOString()}">${esc(est.ageLabel)}</time></span>`);
  if (showPeople) parts.push(`<span class="num">${esc(est.peopleLabel)}</span>`);
  return `<span class="est" data-est="${esc(venue.id)}" data-variant="compact" data-tone="${est.tone}">
    <span class="sr-only">${esc(srSummary)}</span>
    <span class="est-meta" aria-hidden="true">${parts.join(SEP)}</span>
  </span>`;
}

/** Full estimate block for venue detail and the operator's guest preview. */
export function estimateBlock(venue, now, { headingId = 'qb-h', showHow = true, headingLevel = 2 } = {}) {
  const est = estimateFor(venue, now);
  const q = venue.queue;
  const [big, unit] = /^(\d+–\d+) min$/.test(est.headline) ? [est.headline.replace(' min', ''), 'min'] : [est.headline, ''];
  const facts = [];
  if (est.peopleLabel && !['stale', 'unknown', 'closed'].includes(est.tone)) facts.push(['In line', est.peopleLabel.replace(' in line', '')]);
  if (Number.isFinite(q?.admitPerMin) && q.admitPerMin > 0 && !['stale', 'unknown', 'closed'].includes(est.tone)) facts.push(['Door pace', `${q.admitPerMin}/min`]);
  if (est.confidence) facts.push(['Confidence', est.confidence]);
  if (est.observedAt != null) facts.push(['Source', est.shortSource === 'Venue' ? 'Venue' : est.shortSource], ['Updated', est.ageLabel]);
  const h = `h${headingLevel}`;
  return `<section class="queue-block" data-est="${esc(venue.id)}" data-variant="block" data-tone="${est.tone}" data-level="${headingLevel}" aria-labelledby="${headingId}">
    <div class="qb-top">
      <${h} class="qb-label" id="${headingId}">Estimated wait at the door</${h}>
      <span class="qb-tags"><span class="crowd-chip" data-level="${crowdStatus(est).level}">${icon(crowdStatus(est).icon, { size: 16 })}${esc(crowdStatus(est).label)}</span>${toneBadge(est.tone)}<span class="demo-tag">Demo data</span></span>
    </div>
    <p class="qb-wait">${esc(big)}${unit ? `<small>${unit}</small>` : ''}</p>
    ${est.detail ? `<p class="qb-detail">${esc(est.detail)}</p>` : ''}
    ${q?.note && est.tone !== 'paused' && !['stale', 'unknown'].includes(est.tone) ? `<p class="qb-detail">Venue note: ${esc(q.note)}</p>` : ''}
    ${facts.length ? `<dl class="qb-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
    ${est.observedAt != null && est.tone !== 'closed' ? `<p class="hint">${esc(est.sourceLabel)} at ${esc(formatTime(est.observedAt))} (demo time).</p>` : ''}
    ${showHow ? howItWorks() : ''}
  </section>`;
}

export function howItWorks() {
  const v = FRESHNESS_MINUTES.venue;
  return `<details class="how"><summary>How this estimate works</summary>
    <p>Estimates are ranges, never exact times. In this prototype every number is simulated; none comes from the bar.</p>
    <ul>
      <li><strong>Venue update</strong>: door staff report about how many people are in line and how fast they’re admitting. Wait ≈ people ahead ÷ admissions per minute, widened for uncertainty.</li>
      <li><strong>Crowd reports</strong>: guests near the door report the line. Fewer reports or disagreeing reports mean lower confidence.</li>
      <li>Fresh for ${v.fresh} minutes, then marked “may have changed”. After ${v.stale} minutes the number is hidden and we say the wait is unavailable.</li>
      <li>“At capacity” means entry only as people leave, so the wait can grow quickly regardless of line length.</li>
      <li>Typical patterns describe past nights and are never shown as the current wait.</li>
    </ul></details>`;
}

/**
 * Crowd status for the card's bottom bar (team mockup): Quiet / Lively / Packed by the TOP of the wait
 * range (Quiet <=5 min, Lively <=15, Packed longer), plus the range in words. Color is never the only
 * cue: every state has a word, an icon shape and a sub-line. States without a usable range say so.
 */
export function crowdStatus(est) {
  switch (est.tone) {
    case 'closed': return { level: 'closed', label: 'Closed', sub: 'Not open now', icon: 'closed' };
    case 'paused': return { level: 'paused', label: 'Paused', sub: 'Entry paused', icon: 'pause' };
    case 'capacity': return { level: 'packed', label: 'Full', sub: 'At capacity', icon: 'crowd3' };
    case 'stale': return { level: 'none', label: 'No update', sub: 'Out of date', icon: 'help' };
    case 'unknown': return { level: 'none', label: 'No reports', sub: 'Wait unknown', icon: 'help' };
    default: break;
  }
  if (est.waitHigh == null) return { level: 'none', label: 'Unclear', sub: 'Reports disagree', icon: 'uncertain' };
  const level = est.waitHigh <= 5 ? 'quiet' : est.waitHigh <= 15 ? 'lively' : 'packed';
  return {
    level,
    label: { quiet: 'Quiet', lively: 'Lively', packed: 'Packed' }[level],
    sub: est.waitHigh <= 2 ? 'No wait' : `${est.waitLow}–${est.waitHigh} min wait`,
    icon: level === 'quiet' ? 'crowd1' : 'crowd3',
    maybe: est.tone === 'aging' || est.tone === 'uncertain',
  };
}

/** The card's bottom bar: crowd icon | word + wait. Visual only; the text twin is srSummary. */
export function cardStatus(venue, now) {
  const est = estimateFor(venue, now);
  const st = crowdStatus(est);
  return `<span class="card-status" data-est="${esc(venue.id)}" data-variant="status" data-tone="${est.tone}" data-level="${st.level}"${st.maybe ? ' data-maybe' : ''} aria-hidden="true">
    <span class="cs-icon">${icon(st.icon, { size: 26 })}</span><span class="cs-text"><b>${esc(st.label)}</b><small>${esc(st.sub)}</small></span>
  </span>`;
}

/** Distance line for the card's top right and the venue page. */
export function distanceText(venue, from = DEMO_SPOT) {
  return formatMiles(distanceTo(venue, from));
}

export function srSummary(venue, now) {
  const est = estimateFor(venue, now);
  const st = crowdStatus(est);
  const showPeople = est.peopleLabel && !['stale', 'unknown', 'closed'].includes(est.tone);
  const dist = distanceText(venue);
  const text = `${st.label}: ${est.headline}. ${est.tone === 'aging' ? 'May have changed. ' : ''}${showPeople ? `${est.peopleLabel}. ` : ''}${est.detail ? `${est.detail}. ` : ''}${est.observedAt != null ? `${est.sourceLabel}, ${est.ageLabel}.` : ''}${dist ? ` ${dist} from the demo spot.` : ''} Demo data.`;
  return `<span class="sr-only" data-est="${esc(venue.id)}" data-variant="sr" data-tone="${est.tone}">${esc(text)}</span>`;
}

/** Photo slot: the venue's own photo when licensed or permitted (venue.photo), else the drawn storefront. */
export function venuePhoto(venue, { title = false, anchor } = {}) {
  return venue.photo ? `<img src="${esc(venue.photo)}" alt="${title ? esc(`Photo of ${venue.name}`) : ''}" loading="lazy" decoding="async">` : facadeArt(venue, { title, anchor });
}
/** Logo slot: the bar's logo only with the bar's permission (venue.logo), else an initials badge. */
export function venueLogo(venue) {
  return venue.logo ? `<img src="${esc(venue.logo)}" alt="" loading="lazy">` : `<span class="mono">${esc(monogram(venue))}</span>`;
}

/**
 * Bar card (team mockup): logo top left, distance top right, name, photo, crowd status bar.
 * `save` adds the Save toggle (Saved page only; the home grid matches the mockup without it).
 */
export function venueCard(venue, now, { saved = false, save = false } = {}) {
  const dist = distanceText(venue);
  return `<li class="bar-card" data-venue-row="${esc(venue.id)}" data-area="${esc(venue.area ?? '')}">
    <a class="bar-link" href="#/venue/${encodeURIComponent(venue.id)}" data-nav-venue="${esc(venue.id)}">
      <span class="card-top"><span class="bar-logo" aria-hidden="true">${venueLogo(venue)}</span><span class="card-dist">${icon('pinFill', { size: 16 })}${dist ? `${esc(dist)}<span class="dist-away">away</span>` : 'n/a'}</span></span>
      <span class="bar-name">${esc(venue.name)}</span>
      <span class="bar-photo" data-thumb="${esc(venue.id)}">${venuePhoto(venue, { anchor: 'bottom' })}</span>
      ${cardStatus(venue, now)}
      ${srSummary(venue, now)}
    </a>
    ${save ? saveButton(venue, saved, 'save card-save') : ''}
  </li>`;
}

export const coverText = (venue) => (venue.cover === 0 ? 'No cover' : venue.cover == null ? 'Cover not listed' : `${dollars(venue.cover)} cover`);

/** Flat, typographic list row (no thumbnail): name, "cover | kind", area; the wait ring at top right. */
export function venueRow(venue, now, { saved = false, selected = false } = {}) {
  const line2 = [coverText(venue), venue.tags?.[0]].filter(Boolean).join(' | ');
  return `<li class="venue-row${selected ? ' is-selected' : ''}" data-venue-row="${esc(venue.id)}">
    <a class="venue-link" href="#/venue/${encodeURIComponent(venue.id)}" data-nav-venue="${esc(venue.id)}" ${selected ? 'aria-current="true"' : ''}>
      <span class="row-main">
        <span class="row-title">${esc(venue.name)}</span>
        <span class="row-line2">${esc(line2)}</span>
        <span class="row-line3">${esc(venue.area ?? 'Area not listed')}</span>
      </span>
      ${estimateRing(venue, now, { size: 56 })}
      ${estimateCompact(venue, now)}
    </a>
    ${saveButton(venue, saved)}
  </li>`;
}

export function saveButton(venue, saved, extraCls = 'save') {
  return `<button type="button" class="icon-btn ${extraCls}" data-action="toggle-save" data-id="${esc(venue.id)}" aria-pressed="${saved}" aria-label="Save ${esc(venue.name)}">${icon(saved ? 'bookmarkFill' : 'bookmark')}</button>`;
}

export function skeletonRows(n = 5) {
  return `<div class="sk-group" aria-hidden="true">${Array.from({ length: n }, () => '<div class="skeleton-row"><div class="sk-lines"><div class="sk sk-l1"></div><div class="sk sk-l2"></div><div class="sk sk-l3"></div><div class="sk sk-l4"></div></div><div class="sk sk-ring"></div></div>').join('')}</div>`;
}

export function stateBox({ iconName = 'info', title, body, actions = '', headingLevel = 2 }) {
  const h = `h${headingLevel}`;
  const attrs = headingLevel === 1 ? ' id="page-h" tabindex="-1"' : '';
  return `<div class="state"><div class="state-icon">${icon(iconName)}</div><${h}${attrs}>${esc(title)}</${h}>${body ? `<p>${body}</p>` : ''}${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;
}

export function banner(kind, iconName, html, actions = '') {
  return `<div class="banner banner-${kind}" role="${kind === 'error' ? 'alert' : 'status'}">${icon(iconName)}<div>${html}</div>${actions ? `<div class="banner-actions">${actions}</div>` : ''}</div>`;
}

export function windowLabel(start, end) {
  return `${formatTime(start)}–${formatTime(end)}`;
}

export function passCard(pass, now, { headingLevel = 3 } = {}) {
  const status = passStatus(pass, now);
  const h = `h${headingLevel}`;
  const wm = Array.from({ length: 9 }, () => '<span>DEMO · NOT VALID FOR ENTRY · DEMO · NOT VALID FOR ENTRY</span>').join('');
  return `<article class="pass-card" data-status="${status}" aria-label="Demo pass for ${esc(pass.venueName)}, not valid for entry">
    <div class="pass-watermark" aria-hidden="true"><div>${wm}</div></div>
    <div class="pass-top"><div><p class="qb-label" style="color:var(--pass-ink-2)">Demo priority pass</p><${h} class="pass-venue">${esc(pass.venueName)}</${h}></div><span class="pass-status">${esc(PASS_STATUS_COPY[status])}</span></div>
    <dl class="pass-grid">
      <div><dt>Entry window</dt><dd>${esc(windowLabel(pass.windowStart, pass.windowEnd))}</dd></div>
      <div><dt>Party</dt><dd>${pass.party} ${pass.party === 1 ? 'person' : 'people'}</dd></div>
      <div><dt>Demo total</dt><dd>${money(pass.total)} <span style="font-weight:500;color:var(--pass-ink-2)">(no charge)</span></dd></div>
      <div><dt>Reference</dt><dd class="pass-ref">${esc(pass.ref)}</dd></div>
      <div><dt>Cover</dt><dd>${esc(pass.coverNote)}</dd></div>
      <div><dt>ID</dt><dd>Physical ID checked at the door</dd></div>
    </dl>
    <p class="pass-invalid">${icon('alert')}Demo pass. No charge. Not valid for entry.</p>
  </article>`;
}

export function demoChip(nowMs) {
  return `<a class="demo-chip" href="#/about" aria-label="Demo data: real bar names, simulated waits and passes. About this demo"><span class="dot" aria-hidden="true"></span>Demo data</a><span class="demo-time num"><span class="demo-time-label">Demo time </span><span data-demo-time>${esc(formatTime(nowMs))}</span></span>`;
}
