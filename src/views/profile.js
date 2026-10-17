// Profile & settings. The person shown is the demo user; nothing leaves this device.
import { esc } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { initials, balanceOf } from '../data/social.js';

const row = (href, iconName, label, sub) => `<a class="list-link" href="${href}">${icon(iconName, { size: 20 })}<span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>${icon('chevronRight', { size: 18 })}</a>`;

export function renderProfile(ctx, { editing = false, errors = {} } = {}) {
  const p = ctx.state.profile;
  const reports = ctx.state.reports.length;
  const groups = ctx.state.groups.joined.length + ctx.state.groups.created.length;
  return `<div class="page">
    <h1 class="sr-only" id="page-h" tabindex="-1">Profile</h1>
    <section class="profile-head">
      <span class="avatar avatar-lg" style="--hue:220;--size:72px" aria-hidden="true">${esc(initials(p.name))}</span>
      <div class="profile-id">
        <p class="profile-name">${esc(p.name)}</p>
        ${p.handle ? `<button type="button" class="handle" data-action="ig-link" data-handle="${esc(p.handle)}" aria-label="Instagram @${esc(p.handle)}">${icon('at', { size: 14 })}${esc(p.handle)}</button>` : '<p class="hint" style="margin:0">No Instagram added</p>'}
      </div>
      <button type="button" class="btn btn-sm" data-action="edit-profile" aria-expanded="${editing}">${editing ? 'Cancel' : 'Edit'}</button>
    </section>
    ${editing ? `<form id="profile-form" class="form-stack panel" novalidate>
      <div class="field"><label class="label" for="p-name">Name</label><input id="p-name" name="displayname" class="text-input" maxlength="30" value="${esc(p.name)}" ${errors.name ? 'aria-invalid="true" aria-describedby="err-p-name"' : ''}>
        ${errors.name ? `<p class="field-error" id="err-p-name">${icon('alert')}${esc(errors.name)}</p>` : ''}</div>
      <div class="field"><label class="label" for="p-ig">Instagram handle (optional)</label><div class="input-prefix"><span aria-hidden="true">@</span><input id="p-ig" name="instagram" class="text-input" maxlength="30" autocomplete="off" autocapitalize="none" spellcheck="false" value="${esc(p.handle)}" ${errors.handle ? 'aria-invalid="true" aria-describedby="err-p-ig"' : ''}></div>
        ${errors.handle ? `<p class="field-error" id="err-p-ig">${icon('alert')}${esc(errors.handle)}</p>` : ''}</div>
      <button type="submit" class="btn btn-primary btn-block">Save profile</button>
    </form>` : ''}
    <dl class="stat-row">
      <div><dt>Points</dt><dd class="num">${new Intl.NumberFormat('en-US').format(balanceOf(ctx.state.points))}</dd></div>
      <div><dt>Reports</dt><dd class="num">${reports}</dd></div>
      <div><dt>Groups</dt><dd class="num">${groups}</dd></div>
    </dl>

    <h2 class="section-title">Your stuff</h2>
    <nav class="list-group" aria-label="Your stuff">
      ${row('#/saved', 'bookmark', 'Saved bars', `${ctx.state.saved.length} saved`)}
      ${row('#/passes', 'ticket', 'Priority passes', `${ctx.state.passes.length} demo passes`)}
      ${row('#/points', 'star', 'Points & rewards')}
    </nav>

    <h2 class="section-title">Settings</h2>
    <div class="list-group">
      <div class="switch-row list-switch"><label for="pref-notify"><span class="label" style="margin:0">Wait-drop alerts</span><span class="hint">Tell me when a saved bar’s line gets short (demo: no notifications are sent).</span></label>
        <span class="switch"><input id="pref-notify" type="checkbox" role="switch" data-input="pref" data-key="notifyDrops" ${ctx.state.prefs.notifyDrops ? 'checked' : ''}><span></span></span></div>
    </div>

    <h2 class="section-title">More</h2>
    <nav class="list-group" aria-label="More">
      ${row('#/console', 'door', 'Venue console', 'What bar staff would update (demo)')}
      ${row('#/about', 'info', 'About this demo', 'How estimates work, demo controls, sources')}
    </nav>
  </div>`;
}
