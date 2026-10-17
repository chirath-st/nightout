// Scan: guests report a bar's line (photo + rough size) and tell us when they got in, which turns
// into a measured wait. SIMULATED: the camera is a mock (no camera access, no image of anyone is taken),
// reports and points stay on this device, and the report becomes that bar's demo crowd estimate.
import { esc, venuePhoto } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { formatTime } from '../lib/clock.js';
import { LINE_BUCKETS, POINTS } from '../data/social.js';

const MIN = 60000;

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
  return venues.map((v) => `<li><button type="button" class="pick-row" data-action="scan-pick" data-id="${esc(v.id)}"><span class="pick-name">${esc(v.name)}</span><span class="pick-area">${esc(v.area ?? '')}</span>${icon('chevronRight', { size: 18 })}</button></li>`).join('')
    || '<li class="hint">No bar matches. Try another name.</li>';
}

function pickStep(ctx, flow) {
  return `<div class="search" role="search">${icon('search')}<label for="scan-q" class="sr-only">Find the bar you’re at</label>
      <input id="scan-q" type="search" autocomplete="off" spellcheck="false" placeholder="Which bar are you at?" value="${esc(flow.q || '')}" data-input="scan-q"></div>
    <ul class="pick-list" id="scan-list">${pickListItems(ctx, flow.q)}</ul>`;
}

function captureStep(ctx, flow) {
  const venue = ctx.venues.find((v) => v.id === flow.venueId);
  const sizeOk = !!flow.bucket;
  return `<div class="scan-venue"><div><p class="eyebrow">Reporting</p><p class="scan-venue-name">${esc(venue?.name ?? '')}</p></div><button type="button" class="btn btn-sm" data-action="scan-change">Change</button></div>
    <div class="viewfinder ${flow.captured ? 'is-captured' : ''}">
      ${flow.captured ? `${venuePhoto(venue)}<span class="vf-tag">${icon('check', { size: 14 })}Simulated photo</span>` : `<span class="vf-corners" aria-hidden="true"></span><p class="vf-hint">${icon('camera', { size: 22 })}Point at the line, then tap the shutter</p>`}
      <span class="vf-sim">Demo camera: no photo is actually taken</span>
    </div>
    <div class="shutter-row">
      ${flow.captured
        ? `<button type="button" class="btn" data-action="scan-retake">Retake</button>`
        : `<button type="button" class="shutter" data-action="scan-shutter" aria-label="Take photo of the line (simulated)"><span></span></button>`}
    </div>
    <fieldset class="field-group" ${flow.captured ? '' : 'disabled'}>
      <legend>About how many people are in line?</legend>
      <div class="bucket-row">${LINE_BUCKETS.map((b) => `<label class="bucket"><input type="radio" name="bucket" value="${b.id}" data-input="scan-bucket" ${flow.bucket === b.id ? 'checked' : ''}><span>${esc(b.label)}</span></label>`).join('')}</div>
    </fieldset>
    <div class="switch-row" ${flow.captured ? '' : 'hidden'}><label for="scan-inline"><span class="label" style="margin:0">I’m in this line</span><span class="hint">We’ll ask when you get in to measure the real wait.</span></label>
      <span class="switch"><input id="scan-inline" type="checkbox" role="switch" data-input="scan-inline" ${flow.inLine ? 'checked' : ''}><span></span></span></div>
    <button type="button" class="btn btn-primary btn-lg btn-block" data-action="scan-submit" ${flow.captured && sizeOk ? '' : 'aria-disabled="true"'}>Send report · +${POINTS.REPORT} points</button>
    ${flow.error ? `<p class="field-error" role="alert">${icon('alert')}${esc(flow.error)}</p>` : ''}`;
}

function doneStep(ctx, flow) {
  const venue = ctx.venues.find((v) => v.id === flow.venueId);
  return `<div class="result result-ok scan-done">
      <div class="result-icon">${icon('star')}</div>
      <h2 tabindex="-1" data-autofocus>+${POINTS.REPORT} points</h2>
      <p>Thanks. Your report is now the latest crowd estimate for ${esc(venue?.name ?? 'this bar')} (demo, on this device).</p>
      <div class="actions"><a class="btn btn-primary" href="#/venue/${encodeURIComponent(flow.venueId)}">See ${esc(venue?.name ?? 'the bar')}</a><button type="button" class="btn" data-action="scan-restart">Report another bar</button></div>
    </div>`;
}

export function renderScan(ctx, flow) {
  const step = flow.step === 'done' ? doneStep(ctx, flow) : flow.venueId ? captureStep(ctx, flow) : pickStep(ctx, flow);
  return `<div class="page">
    <h1 class="page-title" id="page-h" tabindex="-1">Report a line</h1>
    <p class="page-sub">Snap the line, say how long it is, and earn ${POINTS.REPORT} points. Get ${POINTS.GOT_IN} more when you tell us you got in.</p>
    ${waitingCard(ctx)}
    <div class="scan-step">${step}</div>
    <p class="hint scan-privacy">${icon('shield', { size: 14 })} In a real app, line photos would be used only to count the line, with faces blurred and photos deleted after review. Nothing here uses your camera or location.</p>
  </div>`;
}
