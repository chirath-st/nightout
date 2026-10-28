// Points: balance and progress to the next reward, door check-ins, how to earn, rewards and history.
// SIMULATED: demo points have no cash value, no bar honors these rewards, and check-ins are a simulated
// QR scan (no camera). No reward can be redeemed for alcohol (NJ rule, see DRINKS_LOCK).
import { esc, venueLogo } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { formatTime } from '../lib/clock.js';
import { REWARDS, DRINKS_LOCK, POINTS, balanceOf, nextReward, initials, checkedInTonight, youSeed } from '../data/social.js';
import { personAvatar } from '../ui/avatars.js';
import { isOpenAt } from '../lib/explore.js';

const fmt = (n) => new Intl.NumberFormat('en-US').format(n);

export function renderPoints(ctx) {
  const st = ctx.state;
  const balance = balanceOf(st.points);
  const next = nextReward(balance);
  const vouchers = [...st.vouchers].sort((a, b) => b.at - a.at);
  const history = [...st.points].reverse().slice(0, 15);
  const passes = st.passes.length;
  const uniqueBars = new Set(st.checkins.map((c) => c.venueId)).size;
  const dailyDone = st.lastDaily === st.clock.base;
  return `<div class="page">
    <div class="points-head">
      ${personAvatar({ seed: youSeed(st.profile.name), initials: initials(st.profile.name) }, 44)}
      <div><h1 class="page-title" id="page-h" tabindex="-1">My points</h1><p class="points-who">${esc(st.profile.name)}</p></div>
    </div>
    <section class="points-card" aria-label="Your points">
      <p class="eyebrow">Your balance</p>
      <p class="points-total num"><span class="roll" data-points-total>${fmt(balance)}</span><small>pts</small></p>
      ${next ? `<div class="points-next"><span class="pn-track" aria-hidden="true" data-reward="${esc(next.reward.id)}"><i style="--pn:${next.progress.toFixed(3)}"></i></span>
        <p><b class="num">${fmt(next.need)}</b> points to your next reward: ${esc(next.reward.title)}</p></div>` : '<p class="points-note">You can afford every reward.</p>'}
      <p class="points-note">No cash value.</p>
    </section>

    <button type="button" class="btn btn-primary btn-lg btn-block checkin-btn" data-action="open-checkin">${icon('pinFill', { size: 20 })}Check in at a bar<span class="trail">+${POINTS.CHECKIN}</span></button>
    

    <dl class="fact-strip points-stats">
      <div><dt>Check-ins</dt><dd>${st.checkins.length}<span class="fact-sub">All time</span></dd></div>
      <div><dt>Unique bars</dt><dd>${uniqueBars}<span class="fact-sub">of ${ctx.venues.length}</span></dd></div>
      <div><dt>Reports</dt><dd>${st.reports.length}<span class="fact-sub">Crowd updates</span></dd></div>
    </dl>

    <div class="section-head"><h2>Earn points</h2></div>
    <ul class="earn-list">
      <li>${icon('calendar', { size: 20 })}<span>Daily login<small>${dailyDone ? 'Collected tonight' : 'Open Night Out on a night out'}</small></span><b class="num">+${POINTS.DAILY}</b></li>
      <li>${icon('pinFill', { size: 20 })}<span>Bar check-in<small>Once per bar a night</small></span><b class="num">+${POINTS.CHECKIN}</b></li>
      <li>${icon('camera', { size: 20 })}<span>Line report<small>Its size, with a photo if you like</small></span><b class="num">+${POINTS.REPORT}</b></li>
      <li>${icon('check', { size: 20 })}<span>Tell us when you got in<small>Gives everyone a measured wait</small></span><b class="num">+${POINTS.GOT_IN}</b></li>
    </ul>
    <a class="btn btn-block" href="#/scan" style="margin-top:12px">${icon('camera', { size: 18 })}Report a line</a>

    <div class="section-head"><h2>Rewards</h2></div>
    <ul class="reward-grid">
      ${REWARDS.map((r) => {
        const short = r.cost - balance;
        return `<li class="reward${short > 0 ? ' is-short' : ''}">
          <span class="reward-icon">${icon(r.icon, { size: 20 })}</span>
          <span><p class="reward-title">${esc(r.title)}</p><p class="reward-detail">${esc(r.detail)}</p></span>
          <span class="reward-side"><span class="reward-cost num">${fmt(r.cost)}<small>pts</small></span>
            <button type="button" class="btn btn-sm ${short <= 0 ? 'btn-primary' : ''}" data-action="redeem" data-id="${r.id}" ${short > 0 ? 'aria-disabled="true"' : ''} aria-label="${short > 0 ? `${esc(r.title)}: need ${fmt(short)} more points` : `Redeem ${esc(r.title)} for ${fmt(r.cost)} points`}">${short > 0 ? `Need ${fmt(short)}` : 'Redeem'}</button></span>
        </li>`;
      }).join('')}
      <li class="reward is-locked">
        <span class="reward-icon">${icon('lock', { size: 20 })}</span>
        <span><p class="reward-title">No alcohol rewards</p><p class="reward-detail">${esc(DRINKS_LOCK)}</p></span>
        <span class="reward-side"><span class="reward-cost">Not available</span></span>
      </li>
    </ul>
    <p class="hint">Line cut and VIP entry still need a valid ID and depend on capacity.</p>

    <div class="section-head"><h2>Your rewards</h2></div>
    ${vouchers.length ? `<ul class="plain-list">${vouchers.map((v) => {
      const r = REWARDS.find((x) => x.id === v.rewardId);
      // Marked used by a venue in Business view (on this device).
      const used = (st.redemptions ?? []).find((x) => x.ref === v.ref);
      const at = used ? ctx.venues.find((x) => x.id === used.venueId)?.name ?? 'a venue' : null;
      return `<li data-key="${esc(v.id)}"><span><b>${esc(r?.title ?? 'Reward')}</b><small>Code ${esc(v.ref)} · ${used ? `used at ${esc(at)}, ${esc(formatTime(used.at))}` : 'not valid toward alcohol'}</small></span><span class="num muted">${esc(formatTime(v.at))}</span></li>`;
    }).join('')}</ul>` : '<p class="hint">Nothing redeemed yet.</p>'}
    ${passes ? `<a class="list-link" href="#/passes">${icon('ticket', { size: 20 })}<span>Priority passes (${passes})</span>${icon('chevronRight', { size: 18 })}</a>` : ''}

    <div class="section-head"><h2 id="history-h">Point history</h2></div>
    <ul class="plain-list history-list">${history.map((e) => `<li data-key="${esc(e.id)}"><span>${esc(e.label)}${e.at != null ? `<small>${esc(formatTime(e.at))}</small>` : ''}</span><span class="num ${e.delta >= 0 ? 'plus' : 'muted'}">${e.delta >= 0 ? '+' : '−'}${fmt(Math.abs(e.delta))}</span></li>`).join('')}</ul>
  </div>`;
}

/** Check-in sheet: pick the bar, confirm, done. One check-in per bar per demo night. No QR is read and no bar shows one:
 *  the sheet doesn't pretend to scan (it used to draw a viewfinder and "Scan QR code"). */
export function checkinSheet(ctx, flow) {
  const head = (title) => `<div class="sheet-head"><span class="sheet-grabber" aria-hidden="true"></span><h2 class="sheet-title" id="picker-title">${title}</h2>
      <button type="button" class="icon-btn sheet-close" data-action="close-picker" aria-label="Close">${icon('x')}</button></div>`;
  const venue = ctx.venues.find((v) => v.id === flow.venueId);
  if (flow.step === 'done' && venue) {
    return `${head('Checked in')}<div class="sheet-body checkin-done">
      <p class="checkin-pts num" data-autofocus tabindex="-1">+${POINTS.CHECKIN}<small>pts</small></p>
      <p>You checked in at <b>${esc(venue.name)}</b>.</p>
      <button type="button" class="btn btn-primary btn-lg btn-block" data-action="close-picker">Done</button></div>`;
  }
  if (flow.step === 'scan' && venue) {
    return `${head(`Check in at ${esc(venue.name)}`)}<div class="sheet-body">
      <p class="hint">Check in once you’re inside. One check-in per bar a night.</p>
      <button type="button" class="btn btn-primary btn-lg btn-block" data-action="checkin-scan" data-autofocus>Check in<span class="trail">+${POINTS.CHECKIN}</span></button>
      <button type="button" class="btn btn-ghost btn-block" data-action="checkin-back" style="margin-top:8px">Pick another bar</button></div>`;
  }
  const night = ctx.state.clock.base;
  const rows = [...ctx.venues].sort((a, b) => a.name.localeCompare(b.name)).map((v) => {
    const done = checkedInTonight(ctx.state.checkins, v.id, night);
    const closed = isOpenAt(v, ctx.now) === false;
    const why = done ? 'Checked in tonight' : closed ? 'Closed now' : v.area ?? '';
    return `<li><button type="button" class="pick-row" data-action="checkin-pick" data-id="${esc(v.id)}" ${done || closed ? 'aria-disabled="true"' : ''}><span class="bar-logo" aria-hidden="true">${venueLogo(v)}</span><span class="pick-name">${esc(v.name)}</span><span class="pick-area">${esc(why)}</span>${done ? icon('check', { size: 18 }) : icon('chevronRight', { size: 18 })}</button></li>`;
  }).join('');
  return `${head('Check in at a bar')}<div class="sheet-body"><ul class="pick-list">${rows}</ul></div>`;
}
