import { esc, venueCard, stateBox, passCard, estimateBlock, banner, dealWhen } from '../ui/components.js';
import { DEAL_KINDS, DRINK_ITEMS, DEAL_TITLE_MAX, slowHours } from '../lib/deals.js';
import { TYPICAL_HOURS } from '../data/venues.js';
import { DEMO_SPOT } from '../lib/geo.js';
import { icon } from '../ui/icons.js';
import { passStatus, money } from '../lib/pass.js';
import { FRESHNESS_MINUTES, describeEstimate, validPeople } from '../lib/queue.js';
import { offerSummary } from '../lib/pass.js';
import { TONE_LABEL } from '../ui/icons.js';
import { formatTime, hhmm, timeLabel } from '../lib/clock.js';
import { ideaPanel } from './ideas.js';

/* ---------- Saved ---------- */
export function renderSaved(ctx) {
  const saved = ctx.state.saved.map((id) => ctx.venues.find((v) => v.id === id)).filter(Boolean);
  const missing = ctx.state.saved.length - saved.length;
  return `<div class="page">
    <h1 class="page-title" id="page-h" tabindex="-1">Saved</h1>
    <p class="page-sub">Places you want to try. Saved on this device only.</p>
    ${missing ? banner('info', 'info', `<p>${missing} saved venue${missing === 1 ? ' isn’t' : 's aren’t'} in the current demo dataset. ${missing === 1 ? 'It comes' : 'They come'} back when you switch to the demo venues.</p>`, ctx.state.dataset !== 'demo' ? '<button type="button" class="btn" data-action="dataset" data-kind="demo">Switch to demo venues</button>' : '') : ''}
    ${ctx.ui.lastRemoved && ctx.ui.lastRemoved.visit === ctx.visit ? `<div class="undo-row" role="status"><span>Removed ${esc(ctx.ui.lastRemoved.name)}.</span><button type="button" class="btn btn-quiet" data-action="undo-remove">Undo</button></div>` : ''}
    ${saved.length
      ? `<ul class="bar-grid" style="margin-top:var(--s-4)">${saved.map((v) => venueCard(v, ctx.now, { saved: true, save: true })).join('')}</ul>
         <p class="hint" style="margin-top:12px">Estimates here use the same source, age and confidence rules as Tonight.</p>`
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
    <p class="page-sub">Demo priority passes. No charge. Not valid for entry.</p>
    ${passes.length
      ? `<div class="pass-list">${passes.map((p) => passItem(p, ctx.now)).join('')}</div>`
      : stateBox({ iconName: 'ticket', title: 'No demo passes yet', body: example ? 'Some bars show a simulated priority pass so you can try the flow. No bar is affiliated with Night Out.' : 'No venue in the current dataset has a priority window open right now.', actions: example ? `<a class="btn btn-primary" href="#/venue/${encodeURIComponent(example.id)}">See ${esc(example.name)}</a>` : '<a class="btn btn-primary" href="#/">Browse bars</a>' })}
  </div>`;
}

function passItem(p, now) {
  const status = passStatus(p, now);
  const canCancel = status === 'upcoming' || status === 'active';
  return `<div>
    ${passCard(p, now, { headingLevel: 2 })}
    <div class="pass-item-actions">
      <a class="btn" href="#/venue/${encodeURIComponent(p.venueId)}" aria-label="View ${esc(p.venueName)}">${icon('arrowRight')}View venue</a>
      ${canCancel ? `<button type="button" class="btn btn-danger" data-action="cancel-pass" data-id="${esc(p.id)}">Cancel demo pass</button>` : ''}
      ${status === 'cancelled' && now < p.windowEnd ? `<button type="button" class="btn" data-action="restore-pass" data-id="${esc(p.id)}">Restore demo pass</button>` : ''}
    </div>
  </div>`;
}

export function renderPassDetail(ctx, id) {
  const p = ctx.state.passes.find((x) => x.id === id);
  if (!p) {
    return `<div class="page">${stateBox({ iconName: 'ticket', title: 'Pass not found', body: 'It may have been removed when the demo was reset.', actions: '<a class="btn btn-primary" href="#/passes">All passes</a>', headingLevel: 1 })}</div>`;
  }
  return `<div class="page">
    <div class="back-row"><a class="back-link" href="#/passes">${icon('chevronLeft')}All passes</a></div>
    <h1 class="sr-only" id="page-h" tabindex="-1">Demo pass for ${esc(p.venueName)}</h1>
    ${passItem(p, ctx.now)}
    <p class="hint" style="margin-top:12px">Created ${esc(formatTime(p.createdAt))} (demo time). A real pass would be verified by the venue’s system at the door. This one is intentionally not scannable.</p>
  </div>`;
}

/* ---------- Venue console (operator demo) ---------- */
export function renderConsole(ctx) {
  const venues = ctx.venues;
  if (!venues.length) return `<div class="page">${stateBox({ iconName: 'door', title: 'No venues to manage', body: 'Restore the demo dataset first.', actions: '<button type="button" class="btn btn-primary" data-action="dataset" data-kind="demo">Restore demo venues</button>', headingLevel: 1 })}</div>`;
  const id = ctx.console.venueId && venues.some((v) => v.id === ctx.console.venueId) ? ctx.console.venueId : venues[0].id;
  const v = venues.find((x) => x.id === id);
  const d = ctx.console.drafts[id] ?? draftFrom(v);
  const cleared = ctx.ui.clearedQueue?.venueId === id;
  const audit = ctx.state.audit.filter((a) => a.venueId === id).slice(0, 8);
  const doors = [['moving', 'Moving'], ['capacity', 'At capacity'], ['paused', 'Entry paused'], ['closed', 'Closed']];
  return `<div class="page" style="max-width:1100px">
    <h1 class="page-title" id="page-h" tabindex="-1">Venue console</h1>
    <p class="page-sub">Demo of what door staff would update. No real venue is connected. Changes stay on this device.</p>
    <div class="field-group" style="margin-top:var(--s-4)">
      <label class="label" for="console-venue">Venue (simulated controls)</label>
      <div class="select"><select id="console-venue" data-input="console-venue" style="width:100%;min-height:46px">${venues.map((x) => `<option value="${x.id}" ${x.id === id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>${icon('chevronDown')}</div>
    </div>
    <div class="console-grid">
      <section class="panel" aria-labelledby="door-h">
        <h2 id="door-h">Door update</h2>
        <p class="panel-sub">Publishing shows guests “Venue update · just now”. It goes out of date after ${FRESHNESS_MINUTES.venue.stale} minutes without a new update.</p>
        <form id="door-form" novalidate>
          <fieldset class="field-group"><legend>Door status</legend>
            <div class="radio-row">${doors.map(([val, label]) => `<label class="radio-card"><input type="radio" name="door" value="${val}" data-input="console-door" ${d.doorStatus === val ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div>
          </fieldset>
          <div class="field-group stepper-row">
            <div><p class="label" id="ppl-label">People in line (about)</p><p class="hint">${d.people == null ? 'Not set yet. No line size on record.' : `Published as a range: ~${d.peopleLow}–${d.peopleHigh}`}</p></div>
            <div class="stepper" role="group" aria-labelledby="ppl-label">
              <button type="button" class="icon-btn" data-action="console-people" data-delta="-5" aria-label="5 fewer people" ${d.people == null || d.people <= 0 ? 'disabled' : ''}>${icon('minus')}</button>
              <output>${d.people ?? '—'}</output>
              <button type="button" class="icon-btn" data-action="console-people" data-delta="5" aria-label="5 more people" ${d.people >= 400 ? 'disabled' : ''}>${icon('plus')}</button>
            </div>
          </div>
          <div class="field-group range-row">
            <label class="label" for="admit">Admissions per minute: <output for="admit">${d.admitPerMin ?? 'not set'}</output></label>
            <input id="admit" type="range" min="0.5" max="6" step="0.5" value="${d.admitPerMin ?? 2}" data-input="console-admit"${d.admitPerMin == null ? ' aria-valuetext="not set"' : ''}>
            <p class="hint" id="console-hint">${esc(consoleHint(d, ctx.now))}</p>
          </div>
          <div class="field-group">
            <label class="label" for="door-note">Note for guests (optional)</label>
            <input id="door-note" name="note" class="text-input" maxlength="60" value="${esc(d.note)}" data-input="console-note" placeholder="Private event until 11:30 PM…" autocomplete="off">
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" data-action="console-publish" aria-disabled="${!draftReady(d)}">${icon('check')}Publish update</button>
            ${cleared ? '<button type="button" class="btn" data-action="console-undo-clear">Restore previous estimate</button>' : '<button type="button" class="btn" data-action="console-clear">Clear estimate (no data)</button>'}
          </div>
        </form>
      </section>
      <section class="panel" aria-labelledby="prev-h">
        <h2 id="prev-h">What guests see now</h2>
        <p class="panel-sub">The same component as the guest app.</p>
        ${estimateBlock(v, ctx.now, { headingId: 'qb-console', showHow: false, headingLevel: 3 })}
      </section>
      ${dealPanel(v, ctx)}
      ${ideaPanel(v, ctx)}
      ${passPanel(v, ctx)}
      <section class="panel" aria-labelledby="audit-h">
        <h2 id="audit-h">Change log</h2>
        ${audit.length ? `<ol class="audit">${audit.map((a) => `<li><time>${esc(formatTime(a.at))} · demo time</time><span>${esc(a.summary)}</span></li>`).join('')}</ol>` : '<p class="hint">Publish a door update to start the log.</p>'}
      </section>
    </div>
  </div>`;
}

/** Start from what's on record; nothing is invented. Missing counts or pace stay unset until the operator sets them. */
export function draftFrom(v) {
  const q = v.queue;
  const people = validPeople(q) ? Math.round((q.peopleLow + q.peopleHigh) / 2 / 5) * 5 : null;
  const pace = Number.isFinite(q?.admitPerMin) && q.admitPerMin > 0 ? q.admitPerMin : null;
  return { venueId: v.id, doorStatus: q?.doorStatus ?? 'moving', people, ...(people == null ? { peopleLow: null, peopleHigh: null } : rangeFor(people)), admitPerMin: pace, note: q?.note ?? '' };
}

/** A moving line needs both a line size and a pace before a wait can be published. */
export const draftReady = (d) => d.doorStatus !== 'moving' || (d.people != null && d.admitPerMin != null);

/** What guests would see if this draft were published, via the same estimate rules as the guest app. */
export function consoleHint(d, now) {
  if (!draftReady(d)) return 'Set the line size and door pace to publish a wait estimate.';
  const preview = { id: 'draft', queue: { sourceType: 'venue', observedAt: now, peopleLow: d.peopleLow, peopleHigh: d.peopleHigh, admitPerMin: d.admitPerMin, doorStatus: d.doorStatus, note: d.note } };
  const est = describeEstimate(preview, now, { isOpen: true });
  const tone = est.headline === TONE_LABEL[est.tone] ? '' : ` (${TONE_LABEL[est.tone]})`;
  const how = est.waitLow != null && est.tone === 'fresh' ? ' People ÷ admission rate, widened for uncertainty.' : '';
  return `After publishing, guests see “${est.headline}”${tone}.${how}`;
}

export function rangeFor(people) {
  if (people <= 2) return { peopleLow: 0, peopleHigh: 2 };
  return { peopleLow: Math.max(0, Math.round(people * 0.85)), peopleHigh: Math.round(people * 1.15) };
}

function passPanel(v, ctx) {
  if (!v.pass) return `<section class="panel" aria-labelledby="pp-h"><h2 id="pp-h">Priority pass</h2><p class="hint">No simulated priority pass for this bar.</p></section>`;
  const p = v.pass;
  return `<section class="panel" aria-labelledby="pp-h">
    <h2 id="pp-h">Priority pass availability</h2>
    <p class="panel-sub">Inventory is real within the demo: remaining = capacity − demo passes.</p>
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
    <h1 class="page-title" id="page-h" tabindex="-1">About this demo</h1>
    <p class="page-sub">Night Out is a prototype with simulated data.</p>
    <div class="prose" style="margin-top:var(--s-4)">
      <p><strong>Bar names, street addresses, logos and photos are real. Everything else is simulated.</strong> Waits, line sizes, reports, passes, prices, covers, hours, menus, typical patterns, community ideas and the people who proposed them are made up for this demo and don’t describe how these bars operate. No bar is affiliated with Night Out or has endorsed it, and no line is live.</p>
      <p>The list is the student bars around Easton Ave, checked in October 2026 against the New Jersey ABC retail license list (October 1, 2026), New Brunswick council license records, the September 2026 Rutgers bar-crawl stops and the bars’ own websites: Olde Queens Tavern, Scarlet Pub, Huey’s Knight Club, PITCH Social, The Vine, The Olive Branch, Stuff Yer Face, 30 Burgers &amp; Brews and Evelyn’s, plus Ale ’N ’Wich on Hamilton St. Left out: Knights Public House (closed in 2026), and downtown restaurants with bars that aren’t student line spots. Distances are straight-line from a demo spot, ${esc(DEMO_SPOT.label)}, using OpenStreetMap, New Jersey address points and the US Census geocoder.</p>
      <p>This isn’t the first nightlife app around Rutgers. LineLeap already runs New Brunswick bar crawls, and at least one Easton Ave bar sells skip-the-line tickets on another platform. This demo explores a different promise: <em>trustworthy line information and a fair, transparent priority pass</em>.</p>
    </div>
    <h2 class="section-title">How estimates are labeled</h2>
    <table class="rules-table"><thead><tr><th scope="col">State</th><th scope="col">When</th><th scope="col">What you see</th></tr></thead><tbody>
      <tr><td>Fresh</td><td>Updated in the last ${v.fresh} min</td><td>Range, source, age, confidence</td></tr>
      <tr><td>May have changed</td><td>${v.fresh}–${v.stale} min old</td><td>Range kept, lower confidence</td></tr>
      <tr><td>Out of date</td><td>Older than ${v.stale} min</td><td>Number hidden: “Current wait unavailable”</td></tr>
      <tr><td>No data</td><td>No report at all</td><td>“Wait unknown”, never zero</td></tr>
      <tr><td>Uncertain</td><td>Recent crowd reports disagree</td><td>Wide range, low confidence</td></tr>
    </tbody></table>
    <p class="hint" style="margin-top:8px">These thresholds are our design assumptions, not an industry standard. A real pilot would tune them against observed waits.</p>
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
        <p class="hint">Worst case adds very long names, 250+ and single-person lines, missing data and all-stale estimates.</p>
      </fieldset>
      <div class="form-actions">
        <button type="button" class="btn" data-action="fast-forward">${icon('ff')}Fast-forward 10 min</button>
        <button type="button" class="btn btn-danger" data-action="reset-demo">${icon('trash')}Reset demo</button>
      </div>
      ${ctx.ui.resetSnapshot && ctx.ui.resetSnapshot.visit === ctx.visit ? '<div class="undo-row" role="status"><span>Demo reset.</span><button type="button" class="btn btn-quiet" data-action="undo-reset">Undo reset</button></div>' : ''}
      <p class="hint">Demo time is ${esc(formatTime(ctx.now))}. It started at 10:40 PM on the review date and runs in real time.</p>
    </div>
    <h2 class="section-title">Credits</h2>
    <p class="prose"><span>Original code, icons and illustrations were made for this prototype. Bar logos and photos are real and belong to the bars (Stuff Yer Face’s storefront photo: Ben+Sam on Flickr, CC BY-SA 2.0; The Vine’s sign photo: @dtjphotography). They’re shown only so the demo is recognizable; no bar has given permission or is affiliated, and permission will be asked before any launch. Each photo’s source is on its bar page. The shared version loads the Archivo font (SIL Open Font License) from Google Fonts. Design and QA guidance came from pinned, licensed sources listed in <code>app/ATTRIBUTIONS.md</code>.</span></p>
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

function dealPanel(v, ctx) {
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
      <p class="hint">One drink, its standard size and one price. Shown only to guests who confirmed they’re 21+, with no “was” price.</p>`
    : `<div class="field"><label class="label" for="deal-title">Headline</label><input id="deal-title" class="text-input" maxlength="${DEAL_TITLE_MAX}" autocomplete="off" value="${esc(d.title)}" data-input="deal-field" data-key="title" placeholder="${esc(PLACEHOLDER[d.kind] ?? '')}"${invalid(e.title, 'err-deal-title')}>${e.title ? errP('err-deal-title', e.title) : `<p class="hint">Up to ${DEAL_TITLE_MAX} characters. Shown on the bar’s card while the deal runs.</p>`}</div>`;
  return `<section class="panel" aria-labelledby="deal-h">
    <h2 id="deal-h" tabindex="-1">Post a deal</h2>
    <p class="panel-sub">Bring people in during slow hours.${slow.length ? ` Typically quiet here: ${esc(slow.join(', '))} (simulated pattern).` : ''} Guests see it on the bar’s card and page while it runs.</p>
    <form id="deal-form" class="form-stack" novalidate style="margin-top:0">
      <fieldset class="field-group"><legend>Type</legend>
        <div class="radio-row deal-kinds">${Object.entries(DEAL_KINDS).map(([k, kd]) => `<label class="radio-card"><input type="radio" name="deal-kind" value="${k}" data-input="deal-kind" ${d.kind === k ? 'checked' : ''}><span>${esc(kd.short)}${kd.adults ? ' · 21+' : ''}</span></label>`).join('')}</div>
      </fieldset>
      ${fields}
      <div class="field-pair">${timeSelect('start', 'Starts')}${timeSelect('end', 'Ends')}</div>
      ${e.time ? errP('err-deal-time', e.time) : ''}
      ${d.kind === 'event' ? '<p class="hint">Contests are open to 21+ entrants only, with no purchase needed.</p>' : ''}
      <p class="hint">New Jersey doesn’t allow 2-for-1 or multi-drink offers, unlimited drinks, free items for buying alcohol, bigger pours for the same price, or prices by gender. This form only builds deals that avoid those.</p>
      <div class="form-actions" style="margin-top:0"><button type="submit" class="btn btn-primary" data-action="deal-post">${icon('plus')}Post deal (demo)</button></div>
    </form>
    ${mine.length ? `<h3 class="label" style="margin-top:20px">Posted from this console</h3><ul class="plain-list">${mine.map((x) => `<li><span><b>${esc(x.title)}</b><small>${esc(dealWhen(x, ctx.now))}</small></span><button type="button" class="btn btn-sm" data-action="deal-remove" data-id="${esc(x.id)}" aria-label="Remove deal: ${esc(x.title)}">Remove</button></li>`).join('')}</ul>` : ''}
  </section>`;
}
