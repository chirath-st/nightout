// Simulated priority-pass journey (review → pending → confirmed | failed → retry).
// Payment is described, never collected. Demo outcome text is fixed: DEMO_OUTCOME.
import { esc, passCard, windowLabel } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { windowState, WINDOW_STATE_COPY, purchasable, priceFor, money, dollars, maxPartyFor, DEMO_OUTCOME, refCode } from '../lib/pass.js';

export function renderPassSheet(ctx, flow) {
  const venue = ctx.venues.find((v) => v.id === flow.venueId);
  if (!venue || !venue.pass) {
    return { title: 'Priority pass', body: '<p>This venue doesn’t offer a priority pass in the demo.</p>', foot: '<button type="button" class="btn btn-block" data-action="close-sheet">Close</button>' };
  }
  const now = ctx.now;
  if (flow.step === 'done') return done(ctx, flow, venue);
  if (flow.step === 'error') return failed(flow, venue);

  const wins = venue.pass.windows.map((w) => ({ w, state: windowState(venue.pass, w, now) }));
  const anyOpen = wins.some((x) => purchasable(x.state));
  const chosen = wins.find((x) => x.w.id === flow.windowId && purchasable(x.state));
  const party = chosen ? Math.min(flow.party, maxPartyFor(chosen.w)) : flow.party;
  const price = priceFor(venue.pass, party);
  const pending = flow.step === 'pending';

  const options = wins.map(({ w, state }) => {
    const label = state === 'few' ? WINDOW_STATE_COPY.few(w.remaining) : WINDOW_STATE_COPY[state];
    const disabled = !purchasable(state) || pending;
    return `<label class="window-option">
      <input type="radio" id="win-${w.id}" name="win" value="${w.id}" data-input="pass-window" ${flow.windowId === w.id && purchasable(state) ? 'checked' : ''} ${disabled ? 'disabled' : ''} aria-describedby="wst-${w.id}${flow.errors?.window ? ' err-window' : ''}"${flow.errors?.window ? ' aria-invalid="true"' : ''}>
      <span class="w-time">${esc(windowLabel(w.start, w.end))}</span>
      <span class="w-state ${state === 'few' ? 'is-few' : state === 'open' ? 'is-open' : ''}" id="wst-${w.id}">${esc(label)}</span>
    </label>`;
  }).join('');

  const unavailableNote = !anyOpen
    ? `<div class="banner banner-warn" role="status">${icon('alert')}<div><p><strong>${venue.pass.paused ? 'Paused by the venue.' : wins.every((x) => x.state === 'passed') ? 'All windows ended.' : 'Sold out tonight.'}</strong></p><p>No pass can be created right now. Nothing has been charged.</p></div></div>`
    : '';

  const body = `
    <div class="banner banner-demo" role="note">${icon('info')}<div><p><strong>Demo review. No payment will be taken.</strong></p><p>${esc(venue.name)} isn’t affiliated with Night Out and hasn’t agreed to sell passes. This simulates how a venue-authorized priority pass could work.</p></div></div>
    ${unavailableNote}
    ${flow.notice ? `<div class="banner banner-warn" role="alert" tabindex="-1" data-notice>${icon('alert')}<div><p>${esc(flow.notice)}</p></div></div>` : ''}
    <form id="pass-form" novalidate>
      <fieldset class="field-group" ${pending ? 'disabled' : ''}>
        <legend>Entry window</legend>
        <div class="window-grid">${options}</div>
        <p class="hint">Arrive during your window. Windows and caps are set by the venue (simulated).</p>
        ${flow.errors?.window ? `<p class="field-error" id="err-window">${icon('alert')}${esc(flow.errors.window)}</p>` : ''}
      </fieldset>
      <div class="field-group">
        <div class="stepper-row">
          <div><p class="label" id="party-label">Party size</p><p class="hint" id="party-hint">${chosen ? `Up to ${maxPartyFor(chosen.w)} for this window` : 'Choose a window first'}</p></div>
          <div class="stepper" role="group" aria-labelledby="party-label">
            <button type="button" class="icon-btn" data-action="party" data-delta="-1" aria-label="Fewer people" ${party <= 1 || pending ? 'disabled' : ''}>${icon('minus')}</button>
            <output aria-label="Party size">${party}</output>
            <button type="button" class="icon-btn" data-action="party" data-delta="1" aria-label="More people" ${!chosen || party >= maxPartyFor(chosen.w) || pending ? 'disabled' : ''}>${icon('plus')}</button>
          </div>
        </div>
      </div>
      <div class="field-group">
        <p class="label">What priority means</p>
        <ul class="terms">
          <li>${icon('check')}<span>You join the venue’s priority lane during your window, ahead of the general line.</span></li>
          <li>${icon('alert')}<span>Entry is never guaranteed. Door staff still check physical ID (21+), dress code, capacity and safety.</span></li>
          <li>${icon('capacity')}<span>At capacity, priority only changes order: entry happens as people leave.</span></li>
          <li>${icon('refresh')}<span>Planned remedy: if the venue closes, pauses priority or can’t honor the pass in your window, the pass is refunded. This is demo copy, not a real policy.</span></li>
          <li>${icon('ticket')}<span>${venue.pass.coverIncluded ? 'Includes the venue’s cover.' : `Cover is not included${Number.isFinite(venue.cover) && venue.cover > 0 ? ` (${dollars(venue.cover)} at the door, sample)` : ''}.`} No drinks are included or sold.</span></li>
        </ul>
      </div>
      <div class="field-group">
        <p class="label">Price (all-in, illustrative)</p>
        <table class="price-table"><tbody>
          <tr><td>Priority entry × ${party}</td><td class="num">${money(price.base)}</td></tr>
          <tr><td>Service fee × ${party}</td><td class="num">${money(price.fees)}</td></tr>
          <tr class="total"><td>Total (demo, not charged)</td><td class="num">${money(price.total)}</td></tr>
        </tbody></table>
        <p class="hint">Any tax treatment is unresolved and not shown. In a real product the full price would appear before checkout.</p>
      </div>
      <div class="field-group">
        <label class="check"><input type="checkbox" data-input="pass-ack" ${flow.ack ? 'checked' : ''} ${pending ? 'disabled' : ''} ${flow.errors?.ack ? 'aria-describedby="err-ack" ' : ''}aria-invalid="${flow.errors?.ack ? 'true' : 'false'}"><span>I understand this is a demo pass: no charge, not valid for entry, and priority never guarantees admission.</span></label>
        ${flow.errors?.ack ? `<p class="field-error" id="err-ack">${icon('alert')}${esc(flow.errors.ack)}</p>` : ''}
      </div>
    </form>`;

  const foot = pending
    ? `<div class="total-line"><span>No payment is taken</span><span class="spinner" aria-hidden="true"></span></div><button type="button" class="btn btn-primary btn-lg btn-block" aria-disabled="true"><span role="status">Creating demo pass…</span></button>`
    : anyOpen
      ? `<div class="total-line"><span>Demo total for ${party}</span><strong>${money(price.total)}</strong></div><button type="submit" form="pass-form" class="btn btn-primary btn-lg btn-block" data-action="submit-pass">Create demo pass (${money(price.total)}, no charge)</button>`
      : '<button type="button" class="btn btn-lg btn-block" data-action="close-sheet">Back to venue</button>';
  return { title: `Priority pass (demo): ${venue.name}`, body, foot };
}

function failed(flow, venue) {
  const offline = flow.errorKind === 'offline';
  return {
    title: `Priority pass (demo): ${venue.name}`,
    body: `<div class="result result-err">
      <div class="result-icon">${icon(offline ? 'wifiOff' : 'alert')}</div>
      <h2 tabindex="-1" data-autofocus>${offline ? 'You’re offline (simulated)' : 'Couldn’t confirm the demo pass'}</h2>
      <p>${offline ? 'Nothing was sent. No demo pass was created and nothing was charged. Reconnect, then try again.' : 'The simulated request failed before confirming. No demo pass was created and nothing was charged. Your choices are kept.'}</p>
      <p class="hint">Reference for this attempt: <span class="num">${esc(refCode(flow.opId))}</span>. Trying again reuses it, so you can’t create two passes by accident.</p>
    </div>`,
    foot: `${offline ? '<button type="button" class="btn btn-primary btn-lg btn-block" data-action="go-online-retry">Reconnect and try again</button>' : '<button type="button" class="btn btn-primary btn-lg btn-block" data-action="retry-pass">Try again</button>'}<button type="button" class="btn btn-quiet btn-block" data-action="back-to-review" style="margin-top:6px">Back to review</button>`,
  };
}

function done(ctx, flow, venue) {
  const pass = ctx.state.passes.find((p) => p.id === flow.passId);
  return {
    title: `Priority pass (demo): ${venue.name}`,
    body: `<div class="result result-ok">
      <div class="result-icon">${icon('check')}</div>
      <h2 tabindex="-1" data-autofocus>${esc(DEMO_OUTCOME)}</h2>
      <p>Saved on this device under Passes. In a real product you’d arrive during your window and door staff would still check ID and capacity. This demo pass can’t be used for entry.</p>
      ${pass ? passCard(pass, ctx.now) : ''}
    </div>`,
    foot: `<a class="btn btn-primary btn-lg btn-block" href="#/passes/${encodeURIComponent(flow.passId)}" data-action="view-pass">View in Passes</a><button type="button" class="btn btn-quiet btn-block" data-action="close-sheet" style="margin-top:6px">Done</button>`,
  };
}
