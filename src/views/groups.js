// Groups: people post plans to head out together; others join. Everything is simulated and stays on
// this device. Hosts are fictional; Instagram handles are shown but never linked out in the demo.
import { esc, stateBox, venueLogo, cardStatus, distanceText } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { formatTime } from '../lib/clock.js';
import { initials, validHandle, groupMembers, currentStop } from '../data/social.js';
import { personAvatar } from '../ui/avatars.js';

const MAX_FACES = 5;
const membersFor = (g, ctx) => groupMembers(g, { you: ctx.state.profile, joined: ctx.state.groups.joined.includes(g.id) });

export function allGroups(ctx) {
  return [...ctx.state.groups.created, ...ctx.groups].sort((a, b) => a.startsAt - b.startsAt);
}

function groupCard(g, ctx) {
  const venue = ctx.venues.find((v) => v.id === g.venueId);
  const joined = ctx.state.groups.joined.includes(g.id) || g.mine;
  const going = g.going + (ctx.state.groups.joined.includes(g.id) ? 1 : 0);
  const full = going >= g.spots && !joined;
  const ended = ctx.now >= g.startsAt + 3 * 60 * 60000;
  const members = membersFor(g, ctx);
  const faces = members.slice(0, MAX_FACES).map((m) => personAvatar(m, 30)).join('');
  const more = members.length > MAX_FACES ? `<span class="avatar avatar-more" style="--size:30px">+${members.length - MAX_FACES}</span>` : '';
  const open = Math.max(0, g.spots - going);
  const handle = g.host.handle
    ? `<button type="button" class="handle" data-action="member-profile" data-group="${esc(g.id)}" data-index="0" aria-haspopup="dialog" aria-label="@${esc(g.host.handle)}: see ${esc(g.host.name)}’s profile">${icon('at', { size: 14 })}${esc(g.host.handle)}</button>`
    : '';
  const [t, ap] = formatTime(g.startsAt).split(/\s+/);
  return `<li class="group-card">
    <div class="group-dest">${venue ? `<span class="bar-logo" aria-hidden="true">${venueLogo(venue)}</span>` : ''}<span><b>${esc(venue?.name ?? 'Bar not in this dataset')}</b><small>${esc([venue && distanceText(venue), 'Demo group'].filter(Boolean).join(' · '))}</small></span>${venue ? `<span class="group-wait" aria-hidden="true">${cardStatus(venue, ctx.now)}</span>` : ''}</div>
    <div class="group-host">${personAvatar(members[0], 36)}<div class="group-host-text"><span class="group-host-name">${esc(g.host.name)}${g.mine ? ' <span class="mini-tag">You</span>' : ''}</span>${handle}</div></div>
    <h2 class="group-title-text">${esc(g.title)}</h2>
    ${g.stops?.length > 1 ? hopTimeline(g, ctx) : `<p class="group-when"><small>Leaving</small><span class="num">${esc(t)}</span><small class="ap">${esc(ap ?? '')}</small></p>`}
    ${g.note ? `<p class="group-note">${esc(g.note)}</p>` : ''}
    <div class="group-foot">
      <button type="button" class="group-spots" data-action="group-members" data-id="${esc(g.id)}" aria-haspopup="dialog" aria-label="${going} of ${g.spots} going. See who’s going"><span class="avatars" aria-hidden="true">${faces}${more}</span><span class="gs-text"><span class="num">${going} of ${g.spots} going</span><small>${open ? `${open} spot${open === 1 ? '' : 's'} left` : 'Full'}</small></span></button>
      ${g.mine ? '<span class="mini-tag">Your group</span>'
        : ended ? '<span class="mini-tag">Ended</span>'
        : `<button type="button" class="btn ${joined ? '' : 'btn-primary'} btn-sm" data-action="join-group" data-id="${esc(g.id)}" aria-pressed="${joined}" ${full ? 'aria-disabled="true"' : ''}>${joined ? `${icon('check', { size: 16 })}Joined` : full ? 'Full' : 'Join'}</button>`}
    </div>
  </li>`;
}

/** Bar hop: each stop runs until the next one starts; the current stop is marked while the hop is on. */
function hopTimeline(g, ctx) {
  const cur = currentStop(g.stops, ctx.now);
  const ended = ctx.now >= g.stops[g.stops.length - 1].startsAt + 2 * 60 * 60000;
  return `<div class="hop"><p class="hop-label">${icon('nav', { size: 14 })}Bar hop · ${g.stops.length} stops</p>
    <ol class="hop-list">${g.stops.map((st, i) => {
      const v = ctx.venues.find((x) => x.id === st.venueId);
      const next = g.stops[i + 1];
      const now = cur === i && !ended;
      return `<li class="hop-stop${now ? ' is-now' : cur != null && i < cur ? ' is-past' : ''}">
        <span class="hop-dot" aria-hidden="true"></span>
        ${v ? `<span class="bar-logo" aria-hidden="true">${venueLogo(v)}</span>` : ''}
        <span class="hop-bar"><b>${esc(v?.name ?? 'Bar not in this dataset')}</b><small class="num">${esc(formatTime(st.startsAt))}${next ? `–${esc(formatTime(next.startsAt))}` : ' till late'}</small></span>
        ${now ? '<span class="mini-tag hop-now">Now</span>' : ''}
      </li>`;
    }).join('')}</ol></div>`;
}

const tagsOf = (m) => [m.role, m.year, ...(m.vibe ?? [])].filter(Boolean);
const sheetHead = (title, back) => `<div class="sheet-head"><span class="sheet-grabber" aria-hidden="true"></span>${back ? `<button type="button" class="icon-btn sheet-back" data-action="group-members" data-id="${esc(back)}" aria-label="Back to who’s going">${icon('chevronLeft')}</button>` : ''}<h2 class="sheet-title" id="picker-title">${title}</h2>
      <button type="button" class="icon-btn sheet-close" data-action="close-picker" aria-label="Close">${icon('x')}</button></div>`;

/** "Who's going" sheet: everyone in the group with their picture, handle and tags; tap one to see their profile. */
export function membersSheet(g, ctx) {
  const members = membersFor(g, ctx);
  const going = g.going + (ctx.state.groups.joined.includes(g.id) ? 1 : 0);
  return `${sheetHead('Who’s going')}
    <div class="sheet-body">
      <p class="members-sub">${esc(g.title)} · <span class="num">${going} of ${g.spots}</span></p>
      <ul class="member-list">${members.map((m, i) => `<li><button type="button" class="member-row" data-action="member-profile" data-group="${esc(g.id)}" data-index="${i}">${personAvatar(m, 44)}<span class="member-main"><b>${esc(m.you ? `${m.name} (you)` : m.name)}</b>${m.handle ? `<small class="member-handle">@${esc(m.handle)}</small>` : ''}${tagsOf(m).length ? `<span class="member-tags">${tagsOf(m).map((x) => `<span class="mini-tag">${esc(x)}</span>`).join('')}</span>` : ''}</span>${icon('chevronRight', { size: 18 })}</button></li>`).join('')}</ul>
      <p class="hint">Demo people: names, handles and years are made up, and pictures are drawn by the app. Real profiles would come from sign-up.</p>
    </div>`;
}

/** One member's profile, Instagram-style: picture, handle, year, interests and where they're going (all demo). */
export function memberProfileSheet(g, index, ctx) {
  const members = membersFor(g, ctx);
  const m = members[index];
  if (!m) return membersSheet(g, ctx);
  const venue = ctx.venues.find((v) => v.id === g.venueId);
  const plans = allGroups(ctx).filter((x) => membersFor(x, ctx).some((p) => p.name === m.name)).length;
  return `${sheetHead(m.you ? 'Your profile' : 'Profile', g.id)}
    <div class="sheet-body member-profile">
      <div class="mp-head">${personAvatar(m, 88)}
        <div class="mp-id"><p class="mp-name">${esc(m.you ? `${m.name} (you)` : m.name)}</p>
          ${m.handle ? `<button type="button" class="handle" data-action="ig-link" data-handle="${esc(m.handle)}" aria-label="Open @${esc(m.handle)} on Instagram (off in this demo)">${icon('at', { size: 14 })}${esc(m.handle)}</button>` : '<p class="hint" style="margin:0">No Instagram added</p>'}
        </div></div>
      <dl class="fact-strip mp-facts">
        <div><dt>Year</dt><dd>${esc(m.year ?? (m.you ? 'You' : '—'))}</dd></div>
        <div><dt>Plans</dt><dd class="num">${plans}<span class="fact-sub">this week</span></dd></div>
        <div><dt>Role</dt><dd>${esc(m.role ?? 'Going')}</dd></div>
      </dl>
      ${(m.vibe ?? []).length ? `<p class="eyebrow" style="margin-top:16px">Into</p><div class="member-tags mp-tags">${m.vibe.map((x) => `<span class="mini-tag">${esc(x)}</span>`).join('')}</div>` : ''}
      <p class="eyebrow" style="margin-top:16px">Going to</p>
      <div class="mp-plan">${venue ? `<span class="bar-logo" aria-hidden="true">${venueLogo(venue)}</span>` : ''}<span><b>${esc(g.title)}</b><small>${esc(venue?.name ?? '')} · ${esc(formatTime(g.startsAt))}</small></span></div>
      ${m.handle ? `<button type="button" class="btn btn-block" data-action="ig-link" data-handle="${esc(m.handle)}" style="margin-top:16px">${icon('at', { size: 16 })}Open Instagram</button>` : ''}
      <p class="hint">Demo person: the name, handle and picture are made up, so Instagram links are off. In the real app this opens their Instagram profile.</p>
    </div>`;
}

export function renderGroups(ctx) {
  const groups = allGroups(ctx);
  return `<div class="page">
    <div class="back-row"><a class="back-link" href="#/events" data-action="back">${icon('chevronLeft')}Events</a></div>
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

const TIMES = [[21, 0], [21, 30], [22, 0], [22, 30], [23, 0], [23, 30], [0, 0], [0, 30], [1, 0], [1, 30]];
const timeOptions = (value) => TIMES.map(([h, m]) => { const v = `${h}:${String(m).padStart(2, '0')}`; const label = formatTime(new Date(2000, 0, 1, h, m).getTime()); return `<option value="${v}" ${v === value ? 'selected' : ''}>${label}</option>`; }).join('');
/** Minutes after 6 PM for a 'H:MM' time on the demo night (times before noon are after midnight). */
export const nightMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return ((h < 12 ? h + 24 : h) - 18) * 60 + m; };
export const MAX_STOPS = 4;

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
          <div class="select"><select id="g-time" name="time" data-input="group-field" data-key="time">${timeOptions(d.time)}</select>${icon('chevronDown', { size: 14 })}</div>
        </div>
      </div>
      <div class="switch-row hop-switch"><label for="g-hop"><span class="label" style="margin:0">Bar hop</span><span class="hint">Add more stops with times, like Huey’s at 10, then Scarlet Pub at 11.</span></label>
        <span class="switch"><input id="g-hop" type="checkbox" role="switch" data-input="group-hop" ${d.hop ? 'checked' : ''}><span></span></span></div>
      ${d.hop ? `<fieldset class="hop-edit"><legend class="label">Then</legend>
        <ol class="hop-edit-list">${d.stops.map((st, i) => `<li class="hop-edit-row">
          <div class="select"><label class="sr-only" for="hop-bar-${i}">Stop ${i + 2} bar</label><select id="hop-bar-${i}" data-input="hop-field" data-index="${i}" data-key="venueId">${venues.map((v) => `<option value="${esc(v.id)}" ${v.id === st.venueId ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>${icon('chevronDown', { size: 14 })}</div>
          <div class="select hop-time"><label class="sr-only" for="hop-time-${i}">Stop ${i + 2} time</label><select id="hop-time-${i}" data-input="hop-field" data-index="${i}" data-key="time">${timeOptions(st.time)}</select>${icon('chevronDown', { size: 14 })}</div>
          <button type="button" class="icon-btn" data-action="hop-remove" data-index="${i}" aria-label="Remove stop ${i + 2}">${icon('x')}</button>
        </li>`).join('')}</ol>
        ${errors.stops ? `<p class="field-error" id="err-g-stops">${icon('alert')}${esc(errors.stops)}</p>` : ''}
        ${d.stops.length < MAX_STOPS - 1 ? `<button type="button" class="btn btn-sm" data-action="hop-add">${icon('plus', { size: 16 })}Add a stop</button>` : `<p class="hint">Up to ${MAX_STOPS} stops.</p>`}
      </fieldset>` : ''}
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
  if (d.hop && d.stops?.length) {
    const seq = [{ venueId: d.venueId, time: d.time }, ...d.stops];
    if (seq.some((st, i) => i > 0 && nightMinutes(st.time) <= nightMinutes(seq[i - 1].time))) errors.stops = 'Each stop needs a later time than the one before.';
    else if (seq.some((st, i) => i > 0 && st.venueId === seq[i - 1].venueId)) errors.stops = 'Pick a different bar than the stop before.';
  }
  return errors;
}
