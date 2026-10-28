// Business view (Profile > Business view): the same app, signed in as one venue, for owner interviews. A DEMO LOGIN:
// no account, no server and no real venue data. Reward codes are checked against this device's own rewards (Points >
// Redeem) and a few sample guest codes; uploaded photos are object URLs in this page's memory, never posted or saved.
// A real launch needs venue sign-in, per-venue data isolation, server-side code checks and abuse limits.
import { esc } from '../ui/components.js';
import { icon } from '../ui/icons.js';
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
    <div class="segmented biz-tabs" role="group" aria-label="Business sections" style="--n:${BIZ_SECTIONS.length}">${BIZ_SECTIONS.map(([k, w]) => `<button type="button" data-action="biz-section" data-s="${k}" aria-pressed="${section === k}">${w}</button>`).join('')}</div>`;
}

function resultBox(r, ctx) {
  if (!r) return '';
  // No live-region roles here: main.js announces each result once (and moves focus), so it isn't read twice.
  if (r.kind === 'invalid') return `<p class="field-error" id="redeem-result">${icon('alert')}Codes look like NO-7K2D (four letters or numbers).</p>`;
  if (r.kind === 'unknown') return `<div class="redeem-result" id="redeem-result" data-kind="unknown" tabindex="-1">${icon('alert', { size: 20 })}<span><b>No reward has code ${esc(r.code)}</b><small>Check the letters with the guest.</small></span></div>`;
  const reward = rewardOf(r.voucher.rewardId);
  if (r.kind === 'used') {
    const where = ctx.venues.find((x) => x.id === r.redemption.venueId)?.name ?? 'a venue';
    return `<div class="redeem-result" id="redeem-result" data-kind="used" tabindex="-1">${icon('alert', { size: 20 })}<span><b>Already redeemed</b><small>${esc(reward?.title ?? 'Reward')} · ${esc(where)}, ${esc(formatTime(r.redemption.at))}</small></span></div>`;
  }
  return `<div class="redeem-result" id="redeem-result" data-kind="valid">${icon('check', { size: 20 })}<span><b>Valid · ${esc(reward?.title ?? 'Reward')}</b><small>${esc(r.code)} · ${r.voucher.sample ? 'sample guest' : 'redeemed in Points'}, ${esc(formatTime(r.voucher.at))} · not valid toward alcohol</small></span>
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
      ${resultBox(c.codeResult, ctx)}
      <p class="eyebrow biz-sub">Sample guest codes</p>
      <div class="biz-codes">${samples.map((s) => `<button type="button" class="biz-code" data-action="redeem-pick" data-code="${esc(s.ref)}"><span class="num">${esc(s.ref)}</span><small>${esc(rewardOf(s.rewardId)?.title ?? '')}${used.has(s.ref) ? ' · used' : ''}</small></button>`).join('')}</div>
      ${gate('Demo: codes are checked on this device only. A real launch checks them on our server, for signed-in venue staff.')}
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
  const deals = (ctx.state.deals ?? []).filter((d) => d.venueId === v.id && d.endsAt > ctx.now).length;
  const by = REWARDS.map((r) => ({ r, n: tonight.filter((x) => x.rewardId === r.id).length })).filter((x) => x.n);
  return `<section class="panel biz-report" aria-labelledby="report-h">
      <h2 id="report-h">Redemptions</h2>
      <dl class="fact-strip biz-kpis">
        <div><dt>Tonight</dt><dd class="num">${tonight.length}<span class="fact-sub">codes redeemed</span></dd></div>
        <div><dt>Offers</dt><dd class="num">${deals}<span class="fact-sub">live, posted here</span></dd></div>
        <div><dt>7 nights</dt><dd class="num">${week}<span class="fact-sub">sample history</span></dd></div>
      </dl>
      <h3 class="biz-h3">Tonight, by reward</h3>
      ${by.length ? `<ul class="plain-list biz-list">${by.map(({ r, n }) => `<li><span><b>${esc(r.title)}</b><small>${r.cost} points each</small></span><span class="num">${n}</span></li>`).join('')}</ul>` : '<p class="hint">No codes redeemed here tonight. Try Redeem.</p>'}
      <h3 class="biz-h3">Last 7 nights <span class="muted">(sample history)</span></h3>
      <ol class="biz-chart" aria-label="Codes redeemed each night">${hist.map((x) => `<li style="--h:${(x.n / max).toFixed(3)}"><span class="num">${x.n}</span><i aria-hidden="true"></i><small>${esc(x.label)}</small></li>`).join('')}<li class="is-tonight" style="--h:${(tonight.length / max).toFixed(3)}"><span class="num">${tonight.length}</span><i aria-hidden="true"></i><small>Tonight</small></li></ol>
      ${gate('The 7-night history is made up. Tonight counts codes redeemed on this device.')}
    </section>`;
}

/** Photos: add photos for the bar's page and preview them. They stay in this page's memory and are never posted. */
export function photosPanel(v, ctx) {
  const ups = (ctx.console.uploads ?? []).filter((u) => u.venueId === v.id);
  const full = ups.length >= MAX_UPLOADS;
  return `<section class="panel biz-photos" aria-labelledby="photos-h">
      <h2 id="photos-h" tabindex="-1">Photos for your page</h2>
      <p class="hint">Preview how a photo would look on your bar’s page. Nothing is posted.</p>
      <div class="biz-photo-actions">
        <button type="button" class="btn btn-primary" data-action="biz-upload"${full ? ' aria-disabled="true"' : ''}>${icon('plus', { size: 18 })}Add photos</button>
        <button type="button" class="btn" data-action="biz-art-photo"${full ? ' aria-disabled="true"' : ''}>Use a sample photo</button>
      </div>
      ${ups.length ? `<figure class="biz-cover"><img src="${esc(ups[0].url)}" alt="Cover preview for ${esc(v.name)}" decoding="async"><figcaption><b>${esc(v.name)}</b><small>Cover preview · not posted</small></figcaption></figure>
      <ul class="biz-photo-grid">${ups.map((u, i) => `<li data-key="${esc(u.id)}"><img src="${esc(u.url)}" alt="${esc(u.sample ? `Sample photo ${i + 1}` : `Your photo ${i + 1}`)}" decoding="async"><button type="button" class="icon-btn biz-photo-x" data-action="biz-photo-remove" data-id="${esc(u.id)}" aria-label="Remove ${esc(u.sample ? `sample photo ${i + 1}` : `photo ${i + 1}`)}">${icon('x', { size: 16 })}</button></li>`).join('')}</ul>` : ''}
      ${gate('Demo: photos stay on this device and are let go when you leave. A real launch needs venue sign-in and photo review.')}
    </section>`;
}
