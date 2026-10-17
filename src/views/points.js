// Points: balance, ways to earn, rewards and history. SIMULATED: demo points have no cash value and no
// bar honors these rewards. No reward can be redeemed for alcohol (NJ rule, see DRINKS_LOCK).
import { esc } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { formatTime } from '../lib/clock.js';
import { REWARDS, DRINKS_LOCK, POINTS, balanceOf } from '../data/social.js';

const fmt = (n) => new Intl.NumberFormat('en-US').format(n);

export function renderPoints(ctx) {
  const balance = balanceOf(ctx.state.points);
  const vouchers = [...ctx.state.vouchers].sort((a, b) => b.at - a.at);
  const history = [...ctx.state.points].reverse().slice(0, 12);
  const passes = ctx.state.passes.length;
  return `<div class="page">
    <h1 class="page-title" id="page-h" tabindex="-1">Points</h1>
    <section class="points-card" aria-label="Your points">
      <p class="eyebrow">Your balance</p>
      <p class="points-total"><span class="num">${fmt(balance)}</span><small>pts</small></p>
      <p class="points-note">Demo points. No cash value; nothing here is real yet.</p>
    </section>

    <h2 class="section-title">Earn</h2>
    <ul class="earn-list">
      <li>${icon('camera', { size: 20 })}<span>Report a bar’s line</span><b class="num">+${POINTS.REPORT}</b></li>
      <li>${icon('check', { size: 20 })}<span>Tell us when you got in</span><b class="num">+${POINTS.GOT_IN}</b></li>
    </ul>
    <a class="btn btn-block" href="#/scan">${icon('camera', { size: 18 })}Report a line</a>

    <h2 class="section-title">Rewards</h2>
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
    <p class="hint">Rewards are simulated: no bar has agreed to honor them, and none can be used toward alcoholic beverages. Line cuts and VIP entry would always depend on the venue, ID checks and capacity.</p>

    <h2 class="section-title">Your rewards</h2>
    ${vouchers.length ? `<ul class="plain-list">${vouchers.map((v) => {
      const r = REWARDS.find((x) => x.id === v.rewardId);
      return `<li><span><b>${esc(r?.title ?? 'Reward')}</b><small>Code ${esc(v.ref)} · demo, not valid · not valid toward alcoholic beverages</small></span><span class="num muted">${esc(formatTime(v.at))}</span></li>`;
    }).join('')}</ul>` : '<p class="hint">Nothing redeemed yet.</p>'}
    ${passes ? `<a class="list-link" href="#/passes">${icon('ticket', { size: 20 })}<span>Priority passes (${passes})</span>${icon('chevronRight', { size: 18 })}</a>` : ''}

    <h2 class="section-title">History</h2>
    <ul class="plain-list">${history.map((e) => `<li><span>${esc(e.label)}${e.at != null ? `<small>${esc(formatTime(e.at))}</small>` : ''}</span><span class="num ${e.delta >= 0 ? 'plus' : 'muted'}">${e.delta >= 0 ? '+' : '−'}${fmt(Math.abs(e.delta))}</span></li>`).join('')}</ul>
  </div>`;
}
