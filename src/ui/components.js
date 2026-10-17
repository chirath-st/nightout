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
import { distanceTo, formatMiles, DEMO_SPOT } from '../lib/geo.js';
import { activeDeal, dealState, DEAL_KINDS } from '../lib/deals.js';

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
  const big = rangeTone ? `${est.tone === 'fresh' ? '' : '<span class="approx">≈</span>'}${est.waitLow}–${est.waitHigh}<small>min</small>` : esc(word ?? est.headline);
  const age = est.observedAt != null ? Math.max(0, Math.round((now - est.observedAt) / 60000)) : null;
  const band = est.tone === 'fresh' ? 0 : est.tone === 'aging' || est.tone === 'uncertain' ? 1 : 2;
  const people = est.peopleLabel ? est.peopleLabel.replace(' in line', '') : null;
  const pace = Number.isFinite(q?.admitPerMin) && q.admitPerMin > 0 ? q.admitPerMin : null;
  const door = {
    capacity: 'Entry only as people leave. The wait can grow quickly.',
    paused: q?.note || 'The door has paused entry.',
    closed: est.detail || 'Not open now.',
    stale: age != null ? `Last report ${age} min ago. The number is hidden until someone reports again.` : 'No recent report.',
    unknown: 'No one has reported this line yet.',
  }[est.tone] ?? [people && `About ${people.replace(/^~/, '')} in line`, pace && `door moving ~${pace} a min`].filter(Boolean).join(', ');
  const levelGlyph = { closed: 'moon', paused: 'pause', stale: 'aging', unknown: 'help' }[est.tone];
  const levelHead = levelGlyph ? `${icon(levelGlyph, { size: 18, cls: 'cs-glyph' })}${esc(st.label)}` : `${meter(st.level, { maybe: st.maybe, lg: true })}${esc(st.label)}`;
  const freshLeft = est.tone === 'fresh' && age != null ? Math.max(0, FRESHNESS_MINUTES[q.sourceType].fresh - age) : null;
  const sentence = est.observedAt != null && est.tone !== 'closed'
    ? `<b>Updated ${esc(est.ageLabel)}</b> · ${esc(est.sourceLabel)}${est.confidence ? `, ${esc(est.confidence.toLowerCase())} confidence` : ''}.${freshLeft != null ? ` Fresh for ${Math.round(freshLeft)} more minute${Math.round(freshLeft) === 1 ? '' : 's'}; after 20 the number is hidden.` : ''}`
    : esc(est.detail || '');
  return `<section class="queue-block" data-est="${esc(venue.id)}" data-variant="block" data-tone="${est.tone}" data-level="${headingLevel}" aria-labelledby="${headingId}">
    <div class="qb-top"><${h} class="qb-label" id="${headingId}">Wait at the door</${h}><span class="demo-tag">Demo estimate</span></div>
    <p class="qb-wait"><span class="sr-only">Estimated wait </span>${big}</p>
    ${rangeTone ? `<div class="qb-scale" aria-hidden="true" style="--lo:${Math.min(est.waitLow, 30)};--hi:${Math.min(est.waitHigh, 30)};--max:30"><span class="qb-scale-track"><b style="left:33.33%"></b><b style="left:66.66%"></b><span class="qb-scale-range"></span></span><span class="qb-scale-axis"><span style="left:0">0</span><span style="left:33.33%">10</span><span style="left:66.66%">20</span><span style="left:100%">30+ min</span></span></div>` : ''}
    <p class="qb-level"><b>${levelHead}</b>${door ? `<span>${esc(door)}</span>` : ''}</p>
    ${age != null && est.tone !== 'closed' ? `<div class="qb-fresh" aria-hidden="true" style="--age:${Math.min(age, 26)}"><span class="qf-track"><i class="qf-1"></i><i class="qf-2"></i><i class="qf-3"></i><b class="qf-mark"></b></span><span class="qf-legend"><span class="${band === 0 ? 'is-on' : ''}">Fresh</span><span class="${band === 1 ? 'is-on' : ''}">May have changed</span><span class="${band === 2 ? 'is-on' : ''}">Out of date</span></span></div>` : ''}
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
  return `<dl class="fact-strip">
    ${cell('In line', esc(people), 'people (demo)')}
    ${cell('Door pace', pace, est.tone === 'paused' ? 'Paused' : est.tone === 'capacity' ? 'One in, one out' : 'Letting in')}
    ${cell('Confidence', esc(est.confidence ?? '—'), est.tone === 'uncertain' ? 'Reports differ' : est.shortSource ?? 'No source')}
    ${cell('Distance', dist == null ? '—' : `${esc(formatMiles(dist).replace(' mi', ''))}<small>mi</small>`, 'Straight line')}
    ${cell('Cover', venue.cover == null ? '—' : `$${venue.cover}`, 'Simulated')}
    ${cell('Closes', closes, venue.closedTonight ? 'Closed tonight' : open === false ? 'Closed now' : 'Open now')}
  </dl>`;
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
 * Crowd status: Quiet / Lively / Packed by the TOP of the wait range (Quiet <=5 min, Lively <=15, Packed
 * longer), plus the range. Color is never the only cue: every state has a word, a meter or glyph shape and
 * a value. States without a usable range say so (and never show a number).
 */
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
  const level = est.waitHigh <= 5 ? 'quiet' : est.waitHigh <= 15 ? 'lively' : 'packed';
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
    <p class="vs-fresh"><span class="demo-tag">Demo</span><span>${esc(fresh)}</span></p>
  </section>`;
}

/** The card's bottom-right wait (spec "Late Edition"): eyebrow (meter or glyph + word) over the value. Live-patched. */
export function cardStatus(venue, now) {
  const est = estimateFor(venue, now);
  const st = crowdStatus(est);
  const range = est.waitLow != null ? `${est.waitLow}–${est.waitHigh}` : null;
  let eb; let val;
  switch (est.tone) {
    case 'capacity': eb = `${meter('capacity')}Door`; val = '<span class="cs-tag">Full</span>'; break;
    case 'paused': eb = `${glyph('pause')}Door`; val = '<span class="cs-tag is-outline">Paused</span>'; break;
    case 'unknown': eb = `${glyph('help')}Wait`; val = '<span class="cs-value is-word is-dim">No reports</span>'; break;
    case 'stale': eb = `${glyph('aging')}Wait`; val = '<span class="cs-value is-word is-dim">Out of date</span>'; break;
    case 'closed': eb = `${glyph('moon')}Closed`; val = `<span class="cs-value is-word">${venue.closedTonight ? 'Not tonight' : esc(hoursShort(venue, now))}</span>`; break;
    case 'uncertain':
      eb = `${meter('mixed')}Mixed`;
      val = range ? `<span class="cs-value is-dim"><span class="approx">≈</span>${range}<small>min</small></span>` : '<span class="cs-value is-word is-dim">Unclear</span>';
      break;
    default:
      eb = `${meter(st.level, { maybe: st.maybe })}${st.label}`;
      val = st.maybe ? `<span class="cs-value is-dim"><span class="approx">≈</span>${range}<small>min</small></span>` : `<span class="cs-value">${range}<small>min</small></span>`;
  }
  return `<span class="card-status" data-est="${esc(venue.id)}" data-variant="status" data-tone="${est.tone}" data-level="${st.level}"${st.maybe ? ' data-maybe' : ''}><span class="foot-eb">${eb}</span>${val}</span>`;
}

/** Freshness micro-line under the card name ("Demo wait · 4m ago"): the per-card demo marker. Live-patched. */
export function cardFresh(venue, now) {
  const est = estimateFor(venue, now);
  const age = est.observedAt != null ? Math.max(0, Math.round((now - est.observedAt) / 60000)) : null;
  const text = {
    aging: `${icon('aging', { size: 12 })}Demo · ${age}m ago · may have changed`,
    uncertain: 'Demo wait · reports differ',
    unknown: 'Demo · be first to report',
    stale: `${icon('aging', { size: 12 })}Demo · last report ${age}m ago`,
    closed: 'Demo data',
  }[est.tone] ?? `Demo wait · ${age ?? 0}m ago`;
  return `<span class="card-fresh" data-est="${esc(venue.id)}" data-variant="fresh" data-tone="${est.tone}">${text}</span>`;
}

/** The card's bottom-left: the live deal ending soonest ("Demo deal"), else when the bar opens or closes. Live-patched. */
export function dealTag(venue, now) {
  const d = activeDeal(venue, now);
  return d
    ? `<span class="deal-slot" data-deal-for="${esc(venue.id)}"><span class="foot-eb">Demo deal</span><span class="deal-tag">${esc(d.short || d.title)}</span></span>`
    : `<span class="deal-slot" data-deal-for="${esc(venue.id)}"><span class="foot-eb">No deal</span><span class="deal-tag is-none">${esc(hoursShort(venue, now))}</span></span>`;
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
  const deal = activeDeal(venue, now);
  const text = `${st.label}: ${est.headline}. ${est.tone === 'aging' ? 'May have changed. ' : ''}${showPeople ? `${est.peopleLabel}. ` : ''}${est.detail ? `${est.detail}. ` : ''}${est.observedAt != null ? `${est.sourceLabel}, ${est.ageLabel}.` : ''}${dist ? ` ${dist} from the demo spot.` : ''}${deal ? ` Demo deal: ${deal.title}, until ${formatTime(deal.endsAt)}.` : ''} Demo data.`;
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
  if (venue.photo) return `<img class="real-photo" src="${esc(venue.photo)}" alt="${title ? esc(venue.photoAlt ?? `Photo of ${venue.name}`) : ''}"${venue.photoPos ? ` style="--pos:${esc(venue.photoPos)}"` : ''} loading="lazy" decoding="async">`;
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
  return `<li class="bar-card" data-venue-row="${esc(venue.id)}" data-area="${esc(venue.area ?? '')}">
    <a class="bar-link" href="#/venue/${encodeURIComponent(venue.id)}" data-nav-venue="${esc(venue.id)}">
      <span class="bar-photo" data-thumb="${esc(venue.id)}">${venuePhoto(venue)}
        <span class="card-top" aria-hidden="true"><span class="bar-logo">${venueLogo(venue)}</span><span class="card-dist">${icon('nav', { size: 11 })}${dist ? esc(dist) : 'n/a'}</span></span>
        <span class="bar-id"><span class="bar-name">${esc(venue.name)}</span><span aria-hidden="true">${cardFresh(venue, now)}</span></span>
      </span>
      <span class="card-foot" aria-hidden="true">${dealTag(venue, now)}${cardStatus(venue, now)}</span>
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
  return `<button type="button" class="icon-btn ${extraCls}" data-action="toggle-save" data-id="${esc(venue.id)}" aria-pressed="${saved}" aria-label="Save ${esc(venue.name)}">${icon(saved ? 'heartFill' : 'heart')}</button>`;
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

export function demoChip() {
  return `<a class="demo-chip" href="#/about" aria-label="Demo data: real bar names, simulated waits, deals and points. About this demo"><span class="dot" aria-hidden="true"></span><span class="demo-long" aria-hidden="true">Demo data</span><span class="demo-short" aria-hidden="true">Demo</span></a>`;
}

