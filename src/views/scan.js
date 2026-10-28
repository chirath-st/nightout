// Scan the line: a full-screen, 3-step flow. Photo first (tapping Scan opens the phone's camera; team build only, the
// store build takes no photos and starts at the bar), then which bar it is,
// then how long the line is; "Report without a photo" skips the camera. Guests report a bar's line and tell us when they
// got in, which turns into a measured wait. The photo is real but stays on this phone: it is shown here and the app lets
// go of it when the report is sent or closed. The app never uploads or saves it (iOS may keep its own temporary copy in
// the app's private storage until it clears it), and nothing counts people in it (no image analysis). The team build
// keeps reports and points on this device; the store build sends the line size, not the photo.
import { esc, venueLogo, crowdStatus, meter, distanceText } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { formatTime } from '../lib/clock.js';
import { describeEstimate, waitRange, relativeAge, PACE_COPY } from '../lib/queue.js';
import { distanceTo, usingDeviceLocation } from '../lib/geo.js';
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
    <p class="hint">Since ${esc(formatTime(w.startedAt))}. Tap when you’re through the door.</p>
    <div class="waiting-actions">
      <button type="button" class="btn btn-primary btn-lg" data-action="scan-in">${icon('check', { size: 18 })}${globalThis.__STORE__ ? 'I’m in' : `I’m in · +${POINTS.GOT_IN}`}</button>
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

/** The photo just taken, shown while the report is made: it stays on this phone (never uploaded). Retake opens the camera. */
function scanPhoto(flow, size = '') {
  if (globalThis.__STORE__ || !flow.photo) return '';
  return `<div class="scan-photo${size ? ` is-${size}` : ''}"><img src="${esc(flow.photo)}" alt="Your photo of the line" decoding="async">
    <span class="vf-tag">${icon('lock', { size: 13 })}Stays on this device</span>
    <button type="button" class="icon-btn vf-retake" data-action="scan-retake" aria-label="Retake photo">${icon('retake')}</button></div>`;
}

/** Step 1: the camera. Tapping Scan opens it directly on a phone; this screen is where you land if you closed it. */
function photoStep(ctx, flow) {
  if (globalThis.__STORE__) return ''; // never reached in the store build (it starts at the bar); lets the build drop it
  const closed = flow.camera === 'cancelled';
  // Opened from a bar's page (Report the line): that bar is already known, so say which one this report is for.
  const venue = flow.venueId ? ctx.venues.find((v) => v.id === flow.venueId) : null;
  return `${venue ? `<div class="scan-venue"><span class="bar-logo" aria-hidden="true">${venueLogo(venue)}</span><span><span class="scan-venue-name">${esc(venue.name)}</span><small>${esc([distanceText(venue), venue.area].filter(Boolean).join(' · '))}</small></span></div>`
      : `<p class="scan-lede">Snap the line for <b class="num">+${POINTS.REPORT}</b>, then <b class="num">+${POINTS.GOT_IN}</b> when you get in.</p>`}
    <button type="button" class="cam-take" data-action="scan-camera">${icon('camera', { size: 30 })}<span class="cam-take-label">Take a photo of the line</span><small>Frame the line, not faces</small></button>
    ${closed ? `<p class="hint cam-note" role="status">No photo taken.${ctx.native ? ' If the camera didn’t open, allow it in Settings › Night Out › Camera.' : ''}</p>` : ''}
    <button type="button" class="btn btn-block cam-manual" data-action="scan-manual">Report without a photo</button>
    <p class="cam-privacy">${icon('lock', { size: 13 })}Your photo stays on this device. It isn’t uploaded.</p>`;
}

function pickStep(ctx, flow) {
  const open = ctx.venues.filter((v) => isOpenAt(v, ctx.now) !== false && distanceTo(v) != null);
  const nearest = open.sort((a, b) => distanceTo(a) - distanceTo(b))[0];
  // "Nearest bar" only when we know where you are (never measured from the demo's campus corner); otherwise offer to find out.
  const showNearest = nearest && usingDeviceLocation();
  return `${scanPhoto(flow, 'sm')}<h2 class="scan-q">Where are you?</h2>
    ${!usingDeviceLocation() ? `<button type="button" class="scan-venue scan-locate" data-action="use-location">${icon('nav', { size: 22 })}<span><span class="scan-venue-name">Find the bar I’m at</span><small>Uses your location on this device only</small></span></button>` : ''}
    ${showNearest ? `<p class="eyebrow scan-label">Nearest bar</p>
    <button type="button" class="scan-venue scan-nearest" data-action="scan-pick" data-id="${esc(nearest.id)}"><span class="bar-logo" aria-hidden="true">${venueLogo(nearest)}</span><span><span class="scan-venue-name">${esc(nearest.name)}</span><small>${esc(distanceText(nearest) ?? '')} away</small></span><span class="btn btn-sm btn-primary" aria-hidden="true">Report</span></button>` : ''}
    <p class="eyebrow scan-label">Or pick a bar</p>
    <div class="search" role="search">${icon('search')}<label for="scan-q" class="sr-only">Find the bar you’re at</label>
      <input id="scan-q" type="search" autocomplete="off" spellcheck="false" placeholder="Which bar are you at?" value="${esc(flow.q || '')}" data-input="scan-q"></div>
    <ul class="pick-list" id="scan-list">${pickListItems(ctx, flow.q)}</ul>`;
}

/** "Your estimate": what this report would tell everyone, next to the latest estimate it replaces. */
export function scanEstimate(ctx, flow) {
  const venue = ctx.venues.find((v) => v.id === flow.venueId);
  const latest = describeEstimate(venue, ctx.now, { isOpen: isOpenAt(venue, ctx.now) !== false });
  // An unknown wait that does have a report (no door pace, or a time it can't date) says so, never "no reports".
  const latestLine = latest.waitHigh != null || latest.tone === 'paused' || latest.tone === 'capacity'
    ? `Latest: ${latest.waitHigh != null ? `${latest.waitLow}–${latest.waitHigh} min` : latest.headline}${latest.ageLabel ? ` · ${latest.ageLabel}` : ''}`
    : latest.tone === 'unknown' && latest.hasReport ? `Latest: Wait unknown${latest.ageLabel ? ` · ${latest.ageLabel}` : ''}`
      : globalThis.__STORE__ && ctx.loadFailed ? 'Latest estimate not loaded' : 'No recent reports here';
  const q = draftQueue(venue, flow, ctx.now);
  if (!q) {
    return `<div><p class="eyebrow">Your estimate</p><p class="v is-empty">Pick a size</p></div><div class="lv"><span>${esc(latestLine)}</span></div>`;
  }
  const est = describeEstimate({ queue: q }, ctx.now);
  const st = crowdStatus(est);
  const value = est.waitHigh == null ? esc(st.label) : est.waitHigh <= 5 && q.peopleHigh <= 2 ? 'No wait' : `<span class="roll">${est.waitLow}–${est.waitHigh}</span><small>min wait</small>`;
  return `<div><p class="eyebrow">Your estimate</p><p class="v num">${value}</p></div>
    <div class="lv"><b>${meter(st.level)}${esc(st.label)}</b><span>${esc(latestLine)}</span></div>`;
}

function captureStep(ctx, flow) {
  const venue = ctx.venues.find((v) => v.id === flow.venueId);
  const pace = paceFor(venue);
  return `<div class="scan-venue"><span class="bar-logo" aria-hidden="true">${venueLogo(venue)}</span><span><span class="scan-venue-name">${esc(venue?.name ?? '')}</span><small>${esc([distanceText(venue), venue?.area].filter(Boolean).join(' · '))}</small></span><button type="button" class="btn btn-sm" data-action="scan-change">Change</button></div>
    ${scanPhoto(flow)}
    <fieldset class="field-group">
      <legend class="eyebrow">How many people are in line?</legend>
      <div class="bucket-row">${LINE_BUCKETS.map((b) => `<label class="bucket${b.id === 'none' ? ' is-wide' : ''}"><input type="radio" name="bucket" value="${b.id}" data-input="scan-bucket" ${flow.bucket === b.id ? 'checked' : ''}><span><b>${b.id === 'none' ? '0' : esc(b.label)}</b><em>${WORDS[b.id]}</em><i>${minutesFor(b, pace)}</i></span></label>`).join('')}</div>
    </fieldset>
    <fieldset class="field-group">
      <legend class="eyebrow">At the door</legend>
      <div class="segmented door-seg" style="--n:${DOOR_STATES.length}">${DOOR_STATES.map(([id, label]) => `<label><input type="radio" name="door" value="${id}" data-input="scan-door" ${(flow.door ?? 'moving') === id ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div>
    </fieldset>
    <div class="scan-estimate" id="scan-estimate" role="status">${scanEstimate(ctx, flow)}</div>
    <div class="switch-row scan-inline"><label for="scan-inline"><span class="label" style="margin:0">I’m in this line</span><span class="hint">${globalThis.__STORE__ ? 'We’ll time your wait until you tap “I’m in”' : `+${POINTS.GOT_IN} when you tell us you’re in`}</span></label>
      <span class="switch"><input id="scan-inline" type="checkbox" role="switch" data-input="scan-inline" ${flow.inLine ? 'checked' : ''}><span></span></span></div>`;
}

function storeDoneStep(ctx, flow) {
  const venue = ctx.venues.find((v) => v.id === flow.venueId);
  const bar = esc(venue?.name ?? 'this bar');
  return `<div class="result result-ok scan-done">
      <p class="scan-pts" tabindex="-1" data-autofocus>${icon('check', { size: 28 })}</p>
      <h2>Report sent</h2>
      <p>Thanks. ${bar}’s estimate updates when another guest or our staff count backs your report up.</p>
      <div class="actions"><a class="btn btn-primary" href="#/venue/${encodeURIComponent(flow.venueId)}">See ${bar}</a><button type="button" class="btn" data-action="scan-restart">Report another bar</button></div>
    </div>`;
}

function doneStep(ctx, flow) {
  if (globalThis.__STORE__) return storeDoneStep(ctx, flow);
  const venue = ctx.venues.find((v) => v.id === flow.venueId);
  const bar = esc(venue?.name ?? 'this bar');
  const o = flow.outcome ?? { kind: 'lead' };
  const age = o.leadAt != null ? relativeAge(o.leadAt, ctx.now) : '';
  // Disagreeing with a staff count only flags it while the count is under 10 minutes old; after that guests set it.
  const left = o.leadAt != null ? Math.max(1, Math.ceil(10 - (ctx.now - o.leadAt) / 60_000)) : null;
  const what = o.kind === 'backs' ? `A ${o.leadNoun} from ${age} sets the count. Your report backs it up.`
    : o.kind === 'against' ? (o.photosDisagree ? `Two ${globalThis.__STORE__ ? 'head counts' : 'line photos'} disagree, so ${bar} shows the wait as uncertain. Your report doesn’t match the latest one.`
      : o.conflict ? `You and another guest disagree with the ${o.leadNoun} from ${age}, so ${bar} now shows the wait as uncertain.`
        : `Your report doesn’t match the ${o.leadNoun} from ${age}. If another guest agrees in the next ${left} min, the wait shows as uncertain.`)
    : `Your report now sets the crowd estimate for ${bar}.`;
  return `<div class="result result-ok scan-done">
      <p class="scan-pts num" tabindex="-1" data-autofocus>+<span class="roll">${POINTS.REPORT}</span><small>pts</small></p>
      <h2>Report added</h2>
      <p>${what}</p>
      <div class="actions"><a class="btn btn-primary" href="#/venue/${encodeURIComponent(flow.venueId)}">See ${bar}</a><button type="button" class="btn" data-action="scan-restart">Report another bar</button></div>
    </div>`;
}

export const scanSubmitReady = (flow) => !!(flow.venueId && flow.bucket && !flow.sending);
/** Which step the flow is on: 1 photo, 2 bar, 3 line size, 4 done. The photo comes first (or "without a photo").
 *  The store build takes no photos (staff counters count; its privacy terms say so): it starts at the bar. */
export const scanStepOf = (flow) => (flow.step === 'done' ? 4 : !(flow.photo || flow.manual || globalThis.__STORE__) ? 1 : flow.venueId ? 3 : 2);

export function renderScan(ctx, flow) {
  const n = scanStepOf(flow);
  const step = n === 4 ? doneStep(ctx, flow) : n === 3 ? captureStep(ctx, flow) : n === 2 ? pickStep(ctx, flow) : photoStep(ctx, flow);
  // The counter starts at the flavor's first step: the store has no photo step, so its bar picker is 1/3 and done is 3/3
  // (as before); the team build counts photo, bar, size and shows done as 3/3.
  const pos = globalThis.__STORE__ ? n - 1 : Math.min(n, 3);
  const done = n === 4;
  // Closing discards something only once the report has something in it (a photo, a bar or a size).
  const started = !done && Boolean(flow.photo || flow.venueId || flow.bucket);
  return `<div class="scan-flow" data-step="${n}">
    <div class="scan-head"><button type="button" class="icon-btn" data-action="scan-close" aria-label="${started ? 'Close and discard report' : 'Close'}">${icon('x')}</button><h1 id="page-h" tabindex="-1">${globalThis.__STORE__ ? 'Report the line' : 'Scan the line'}</h1><span class="sr-only">Step ${pos} of 3</span><span class="scan-count" aria-hidden="true">${pos}/3</span></div>
    <div class="scan-steps" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="seg${i < pos || done ? ' is-done' : i === pos ? ' is-now' : ''}" style="--fill:${i < pos || done ? 1 : i === pos ? 0.55 : 0}"></i>`).join('')}</div>
    ${n < 3 ? waitingCard(ctx) : ''}
    <div class="scan-step">${step}</div>
    ${n === 4 ? waitingCard(ctx) : ''}
  </div>
  ${n === 3 ? `<div class="scan-submit">${flow.error ? `<p class="field-error" role="alert">${icon('alert')}${esc(flow.error)}</p>` : ''}<button type="button" class="btn btn-primary btn-lg btn-block" data-action="scan-submit" ${scanSubmitReady(flow) ? '' : 'aria-disabled="true"'}>${globalThis.__STORE__ ? (flow.sending ? 'Sending…' : 'Send report') : `Add report<span class="trail">+${POINTS.REPORT}</span>`}</button></div>` : ''}`;
}
