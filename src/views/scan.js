// Scan the line: a full-screen, 3-step flow (pick the bar, snap the line and size it, done). Guests
// report a bar's line and tell us when they got in, which turns into a measured wait. SIMULATED: the
// camera is a mock (no camera access, no image of anyone is taken), reports and points stay on this
// device, and the report becomes that bar's demo crowd estimate.
import { esc, venuePhoto, venueLogo, crowdStatus, meter, distanceText } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { formatTime } from '../lib/clock.js';
import { describeEstimate, waitRange, relativeAge, PACE_COPY } from '../lib/queue.js';
import { distanceTo } from '../lib/geo.js';
import { isOpenAt } from '../lib/explore.js';
import { LINE_BUCKETS, POINTS } from '../data/social.js';

const MIN = 60000;
/** Door pace assumed when the bar hasn't shared one (demo): about 2 people let in a minute. */
export const ASSUMED_PACE = 2;
export const DOOR_STATES = Object.freeze([['moving', 'Letting in'], ['capacity', 'One in, one out'], ['paused', 'Paused']]);
const WORDS = { none: 'No line', short: 'Short', medium: 'Medium', long: 'Long', huge: 'Very long' };

/** Where the bar's pace came from: " · set at the door (demo)", " · measured from guests’ waits", " (assumed)". */
export function paceSuffix(venue) {
  const src = venue?.queue?.paceSource;
  if (!(Number.isFinite(venue?.queue?.admitPerMin) && venue.queue.admitPerMin > 0)) return ' (assumed)';
  return src && src !== 'assumed' ? ` · ${PACE_COPY[src]}` : src === 'assumed' ? ' (assumed)' : '';
}
export const paceFor = (venue) => (Number.isFinite(venue?.queue?.admitPerMin) && venue.queue.admitPerMin > 0 ? venue.queue.admitPerMin : ASSUMED_PACE);
/** The queue a report would post (shared with main.js so the panel and the saved estimate agree). */
export function draftQueue(venue, flow, now) {
  const b = LINE_BUCKETS.find((x) => x.id === flow.bucket);
  if (!b) return null;
  return { sourceType: 'crowd', observedAt: now, reportCount: 1, peopleLow: b.low, peopleHigh: b.high, admitPerMin: paceFor(venue), doorStatus: flow.door ?? 'moving' };
}
const minutesFor = (b, pace) => {
  if (b.id === 'none') return 'Walk right in';
  const r = waitRange({ peopleLow: b.low, peopleHigh: b.high, admitPerMin: pace });
  return r ? `≈ ${r.low}–${r.high} min` : '';
};

export function waitingCard(ctx) {
  const w = ctx.state.activeWait;
  if (!w) return '';
  const venue = ctx.venues.find((v) => v.id === w.venueId);
  const mins = Math.max(0, Math.floor((ctx.now - w.startedAt) / MIN));
  return `<section class="waiting-card" aria-labelledby="wait-h">
    <div class="waiting-top"><span class="pulse" aria-hidden="true"></span><h2 id="wait-h">In line at ${esc(venue?.name ?? 'a bar')}</h2></div>
    <p class="waiting-time"><span class="num" data-elapsed="${w.startedAt}">${mins}</span><small>min so far</small></p>
    <p class="hint">Since ${esc(formatTime(w.startedAt))} (demo time). Tap when you’re through the door: your real wait helps everyone.</p>
    <div class="waiting-actions">
      <button type="button" class="btn btn-primary btn-lg" data-action="scan-in">${icon('check', { size: 18 })}I’m in · +${POINTS.GOT_IN}</button>
      <button type="button" class="btn" data-action="scan-left">I left the line</button>
    </div>
  </section>`;
}

export function pickListItems(ctx, query) {
  const q = (query || '').trim().toLowerCase();
  const venues = ctx.venues.filter((v) => !q || v.name.toLowerCase().includes(q) || (v.area ?? '').toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  return venues.map((v) => `<li><button type="button" class="pick-row" data-action="scan-pick" data-id="${esc(v.id)}"><span class="bar-logo" aria-hidden="true">${venueLogo(v)}</span><span class="pick-name">${esc(v.name)}</span><span class="pick-area">${esc([distanceText(v), v.area].filter(Boolean).join(' · '))}</span>${icon('chevronRight', { size: 18 })}</button></li>`).join('')
    || '<li class="hint">No bar matches. Try another name.</li>';
}

function pickStep(ctx, flow) {
  const open = ctx.venues.filter((v) => isOpenAt(v, ctx.now) !== false && distanceTo(v) != null);
  const nearest = open.sort((a, b) => distanceTo(a) - distanceTo(b))[0];
  return `<p class="scan-lede">Snap the line at the door, say how long it is and earn <b class="num">+${POINTS.REPORT}</b>. Tell us when you get in for <b class="num">+${POINTS.GOT_IN}</b> more.</p>
    ${nearest ? `<p class="eyebrow scan-label">Nearest bar</p>
    <button type="button" class="scan-venue scan-nearest" data-action="scan-pick" data-id="${esc(nearest.id)}"><span class="bar-logo" aria-hidden="true">${venueLogo(nearest)}</span><span><span class="scan-venue-name">${esc(nearest.name)}</span><small>${esc(distanceText(nearest) ?? '')} from the demo spot</small></span><span class="btn btn-sm btn-primary" aria-hidden="true">Report</span></button>` : ''}
    <p class="eyebrow scan-label">Or pick a bar</p>
    <div class="search" role="search">${icon('search')}<label for="scan-q" class="sr-only">Find the bar you’re at</label>
      <input id="scan-q" type="search" autocomplete="off" spellcheck="false" placeholder="Which bar are you at?" value="${esc(flow.q || '')}" data-input="scan-q"></div>
    <ul class="pick-list" id="scan-list">${pickListItems(ctx, flow.q)}</ul>`;
}

/** "Your estimate": what this report would tell everyone, next to the latest estimate it replaces. */
export function scanEstimate(ctx, flow) {
  const venue = ctx.venues.find((v) => v.id === flow.venueId);
  const latest = describeEstimate(venue, ctx.now, { isOpen: isOpenAt(venue, ctx.now) !== false });
  const latestLine = latest.waitHigh != null || latest.tone === 'paused' || latest.tone === 'capacity'
    ? `Latest: ${latest.waitHigh != null ? `${latest.waitLow}–${latest.waitHigh} min` : latest.headline}${latest.ageLabel ? ` · ${latest.ageLabel}` : ''}`
    : 'No recent reports here';
  const q = draftQueue(venue, flow, ctx.now);
  if (!q) {
    return `<div><p class="eyebrow">Your estimate</p><p class="v is-empty">${flow.captured ? 'Pick a size' : 'Snap first'}</p></div><div class="lv"><span>${esc(latestLine)}</span></div>`;
  }
  const est = describeEstimate({ queue: q }, ctx.now);
  const st = crowdStatus(est);
  const value = est.waitHigh == null ? esc(st.label) : est.waitHigh <= 5 && q.peopleHigh <= 2 ? 'No wait' : `${est.waitLow}–${est.waitHigh}<small>min wait</small>`;
  return `<div><p class="eyebrow">Your estimate</p><p class="v num">${value}</p><p class="scan-pace">Door pace ~${paceFor(venue)} a minute${paceSuffix(venue)}</p></div>
    <div class="lv"><b>${meter(st.level)}${esc(st.label)}</b><span>${esc(latestLine)}</span></div>`;
}

function captureStep(ctx, flow) {
  const venue = ctx.venues.find((v) => v.id === flow.venueId);
  const pace = paceFor(venue);
  const off = flow.captured ? '' : 'disabled';
  return `<div class="scan-venue"><span class="bar-logo" aria-hidden="true">${venueLogo(venue)}</span><span><span class="scan-venue-name">${esc(venue?.name ?? '')}</span><small>${esc([distanceText(venue), venue?.area].filter(Boolean).join(' · '))}</small></span><button type="button" class="btn btn-sm" data-action="scan-change">Change</button></div>
    <div class="viewfinder ${flow.captured ? 'is-captured' : ''}">
      ${flow.captured
        ? `${venuePhoto(venue)}<span class="vf-tag">${icon('check', { size: 14 })}Demo photo</span><button type="button" class="icon-btn vf-retake" data-action="scan-retake" aria-label="Retake photo">${icon('retake')}</button>`
        : `<span class="vf-corners" aria-hidden="true"></span><span class="vf-tag vf-tip">Frame the line, not faces</span>`}
      <span class="vf-sim">${icon('lock', { size: 14 })}Demo camera · nothing is uploaded</span>
    </div>
    ${flow.captured ? '' : `<div class="shutter-row"><button type="button" class="shutter" data-action="scan-shutter" aria-label="Take photo of the line (simulated)"><span></span></button></div>`}
    <fieldset class="field-group" ${off}>
      <legend class="eyebrow">How many people are in line?</legend>
      <div class="bucket-row">${LINE_BUCKETS.map((b) => `<label class="bucket${b.id === 'none' ? ' is-wide' : ''}"><input type="radio" name="bucket" value="${b.id}" data-input="scan-bucket" ${flow.bucket === b.id ? 'checked' : ''}><span><b>${b.id === 'none' ? '0' : esc(b.label)}</b><em>${WORDS[b.id]}</em><i>${minutesFor(b, pace)}</i></span></label>`).join('')}</div>
    </fieldset>
    <fieldset class="field-group" ${off}>
      <legend class="eyebrow">At the door</legend>
      <div class="segmented door-seg">${DOOR_STATES.map(([id, label]) => `<label><input type="radio" name="door" value="${id}" data-input="scan-door" ${(flow.door ?? 'moving') === id ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div>
    </fieldset>
    <div class="scan-estimate" id="scan-estimate" role="status">${scanEstimate(ctx, flow)}</div>
    <div class="switch-row scan-inline" ${flow.captured ? '' : 'hidden'}><label for="scan-inline"><span class="label" style="margin:0">I’m in this line</span><span class="hint">We’ll ask when you get in to measure the real wait (+${POINTS.GOT_IN}).</span></label>
      <span class="switch"><input id="scan-inline" type="checkbox" role="switch" data-input="scan-inline" ${flow.inLine ? 'checked' : ''}><span></span></span></div>
    ${flow.error ? `<p class="field-error" role="alert">${icon('alert')}${esc(flow.error)}</p>` : ''}`;
}

function doneStep(ctx, flow) {
  const venue = ctx.venues.find((v) => v.id === flow.venueId);
  const bar = esc(venue?.name ?? 'this bar');
  const o = flow.outcome ?? { kind: 'lead' };
  const age = o.leadAt != null ? relativeAge(o.leadAt, ctx.now) : '';
  // Disagreeing with a staff count only flags it while the count is under 10 minutes old; after that guests set it.
  const left = o.leadAt != null ? Math.max(1, Math.ceil(10 - (ctx.now - o.leadAt) / 60_000)) : null;
  const what = o.kind === 'backs' ? `A ${o.leadNoun} from ${age} sets the count. Your report backs it up.`
    : o.kind === 'against' ? (o.photosDisagree ? `Two line photos disagree, so ${bar} shows the wait as uncertain. Your report doesn’t match the latest one.`
      : o.conflict ? `You and another guest disagree with the ${o.leadNoun} from ${age}, so ${bar} now shows the wait as uncertain.`
        : `Your report doesn’t match the ${o.leadNoun} from ${age}. If another guest agrees in the next ${left} min, the wait shows as uncertain.`)
    : `Your report now sets the crowd estimate for ${bar}.`;
  return `<div class="result result-ok scan-done">
      <p class="scan-pts num" tabindex="-1" data-autofocus>+${POINTS.REPORT}<small>pts</small></p>
      <h2>Report sent</h2>
      <p>${what}</p>
      <div class="actions"><a class="btn btn-primary" href="#/venue/${encodeURIComponent(flow.venueId)}">See ${bar}</a><button type="button" class="btn" data-action="scan-restart">Report another bar</button></div>
    </div>`;
}

export const scanSubmitReady = (flow) => !!(flow.captured && flow.bucket);

export function renderScan(ctx, flow) {
  const n = flow.step === 'done' ? 3 : flow.venueId ? 2 : 1;
  const step = n === 3 ? doneStep(ctx, flow) : n === 2 ? captureStep(ctx, flow) : pickStep(ctx, flow);
  return `<div class="scan-flow" data-step="${n}">
    <div class="scan-head"><button type="button" class="icon-btn" data-action="scan-close" aria-label="${n === 2 ? 'Close and discard report' : 'Close'}">${icon('x')}</button><h1 id="page-h" tabindex="-1">Scan the line</h1><span class="scan-count" aria-label="Step ${n} of 3">${n}/3</span></div>
    <div class="scan-steps" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="${i < n || n === 3 ? 'is-done' : i === n ? 'is-now' : ''}"></i>`).join('')}</div>
    ${n === 1 ? waitingCard(ctx) : ''}
    <div class="scan-step">${step}</div>
    ${n === 3 ? waitingCard(ctx) : ''}
    ${n !== 3 ? `<p class="hint scan-privacy">${icon('shield', { size: 14 })} In a real app, line photos would be used only to count the line, with faces blurred and photos deleted after review. Nothing here uses your camera or location.</p>` : ''}
  </div>
  ${n === 2 ? `<div class="scan-submit"><button type="button" class="btn btn-primary btn-lg btn-block" data-action="scan-submit" ${scanSubmitReady(flow) ? '' : 'aria-disabled="true"'}>Send report<span class="trail">+${POINTS.REPORT}</span></button><p class="hint">Demo points. Reports stay on this phone.</p></div>` : ''}`;
}
