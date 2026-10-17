// Groups: people post plans to head out together; others join. Everything is simulated and stays on
// this device. Hosts are fictional; Instagram handles are shown but never linked out in the demo.
import { esc, stateBox } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { formatTime } from '../lib/clock.js';
import { initials, validHandle } from '../data/social.js';

const avatar = (person, size = 40) => `<span class="avatar" style="--hue:${person.hue ?? 210};--size:${size}px" aria-hidden="true">${esc(initials(person.name))}</span>`;

export function allGroups(ctx) {
  return [...ctx.state.groups.created, ...ctx.groups].sort((a, b) => a.startsAt - b.startsAt);
}

function groupCard(g, ctx) {
  const venue = ctx.venues.find((v) => v.id === g.venueId);
  const joined = ctx.state.groups.joined.includes(g.id) || g.mine;
  const going = g.going + (ctx.state.groups.joined.includes(g.id) ? 1 : 0);
  const full = going >= g.spots && !joined;
  const ended = ctx.now >= g.startsAt + 3 * 60 * 60000;
  const dots = Array.from({ length: g.spots }, (_, i) => `<span class="${i < going ? 'is-on' : ''}"></span>`).join('');
  const handle = g.host.handle
    ? `<button type="button" class="handle" data-action="ig-link" data-handle="${esc(g.host.handle)}" aria-label="Instagram @${esc(g.host.handle)}">${icon('at', { size: 14 })}${esc(g.host.handle)}</button>`
    : '';
  return `<li class="group-card">
    <div class="group-host">${avatar(g.host)}<div class="group-host-text"><span class="group-host-name">${esc(g.host.name)}${g.mine ? ' <span class="mini-tag">You</span>' : ''}</span>${handle}</div></div>
    <h2 class="group-title-text">${esc(g.title)}</h2>
    <p class="group-where">${icon('pin', { size: 14 })}<span>${esc(venue?.name ?? 'Bar not in this dataset')}</span><span class="sep" aria-hidden="true">•</span><span class="num">${esc(formatTime(g.startsAt))}</span></p>
    ${g.note ? `<p class="group-note">${esc(g.note)}</p>` : ''}
    <div class="group-foot">
      <div class="group-spots"><span class="spot-dots" aria-hidden="true">${dots}</span><span class="num">${going} of ${g.spots} going</span></div>
      ${g.mine ? '<span class="mini-tag">Your group</span>'
        : ended ? '<span class="mini-tag">Ended</span>'
        : `<button type="button" class="btn ${joined ? '' : 'btn-primary'} btn-sm" data-action="join-group" data-id="${esc(g.id)}" aria-pressed="${joined}" ${full ? 'aria-disabled="true"' : ''}>${joined ? `${icon('check', { size: 16 })}Joined` : full ? 'Full' : 'Join'}</button>`}
    </div>
  </li>`;
}

export function renderGroups(ctx) {
  const groups = allGroups(ctx);
  return `<div class="page">
    <div class="title-row">
      <h1 class="page-title" id="page-h" tabindex="-1">Groups</h1>
      <a class="btn btn-primary btn-sm" href="#/groups/new">${icon('plus', { size: 16 })}Post a group</a>
    </div>
    <p class="page-sub">Find people heading out tonight, or start your own plan.</p>
    <div class="safety-note">${icon('shield', { size: 18 })}<p>Meet in public at the bar. Everyone must be 21+ with physical ID. Night Out never shares your location. Demo: groups and people are made up.</p></div>
    ${groups.length ? `<ul class="group-list">${groups.map((g) => groupCard(g, ctx)).join('')}</ul>`
      : stateBox({ iconName: 'users', title: 'No groups yet', body: 'Be the first to post a plan for tonight.', actions: '<a class="btn btn-primary" href="#/groups/new">Post a group</a>' })}
  </div>`;
}

const TIMES = [[21, 0], [21, 30], [22, 0], [22, 30], [23, 0], [23, 30], [0, 0], [0, 30], [1, 0]];

export function renderGroupNew(ctx, draft, errors = {}) {
  const d = draft;
  const venues = [...ctx.venues].sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="page">
    <div class="back-row"><a class="back-link" href="#/groups" data-action="back">${icon('chevronLeft')}Groups</a></div>
    <h1 class="page-title" id="page-h" tabindex="-1">Post a group</h1>
    <p class="page-sub">Posted as ${esc(ctx.state.profile.name)}. Demo: it stays on this device and no one else sees it.</p>
    <form id="group-form" class="form-stack" novalidate>
      <div class="field">
        <label class="label" for="g-title">What’s the plan?</label>
        <input id="g-title" name="title" class="text-input" maxlength="60" required value="${esc(d.title)}" placeholder="Pregame then Scarlet Pub…" data-input="group-field" data-key="title" ${errors.title ? 'aria-invalid="true" aria-describedby="err-g-title"' : ''}>
        ${errors.title ? `<p class="field-error" id="err-g-title">${icon('alert')}${esc(errors.title)}</p>` : ''}
      </div>
      <div class="field-pair">
        <div class="field">
          <label class="label" for="g-venue">Bar</label>
          <div class="select"><select id="g-venue" name="venue" data-input="group-field" data-key="venueId">${venues.map((v) => `<option value="${esc(v.id)}" ${v.id === d.venueId ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>${icon('chevronDown', { size: 14 })}</div>
        </div>
        <div class="field">
          <label class="label" for="g-time">Meet at</label>
          <div class="select"><select id="g-time" name="time" data-input="group-field" data-key="time">${TIMES.map(([h, m]) => { const v = `${h}:${String(m).padStart(2, '0')}`; const label = formatTime(new Date(2000, 0, 1, h, m).getTime()); return `<option value="${v}" ${v === d.time ? 'selected' : ''}>${label}</option>`; }).join('')}</select>${icon('chevronDown', { size: 14 })}</div>
        </div>
      </div>
      <div class="field stepper-row">
        <div><p class="label" id="g-spots-label">Group size</p><p class="hint">Including you</p></div>
        <div class="stepper" role="group" aria-labelledby="g-spots-label">
          <button type="button" class="icon-btn" data-action="group-spots" data-delta="-1" aria-label="Fewer spots" ${d.spots <= 2 ? 'disabled' : ''}>${icon('minus')}</button>
          <output>${d.spots}</output>
          <button type="button" class="icon-btn" data-action="group-spots" data-delta="1" aria-label="More spots" ${d.spots >= 12 ? 'disabled' : ''}>${icon('plus')}</button>
        </div>
      </div>
      <div class="field">
        <label class="label" for="g-note">Note (optional)</label>
        <textarea id="g-note" name="note" class="text-input text-area" maxlength="140" rows="3" placeholder="Who should join, where you’re meeting…" data-input="group-field" data-key="note">${esc(d.note)}</textarea>
      </div>
      <div class="field">
        <label class="label" for="g-ig">Instagram handle (optional)</label>
        <div class="input-prefix"><span aria-hidden="true">@</span><input id="g-ig" name="instagram" class="text-input" maxlength="30" autocomplete="off" autocapitalize="none" spellcheck="false" value="${esc(d.handle)}" data-input="group-field" data-key="handle" ${errors.handle ? 'aria-invalid="true" aria-describedby="err-g-ig"' : ''}></div>
        ${errors.handle ? `<p class="field-error" id="err-g-ig">${icon('alert')}${esc(errors.handle)}</p>` : '<p class="hint">Shown on your group so people can check you out first.</p>'}
      </div>
      <button type="submit" class="btn btn-primary btn-lg btn-block" data-action="post-group">Post group</button>
    </form>
  </div>`;
}

export function validateGroup(d) {
  const errors = {};
  if (!d.title.trim()) errors.title = 'Add a short plan, like “Pregame then Scarlet Pub”.';
  if (d.handle && !validHandle(d.handle.replace(/^@/, ''))) errors.handle = 'Use letters, numbers, periods or underscores (up to 30).';
  return errors;
}
