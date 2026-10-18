// Shared HTML builders. The queue estimate is rendered ONLY through estimateCompact/estimateBlock so the
// same venue reads identically on cards, map preview, detail, Saved and the operator preview
// (Tim Gabe: one consistent pattern for the same situation).
import { describeEstimate, FRESHNESS_MINUTES, ageMinutes } from '../lib/queue.js';
import { isOpenAt } from '../lib/explore.js';
import { passStatus, PASS_STATUS_COPY, money, dollars } from '../lib/pass.js';
import { formatTime } from '../lib/clock.js';
import { icon, TONE_ICON, TONE_LABEL } from './icons.js';
import { monogram } from './art.js';
import { nightArt, NIGHT_PALETTES } from './nightart.js';
import { distanceTo, formatMiles, walkMinutes, DEMO_SPOT } from '../lib/geo.js';
import { activeDeal, dealState, DEAL_KINDS, DRINK_ITEMS } from '../lib/deals.js';

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
    <span class="ring-text">${center}</span>
  </span>`;
}

/** The text twin of the ring: one meta line for rows, map preview and Saved, plus the full screen-reader summary. */
export function estimateCompact(venue, now) {
  const est = estimateFor(venue, now);
  const showPeople = est.peopleLabel && !['stale', 'unknown', 'closed'].includes(est.tone);
  const srSummary = `${est.headline}. ${showPeople ? `${est.peopleLabel}. ` : ''}${est.detail ? `${est.detail}. ` : ''}${est.observedAt != null ? `${est.sourceLabel}, ${est.ageLabel}.` : ''}`;
  const parts = [`<span class="tone-word tw-${est.tone}">${icon(TONE_ICON[est.tone], { size: 14 })}${TONE_LABEL[est.tone]}</span>`];
  if (!RANGE_TONES.includes(est.tone) && est.tone !== 'capacity' && est.detail && est.tone !== 'stale') parts.push(`<span>${esc(est.detail)}</span>`);
  if (est.observedAt != null && est.tone !== 'closed') parts.push(`<span>${esc(est.shortSource)}</span>`, `<span><time datetime="${new Date(est.observedAt).toISOString()}">${esc(est.ageLabel)}</time></span>`);
  if (showPeople) parts.push(`<span class="num">${esc(est.peopleLabel)}</span>`);
  return `<span class="est" data-est="${esc(venue.id)}" data-variant="compact" data-tone="${est.tone}">
    <span class="sr-only">${esc(srSummary)}</span>
    <span class="est-meta" aria-hidden="true">${parts.join(SEP)}</span>
  </span>`;
}

/**
 * Full estimate block ("Late Edition"): the range at display size, a 0–30+ scale with the range bracketed,
 * the crowd meter + word + door status, a freshness ruler (fresh / may have changed / out of date) and one
 * plain sentence about the source. Used on the bar page and in the operator's guest preview. Live-patched.
 */
export function estimateBlock(venue, now, { headingId = 'qb-h', showHow = true, headingLevel = 2 } = {}) {
  const est = estimateFor(venue, now);
  const st = crowdStatus(est);
  const q = venue.queue;
  const h = `h${headingLevel}`;
  const rangeTone = ['fresh', 'aging', 'uncertain'].includes(est.tone) && est.waitLow != null;
  const word = { stale: 'Out of date', unknown: 'No reports', closed: 'Closed', capacity: 'At capacity', paused: 'Entry paused' }[est.tone];
  // The range is a .roll: the live tick rolls it in place (main.js patchEstimateBlock); at rest it is plain text.
  const big = rangeTone ? `${est.tone === 'fresh' ? '' : '<span class="approx">≈</span>'}<span class="roll">${est.waitLow}–${est.waitHigh}</span><small>min</small>` : esc(word ?? est.headline);
  const age = est.observedAt != null ? Math.max(0, Math.round((now - est.observedAt) / 60000)) : null;
  const band = est.tone === 'fresh' ? 0 : est.tone === 'aging' || est.tone === 'uncertain' ? 1 : 2;
  const people = est.peopleLabel ? est.peopleLabel.replace(' in line', '') : null;
  const pace = Number.isFinite(q?.admitPerMin) && q.admitPerMin > 0 ? q.admitPerMin : null;
  const door = {
    capacity: 'Entry only as people leave. The wait can grow quickly.',
    paused: q?.note || 'The door has paused entry.',
    closed: est.detail || 'Not open now.',
    stale: age != null ? `Last report ${age} min ago.` : 'No recent report.',
    unknown: 'No one has reported this line yet.',
  }[est.tone] ?? [people && `About ${people.replace(/^~/, '')} in line`, pace && `door moving ~${pace} a min${q?.doorsTotal > 1 ? ` (${q.doorsOpen} of ${q.doorsTotal} doors)` : ''}${q?.paceSource === 'measured' ? ' (measured)' : q?.paceSource === 'assumed' ? ' (assumed)' : ''}`].filter(Boolean).join(', ');
  // Range tones show the level word and meter only: the people and the door pace are in the fact strip (QA plan 9.5). An
  // uncertain estimate keeps its reason; capacity, paused, stale and unknown keep their door sentence.
  const reason = est.tone === 'uncertain' && est.detail ? `${est.detail}.` : '';
  const doorLine = rangeTone ? reason : [reason, door].filter(Boolean).join(' ');
  const levelGlyph = { closed: 'moon', paused: 'pause', stale: 'aging', unknown: 'help' }[est.tone];
  const levelHead = levelGlyph ? `${icon(levelGlyph, { size: 18, cls: 'cs-glyph' })}${esc(st.label)}` : `${meter(st.level, { maybe: st.maybe, lg: true })}${esc(st.label)}`;
  const sentence = est.observedAt != null && est.tone !== 'closed'
    ? `<b>Updated ${esc(est.ageLabel)}</b> · ${esc(est.sourceLabel)}${est.confidence ? `, ${esc(est.confidence.toLowerCase())} confidence` : ''}.`
    : esc(est.detail || '');
  return `<section class="queue-block" data-est="${esc(venue.id)}" data-variant="block" data-tone="${est.tone}" data-level="${headingLevel}" aria-labelledby="${headingId}">
    <div class="qb-top"><${h} class="qb-label" id="${headingId}">Wait at the door</${h}></div>
    <p class="qb-wait"><span class="sr-only">Estimated wait </span>${big}</p>
    ${rangeTone ? `<div class="qb-scale" aria-hidden="true" style="--lo:${Math.min(est.waitLow, 30)};--hi:${Math.min(est.waitHigh, 30)};--max:30"><span class="qb-scale-track"><b style="left:33.33%"></b><b style="left:66.66%"></b><span class="qb-scale-range"><i class="r-lo"></i><i class="r-hi"></i><i class="r-mid"></i></span></span><span class="qb-scale-axis"><span style="left:0">0</span><span style="left:33.33%">10</span><span style="left:66.66%">20</span><span style="left:100%">30+ min</span></span></div>` : ''}
    <p class="qb-level"><b>${levelHead}</b>${doorLine ? `<span>${esc(doorLine)}</span>` : ''}</p>
    ${age != null && est.tone !== 'closed' ? `<div class="qb-fresh" aria-hidden="true" style="--age:${Math.min(age, 26)}"><span class="qf-track"><i class="qf-1"></i><i class="qf-2"></i><i class="qf-3"></i><span class="qf-rail"><b class="qf-mark"></b></span></span><span class="qf-legend"><span class="${band === 0 ? 'is-on' : ''}">Fresh</span><span class="${band === 1 ? 'is-on' : ''}">May have changed</span><span class="${band === 2 ? 'is-on' : ''}">Out of date</span></span></div>` : ''}
    ${sentence ? `<p class="qb-detail">${sentence}</p>` : ''}
    ${q?.note && !['paused', 'stale', 'unknown'].includes(est.tone) ? `<p class="qb-detail">Venue note: ${esc(q.note)}</p>` : ''}
    ${showHow ? howItWorks() : ''}
  </section>`;
}

/** The bar page's 2×3 stats: In line, Door pace, Confidence, Distance, Cover, Closes. */
export function factStrip(venue, now) {
  const est = estimateFor(venue, now);
  const q = venue.queue;
  const live = !['stale', 'unknown', 'closed'].includes(est.tone);
  const people = live && est.peopleLabel ? est.peopleLabel.replace(' in line', '') : '—';
  const pace = live && Number.isFinite(q?.admitPerMin) && q.admitPerMin > 0 ? `~${q.admitPerMin}<small>/min</small>` : '—';
  const dist = distanceTo(venue, DEMO_SPOT);
  const open = isOpenAt(venue, now);
  const [ch] = venue.hours?.close.split(':').map(Number) ?? [];
  const closes = venue.hours ? `${ch === 0 ? 12 : ch > 12 ? ch - 12 : ch}<small>${ch >= 12 ? 'PM' : 'AM'}</small>` : '—';
  const cell = (dt, dd, sub) => `<div><dt>${dt}</dt><dd>${dd}<span class="fact-sub">${esc(sub)}</span></dd></div>`;
  return `<dl class="fact-strip" data-est="${esc(venue.id)}" data-variant="facts">
    ${cell('In line', esc(people), 'people')}
    ${cell('Door pace', pace, est.tone === 'paused' ? 'Paused' : est.tone === 'capacity' ? 'One in, one out' : q?.paceSource === 'assumed' ? 'Assumed' : q?.doorsTotal > 1 ? `${q.doorsOpen} of ${q.doorsTotal} doors` : q?.paceSource === 'measured' ? 'Measured' : 'Letting in')}
    ${cell('Confidence', esc(est.confidence ?? '—'), est.tone === 'uncertain' ? 'Reports differ' : est.shortSource ?? 'No source')}
    ${cell('Distance', dist == null ? '—' : `${esc(formatMiles(dist).replace(' mi', ''))}<small>mi</small>`, 'Straight line')}
    ${cell('Cover', venue.cover == null ? '—' : venue.cover === 0 ? 'Free' : `$${venue.cover}`, 'At the door')}
    ${cell('Closes', closes, venue.closedTonight ? 'Closed tonight' : open === false ? 'Closed now' : 'Open now')}
  </dl>`;
}

export function howItWorks() {
  const v = FRESHNESS_MINUTES.venue;
  return `<details class="how"><summary>How this estimate works</summary>
    <p>Estimates are ranges, never exact times.</p>
    <ul>
      <li><strong>Line photo</strong>: a Night Out ambassador, or a bar’s bouncer, photographs the line and counts the heads. Wait ≈ people in line ÷ door pace, widened for uncertainty.</li>
      <li><strong>Door pace</strong> comes from the door, from guests’ measured waits, or is assumed at 2 a minute.</li>
      <li><strong>Guest reports</strong> confirm a photo; two that disagree mark the wait uncertain.</li>
      <li>Fresh for ${v.fresh} minutes, then marked “may have changed”. After ${v.stale} minutes the number is hidden and we say the wait is unavailable.</li>
      <li>“At capacity” means entry only as people leave, so the wait can grow quickly regardless of line length.</li>
      <li>Typical patterns describe past nights and are never shown as the current wait.</li>
    </ul></details>`;
}

/**
 * Crowd status: Quiet / Lively / Packed by the TOP of the wait range (Quiet <=5 min, Lively <=15, Packed
 * longer), plus the range. Color is never the only cue: every state has a word, a meter or glyph shape and
 * a value. States without a usable range say so (and never show a number).
 */
/** People in line as one best number (middle of the reported range); 0 for "about 0–2"; null when unknown. */
export const peopleInLine = (est) => (Number.isFinite(est?.peopleHigh) && Number.isFinite(est?.peopleLow) ? (est.peopleHigh <= 2 ? 0 : Math.round((est.peopleLow + est.peopleHigh) / 2)) : null);
/** Line levels by people: under 10 quiet, 10–29 lively, 30+ packed. */
export const levelForPeople = (n) => (n < 10 ? 'quiet' : n < 30 ? 'lively' : 'packed');

export function crowdStatus(est) {
  switch (est.tone) {
    case 'closed': return { level: 'closed', label: 'Closed', sub: 'Not open now', icon: 'moon' };
    case 'paused': return { level: 'paused', label: 'Paused', sub: 'Entry paused', icon: 'pause' };
    case 'capacity': return { level: 'capacity', label: 'Full', sub: 'At capacity', icon: 'crowd3' };
    case 'stale': return { level: 'none', label: 'No update', sub: 'Out of date', icon: 'aging' };
    case 'unknown': return { level: 'none', label: 'No reports', sub: 'Wait unknown', icon: 'help' };
    default: break;
  }
  if (est.waitHigh == null) return { level: 'mixed', label: 'Mixed', sub: 'Reports disagree', icon: 'uncertain', maybe: true };
  // One scale everywhere (team ask: "how long is the line"): people in line when known, else the top of the wait range.
  const n = peopleInLine(est);
  const level = n != null ? levelForPeople(n) : est.waitHigh <= 5 ? 'quiet' : est.waitHigh <= 15 ? 'lively' : 'packed';
  return {
    level,
    label: { quiet: 'Quiet', lively: 'Lively', packed: 'Packed' }[level],
    sub: est.waitHigh <= 2 ? 'No wait' : `${est.waitLow}–${est.waitHigh} min wait`,
    icon: level === 'quiet' ? 'crowd1' : 'crowd3',
    maybe: est.tone === 'aging' || est.tone === 'uncertain',
  };
}

/** 1/2/3-bar crowd meter (shape + count carry the level; hue is a fourth cue). */
export const meter = (level, { maybe = false, lg = false } = {}) => `<span class="meter${lg ? ' is-lg' : ''}" data-level="${level}"${maybe ? ' data-maybe' : ''} aria-hidden="true"><i></i><i></i><i></i></span>`;
const glyph = (name) => icon(name, { size: 14, cls: 'cs-glyph' });

/** Open/close hint for the card when there's no deal: "Open till 2 AM", "Opens 8 PM", "Closed tonight". */
export function hoursShort(venue, now) {
  if (venue.closedTonight) return venue.hours ? `Usually ${formatTime(new Date(2000, 0, 1, ...venue.hours.open.split(':').map(Number)).getTime()).replace(':00', '')}–${formatTime(new Date(2000, 0, 1, ...venue.hours.close.split(':').map(Number)).getTime()).replace(':00', '')}` : 'Closed tonight';
  if (!venue.hours) return 'Hours not listed';
  const [ch, cm] = venue.hours.close.split(':').map(Number);
  const [oh, om] = venue.hours.open.split(':').map(Number);
  const t = (h, m) => formatTime(new Date(2000, 0, 1, h, m).getTime()).replace(':00', '');
  return isOpenAt(venue, now) === false ? `Opens ${t(oh, om)}` : `Open till ${t(ch, cm)}`;
}

/** The bar page's status row: crowd word and icon, the wait range big, and where it came from. Live-patched by tick(). */
export function venueStatus(venue, now) {
  const est = estimateFor(venue, now);
  const st = crowdStatus(est);
  const range = est.waitLow != null && st.level !== 'none' && !['closed', 'paused', 'capacity'].includes(est.tone);
  const fresh = est.observedAt != null && est.tone !== 'closed' ? `${est.shortSource} · ${est.ageLabel}${est.tone === 'aging' ? ' · may have changed' : ''}` : (est.detail || '');
  return `<section class="venue-status" data-est="${esc(venue.id)}" data-variant="vstatus" data-tone="${est.tone}" data-level="${st.level}"${st.maybe ? ' data-maybe' : ''} aria-labelledby="vs-h">
    <h2 class="sr-only" id="vs-h">Line right now</h2>
    <div class="vs-crowd"><span class="vs-icon">${icon(st.icon, { size: 28 })}</span><span class="vs-word">${esc(st.label)}</span></div>
    <div class="vs-wait">${range ? `<span class="vs-num num">${est.waitLow}–${est.waitHigh}</span><span class="vs-unit">min wait</span>` : `<span class="vs-text">${esc(st.sub)}</span>`}</div>
    <p class="vs-fresh"><span>${esc(fresh)}</span></p>
  </section>`;
}

/**
 * People in line, for the card's bottom-right (team ask, 2026-10-17: "pivot to how long is the line"): one best
 * estimate (the middle of the reported range) and a level for the glow. Levels by line length: under 10 quiet,
 * 10–29 lively, 30+ packed. Closed is grey; no recent data says so and shows no number.
 */
export function lineInfo(venue, now) {
  const est = estimateFor(venue, now);
  const q = venue?.queue;
  const n = peopleInLine(q && Number.isFinite(q.peopleLow) ? { peopleLow: q.peopleLow, peopleHigh: q.peopleHigh } : null);
  const level = n == null ? 'none' : levelForPeople(n);
  switch (est.tone) {
    case 'closed': return { state: 'closed', level: 'closed', n: null, word: 'Closed', est };
    case 'stale': case 'unknown': return { state: 'none', level: 'none', n: null, word: 'No update', est };
    case 'capacity': return { state: 'full', level: 'packed', n, word: 'Full', est };
    case 'paused': return { state: 'paused', level: 'paused', n, word: 'Paused', est };
    default: return { state: n === 0 ? 'clear' : 'line', level, n, word: n === 0 ? 'No line' : 'in line', approx: est.tone === 'aging' || est.tone === 'uncertain', est };
  }
}

/** The card's bottom-right: a glowing dot in the line's level and the people-in-line number. Live-patched by tick(). */
export function cardStatus(venue, now) {
  const L = lineInfo(venue, now);
  const num = L.n != null && ['line', 'full'].includes(L.state) ? `<span class="lb-num num">${L.approx ? '≈' : ''}${L.n}</span>` : '';
  return `<span class="line-badge" data-est="${esc(venue.id)}" data-variant="status" data-tone="${L.est.tone}" data-state="${L.state}" data-level="${L.level}"><span class="lb-dot" aria-hidden="true"></span><span class="lb-text">${num}<span class="lb-word">${esc(L.state === 'full' ? 'Full' : L.word)}</span></span></span>`;
}

/** Freshness micro-line under the card name ("Demo wait · 4m ago"): the per-card demo marker. Live-patched. */
export function cardFresh(venue, now) {
  const est = estimateFor(venue, now);
  const age = est.observedAt != null ? Math.max(0, Math.round((now - est.observedAt) / 60000)) : null;
  const text = {
    aging: `${icon('aging', { size: 12 })}${age}m ago`, // the glyph says "may have changed" (the sr summary says it in words)
    uncertain: 'Reports differ',
    unknown: 'Be first to report',
    stale: `${icon('aging', { size: 12 })}Last report ${age}m ago`,
    closed: '',
  }[est.tone] ?? `Updated ${age ?? 0}m ago`;
  return `<span class="card-fresh" data-est="${esc(venue.id)}" data-variant="fresh" data-tone="${est.tone}">${text}</span>`;
}

/** Promo badge text, delivery-app style: "Buy 1 get 1", "30% off", "$4 drafts", "Free entry". */
export function promoLabel(d, { compact = false } = {}) {
  const p = d?.promo;
  if (!p) return d?.short ?? d?.title ?? '';
  return p.type === 'bogo' ? (compact ? 'BOGO' : 'Buy 1, get 1 free') : p.type === 'percent' ? `${p.value}% off` : p.label ?? d.short ?? '';
}
/** What a deal applies to, in words. */
export function promoItem(d) {
  if (d.kind === 'drink') { const it = DRINK_ITEMS.find((x) => x.id === d.item); return it ? `${it.label}, ${it.size}` : 'Drink special'; }
  return d.item ?? DEAL_KINDS[d.kind]?.label ?? '';
}

/** The card's bottom-left: the live promo ending soonest (a badge, then what it's on), else the next one tonight. Live-patched. */
/** A deal only counts as live while the bar is open (a promo never outlasts closing time). */
export const liveDeal = (venue, now) => (isOpenAt(venue, now) === false ? null : activeDeal(venue, now));
/** The next deal starting tonight at an open-later bar, if any. */
export const nextDeal = (venue, now) => (venue.deals ?? []).filter((x) => dealState(x, now) === 'soon').sort((a, b) => a.startsAt - b.startsAt)[0] ?? null;

export function dealTag(venue, now) {
  const d = liveDeal(venue, now);
  if (d) return `<span class="deal-slot" data-deal-for="${esc(venue.id)}"><span class="promo-badge" data-type="${esc(d.promo?.type ?? 'price')}" title="${esc(promoLabel(d))}">${esc(promoLabel(d, { compact: true }))}</span><span class="promo-item">${esc(promoItem(d))}</span></span>`;
  const next = nextDeal(venue, now);
  return `<span class="deal-slot" data-deal-for="${esc(venue.id)}">${next ? `<span class="promo-next">${esc(promoLabel(next, { compact: true }))} at ${esc(formatTime(next.startsAt).replace(':00', ''))}</span>` : ''}</span>`;
}

/** When a deal runs, in words: "Now until 11:00 PM", "Starts 11:00 PM", "Ended". */
export function dealWhen(deal, now) {
  const st = dealState(deal, now);
  return st === 'live' ? `Now until ${formatTime(deal.endsAt)}` : st === 'soon' ? `${formatTime(deal.startsAt)}–${formatTime(deal.endsAt)}` : 'Ended';
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
  const deal = liveDeal(venue, now);
  const next = deal ? null : nextDeal(venue, now);
  const L = lineInfo(venue, now);
  const lineWords = L.n != null && ['line', 'full', 'clear'].includes(L.state) ? (L.n === 0 ? 'No line. ' : `About ${L.n} in line${L.state === 'full' ? ', at capacity' : `, ${L.level}`}. `) : '';
  const text = `${lineWords}${st.label}: ${est.headline}. ${est.tone === 'aging' ? 'May have changed. ' : ''}${showPeople ? `${est.peopleLabel}. ` : ''}${est.detail ? `${est.detail}. ` : ''}${est.observedAt != null ? `${est.sourceLabel}, ${est.ageLabel}.` : ''}${dist ? ` ${dist} away, about ${walkMinutes(distanceTo(venue))} min walk.` : ''}${deal ? ` Deal: ${promoLabel(deal)}, ${promoItem(deal)}, until ${formatTime(deal.endsAt)}.` : next ? ` Deal later: ${promoLabel(next)}, ${promoItem(next)}, from ${formatTime(next.startsAt)}.` : ''}`;
  return `<span class="sr-only" data-est="${esc(venue.id)}" data-variant="sr" data-tone="${est.tone}">${esc(text)}</span>`;
}

// Neon palette per bar for the drawn storefront (placeholder art, not a likeness of the real bar).
const ART_PAL = { 'olde-queens': 'amber', 'scarlet-pub': 'red', 'hueys-knight-club': 'violet', 'pitch-social': 'cyan', 'the-vine': 'green', 'olive-branch': 'gold', 'stuff-yer-face': 'rose', 'thirty-burgers': 'amber', evelyns: 'gold', 'ale-n-wich': 'green' };
const artCache = new Map();
function artSrc(venue) {
  const pals = Object.keys(NIGHT_PALETTES);
  let h = 0;
  for (const ch of venue.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pal = ART_PAL[venue.id] ?? pals[h % pals.length];
  const key = `${venue.id}|${pal}`;
  if (!artCache.has(key)) artCache.set(key, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(nightArt(venue.id, pal, {}))}`);
  return artCache.get(key);
}
/** Photo slot: the venue's own photo when licensed or permitted (venue.photo), else the drawn night storefront. */
export function venuePhoto(venue, { title = false } = {}) {
  if (venue.photo) return `<img class="real-photo" src="${esc(venue.photo)}" alt="${title ? esc(venue.photoAlt ?? `Photo of ${venue.name}`) : ''}"${venue.photoPos ? ` style="--pos:${esc(venue.photoPos)}"` : ''} loading="${title ? 'eager' : 'lazy'}" decoding="async">`;
  return `<img class="night-art" src="${artSrc(venue)}" alt="${title ? esc(`Illustration of a bar at night, not a photo of ${venue.name}`) : ''}" decoding="async">`;
}
/** Logo slot: the bar's real logo (demo use, see data/venues.js MEDIA), else an initials badge. */
export function venueLogo(venue) {
  return venue.logo ? `<img src="${esc(venue.logo)}" alt="" loading="lazy">` : `<span class="mono">${esc(monogram(venue))}</span>`;
}

/**
 * Bar card ("Late Edition"): a photo poster with the logo top left and distance top right, the name and a
 * freshness line on the photo, then a footer with the deal bottom left and the wait bottom right.
 * `save` adds the Save toggle (Saved page only). The link's name is the bar name plus the sr-only summary.
 */
export function venueCard(venue, now, { saved = false, save = false } = {}) {
  const dist = distanceText(venue);
  const walk = walkMinutes(distanceTo(venue));
  return `<li class="bar-card" data-venue-row="${esc(venue.id)}" data-area="${esc(venue.area ?? '')}">
    <a class="bar-link" href="#/venue/${encodeURIComponent(venue.id)}" data-nav-venue="${esc(venue.id)}">
      <span class="bar-photo" data-thumb="${esc(venue.id)}">${venuePhoto(venue)}<span class="card-scrim" aria-hidden="true"></span>
        <span class="card-top" aria-hidden="true"><span class="bar-logo">${venueLogo(venue)}</span><span class="card-dist">${walk != null ? `${icon('walk', { size: 13 })}<b class="num">${walk} min</b><span class="cd-mi">${esc(dist)}</span>` : 'n/a'}</span></span>
        <span class="bar-id"><span class="bar-name">${esc(venue.name)}</span><span aria-hidden="true">${cardFresh(venue, now)}</span></span>
      </span>
      <span class="card-foot" aria-hidden="true">${dealTag(venue, now)}${cardStatus(venue, now)}</span>
      ${srSummary(venue, now)}
    </a>
    ${save ? saveButton(venue, saved, 'save card-save') : ''}
  </li>`;
}

/** Map preview (QA plan 6.3): one compact row built from the bar card's parts (photo, name, walk pill, line badge), so
 *  the map speaks the same metric as the list. The photo carries data-thumb, so opening it morphs into the bar page. */
export function mapCard(venue, now, { saved = false } = {}) {
  const walk = walkMinutes(distanceTo(venue));
  return `<div class="map-card" data-venue-row="${esc(venue.id)}">
    <a class="map-card-link" href="#/venue/${encodeURIComponent(venue.id)}" data-nav-venue="${esc(venue.id)}">
      <span class="mc-photo" data-thumb="${esc(venue.id)}">${venuePhoto(venue)}</span>
      <span class="mc-main" aria-hidden="true"><span class="mc-name">${esc(venue.name)}</span>${walk != null ? `<span class="card-dist">${icon('walk', { size: 13 })}<b class="num">${walk} min</b></span>` : ''}</span>
      <span class="mc-status" aria-hidden="true">${cardStatus(venue, now)}</span>
      ${srSummary(venue, now)}
    </a>
    ${saveButton(venue, saved, 'save mc-save')}
  </div>`;
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

/** One heart for every Save: outline and fill stacked; aria-pressed drives the fill (CSS morph), so a toggle never rebuilds it. */
export const heartStack = (size = 20) => `<span class="ic-stack" aria-hidden="true">${icon('heart', { cls: 'ic-line', size })}${icon('heartFill', { cls: 'ic-fill', size })}</span>`;

/** Two labels in one grid cell, cross-faded by the button's aria-pressed (CSS): the box is as wide as the wider label, so
 *  nothing beside it shifts. The hidden label is aria-hidden, so the button's name is only the visible one. */
export const lblStack = (off, on, pressed) => `<span class="lbl-stack"><span${pressed ? ' aria-hidden="true"' : ''}>${off}</span><span${pressed ? '' : ' aria-hidden="true"'}>${on}</span></span>`;

export function saveButton(venue, saved, extraCls = 'save') {
  return `<button type="button" class="icon-btn ${extraCls}" data-action="toggle-save" data-id="${esc(venue.id)}" aria-pressed="${saved}" aria-label="Save ${esc(venue.name)}">${heartStack()}</button>`;
}

export function skeletonRows(n = 5) {
  return `<div class="sk-group" aria-hidden="true">${Array.from({ length: n }, () => '<div class="skeleton-row"><div class="sk-lines"><div class="sk sk-l1"></div><div class="sk sk-l2"></div><div class="sk sk-l3"></div><div class="sk sk-l4"></div></div><div class="sk sk-ring"></div></div>').join('')}</div>`;
}

export function stateBox({ iconName = 'info', title, body, actions = '', headingLevel = 2, cls = '' }) {
  const h = `h${headingLevel}`;
  const attrs = headingLevel === 1 ? ' id="page-h" tabindex="-1"' : '';
  return `<div class="state${cls ? ` ${cls}` : ''}"><div class="state-icon">${icon(iconName)}</div><${h}${attrs}>${esc(title)}</${h}>${body ? `<p>${body}</p>` : ''}${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;
}

export function banner(kind, iconName, html, actions = '') {
  return `<div class="banner banner-${kind}" role="${kind === 'error' ? 'alert' : 'status'}">${icon(iconName)}<div>${html}</div>${actions ? `<div class="banner-actions">${actions}</div>` : ''}</div>`;
}

/** "12:30–1:00 AM": the meridiem is said once when both ends share it (QA plan 9.9). */
export function windowLabel(start, end) {
  const a = formatTime(start), b = formatTime(end);
  const ma = a.match(/\s?(AM|PM)$/), mb = b.match(/\s?(AM|PM)$/);
  return ma && mb && ma[1] === mb[1] ? `${a.slice(0, ma.index)}–${b}` : `${a}–${b}`;
}

export function passCard(pass, now, { headingLevel = 3 } = {}) {
  const status = passStatus(pass, now);
  const h = `h${headingLevel}`;
  const wm = Array.from({ length: 9 }, () => '<span>NOT VALID FOR ENTRY · NOT VALID FOR ENTRY</span>').join('');
  return `<article class="pass-card" data-status="${status}" aria-label="Pass for ${esc(pass.venueName)}, not valid for entry">
    <div class="pass-watermark" aria-hidden="true"><div>${wm}</div></div>
    <div class="pass-top"><div><p class="qb-label" style="color:var(--pass-ink-2)">Priority pass</p><${h} class="pass-venue">${esc(pass.venueName)}</${h}></div><span class="pass-status">${esc(PASS_STATUS_COPY[status])}</span></div>
    <dl class="pass-grid">
      <div><dt>Entry window</dt><dd>${esc(windowLabel(pass.windowStart, pass.windowEnd))}</dd></div>
      <div><dt>Party</dt><dd>${pass.party} ${pass.party === 1 ? 'person' : 'people'}</dd></div>
      <div><dt>Total</dt><dd>${money(pass.total)} <span style="font-weight:500;color:var(--pass-ink-2)">(no charge)</span></dd></div>
      <div><dt>Reference</dt><dd class="pass-ref">${esc(String(pass.ref).replace(/^DEMO-/, ''))}</dd></div>
      <div><dt>Cover</dt><dd>${esc(pass.coverNote)}</dd></div>
      <div><dt>ID</dt><dd>Physical ID checked at the door</dd></div>
    </dl>
    <p class="pass-invalid">${icon('alert')}No charge. Not valid for entry.</p>
  </article>`;
}

/** Brand mark (team artwork, 2026-10-18): the hand-lettered "Night out" from the sprite in index.html. Decorative: callers label it. */
export const wordmark = () => `<svg class="wm-logo" viewBox="0 0 722 207" aria-hidden="true" focusable="false"><use href="#nm-logo"/></svg>`;

/** Top-right points chip: your balance, linking to Points. */
export function pointsChip(balance) {
  const n = new Intl.NumberFormat('en-US').format(balance);
  return `<a class="pts-chip" href="#/points" aria-label="${n} points. Open Points">${icon('star', { size: 15 })}<span class="num roll" data-pts-value>${n}</span></a>`;
}

