// My account (team ideas): profile, VIP cards, subscription, notifications, help. Everything is the
// demo user's and stays on this device. SIMULATED: no billing, no wallet pass, no photo is read.
import { esc, wordmark } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { initials, balanceOf, youSeed, PLANS, PLUS_PERKS, SAMPLE_BAR_CARDS } from '../data/social.js';
import { personAvatar } from '../ui/avatars.js';

const row = (href, iconName, label, sub) => `<a class="list-link" href="${href}">${icon(iconName, { size: 20 })}<span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>${icon('chevronRight', { size: 18 })}</a>`;
const btnRow = (action, iconName, label, sub) => `<button type="button" class="list-link" data-action="${action}">${icon(iconName, { size: 20 })}<span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>${icon('chevronRight', { size: 18 })}</button>`;
const DAY = 86_400_000;
/** Next demo renewal: the plan started 12 demo days ago unless it was changed in Manage subscription. */
export function renewalAt(sub, now) {
  const period = (sub.billing === 'annual' ? 365 : 30) * DAY;
  const start = sub.since ?? now - 12 * DAY;
  return start + period * Math.max(1, Math.ceil((now - start) / period));
}
const dateFmt = (ms) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(ms);
const barcode = (seed) => {
  let h = 2166136261; for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return Array.from({ length: 42 }, (_, i) => { h = Math.imul(h ^ (h >>> 13), 2246822507) >>> 0; return `<i style="--w:${1 + (h % 3)}px"></i>`; }).join('');
};

// Bar cards take a tint from the bar's brand color (team ask: "a little bit of a red tint" for Scarlet Pub).
const BRAND_TINT = { 'scarlet-pub': '#B3122E', 'olde-queens': '#E8590C', 'pitch-social': '#D7263D' };

export function vipCard(card, ctx, { main = false } = {}) {
  const venue = card.venueId ? ctx.venues.find((v) => v.id === card.venueId) : null;
  const tint = !main && card.venueId ? BRAND_TINT[card.venueId] : null;
  return `<article class="vip-card${main ? ' is-main' : ''}${tint ? ' is-tinted' : ''}"${tint ? ` style="--tint:${tint}"` : ''} aria-label="${esc(card.title)}">
    <div class="vip-top"><span class="vip-brand">${main ? `${wordmark()}<span class="sr-only">Night Out</span>` : esc(venue?.name ?? 'Bar card')}</span></div>
    <p class="vip-title">${esc(main ? 'VIP pass' : card.title)}</p>
    <div class="vip-foot"><span><b>${esc(ctx.state.profile.name)}</b><small>${main ? 'Member card' : `Added ${esc(dateFmt(card.addedAt))}`}</small></span><span class="vip-code" aria-hidden="true">${barcode(card.id)}</span></div>
  </article>`;
}

export function renderProfile(ctx, { editing = false, errors = {} } = {}) {
  const st = ctx.state;
  const p = st.profile;
  const sub = st.subscription;
  const plan = PLANS.find((x) => x.id === sub.billing) ?? PLANS[0];
  const cards = st.vipCards;
  return `<div class="page">
    <div class="title-row account-title"><h1 class="page-title" id="page-h" tabindex="-1">My account</h1>
      <button type="button" class="icon-btn settings-btn" data-action="open-settings" aria-label="Settings">${icon('sliders', { size: 22 })}</button></div>
    <section class="profile-head" aria-label="Profile">
      ${personAvatar({ seed: youSeed(p.name), initials: initials(p.name) }, 72)}
      <div class="profile-id">
        <p class="profile-name">${esc(p.name)}</p>
        ${p.handle ? `<button type="button" class="handle" data-action="ig-link" data-handle="${esc(p.handle)}" aria-label="Instagram @${esc(p.handle)}">${icon('at', { size: 14 })}${esc(p.handle)}</button>` : '<p class="hint" style="margin:0">No Instagram added</p>'}
        <button type="button" class="btn btn-sm" data-action="edit-profile" aria-expanded="${editing}">${editing ? 'Cancel' : `${icon('plus', { size: 14 })}Edit profile`}</button>
      </div>
    </section>
    
    ${editing ? `<form id="profile-form" class="form-stack panel" novalidate>
      <div class="field"><label class="label" for="p-name">Name</label><input id="p-name" name="displayname" class="text-input" maxlength="30" value="${esc(p.name)}" ${errors.name ? 'aria-invalid="true" aria-describedby="err-p-name"' : ''}>
        ${errors.name ? `<p class="field-error" id="err-p-name">${icon('alert')}${esc(errors.name)}</p>` : ''}</div>
      <div class="field"><label class="label" for="p-ig">Instagram handle (optional)</label><div class="input-prefix"><span aria-hidden="true">@</span><input id="p-ig" name="instagram" class="text-input" maxlength="30" autocomplete="off" autocapitalize="none" spellcheck="false" value="${esc(p.handle)}" ${errors.handle ? 'aria-invalid="true" aria-describedby="err-p-ig"' : ''}></div>
        ${errors.handle ? `<p class="field-error" id="err-p-ig">${icon('alert')}${esc(errors.handle)}</p>` : ''}</div>
      <button type="submit" class="btn btn-primary btn-block">Save profile</button>
    </form>` : ''}
    <dl class="fact-strip">
      <div><dt>Points</dt><dd>${new Intl.NumberFormat('en-US').format(balanceOf(st.points))}<span class="fact-sub">Balance</span></dd></div>
      <div><dt>Check-ins</dt><dd>${st.checkins.length}<span class="fact-sub">Bars visited</span></dd></div>
      <div><dt>Groups</dt><dd>${st.groups.joined.length + st.groups.created.length}<span class="fact-sub">Joined or posted</span></dd></div>
    </dl>

    <div class="section-head"><h2>My VIP cards</h2><span class="eyebrow">${cards.length + 1} card${cards.length ? 's' : ''}</span></div>
    ${vipCard({ id: 'nightout-vip', title: 'Night Out VIP pass' }, ctx, { main: true })}
    <div class="vip-actions">
      <button type="button" class="btn" data-action="vip-wallet">${icon('ticket', { size: 18 })}Add to Wallet</button>
      <button type="button" class="btn" data-action="vip-add"${cards.length >= SAMPLE_BAR_CARDS.length ? ' aria-disabled="true"' : ''}>${icon('plus', { size: 18 })}Add a bar’s card</button>
    </div>
    
    ${cards.length ? `<ul class="vip-list">${cards.map((c) => `<li>${vipCard(c, ctx)}<button type="button" class="btn btn-sm btn-ghost" data-action="vip-remove" data-id="${esc(c.id)}" aria-label="Remove ${esc(c.title)}">Remove</button></li>`).join('')}</ul>` : ''}

    <div class="section-head"><h2>My subscription</h2></div>
    <section class="sub-card" aria-label="Night Out Plus subscription">
      <div class="sub-top"><span class="sub-name">${icon('star', { size: 18 })}Night Out Plus</span><span class="sub-state" data-on="${sub.plan === 'plus'}">${sub.plan === 'plus' ? 'Active' : 'Off'}</span></div>
      ${sub.plan === 'plus' ? `<dl class="sub-facts">
        <div><dt>Next renewal</dt><dd>${esc(dateFmt(renewalAt(sub, ctx.now)))}</dd></div>
        <div><dt>Billing</dt><dd>${esc(plan.label)} · ${esc(plan.price)}</dd></div>
      </dl>` : '<p class="hint" style="margin:0">Not subscribed.</p>'}
      <ul class="sub-perks">${PLUS_PERKS.map((x) => `<li>${icon('check', { size: 16 })}${esc(x)}</li>`).join('')}</ul>
      <button type="button" class="btn btn-block" data-action="manage-sub">Manage subscription</button>
      
    </section>

    <div class="section-head"><h2>Your stuff</h2></div>
    <nav class="list-group" aria-label="Your stuff">
      ${row('#/saved', 'heart', 'Saved bars', `${st.saved.length} saved`)}
      ${row('#/passes', 'ticket', 'Priority passes', `${st.passes.length} pass${st.passes.length === 1 ? '' : 'es'}`)}
      ${row('#/points', 'star', 'Points & rewards')}
    </nav>
    <div class="section-head"><h2>More</h2></div>
    <nav class="list-group" aria-label="More">
      ${btnRow('open-settings', 'bell', 'Notifications', [st.prefs.notifyDrops && 'Wait drops', st.prefs.notifyDeals && 'Deals', st.prefs.notifyGroups && 'Groups'].filter(Boolean).join(', ') || 'All off')}
      ${btnRow('open-help', 'help', 'Help & support')}
      ${row('#/console', 'door', 'Door console', 'Count the line from a photo')}
      ${row('#/about', 'info', 'About Night Out', 'How estimates work, sources')}
    </nav>
  </div>`;
}

const sheetHead = (title) => `<div class="sheet-head"><span class="sheet-grabber" aria-hidden="true"></span><h2 class="sheet-title" id="picker-title">${title}</h2>
  <button type="button" class="icon-btn sheet-close" data-action="close-picker" aria-label="Close">${icon('x')}</button></div>`;
const toggle = (key, label, sub, on) => `<div class="switch-row list-switch"><label for="pref-${key}"><span class="label" style="margin:0">${label} <span class="sr-only">(${on ? 'on' : 'off'})</span></span><span class="hint">${sub}</span></label>
  <span class="switch"><input id="pref-${key}" type="checkbox" role="switch" data-input="pref" data-key="${key}" ${on ? 'checked' : ''}><span></span></span></div>`;

export function settingsSheet(ctx) {
  const p = ctx.state.prefs;
  return `${sheetHead('Settings')}<div class="sheet-body">
    <p class="eyebrow" style="margin-top:4px">Notifications</p>
    <div class="list-group">
      ${toggle('notifyDrops', 'Wait-drop alerts', 'When a saved bar’s line gets short', p.notifyDrops)}
      ${toggle('notifyDeals', 'Deal alerts', 'When a bar you saved posts a deal', p.notifyDeals)}
      ${toggle('notifyGroups', 'Group updates', 'When someone joins your group', p.notifyGroups)}
    </div>
    <p class="eyebrow" style="margin-top:20px">Privacy</p>
    <div class="list-group">
      <div class="list-link static">${icon('pin', { size: 20 })}<span>Location<small>Off</small></span></div>
      
    </div>
    <button type="button" class="btn btn-block" data-action="close-picker" style="margin-top:18px">Done</button>
  </div>`;
}

export function manageSubSheet(ctx) {
  const sub = ctx.state.subscription;
  return `${sheetHead('Manage subscription')}<div class="sheet-body">
    <fieldset><legend class="sr-only">Plan</legend><div class="option-list">
      ${PLANS.map((x) => `<label class="option-row"><input type="radio" name="sub-plan" value="${x.id}" data-input="sub-plan" ${sub.plan === 'plus' && sub.billing === x.id ? 'checked' : ''}><span class="rd" aria-hidden="true">${icon('check')}</span><span>Plus · ${esc(x.label)}<small class="opt-sub">${esc(x.price)}</small></span></label>`).join('')}
      <label class="option-row"><input type="radio" name="sub-plan" value="none" data-input="sub-plan" ${sub.plan !== 'plus' ? 'checked' : ''}><span class="rd" aria-hidden="true">${icon('check')}</span><span>No subscription<small class="opt-sub">Night Out stays free</small></span></label>
    </div></fieldset>
    
  </div>`;
}

export function helpSheet() {
  const qa = [
    ['How are waits estimated?', 'From door-staff updates and crowd reports: about how many people are in line, divided by how fast the door lets people in.'],
    ['Do I still need ID?', 'Yes. Every bar checks a physical ID at the door. Night Out never asks for your ID.'],
    ['How do points work?', 'Earn them for check-ins and crowd updates, then redeem for non-alcohol rewards. Points have no cash value.'],
  ];
  return `${sheetHead('Help & support')}<div class="sheet-body">
    ${qa.map(([q, a]) => `<details class="how"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}
    
    <button type="button" class="btn btn-block" data-action="help-about" style="margin-top:12px">About Night Out</button>
  </div>`;
}
