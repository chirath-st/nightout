import { esc, venueCard, stateBox, passCard, estimateBlock, banner, dealWhen } from '../ui/components.js';
import { DEAL_KINDS, DRINK_ITEMS, DEAL_TITLE_MAX, slowHours } from '../lib/deals.js';
import { TYPICAL_HOURS } from '../data/venues.js';
import { DEMO_SPOT } from '../lib/geo.js';
import { icon } from '../ui/icons.js';
import { passStatus, money } from '../lib/pass.js';
import { FRESHNESS_MINUTES } from '../lib/queue.js';
import { offerSummary } from '../lib/pass.js';
import { formatTime, hhmm, timeLabel } from '../lib/clock.js';

/* ---------- Saved ---------- */
export function renderSaved(ctx) {
  const saved = ctx.state.saved.map((id) => ctx.venues.find((v) => v.id === id)).filter(Boolean);
  const missing = ctx.state.saved.length - saved.length;
  return `<div class="page">
    <h1 class="page-title" id="page-h" tabindex="-1">Saved</h1>
    
    ${missing ? banner('info', 'info', `<p>${missing} saved venue${missing === 1 ? ' isn’t' : 's aren’t'} in this view. ${missing === 1 ? 'It comes' : 'They come'} back when you show all bars.</p>`, ctx.state.dataset !== 'demo' ? '<button type="button" class="btn" data-action="dataset" data-kind="demo">Show all bars</button>' : '') : ''}
    ${ctx.ui.lastRemoved && ctx.ui.lastRemoved.visit === ctx.visit ? `<div class="undo-row" role="status"><span>Removed ${esc(ctx.ui.lastRemoved.name)}.</span><button type="button" class="btn btn-quiet" data-action="undo-remove">Undo</button></div>` : ''}
    ${saved.length
      ? `<ul class="bar-grid" style="margin-top:var(--s-4)">${saved.map((v) => venueCard(v, ctx.now, { saved: true, save: true })).join('')}</ul>`
      : stateBox({ iconName: 'bookmark', title: 'Nothing saved yet', body: 'Save bars from their pages to compare waits here later.', actions: '<a class="btn btn-primary" href="#/">Browse bars</a>' })}
  </div>`;
}

/* ---------- Passes ---------- */
export function renderPasses(ctx) {
  const passes = [...ctx.state.passes].sort((a, b) => b.createdAt - a.createdAt);
  const example = ctx.venues.find((v) => offerSummary(v.pass, ctx.now).state === 'available');
  const order = { active: 0, upcoming: 1, expired: 2, cancelled: 3 };
  passes.sort((a, b) => order[passStatus(a, ctx.now)] - order[passStatus(b, ctx.now)]);
  return `<div class="page">
    <h1 class="page-title" id="page-h" tabindex="-1">Passes</h1>
    
    ${passes.length
      ? `<div class="pass-list">${passes.map((p) => passItem(p, ctx.now)).join('')}</div>`
      : stateBox({ iconName: 'ticket', title: 'No passes yet', body: example ? 'Get one from a bar’s page while its priority window is open.' : 'No bar has a priority window open right now.', actions: example ? `<a class="btn btn-primary" href="#/venue/${encodeURIComponent(example.id)}">See ${esc(example.name)}</a>` : '<a class="btn btn-primary" href="#/">Browse bars</a>' })}
  </div>`;
}

function passItem(p, now) {
  const status = passStatus(p, now);
  const canCancel = status === 'upcoming' || status === 'active';
  return `<div>
    ${passCard(p, now, { headingLevel: 2 })}
    <div class="pass-item-actions">
      <a class="btn" href="#/venue/${encodeURIComponent(p.venueId)}" aria-label="View ${esc(p.venueName)}">${icon('arrowRight')}View venue</a>
      ${canCancel ? `<button type="button" class="btn btn-danger" data-action="cancel-pass" data-id="${esc(p.id)}">Cancel pass</button>` : ''}
      ${status === 'cancelled' && now < p.windowEnd ? `<button type="button" class="btn" data-action="restore-pass" data-id="${esc(p.id)}">Restore pass</button>` : ''}
    </div>
  </div>`;
}

export function renderPassDetail(ctx, id) {
  const p = ctx.state.passes.find((x) => x.id === id);
  if (!p) {
    return `<div class="page">${stateBox({ iconName: 'ticket', title: 'Pass not found', body: 'It may have been removed.', actions: '<a class="btn btn-primary" href="#/passes">All passes</a>', headingLevel: 1 })}</div>`;
  }
  return `<div class="page">
    <div class="back-row"><a class="back-link" href="#/passes">${icon('chevronLeft')}All passes</a></div>
    <h1 class="sr-only" id="page-h" tabindex="-1">Pass for ${esc(p.venueName)}</h1>
    ${passItem(p, ctx.now)}
    <p class="hint" style="margin-top:12px">Created ${esc(formatTime(p.createdAt))}.</p>
  </div>`;
}

/* ---------- Venue console panels (the console itself is views/console.js) ---------- */
export function passPanel(v, ctx) {
  if (!v.pass) return `<section class="panel" aria-labelledby="pp-h"><h2 id="pp-h">Priority pass</h2><p class="hint">No priority pass for this bar.</p></section>`;
  const p = v.pass;
  return `<section class="panel" aria-labelledby="pp-h">
    <h2 id="pp-h">Priority pass availability</h2>
    <div class="switch-row"><label for="pp-pause"><span class="label" style="margin:0">Pause priority passes</span><span class="hint">Guests see “Paused by venue”.</span></label>
      <span class="switch"><input id="pp-pause" type="checkbox" role="switch" data-input="console-pause" ${p.paused ? 'checked' : ''}><span></span></span></div>
    <div class="cap-row" style="border-top:1px solid var(--line)"><div><span class="label" style="margin:0" id="price-label">Price per person</span><small>${money(p.serviceFee)} service fee added (shown all-in to guests)</small></div>
      <div class="stepper" role="group" aria-labelledby="price-label"><button type="button" class="icon-btn" data-action="console-price" data-delta="-100" aria-label="Lower price by $1" ${p.basePrice <= 100 ? 'disabled' : ''}>${icon('minus')}</button><output>${money(p.basePrice)}</output><button type="button" class="icon-btn" data-action="console-price" data-delta="100" aria-label="Raise price by $1" ${p.basePrice >= 5000 ? 'disabled' : ''}>${icon('plus')}</button></div></div>
    ${p.windows.map((w) => `<div class="cap-row"><div><span id="cap-${w.id}">${esc(formatTime(w.start))}–${esc(formatTime(w.end))}</span><small>${w.sold} sold, ${w.remaining} left</small></div>
      <div class="stepper" role="group" aria-labelledby="cap-${w.id}"><button type="button" class="icon-btn" data-action="console-cap" data-window="${w.id}" data-delta="-1" aria-label="Reduce capacity" ${w.capacity <= w.sold ? 'disabled' : ''}>${icon('minus')}</button><output>${w.capacity}</output><button type="button" class="icon-btn" data-action="console-cap" data-window="${w.id}" data-delta="1" aria-label="Increase capacity" ${w.capacity >= 50 ? 'disabled' : ''}>${icon('plus')}</button></div></div>`).join('')}
    <p class="hint" style="margin-top:10px">Priority is first-come within posted capacity. No profiling or selection of guests.</p>
  </section>`;
}

/* ---------- About ---------- */
export function renderAbout(ctx) {
  const s = ctx.state.sim;
  const v = FRESHNESS_MINUTES.venue;
  const toggle = (key, label, hint) => `<div class="switch-row"><label for="sim-${key}"><span class="label" style="margin:0">${label}</span><span class="hint">${hint}</span></label><span class="switch"><input id="sim-${key}" type="checkbox" role="switch" data-input="sim" data-key="${key}" ${s[key] ? 'checked' : ''}><span></span></span></div>`;
  return `<div class="page">
    <h1 class="page-title" id="page-h" tabindex="-1">About Night Out</h1>
    <div class="prose" style="margin-top:var(--s-4)">
      <p><strong>Night Out is a prototype. Bar names, addresses, logos and photos are real; everything else is sample data.</strong> Waits, reports, passes, prices, hours, deals, events, ideas and people are made up and don’t describe how these bars operate. No bar is affiliated with Night Out or has endorsed it.</p>
      <p>Student bars around Easton Ave and Hamilton St, checked in October 2026 against New Jersey ABC license records and the bars’ own websites. Distances are straight-line from ${esc(DEMO_SPOT.label)}, using OpenStreetMap, New Jersey address points and the US Census geocoder.</p>
    </div>
    <h2 class="section-title">How estimates are labeled</h2>
    <table class="rules-table"><thead><tr><th scope="col">State</th><th scope="col">When</th><th scope="col">What you see</th></tr></thead><tbody>
      <tr><td>Fresh</td><td>Updated in the last ${v.fresh} min</td><td>Range, source, age, confidence</td></tr>
      <tr><td>May have changed</td><td>${v.fresh}–${v.stale} min old</td><td>Range kept, lower confidence</td></tr>
      <tr><td>Out of date</td><td>Older than ${v.stale} min</td><td>Number hidden: “Current wait unavailable”</td></tr>
      <tr><td>No data</td><td>No report at all</td><td>“Wait unknown”, never zero</td></tr>
      <tr><td>Uncertain</td><td>Recent reports or line photos disagree</td><td>Wide range, low confidence</td></tr>
    </tbody></table>
    <h2 class="section-title">What this prototype never does</h2>
    <ul class="prose"><li>Take payments or card details</li><li>Collect, upload or scan IDs, or ask for a date of birth</li><li>Sell, order or redeem alcohol; points are never tied to drinks</li><li>Request your location or send your data anywhere: what you save stays in this browser</li><li>Use Rutgers names or marks, or imply any venue partnership</li><li>Contact a bar or tell it about an idea; approvals happen only in the demo console</li></ul>
    <h2 class="section-title">Demo controls</h2>
    <div class="panel">
      ${toggle('offline', 'Simulate offline', 'Estimates keep aging; refresh is unavailable.')}
      ${toggle('failNextRefresh', 'Fail the next refresh', 'Shows the error state while keeping cached results.')}
      ${toggle('failNextPass', 'Fail the next pass request', 'Shows the safe-retry state in the pass flow.')}
      <fieldset class="field-group"><legend>Dataset</legend>
        <div class="segmented" role="group" aria-label="Dataset">
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
    <p class="prose"><span>Original code, icons and illustrations were made for this prototype. Bar logos and photos are real and belong to the bars (Stuff Yer Face’s storefront photo: Ben+Sam on Flickr, CC BY-SA 2.0; The Vine’s sign photo: @dtjphotography). They’re shown only so the demo is recognizable; no bar has given permission or is affiliated, and permission will be asked before any launch. Each photo’s source is on its bar page. The shared version loads Archivo and, for the wordmark, a Fraunces Italic subset (both SIL Open Font License) from Google Fonts. Design and QA guidance came from pinned, licensed sources listed in <code>app/ATTRIBUTIONS.md</code>.</span></p>
  </div>`;
}

/* ---------- Console: post a deal (structured fields only; see lib/deals.js) ---------- */
const DEAL_TIMES = [[21, 0], [21, 30], [22, 0], [22, 30], [23, 0], [23, 30], [0, 0], [0, 30], [1, 0], [1, 30], [2, 0]];
const PLACEHOLDER = { entry: 'No cover before 11', food: '$5 wings till midnight', na: '$3 mocktails all night', event: 'Trivia at 11 (food voucher prize)' };
const errP = (id, msg) => `<p class="field-error" id="${id}">${icon('alert')}${esc(msg)}</p>`;
const invalid = (msg, id) => (msg ? ` aria-invalid="true" aria-describedby="${id}"` : '');

export function newDealDraft() {
  return { kind: 'entry', title: '', start: [22, 0], end: [23, 0], item: 'draft', price: '', costOk: false };
}

export function dealPanel(v, ctx) {
  const d = ctx.console.dealDraft ?? newDealDraft();
  const e = ctx.console.dealErrors ?? {};
  const slow = slowHours(v.typical, TYPICAL_HOURS);
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
    <h2 id="deal-h" tabindex="-1">Post a deal</h2>
    <p class="panel-sub">Bring people in during slow hours.${slow.length ? ` Typically quiet here: ${esc(slow.join(', '))}.` : ''} Guests see it on the bar’s card and page while it runs.</p>
    <form id="deal-form" class="form-stack" novalidate style="margin-top:0">
      <fieldset class="field-group"><legend>Type</legend>
        <div class="radio-row deal-kinds">${Object.entries(DEAL_KINDS).map(([k, kd]) => `<label class="radio-card"><input type="radio" name="deal-kind" value="${k}" data-input="deal-kind" ${d.kind === k ? 'checked' : ''}><span>${esc(kd.short)}${kd.adults ? ' · 21+' : ''}</span></label>`).join('')}</div>
      </fieldset>
      ${fields}
      <div class="field-pair">${timeSelect('start', 'Starts')}${timeSelect('end', 'Ends')}</div>
      ${e.time ? errP('err-deal-time', e.time) : ''}
      ${d.kind === 'event' ? '<p class="hint">Contests are open to 21+ entrants only, with no purchase needed.</p>' : ''}
      <p class="hint">New Jersey doesn’t allow 2-for-1 or multi-drink offers, unlimited drinks, free items for buying alcohol, bigger pours for the same price, or prices by gender. This form only builds deals that avoid those.</p>
      <div class="form-actions" style="margin-top:0"><button type="submit" class="btn btn-primary" data-action="deal-post">${icon('plus')}Post deal</button></div>
    </form>
    ${mine.length ? `<h3 class="label" style="margin-top:20px">Posted from this console</h3><ul class="plain-list">${mine.map((x) => `<li><span><b>${esc(x.title)}</b><small>${esc(dealWhen(x, ctx.now))}</small></span><button type="button" class="btn btn-sm" data-action="deal-remove" data-id="${esc(x.id)}" aria-label="Remove deal: ${esc(x.title)}">Remove</button></li>`).join('')}</ul>` : ''}
  </section>`;
}
