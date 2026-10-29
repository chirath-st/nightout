import { esc, venueCard, stateBox, estimateBlock, banner, dealWhen } from '../ui/components.js';
import { DEAL_KINDS, DRINK_ITEMS, DEAL_TITLE_MAX, slowHours } from '../lib/deals.js';
import { TYPICAL_HOURS, atNight } from '../data/venues.js';
import { DEMO_SPOT } from '../lib/geo.js';
import { icon } from '../ui/icons.js';
import { FRESHNESS_MINUTES } from '../lib/queue.js';
import { formatTime, hhmm, timeLabel } from '../lib/clock.js';
import { activeReminders } from '../lib/reminders.js';
import { LIVE } from '../lib/backend.js';

/** Icon-only Back for a drill-in page (QA plan 9.13): a Home Screen app has no browser Back. It plays the back transition.
 *  Every child page uses this one disc (its name is in the accessible label), so Back looks the same everywhere. */
export const backIcon = (to, label) => `<a class="back-link back-icon" href="#/${to}" data-action="back" aria-label="Back to ${label}">${icon('chevronLeft', { size: 22 })}</a>`;
export const backTitle = (title, to = 'profile', { label = 'Profile', extra = '' } = {}) =>
  `<div class="title-row back-title">${backIcon(to, label)}<h1 class="page-title" id="page-h" tabindex="-1">${title}</h1>${extra}</div>`;

/* ---------- Saved ---------- */
export function renderSaved(ctx) {
  const saved = ctx.state.saved.map((id) => ctx.venues.find((v) => v.id === id)).filter(Boolean);
  const missing = ctx.state.saved.length - saved.length;
  return `<div class="page">
    ${globalThis.__STORE__ ? '<div class="title-row"><h1 class="page-title" id="page-h" tabindex="-1">Saved</h1></div>' : backTitle('Saved bars')}
    
    ${missing ? (globalThis.__STORE__ || LIVE
      ? banner('info', 'info', `<p>${missing} saved bar${missing === 1 ? ' isn’t' : 's aren’t'} listed anymore.</p>`)
      : banner('info', 'info', `<p>${missing} saved venue${missing === 1 ? ' isn’t' : 's aren’t'} in this view. ${missing === 1 ? 'It comes' : 'They come'} back when you show all bars.</p>`, ctx.state.dataset !== 'demo' ? '<button type="button" class="btn" data-action="dataset" data-kind="demo">Show all bars</button>' : '')) : ''}
    ${saved.length
      ? `<ul class="bar-grid" style="margin-top:var(--s-4)">${saved.map((v) => venueCard(v, ctx.now, { saved: true, save: true, remind: !(globalThis.__STORE__ || LIVE) || ctx.canRemind ? (activeReminders(ctx.state.reminders, ctx.now)[v.id] ?? null) : false })).join('')}</ul>`
      : stateBox({ iconName: 'bookmark', title: 'Nothing saved yet', body: 'Save bars from their pages to compare waits here later.', actions: '<a class="btn btn-primary" href="#/">Browse bars</a>' })}
  </div>`;
}

/* ---------- About ---------- */
export function renderAbout(ctx) {
  const s = ctx.state.sim;
  const v = FRESHNESS_MINUTES.venue;
  const toggle = (key, label, hint) => `<div class="switch-row"><label for="sim-${key}"><span class="label" style="margin:0">${label}</span><span class="hint">${hint}</span></label><span class="switch"><input id="sim-${key}" type="checkbox" role="switch" data-input="sim" data-key="${key}" ${s[key] ? 'checked' : ''}><span></span></span></div>`;
  // Only openly licensed bar photos ship (web and iPhone alike); every other bar is drawn. With the media meta set to
  // 'illustration' there are none, and About says so.
  const media = ctx.venues.some((x) => x.photo);
  return `<div class="page">
    ${backTitle('About Night Out')}
    <div class="prose" style="margin-top:var(--s-4)">
      <p><strong>Night Out is a prototype. ${media ? 'Bar names and addresses are real, and so is the one credited photo. The other storefront drawings and initials are illustrations; everything else is sample data.' : 'Bar names and addresses are real. The storefront drawings and initials are illustrations, not the bars’ photos; everything else is sample data.'}</strong> Waits, reports, prices, hours, deals, events, ideas, points, rewards and people are made up and don’t describe how these bars operate. No bar is affiliated with Night Out or has endorsed it.</p>
      <p>Student bars around Easton Ave and Hamilton St, checked in October 2026 against New Jersey ABC license records and the bars’ own websites. Distances are straight-line from ${esc(DEMO_SPOT.label)}, using OpenStreetMap, New Jersey address points and the US Census geocoder.</p>
    </div>
    <h2 class="section-title">How estimates are labeled</h2>
    <table class="rules-table"><thead><tr><th scope="col">State</th><th scope="col">When</th><th scope="col">What you see</th></tr></thead><tbody>
      <tr><td>Fresh</td><td>Updated in the last ${v.fresh} min</td><td>Range, source, age, confidence</td></tr>
      <tr><td>May have changed</td><td>${v.fresh}–${v.stale} min old</td><td>Range kept, lower confidence</td></tr>
      <tr><td>Out of date</td><td>Older than ${v.stale} min</td><td>Number hidden: “Current wait unavailable”</td></tr>
      <tr><td>No data</td><td>No report at all</td><td>“Wait unknown”, never zero</td></tr>
      <tr><td>Uncertain</td><td>Recent reports or ${(globalThis.__STORE__ || LIVE) ? 'head counts' : 'line photos'} disagree</td><td>Wide range, low confidence</td></tr>
    </tbody></table>
    <h2 class="section-title">What this prototype never does</h2>
    <ul class="prose"><li>Take payments or card details</li><li>Collect, upload or scan IDs, or ask for a date of birth</li><li>Sell, order or redeem alcohol; points are never tied to drinks</li><li>Send your location or your data anywhere: your location is used only if you ask (Use my location), on this device, and what you save stays on this device</li><li>Use Rutgers names or marks, or imply any venue partnership</li><li>Sign a venue in, check reward codes on a server or post its photos: Business view is a demo login, on this device only</li><li>Contact a bar or tell it about an idea; approvals happen only in the demo console</li></ul>
    <h2 class="section-title">Demo controls</h2>
    <div class="panel">
      ${toggle('offline', 'Simulate offline', 'Estimates keep aging; refresh is unavailable.')}
      ${toggle('failNextRefresh', 'Fail the next refresh', 'Shows the error state while keeping cached results.')}
      <fieldset class="field-group"><legend>Dataset</legend>
        <div class="segmented" role="group" aria-label="Dataset" style="--n:3">
          ${[['demo', 'Demo'], ['worst', 'Worst case'], ['empty', 'Empty']].map(([k, l]) => `<button type="button" data-action="dataset" data-kind="${k}" aria-pressed="${ctx.state.dataset === k}">${l}</button>`).join('')}
        </div>
      </fieldset>
      <div class="form-actions">
        <button type="button" class="btn" data-action="fast-forward">${icon('ff')}Fast-forward 10 min</button>
        <button type="button" class="btn btn-danger" data-action="reset-demo">${icon('trash')}Reset demo</button>
      </div>
      ${ctx.ui.resetSnapshot && ctx.ui.resetSnapshot.visit === ctx.visit ? '<div class="undo-row" role="status"><span>Demo reset.</span><button type="button" class="btn btn-quiet" data-action="undo-reset">Undo reset</button></div>' : ''}
      <p class="hint">Demo time is ${esc(formatTime(ctx.now))}.</p>
    </div>
    <h2 class="section-title">Credits</h2>
    <p class="prose"><span>Original code, icons and illustrations were made for this prototype. ${media ? 'Stuff Yer Face’s storefront photo: “Stuff Yer Face” by Ben+Sam on Flickr, CC BY-SA 2.0, creativecommons.org/licenses/by-sa/2.0, cropped; this edit is shared under the same licence.' : 'This version shows no bar photos.'} Text uses your device’s own fonts. Design and QA guidance came from pinned, licensed sources listed in <code>app/ATTRIBUTIONS.md</code>.</span></p>
  </div>`;
}

/* ---------- Console: post a deal (structured fields only; see lib/deals.js) ---------- */
const DEAL_TIMES = [[21, 0], [21, 30], [22, 0], [22, 30], [23, 0], [23, 30], [0, 0], [0, 30], [1, 0], [1, 30], [2, 0]];
/** The typical-crowd chart's hours (data/venues.js TYPICAL_HOURS) as clock hours. */
const HOUR_OF = Object.freeze({ '8p': 20, '9p': 21, '10p': 22, '11p': 23, '12a': 0, '1a': 1, '2a': 2 });
const STARTABLE = new Set(DEAL_TIMES.slice(0, -1).map(hhmm)); // 2:00 AM is only ever an end time
/** Quiet hours a deal can actually start in, as "9:00 PM" (8 PM is before the first slot; 2 AM is closing). */
const slowStarts = (v) => slowHours(v.typical, TYPICAL_HOURS).map((l) => [HOUR_OF[l], 0]).filter((t) => t[0] != null && STARTABLE.has(hhmm(t))).map(timeLabel);
const PLACEHOLDER = { entry: 'No cover before 11', food: '$5 wings till midnight', na: '$3 mocktails all night', event: 'Trivia at 11 (food voucher prize)' };
const errP = (id, msg) => `<p class="field-error" id="${id}">${icon('alert')}${esc(msg)}</p>`;
const invalid = (msg, id) => (msg ? ` aria-invalid="true" aria-describedby="${id}"` : '');

/** Default window: the first slot that hasn't passed yet, for an hour (capped at 2 AM), so a headline alone can post. */
export function newDealDraft(base, now) {
  const last = DEAL_TIMES.length - 1; // 2:00 AM
  let s = 2, e = 4; // 10–11 PM when there is no clock
  if (base != null && now != null) {
    const at = ([h, m]) => atNight(base, h, m);
    s = DEAL_TIMES.findIndex((t) => at(t) >= now);
    if (s < 0 || s >= last) s = last - 1; // after 1:30 AM: the last half hour
    e = DEAL_TIMES.findIndex((t) => at(t) >= at(DEAL_TIMES[s]) + 60 * 60_000);
    if (e < 0) e = last;
  }
  return { kind: 'entry', title: '', start: [...DEAL_TIMES[s]], end: [...DEAL_TIMES[e]], item: 'draft', price: '', costOk: false };
}

/** Review states of a venue's own deals (live Business view), as the server names them. */
const REVIEW_WORD = { pending: 'Waiting for review', approved: 'Approved', rejected: 'Not approved', withdrawn: 'Withdrawn', admin: 'Added by Night Out' };
function serverDeals(live, now) {
  if (live.error) return `<p class="hint">${esc(live.error)}</p>`;
  if (!live.deals) return '';
  const when = (x) => dealWhen({ startsAt: Date.parse(x.starts_at), endsAt: Date.parse(x.ends_at) }, now);
  const state = (x) => (x.is_published && Date.parse(x.ends_at) > now ? 'Live' : REVIEW_WORD[x.review_state] ?? '');
  const busy = (x) => (live.withdrawing ?? []).includes(x.id);
  const withdraw = (x) => (['rejected', 'withdrawn'].includes(x.review_state) ? ''
    : `<button type="button" class="btn btn-sm" data-action="deal-withdraw" data-id="${esc(x.id)}" aria-label="Withdraw deal: ${esc(x.title)}"${busy(x) ? ' aria-disabled="true"' : ''}>${busy(x) ? 'Withdrawing…' : 'Withdraw'}</button>`);
  // A deal guests can see asks first (only a new review brings it back): the existing undo-row confirm.
  const asked = live.ask ? live.deals.find((x) => x.id === live.ask) : null;
  const ask = asked ? `<div class="undo-row" role="alert"><span>Withdraw “${esc(asked.title)}”? Guests stop seeing it.</span><span><button type="button" class="btn btn-quiet" data-action="deal-withdraw-confirm" data-id="${esc(asked.id)}">Withdraw</button><button type="button" class="btn btn-quiet" data-action="deal-withdraw-cancel">Cancel</button></span></div>` : '';
  return live.deals.length ? `<h3 class="label" style="margin-top:20px" data-key="deals-posted">Your deals</h3><ul class="plain-list">${live.deals.map((x) => `<li data-key="${esc(x.id)}"><span><b>${esc(x.title)}</b><small>${esc([state(x), when(x)].filter(Boolean).join(' · '))}</small></span>${withdraw(x)}</li>`).join('')}</ul>${ask}` : '';
}

/** live (a live team build's Business view): { deals, error, sending, ask, withdrawing }: the deal goes to Night Out for
 *  review, and the list is the bar's own deals from the server (ask: the deal whose Withdraw is being confirmed). */
export function dealPanel(v, ctx, live = null) {
  const d = ctx.console.dealDraft ?? newDealDraft(ctx.state.clock.base, ctx.now);
  const e = ctx.console.dealErrors ?? {};
  const slow = slowStarts(v);
  const mine = ctx.state.deals.filter((x) => x.venueId === v.id);
  const timeSelect = (key, label) => `<div class="field"><label class="label" for="deal-${key}">${label}</label><div class="select"><select id="deal-${key}" data-input="deal-field" data-key="${key}"${invalid(e.time, 'err-deal-time')}>${DEAL_TIMES.map((t) => `<option value="${hhmm(t)}" ${hhmm(t) === hhmm(d[key]) ? 'selected' : ''}>${timeLabel(t)}</option>`).join('')}</select>${icon('chevronDown', { size: 14 })}</div></div>`;
  const fields = d.kind === 'drink'
    ? `<div class="field-pair">
        <div class="field"><label class="label" for="deal-item">Drink and size</label><div class="select"><select id="deal-item" data-input="deal-field" data-key="item"${invalid(e.item, 'err-deal-item')}>${DRINK_ITEMS.map((i) => `<option value="${i.id}" ${d.item === i.id ? 'selected' : ''}>${esc(`${i.label}, ${i.size}`)}</option>`).join('')}</select>${icon('chevronDown', { size: 14 })}</div>${e.item ? errP('err-deal-item', e.item) : ''}</div>
        <div class="field"><label class="label" for="deal-price">Price per drink ($)</label><input id="deal-price" class="text-input" inputmode="decimal" autocomplete="off" value="${esc(d.price)}" data-input="deal-field" data-key="price" placeholder="4"${invalid(e.price, 'err-deal-price')}>${e.price ? errP('err-deal-price', e.price) : ''}</div>
      </div>
      <label class="check" style="margin-top:4px"><input id="deal-cost" type="checkbox" data-input="deal-cost" ${d.costOk ? 'checked' : ''}${invalid(e.costOk, 'err-deal-cost')}><span>This price is at or above our cost for the drink.</span></label>
      ${e.costOk ? errP('err-deal-cost', e.costOk) : ''}
      <p class="hint">Shown only to guests who confirmed they’re 21+, with no “was” price.</p>`
    : `<div class="field"><label class="label" for="deal-title">Headline</label><input id="deal-title" class="text-input" maxlength="${DEAL_TITLE_MAX}" autocomplete="off" value="${esc(d.title)}" data-input="deal-field" data-key="title" placeholder="${esc(PLACEHOLDER[d.kind] ?? '')}"${invalid(e.title, 'err-deal-title')}>${e.title ? errP('err-deal-title', e.title) : `<p class="hint">Up to ${DEAL_TITLE_MAX} characters.</p>`}</div>`;
  return `<section class="panel" aria-labelledby="deal-h">
    <h2 id="deal-h" tabindex="-1">${live ? 'Propose a deal' : 'Post a deal'}</h2>
    <p class="panel-sub">${live ? 'Night Out reviews each deal before guests see it.' : `Bring people in during slow hours.${slow.length ? ` Typically quiet here: ${esc(slow.join(', '))}.` : ''} Guests see it on the bar’s card and page while it runs.`}</p>
    <form id="deal-form" class="form-stack" novalidate style="margin-top:0">
      <fieldset class="field-group"><legend>Type</legend>
        <div class="radio-row deal-kinds">${Object.entries(DEAL_KINDS).map(([k, kd]) => `<label class="radio-card"><input type="radio" name="deal-kind" value="${k}" data-input="deal-kind" ${d.kind === k ? 'checked' : ''}><span>${esc(kd.short)}${kd.adults ? ' · 21+' : ''}</span></label>`).join('')}</div>
      </fieldset>
      ${fields}
      <div class="field-pair">${timeSelect('start', 'Starts')}${timeSelect('end', 'Ends')}</div>
      ${e.time ? errP('err-deal-time', e.time) : ''}
      ${d.kind === 'event' ? '<p class="hint">Contests are open to 21+ entrants only, with no purchase needed.</p>' : ''}
      <p class="hint">Only deals New Jersey allows: no 2-for-1, unlimited or gender-priced drinks.</p>
      <div class="form-actions" style="margin-top:0"><button type="submit" class="btn btn-primary" data-action="deal-post"${live?.sending ? ' aria-disabled="true"' : ''}>${live ? (live.sending ? 'Sending…' : 'Send for review') : `${icon('plus')}Post deal`}</button></div>
    </form>
    ${live ? serverDeals(live, ctx.now) : mine.length ? `<h3 class="label" style="margin-top:20px" data-key="deals-posted">Your posted deals</h3><ul class="plain-list">${mine.map((x) => `<li data-key="${esc(x.id)}"><span><b>${esc(x.title)}</b><small>${esc(dealWhen(x, ctx.now))}</small></span><button type="button" class="btn btn-sm" data-action="deal-remove" data-id="${esc(x.id)}" aria-label="Remove deal: ${esc(x.title)}">Remove</button></li>`).join('')}</ul>` : ''}
  </section>`;
}
