// Business view (Profile > Business view): the same app, signed in as one venue, for owner interviews. In the team demo
// it is a DEMO LOGIN: no account, no server and no real venue data. Reward codes are checked against this device's own
// rewards (Points > Redeem) and a few sample guest codes; uploaded photos are object URLs in this page's memory, never
// posted or saved. A live team build (lib/backend.js LIVE) signs in a real venue account instead (renderVenueLive
// below): counts, deals, codes and the report go to the server; photos still stay on the phone.
import { esc, estimateBlock, banner } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { backTitle, dealPanel } from './pages.js';
import { nightArt, NIGHT_PALETTES } from '../ui/nightart.js';
import { formatTime } from '../lib/clock.js';
import { refCode } from '../lib/pass.js';
import { REWARDS } from '../data/social.js';

const MIN = 60_000;
export const BIZ_SECTIONS = Object.freeze([['tonight', 'Tonight'], ['offers', 'Offers'], ['redeem', 'Redeem'], ['report', 'Report'], ['photos', 'Photos']]);
export const MAX_UPLOADS = 6;
const rewardOf = (id) => REWARDS.find((r) => r.id === id) ?? null;

/** Three sample guest codes (made up), so a code can be tried without redeeming points first. */
export function sampleVouchers(now) {
  return [['cover', 52], ['na-drink', 31], ['line-cut', 18]].map(([rewardId, ago], i) => {
    const id = `sample-guest-${i + 1}`;
    return { id, rewardId, ref: refCode(id), at: now - ago * MIN, sample: true };
  });
}

/** "no 7k2d", "NO7K2D" or "7K2D" -> "NO-7K2D"; null when it can't be a code (codes use refCode's alphabet). */
export function normalizeCode(raw) {
  const s = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = s.length === 6 && s.startsWith('NO') ? s.slice(2) : s;
  return /^[ABCDEFGHJKMNPQRSTVWXYZ2-9]{4}$/.test(body) ? `NO-${body}` : null;
}

/** What a venue would learn from a code: { kind: 'invalid' | 'unknown' | 'used' | 'valid', code, voucher, redemption }.
 *  A guest's own reward is used once for good; a sample guest code is used once per demo night (`night`). */
export function checkCode(raw, { vouchers = [], redemptions = [], now, night = null }) {
  const code = normalizeCode(raw);
  if (!code) return { kind: 'invalid', code: null };
  const voucher = [...vouchers, ...sampleVouchers(now)].find((v) => v.ref === code);
  if (!voucher) return { kind: 'unknown', code };
  const redemption = redemptions.find((r) => r.ref === code && (!voucher.sample || r.night === night)) ?? null;
  return { kind: redemption ? 'used' : 'valid', code, voucher, redemption };
}

/** Made-up redemption counts for the 7 nights before tonight (same numbers every time for a venue), oldest first.
 *  `nightStart` is tonight's evening (the demo clock's base): each night is named by its evening, so Saturday night
 *  is "Sat" even though its redemptions run past midnight. Thursday to Saturday nights are busier. */
export function sampleHistory(venueId, nightStart) {
  let h = 2166136261;
  for (const ch of venueId) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
  return Array.from({ length: 7 }, (_, i) => {
    h = Math.imul(h ^ (h >>> 13), 2246822507) >>> 0;
    const evening = new Date(nightStart);
    evening.setDate(evening.getDate() - (7 - i)); // calendar days, so a clock change can't shift the label
    const weekend = [4, 5, 6].includes(evening.getDay());
    return { label: day.format(evening), n: (weekend ? 9 : 2) + (h % (weekend ? 12 : 6)) };
  });
}

/** A rights-safe sample photo for the upload demo: the app's own drawn storefront, in another palette. */
export function samplePhoto(venue, i = 0) {
  const pals = Object.keys(NIGHT_PALETTES);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(nightArt(`${venue.id}:sample${i}`, pals[(i + 3) % pals.length], {}))}`;
}

const gate = (text) => `<p class="biz-gate">${icon('lock', { size: 13 })}${text}</p>`;

/** The top of Business view: who you're signed in as (a demo login), the venue switch and the sections. */
export function businessHead(v, ctx, section) {
  return `<div class="biz-head">
      <a class="back-link back-icon" href="#/profile" data-action="back" aria-label="Back to Profile">${icon('chevronLeft', { size: 22 })}</a>
      <div class="biz-id"><p class="eyebrow biz-badge">Business view · demo login</p><h1 class="page-title" id="page-h" tabindex="-1">${esc(v.name)}</h1></div>
    </div>
    <div class="field-group biz-venue">
      <label class="label" for="console-venue">Signed in as</label>
      <div class="select"><select id="console-venue" data-input="console-venue">${ctx.venues.map((x) => `<option value="${esc(x.id)}" ${x.id === v.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>${icon('chevronDown')}</div>
    </div>
    <div class="segmented biz-tabs" role="group" aria-label="Business sections" style="--n:${BIZ_SECTIONS.length}">${BIZ_SECTIONS.map(([k, w]) => `<button type="button" data-action="biz-section" data-s="${k}" aria-pressed="${section === k}">${w}</button>`).join('')}</div>
    ${gate('Demo login: everything here stays on this device.')}`;
}

function resultBox(r, ctx, v) {
  if (!r) return '';
  // No live-region roles here: main.js announces each result once (and moves focus), so it isn't read twice.
  if (r.kind === 'done') return `<div class="redeem-result" id="redeem-result" data-kind="done" tabindex="-1">${icon('check', { size: 20 })}<span><b>Redeemed · ${esc(rewardOf(r.rewardId)?.title ?? 'Reward')}</b><small class="num">${esc(r.code)}, ${esc(formatTime(r.at))}</small></span></div>`;
  if (r.kind === 'invalid') return `<p class="field-error" id="redeem-result">${icon('alert')}Codes look like NO-7K2D (four letters or numbers).</p>`;
  if (r.kind === 'unknown') return `<div class="redeem-result" id="redeem-result" data-kind="unknown" tabindex="-1">${icon('alert', { size: 20 })}<span><b>No reward has code ${esc(r.code)}</b><small>Check the letters with the guest.</small></span></div>`;
  const reward = rewardOf(r.voucher.rewardId);
  if (r.kind === 'used') {
    // Like the server will: the time only when it was used here; another venue is never named.
    const here = r.redemption.venueId === v.id;
    return `<div class="redeem-result" id="redeem-result" data-kind="used" tabindex="-1">${icon('x', { size: 20 })}<span><b>Already redeemed. Don’t honor it again.</b><small>${esc(reward?.title ?? 'Reward')} · ${here ? `used here, ${esc(formatTime(r.redemption.at))}` : 'used at another venue'}</small></span></div>`;
  }
  return `<div class="redeem-result" id="redeem-result" data-kind="valid">${icon('check', { size: 20 })}<span><b>Valid · ${esc(reward?.title ?? 'Reward')}</b><small>${esc(r.code)} · ${esc(reward?.detail ?? '')} · issued ${esc(formatTime(r.voucher.at))}${r.voucher.sample ? ' (sample guest)' : ''}. Not valid toward alcohol.</small></span>
    <button type="button" class="btn btn-primary btn-block" data-action="redeem-confirm" data-code="${esc(r.code)}">${icon('check', { size: 18 })}Mark as redeemed</button></div>`;
}

/** This demo night's redemptions at a venue (a new night starts a new list; earlier nights stay stored). */
const tonightOf = (ctx, venueId) => (ctx.state.redemptions ?? []).filter((r) => r.venueId === venueId && r.night === ctx.state.clock?.realStart && r.at <= ctx.now);

/** Redeem: type or pick a guest's code, check it, mark it used (on this device). */
export function redeemPanel(v, ctx) {
  const c = ctx.console;
  const samples = sampleVouchers(ctx.now);
  const used = new Set((ctx.state.redemptions ?? []).filter((r) => r.night === ctx.state.clock?.realStart).map((r) => r.ref));
  const recent = tonightOf(ctx, v.id).slice(0, 6);
  return `<section class="panel biz-redeem" aria-labelledby="redeem-h">
      <h2 id="redeem-h" tabindex="-1">Redeem a reward</h2>
      <form id="redeem-form" class="redeem-form" novalidate>
        <label class="label" for="redeem-code">Guest’s code</label>
        <div class="redeem-row"><input id="redeem-code" name="code" class="text-input num" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="8" placeholder="NO-7K2D" value="${esc(c.codeDraft ?? '')}" data-input="redeem-code" aria-describedby="redeem-help${c.codeResult ? ' redeem-result' : ''}"${c.codeResult?.kind === 'invalid' ? ' aria-invalid="true"' : ''}>
        <button type="submit" class="btn btn-primary" id="redeem-check">Check</button></div>
        <p class="hint" id="redeem-help">The guest shows it on their Points screen.</p>
      </form>
      ${resultBox(c.codeResult, ctx, v)}
      <p class="eyebrow biz-sub">Sample guest codes</p>
      <div class="biz-codes">${samples.map((s) => `<button type="button" class="biz-code" data-action="redeem-pick" data-code="${esc(s.ref)}"><span class="num">${esc(s.ref)}</span><small>${esc(rewardOf(s.rewardId)?.title ?? '')}${used.has(s.ref) ? ' · used' : ''}</small></button>`).join('')}</div>
      ${gate('A real launch checks codes on our server.')}
    </section>
    <section class="panel" aria-labelledby="redeemed-h">
      <h2 id="redeemed-h" tabindex="-1">Redeemed tonight</h2>
      ${recent.length ? `<ul class="plain-list biz-list">${recent.map((r) => `<li data-key="${esc(r.id)}"><span><b>${esc(rewardOf(r.rewardId)?.title ?? 'Reward')}</b><small class="num">${esc(r.ref)}${r.sample ? ' · sample guest' : ''}</small></span><span class="num muted">${esc(formatTime(r.at))}</span></li>`).join('')}</ul>` : '<p class="hint">Nothing redeemed here yet tonight.</p>'}
    </section>`;
}

/** Report: tonight's real (on-device) redemptions, by reward, next to a sample history. */
export function reportPanel(v, ctx) {
  const tonight = tonightOf(ctx, v.id);
  const hist = sampleHistory(v.id, ctx.state.clock?.base ?? ctx.now);
  const week = hist.reduce((s, x) => s + x.n, 0);
  const max = Math.max(...hist.map((x) => x.n), tonight.length, 1);
  const by = REWARDS.map((r) => ({ r, n: tonight.filter((x) => x.rewardId === r.id).length })).filter((x) => x.n);
  return `<section class="panel biz-report" aria-labelledby="report-h">
      <h2 id="report-h">Redemptions</h2>
      <dl class="fact-strip biz-kpis">
        <div><dt>Tonight</dt><dd class="num">${tonight.length}<span class="fact-sub">codes redeemed</span></dd></div>
        <div><dt>7 nights</dt><dd class="num">${week}<span class="fact-sub">sample history</span></dd></div>
      </dl>
      <h3 class="biz-h3">Tonight, by reward</h3>
      ${by.length ? `<ul class="plain-list biz-list">${by.map(({ r, n }) => `<li><span><b>${esc(r.title)}</b><small>${esc(r.detail)}</small></span><span class="num">${n}</span></li>`).join('')}</ul>` : '<p class="hint">No codes redeemed here tonight. Try Redeem.</p>'}
      <h3 class="biz-h3">Last 7 nights <span class="muted">(sample history)</span></h3>
      <ol class="biz-chart" aria-label="Codes redeemed each night">${hist.map((x) => `<li style="--h:${(x.n / max).toFixed(3)}"><span class="num">${x.n}</span><i aria-hidden="true"></i><small>${esc(x.label)}</small></li>`).join('')}<li class="is-tonight" style="--h:${(tonight.length / max).toFixed(3)}"><span class="num">${tonight.length}</span><i aria-hidden="true"></i><small>Tonight so far</small></li></ol>
      ${gate('The 7-night history is made up.')}
    </section>`;
}

/** Photos: add photos for the bar's page and preview them. They stay in this page's memory and are never posted. */
export function photosPanel(v, ctx, { live = false } = {}) {
  const ups = (ctx.console.uploads ?? []).filter((u) => u.venueId === v.id);
  const full = ups.length >= MAX_UPLOADS;
  return `<section class="panel biz-photos" aria-labelledby="photos-h">
      <h2 id="photos-h" tabindex="-1">Photos for your page</h2>
      <p class="hint">Preview how a photo would look on your bar’s page. Nothing is posted.</p>
      <div class="biz-photo-actions">
        <button type="button" class="btn btn-primary" data-action="biz-upload"${full ? ' aria-disabled="true"' : ''}>${icon('plus', { size: 18 })}Add photos</button>
        ${live ? '' : `<button type="button" class="btn" data-action="biz-art-photo"${full ? ' aria-disabled="true"' : ''}>Use a sample photo</button>`}
      </div>
      ${ups.length ? `<figure class="biz-cover"><img src="${esc(ups[0].url)}" alt="Cover preview for ${esc(v.name)}" decoding="async"><figcaption><b>${esc(v.name)}</b><small>Cover preview · not posted</small></figcaption></figure>
      <ul class="biz-photo-grid">${ups.map((u, i) => `<li data-key="${esc(u.id)}"><img src="${esc(u.url)}" alt="${esc(u.sample ? `Sample photo ${i + 1}` : `Your photo ${i + 1}`)}" decoding="async"><button type="button" class="icon-btn biz-photo-x" data-action="biz-photo-remove" data-id="${esc(u.id)}" aria-label="Remove ${esc(u.sample ? `sample photo ${i + 1}` : `photo ${i + 1}`)}">${icon('x', { size: 16 })}</button></li>`).join('')}</ul>` : ''}
      ${live ? '' : gate('A real launch needs photo review.')}
    </section>`;
}

/* ---------- Live team build: a venue account on the server ---------- */

/** Sections per role: a counter counts; a bar manager also posts deals, redeems codes and sees the report. */
export const venueSections = (role) => (role === 'bar_manager' ? BIZ_SECTIONS : BIZ_SECTIONS.filter(([k]) => k === 'tonight'));

/** A guest's reward code as the server reads it: separators and case don't matter, an "NO-" prefix is dropped, O reads
 *  as 0 and I/L as 1 (the server's own rule). "NO-XXXX-XXXX-XXXX", or null when it can't be a code. */
export function voucherCode(raw) {
  const y = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const z = (y.length === 14 && (y.startsWith('NO') || y.startsWith('N0')) ? y.slice(2) : y).replace(/O/g, '0').replace(/[IL]/g, '1');
  return /^[0-9A-HJKMNP-TV-Z]{12}$/.test(z) ? `NO-${z.slice(0, 4)}-${z.slice(4, 8)}-${z.slice(8)}` : null;
}

// No live-region role: main.js announces each error once, and the field it names is described by it.
const fieldError = (id, text) => (text ? `<p class="field-error" id="${id}">${icon('alert')}${esc(text)}</p>` : '');
const describedBy = (id, on, invalid = true) => (on ? `${invalid ? ' aria-invalid="true"' : ''} aria-describedby="${id}"` : '');

/** No venue session: email and password, one button. Accounts are issued by Night Out (no sign-up, no reset here). */
function signInPanel(s) {
  return `<section class="panel" aria-labelledby="signin-h">
      <h2 id="signin-h" tabindex="-1">Venue sign-in</h2>
      ${s.note ? `<p class="hint" role="status">${esc(s.note)}</p>` : ''}
      <form id="venue-signin" class="form-stack" novalidate style="margin-top:0">
        <div class="field"><label class="label" for="venue-email">Email</label><input id="venue-email" name="email" class="text-input" type="email" autocomplete="username" autocapitalize="off" spellcheck="false" value="${esc(s.email ?? '')}"${describedBy('venue-signin-error', s.error && s.errorField !== 'password', s.errorField === 'email')}></div>
        <div class="field"><label class="label" for="venue-password">Password</label><input id="venue-password" name="password" class="text-input" type="password" autocomplete="current-password"${describedBy('venue-signin-error', s.error && s.errorField === 'password')}></div>
        ${fieldError('venue-signin-error', s.error)}
        <button type="submit" class="btn btn-primary btn-lg btn-block"${s.busy ? ' aria-disabled="true"' : ''}>${s.busy ? 'Signing in…' : 'Sign in'}</button>
        <p class="hint">Accounts are set up by Night Out.</p>
      </form>
    </section>`;
}

/** Sign out with counts still queued: asked first (Business view, the code step and the error panel alike). */
function confirmOutRow(s) {
  const queued = s.queued ?? 0;
  return s.confirmOut ? `<div class="undo-row" role="alert"><span>${queued} count${queued === 1 ? ' hasn’t' : 's haven’t'} been sent. Sign out and delete ${queued === 1 ? 'it' : 'them'}?</span><span><button type="button" class="btn btn-quiet" data-action="venue-signout-confirm">Sign out</button><button type="button" class="btn btn-quiet" data-action="venue-signout-cancel">Cancel</button></span></div>` : '';
}

/** The second factor: the 6-digit code from the account's authenticator app (a pasted "123 456" fits too). */
function totpPanel(s) {
  return `<section class="panel" aria-labelledby="totp-h">
      <h2 id="totp-h" tabindex="-1">Enter your code</h2>
      <p class="hint">The 6-digit code from your authenticator app.</p>
      <form id="venue-totp" class="form-stack" novalidate style="margin-top:0">
        <div class="field"><label class="label" for="venue-code">Code</label><input id="venue-code" name="code" class="text-input num" inputmode="numeric" autocomplete="one-time-code" maxlength="7" spellcheck="false"${describedBy('venue-totp-error', s.error)}></div>
        ${fieldError('venue-totp-error', s.error)}
        <button type="submit" class="btn btn-primary btn-lg btn-block"${s.busy ? ' aria-disabled="true"' : ''}>${s.busy ? 'Checking…' : 'Continue'}</button>
        <button type="button" class="btn btn-block" data-action="venue-signout"${s.busy ? ' aria-disabled="true"' : ''}>Use another account</button>
      </form>
      ${confirmOutRow(s)}
    </section>`;
}

/** The top of live Business view: the account's name, its bars (an unlisted training bar too), sections, Sign out. */
function businessHeadLive(v, ctx, section, sections) {
  const s = ctx.venue;
  return `<div class="biz-head">
      <a class="back-link back-icon" href="#/profile" data-action="back" aria-label="Back to Profile">${icon('chevronLeft', { size: 22 })}</a>
      <div class="biz-id"><div class="biz-eyerow"><p class="eyebrow biz-badge">Business view · ${esc(s.staff.display_name || 'Venue account')}</p><button type="button" class="btn btn-sm biz-signout" data-action="venue-signout">Sign out</button></div><h1 class="page-title" id="page-h" tabindex="-1">${esc(v.name)}</h1></div>
    </div>
    ${confirmOutRow(s)}
    ${s.staff.bars.length > 1 ? `<div class="field-group biz-venue">
      <label class="label" for="console-venue">Signed in as</label>
      <div class="select"><select id="console-venue" data-input="console-venue">${s.staff.bars.map((x) => `<option value="${esc(x.id)}" ${x.id === v.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>${icon('chevronDown')}</div>
    </div>` : ''}
    ${sections.length > 1 ? `<div class="segmented biz-tabs" role="group" aria-label="Business sections" style="--n:${sections.length}">${sections.map(([k, w]) => `<button type="button" data-action="biz-section" data-s="${k}" aria-pressed="${section === k}">${w}</button>`).join('')}</div>` : ''}`;
}

const DOOR_CHOICES = [['moving', 'Letting in'], ['capacity', 'One in, one out'], ['paused', 'Paused'], ['closed', 'Closed']];
/** What the count field holds when Publish can take it (a whole number, 0 to 400), else null. */
export const typedCount = (raw) => { const t = String(raw ?? '').trim(); return /^\d+$/.test(t) && Number(t) <= 400 ? Number(t) : null; };
/** What the −/+ buttons step from: the number the field shows (a typed 450 counts as 400; an empty or non-number field
 *  as 0), else the count. The field renders the same raw text, so the two never disagree. */
export const countBase = (c) => { if (c.raw == null) return c.people; const t = String(c.raw).trim(); return /^\d+$/.test(t) ? Math.min(400, Number(t)) : 0; };
/** The seconds left before the next count is taken (shown ticking; the live status says it once, in minutes). */
export const countWait = (until, now) => `Try again in ${Math.max(1, Math.ceil((until - now) / 1000))} s.`;
/** Tonight: a count by hand (a number, −/+, optionally tapped head by head on a photo that stays on the phone), the
 *  door and its pace, then Publish. Nothing here counts automatically. */
function countPanelLive(v, ctx) {
  const s = ctx.venue;
  const c = s.count;
  const msg = s.msg?.[v.id] ?? null;
  // A notice lasts 10 minutes (it is about a count that was just dropped, not the rest of the night).
  const notices = (s.notices ?? []).filter((n) => (n.barId === v.id || !n.barId) && ctx.now - n.at < 10 * MIN).slice(-3);
  // The live region holds the words; a wait's seconds tick beside it, hidden from screen readers (said once, in minutes).
  const status = msg ? `<p class="hint biz-status" id="count-status"${msg.until ? ` data-until="${msg.until}"` : ''}><span role="status">${esc(msg.text)}${msg.sr ? `<span class="sr-only"> ${esc(msg.sr)}</span>` : ''}</span>${msg.until ? `<span aria-hidden="true" data-tick> ${esc(countWait(msg.until, ctx.now))}</span>` : ''}</p>` : '';
  const shown = c.raw == null ? c.people : typedCount(c.raw);
  return `<section class="panel line-photo" id="live-count" aria-labelledby="lp-h">
    <h2 id="lp-h">Count the line</h2>
    ${notices.map((n) => banner('info', 'alert', `<p>${esc(n.text)}</p>`)).join('')}
    ${c.photo ? `<div class="viewfinder lp-view is-snapped mark-photo">
        <button type="button" class="scene-btn" data-action="count-mark" aria-label="Count one more person" aria-describedby="count-help"><img src="${esc(c.photo)}" alt="Your photo of the line" decoding="async">${c.marks.map((m) => `<i class="mark-dot" style="left:${m.x}%;top:${m.y}%" aria-hidden="true"></i>`).join('')}</button>
        <span class="vf-tag">${icon('lock', { size: 13 })}Stays on this device</span>
        <button type="button" class="icon-btn vf-retake" data-action="count-photo-remove" aria-label="Remove photo">${icon('x')}</button>
      </div>` : ''}
    <div class="count-row">
      <div><label class="label" id="pc-label" for="count-people">People in line</label><input id="count-people" class="text-input num count-input" inputmode="numeric" autocomplete="off" maxlength="3" value="${esc(c.raw ?? String(c.people))}" data-input="count-people"${describedBy('count-error', c.error)}></div>
      <div class="stepper count-step" role="group" aria-labelledby="pc-label">
        ${[[-5, '5 fewer people'], [-1, '1 fewer person'], [1, '1 more person'], [5, '5 more people']].map(([d, l]) => `<button type="button" class="icon-btn" data-action="count-step" data-delta="${d}" aria-label="${l}" ${(d < 0 && countBase(c) <= 0) || (d > 0 && countBase(c) >= 400) ? 'disabled' : ''}><span class="num">${d > 0 ? '+' : '−'}${Math.abs(d)}</span></button>`).join('')}
      </div>
    </div>
    ${fieldError('count-error', c.error)}
    <p class="hint" id="count-help">${c.photo ? 'Tap each head, or use − / +.' : 'Count by hand, or tap each head on a photo.'}</p>
    ${c.photo ? '' : `<button type="button" class="btn btn-quiet btn-block" data-action="count-photo">${icon('camera', { size: 16 })}Count on a photo</button>`}
    <fieldset class="field-group door-row"><legend class="label">Door</legend>
      <div class="radio-row door-status">${DOOR_CHOICES.map(([val, label]) => `<label class="radio-card"><input type="radio" name="count-door" value="${val}" data-input="count-door" ${c.door === val ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div>
      <div class="pace-row"><span class="label" id="count-pace-l">Pace</span><div class="segmented pace-seg" role="radiogroup" aria-labelledby="count-pace-l" style="--n:4"${[1, 2, 3, 4].includes(c.pace) ? '' : ' data-empty'}>${[1, 2, 3, 4].map((n) => `<label><input type="radio" name="count-pace" value="${n}" data-input="count-pace" ${c.pace === n ? 'checked' : ''}${['paused', 'closed'].includes(c.door) ? ' disabled' : ''}><span>${n}</span></label>`).join('')}</div><span class="hint" style="margin:0">a min</span></div>
    </fieldset>
    ${status}
    <div class="photo-cta"><button type="button" class="btn btn-primary btn-lg btn-block" data-action="count-send">${icon('check', { size: 18 })}${shown == null ? 'Publish' : `Publish ${shown}`}</button></div>
  </section>`;
}

/** Live code check: what the server said about a code (no other venue is ever named, by the server's design). */
function liveResult(r) {
  if (!r) return '';
  const box = (kind, ic, b, small = '', extra = '') => `<div class="redeem-result" id="redeem-result" data-kind="${kind}" tabindex="-1">${icon(ic, { size: 20 })}<span><b>${b}</b>${small ? `<small>${small}</small>` : ''}</span>${extra}</div>`;
  const title = esc(r.reward?.title ?? 'Reward');
  const code = esc(r.code ?? '');
  switch (r.kind) {
    case 'invalid': return `<p class="field-error" id="redeem-result">${icon('alert')}Codes look like NO-XXXX-XXXX-XXXX (12 letters or numbers).</p>`;
    case 'valid': return box('valid', 'check', `Valid · ${title}`, `${code}${r.expiresAt ? ` · expires ${esc(new Date(r.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}` : ''}. Not valid toward alcohol.`,
      `<button type="button" class="btn btn-primary btn-block" data-action="redeem-confirm" data-code="${code}"${r.busy ? ' aria-disabled="true"' : ''}>${icon('check', { size: 18 })}${r.busy ? 'Marking…' : 'Mark as redeemed'}</button>`);
    case 'done': return box('done', 'check', `Redeemed · ${title}`, `${code}, ${esc(formatTime(r.at))}`);
    case 'pending': return box('unknown', 'alert', 'Couldn’t confirm it was redeemed', 'Try again: it is never redeemed twice.', `<button type="button" class="btn btn-primary btn-block" data-action="redeem-confirm" data-code="${code}"${r.busy ? ' aria-disabled="true"' : ''}>${r.busy ? 'Trying…' : 'Try again'}</button>`);
    case 'used': return box('used', 'x', 'Already redeemed. Don’t honor it again.', `${title}${r.usedHereAt ? ` · used here, ${esc(formatTime(r.usedHereAt))}` : ''}`);
    case 'expired': return box('used', 'x', 'This code has expired.', title);
    case 'not_offered_here': return box('unknown', 'alert', 'This reward isn’t offered here.', title);
    case 'offer_limit': return box('unknown', 'alert', 'Tonight’s limit for this reward is reached.', title);
    case 'unknown': return box('unknown', 'alert', 'No reward has this code', 'Check the letters with the guest.');
    default: return box('unknown', 'alert', esc(r.text ?? 'Couldn’t check the code.'));
  }
}

/** The report, only when it is this bar's (a reply for another bar or account is never drawn here). */
const reportOf = (ctx, v) => (ctx.venue.report?.barId === v.id ? ctx.venue.report : null);

function redeemPanelLive(v, ctx) {
  const c = ctx.venue.code;
  const rep = reportOf(ctx, v);
  const busy = c.busy || c.result?.busy; // no new check while a redemption is on its way
  const tonight = rep?.data?.tonight ?? [];
  return `<section class="panel biz-redeem" aria-labelledby="redeem-h">
      <h2 id="redeem-h" tabindex="-1">Redeem a reward</h2>
      <form id="redeem-form" class="redeem-form" novalidate>
        <label class="label" for="redeem-code">Guest’s code</label>
        <div class="redeem-row"><input id="redeem-code" name="code" class="text-input num" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="20" placeholder="NO-XXXX-XXXX-XXXX" value="${esc(c.draft ?? '')}" data-input="redeem-code" aria-describedby="redeem-help${c.result ? ' redeem-result' : ''}"${c.result?.kind === 'invalid' ? ' aria-invalid="true"' : ''}>
        <button type="submit" class="btn btn-primary" id="redeem-check"${busy ? ' aria-disabled="true"' : ''}>${c.busy ? 'Checking…' : 'Check'}</button></div>
        <p class="hint" id="redeem-help">The guest shows it on their Points screen.</p>
      </form>
      ${liveResult(c.result)}
    </section>
    <section class="panel" aria-labelledby="redeemed-h">
      <h2 id="redeemed-h" tabindex="-1">Redeemed tonight</h2>
      ${rep?.error ? `<p class="hint">${esc(rep.error)}</p>` : tonight.length ? `<ul class="plain-list biz-list">${tonight.slice(0, 8).map((r, i) => `<li data-key="red-${i}-${esc(r.at)}"><span><b>${esc(r.reward_title ?? 'Reward')}</b><small class="num">…${esc(r.hint ?? '')}</small></span><span class="num muted">${esc(formatTime(Date.parse(r.at)))}</span></li>`).join('')}</ul>` : rep?.data ? '<p class="hint">Nothing redeemed here yet tonight.</p>' : ''}
    </section>`;
}

/** Report: the server's aggregates for this bar (no person, no other venue). */
function reportPanelLive(v, ctx) {
  const rep = reportOf(ctx, v);
  if (!rep?.data) return `<section class="panel biz-report" aria-labelledby="report-h"><h2 id="report-h">Redemptions</h2><p class="hint">${esc(rep?.error ?? 'Loading…')}</p></section>`;
  const d = rep.data;
  const nights = [...(d.nights ?? [])].reverse(); // oldest first, tonight last
  const tonight = nights.at(-1) ?? { redemptions: 0, by_reward: [], head_counts: 0, head_peak: null, guest_reports: 0 };
  const week = nights.reduce((n, x) => n + (Number(x.redemptions) || 0), 0);
  const max = Math.max(1, ...nights.map((x) => Number(x.redemptions) || 0));
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
  const label = (night) => day.format(new Date(`${night}T12:00:00`));
  const deals = d.deals ?? {};
  return `<section class="panel biz-report" aria-labelledby="report-h">
      <h2 id="report-h">Redemptions</h2>
      <dl class="fact-strip biz-kpis">
        <div><dt>Tonight</dt><dd class="num">${Number(tonight.redemptions) || 0}<span class="fact-sub">codes redeemed</span></dd></div>
        <div><dt>${nights.length} nights</dt><dd class="num">${week}<span class="fact-sub">codes redeemed</span></dd></div>
      </dl>
      <h3 class="biz-h3">Tonight, by reward</h3>
      ${tonight.by_reward?.length ? `<ul class="plain-list biz-list">${tonight.by_reward.map((r) => `<li><span><b>${esc(r.title)}</b></span><span class="num">${Number(r.n) || 0}</span></li>`).join('')}</ul>` : '<p class="hint">No codes redeemed here tonight.</p>'}
      <h3 class="biz-h3">Each night</h3>
      <ol class="biz-chart" aria-label="Codes redeemed each night" style="grid-template-columns:repeat(${Math.max(nights.length, 1)}, minmax(0, 1fr))">${nights.map((x, i) => `<li${i === nights.length - 1 ? ' class="is-tonight"' : ''} style="--h:${((Number(x.redemptions) || 0) / max).toFixed(3)}"><span class="num">${Number(x.redemptions) || 0}</span><i aria-hidden="true"></i><small>${i === nights.length - 1 ? 'Tonight' : esc(label(x.night))}</small></li>`).join('')}</ol>
    </section>
    <section class="panel" aria-labelledby="report-line-h">
      <h2 id="report-line-h">Tonight’s line</h2>
      <dl class="fact-strip biz-kpis">
        <div><dt>Head counts</dt><dd class="num">${Number(tonight.head_counts) || 0}<span class="fact-sub">${tonight.head_peak != null ? `peak ${Number(tonight.head_peak)}` : 'posted'}</span></dd></div>
        <div><dt>Guest reports</dt><dd class="num">${Number(tonight.guest_reports) || 0}<span class="fact-sub">sent</span></dd></div>
        <div><dt>Deals</dt><dd class="num">${Number(deals.live) || 0}<span class="fact-sub">live, ${Number(deals.pending) || 0} waiting</span></dd></div>
      </dl>
    </section>`;
}

/** Business view in a live team build: sign-in, the second factor, then the sections the account's role allows. */
export function renderVenueLive(ctx) {
  const s = ctx.venue;
  if (s.phase !== 'ready' || !s.staff || !ctx.venueBar) {
    const body = s.phase === 'totp' ? totpPanel(s)
      : s.phase === 'loading' ? `<section class="panel"><p class="hint" role="status">Signing in…</p></section>`
        : s.phase === 'error' ? `<section class="panel" aria-labelledby="venue-err-h"><h2 id="venue-err-h" tabindex="-1" aria-describedby="venue-err-text">Couldn’t open Business view</h2><p class="hint" id="venue-err-text">${esc(s.error ?? '')}</p><div class="form-actions"><button type="button" class="btn btn-primary" data-action="venue-retry">Try again</button><button type="button" class="btn" data-action="venue-signout">Sign out</button></div>${confirmOutRow(s)}</section>`
          : signInPanel(s);
    return `<div class="page console-page biz-page" style="max-width:640px">${backTitle('Business view')}<div class="console-grid biz-grid">${body}</div></div>`;
  }
  const v = ctx.venueBar;
  const sections = venueSections(s.staff.role);
  const section = sections.some(([k]) => k === s.section) ? s.section : 'tonight';
  const guests = v.listed ? `<section class="panel" aria-labelledby="prev-h"><h2 id="prev-h">What guests see now</h2>${estimateBlock(v, ctx.now, { headingId: 'qb-console', showHow: false, headingLevel: 3 })}</section>` : '';
  const panels = {
    tonight: () => `${countPanelLive(v, ctx)}${guests}`,
    // Deals only when they are this bar's (a late reply for the bar before a switch is never drawn here).
    offers: () => { const d = s.deals?.barId === v.id ? s.deals : null; return dealPanel(v, ctx, { deals: d?.list ?? null, error: d?.error ?? null, sending: s.dealSending, ask: s.withdrawAsk, withdrawing: s.withdrawing ?? [] }); },
    redeem: () => redeemPanelLive(v, ctx),
    report: () => reportPanelLive(v, ctx),
    photos: () => photosPanel(v, ctx, { live: true }),
  };
  return `<div class="page console-page biz-page" data-section="${section}" style="max-width:1100px">
    ${businessHeadLive(v, ctx, section, sections)}
    <div class="console-grid biz-grid">${panels[section]()}</div>
  </div>`;
}
