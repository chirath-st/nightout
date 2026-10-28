// Community theme-night ideas: cards on the Events tab, the propose form, the bar's approval panel in the
// venue console, and the bar page's "Theme night ideas" rows. SIMULATED: the ideas, people and counts are
// made up, approvals happen only in the demo console on this device, and no bar is ever contacted.
import { esc, venueLogo, stateBox, meter, lblStack } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { formatTime, hhmm, timeLabel } from '../lib/clock.js';
import { initials } from '../data/social.js';
import { THEMES, GENRES } from '../data/events.js';
import { personAvatar } from '../ui/avatars.js';
import {
  ideaCounts, expectedTurnout, turnoutLevel, staffingHint, isSlowNight, nightLabel, nightOptions, takenDays,
  coverLabel, defaultCover, agoLabel, START_TIMES, END_TIMES, TITLE_MAX, PITCH_MAX,
} from '../lib/ideas.js';

const when = (x) => `${nightLabel(x.startsAt)} · ${formatTime(x.startsAt)}–${formatTime(x.endsAt)}`;
const byAvatar = (x, size = 22) => personAvatar({ seed: x.mine ? null : `p-${x.by.name}`, initials: initials(x.by.name) }, size);
const LEVEL_WORD = { quiet: 'Quiet', lively: 'Lively', packed: 'Packed' };

export function ideaCard(x, ctx) {
  const venue = ctx.venues.find((v) => v.id === x.venueId);
  const { joins, hype } = ideaCounts(x, ctx.state);
  const exp = expectedTurnout(joins, hype);
  const joined = ctx.state.ideas.joined.includes(x.id);
  const hyped = ctx.state.ideas.hyped.includes(x.id);
  const status = x.status === 'approved' ? `${icon('checkCircle', { size: 14 })}Approved`
    : x.status === 'declined' ? `${icon('x', { size: 14 })}Bar passed` : `${icon('clock', { size: 14 })}Needs bar approval`;
  const counts = x.status === 'approved'
    ? `<span class="num" data-idea-counts="${esc(x.id)}"><span class="roll">${joins}</span> going</span><span class="sep" aria-hidden="true">•</span><span>${esc(coverLabel(x.cover))}</span>`
    : `<span class="num" data-idea-counts="${esc(x.id)}"><span class="roll">${joins}</span> in · <span class="roll">${hype}</span> hype</span>${x.status === 'pending' ? `<span class="sep" aria-hidden="true">•</span><span class="num">~${exp.low}–${exp.high} expected</span>` : ''}`;
  let actions = '';
  if (x.mine) actions = `<a class="btn btn-sm" href="#/console?venue=${encodeURIComponent(x.venueId)}&amp;s=offers">${icon('door', { size: 16 })}Review as the bar</a>`;
  else if (x.status === 'pending') {
    actions = `<button type="button" class="btn btn-sm" data-action="idea-hype" data-id="${esc(x.id)}" aria-pressed="${hyped}">${icon('bolt', { size: 16 })}${lblStack('Hype', 'Hyped', hyped)}<span class="sr-only"> ${esc(x.title)}</span></button>
      <button type="button" class="btn btn-sm ${joined ? '' : 'btn-primary'}" data-action="idea-join" data-id="${esc(x.id)}" aria-pressed="${joined}">${lblStack('I’m in', `${icon('check', { size: 16 })}You’re in`, joined)}<span class="sr-only"> for ${esc(x.title)}</span></button>`;
  } else if (x.status === 'approved') {
    actions = `<button type="button" class="btn btn-sm ${joined ? '' : 'btn-primary'}" data-action="idea-join" data-id="${esc(x.id)}" aria-pressed="${joined}">${lblStack('I’m in', `${icon('check', { size: 16 })}You’re in`, joined)}<span class="sr-only"> for ${esc(x.title)}</span></button>`;
  }
  return `<li class="idea-card" data-idea="${esc(x.id)}" data-status="${x.status}" data-starts="${x.startsAt}">
    <a class="idea-link" href="#/venue/${encodeURIComponent(x.venueId)}" data-nav-venue="${esc(x.venueId)}">
      <span class="idea-top"><span class="idea-status">${status}</span>${x.mine ? '<span class="mini-tag">Your idea</span>' : ''}</span>
      <span class="ev-bar">${venue ? `<span class="bar-logo ev-logo" aria-hidden="true">${venueLogo(venue)}</span>` : ''}<span>${esc(venue?.name ?? 'Bar not in this dataset')}</span></span>
      <span class="ev-title">${esc(x.title)}</span>
      <span class="ev-meta">${icon('calendar', { size: 15 })}<span class="num">${esc(when(x))}</span>${isSlowNight(x.startsAt) ? '<span class="sep" aria-hidden="true">•</span><span>Slow night</span>' : ''}</span>
      <span class="idea-pitch">${esc(x.pitch)}</span>
      <span class="idea-by">${byAvatar(x)}<span>Proposed by ${esc(x.mine ? `${x.by.name} (you)` : x.by.name)} · ${esc(agoLabel(x.postedAt, ctx.now))}</span></span>
      <span class="idea-counts">${counts}</span>
    </a>
    ${actions ? `<div class="ev-actions">${actions}</div>` : ''}
  </li>`;
}



/* ---------- Propose form ---------- */
const invalid = (err, id) => (err ? ` aria-invalid="true" aria-describedby="${id}"` : '');
const errP = (err, id) => (err ? `<p class="field-error" id="${id}">${icon('alert')}${esc(err)}</p>` : '');

export function renderIdeaNew(ctx, draft, errors = {}) {
  if (!ctx.venues.length) {
    return `<div class="page">${stateBox({ iconName: 'calendar', title: 'No bars to propose at', body: 'Restore the bars in About.', actions: '<a class="btn btn-primary" href="#/about">Open About</a>', headingLevel: 1 })}</div>`;
  }
  const d = draft;
  const venues = [...ctx.venues].sort((a, b) => a.name.localeCompare(b.name));
  const taken = takenDays([...ctx.events, ...ctx.ideas], d.venueId);
  const e = errors;
  const timeSel = (id, key, list, value) => `<div class="field"><label class="label" for="${id}">${key === 'start' ? 'Starts' : 'Ends'}</label><div class="select"><select id="${id}" data-input="idea-field" data-key="${key}"${invalid(e.time, 'err-idea-time')}>${list.map((t) => `<option value="${hhmm(t)}" ${hhmm(t) === hhmm(value) ? 'selected' : ''}>${timeLabel(t)}</option>`).join('')}</select>${icon('chevronDown', { size: 14 })}</div></div>`;
  return `<div class="page">
    <div class="back-row"><a class="back-link" href="#/events?view=ideas" data-action="back">${icon('chevronLeft')}Events</a></div>
    <h1 class="page-title" id="page-h" tabindex="-1">Propose a theme night</h1>
    <p class="page-sub">Posted as ${esc(ctx.state.profile.name)}.</p>
    <form id="idea-form" class="form-stack" novalidate>
      <div class="field"><label class="label" for="idea-venue">Bar</label>
        <div class="select"><select id="idea-venue" data-input="idea-field" data-key="venueId"${invalid(e.venue, 'err-idea-venue')}>${venues.map((v) => `<option value="${esc(v.id)}" ${v.id === d.venueId ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>${icon('chevronDown', { size: 14 })}</div>
        ${errP(e.venue, 'err-idea-venue')}</div>
      <fieldset class="field-group"><legend class="label">Night</legend>
        <div class="radio-row night-picks">${nightOptions(ctx.state.clock.base).map((o) => {
          const [dow, ...rest] = o.label.split(', ');
          return `<label class="radio-card"><input type="radio" name="idea-night" value="${o.day}" data-input="idea-night" ${o.day === d.day ? 'checked' : ''}${invalid(e.day, 'err-idea-day')}><span><b>${esc(dow)}</b> ${esc(rest.join(', '))}${taken.has(o.day) ? '<small>Has an event</small>' : o.slow ? '<small>Slow night</small>' : ''}</span></label>`;
        }).join('')}</div>
        
        ${errP(e.day, 'err-idea-day')}</fieldset>
      <div class="field-pair">${timeSel('idea-start', 'start', START_TIMES, d.start)}${timeSel('idea-end', 'end', END_TIMES, d.end)}</div>
      ${errP(e.time, 'err-idea-time')}
      <fieldset class="field-group"><legend class="label">Kind of night</legend>
        <div class="radio-row theme-picks">${THEMES.map((t) => `<label class="radio-card"><input type="radio" name="idea-theme" value="${esc(t)}" data-input="idea-theme" ${t === d.theme ? 'checked' : ''}${invalid(e.theme, 'err-idea-theme')}><span>${esc(t)}</span></label>`).join('')}</div>
        ${errP(e.theme, 'err-idea-theme')}</fieldset>
      <div class="field"><label class="label" for="idea-genre">Music (optional)</label>
        <div class="select"><select id="idea-genre" data-input="idea-field" data-key="genre"><option value="">The bar’s usual playlist</option>${GENRES.map((g) => `<option value="${esc(g)}" ${g === d.genre ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>${icon('chevronDown', { size: 14 })}</div></div>
      <div class="field"><label class="label" for="idea-title">Name it</label>
        <input id="idea-title" class="text-input" maxlength="${TITLE_MAX}" value="${esc(d.title)}" placeholder="Y2K Night" autocomplete="off" data-input="idea-field" data-key="title"${invalid(e.title, 'err-idea-title')}>
        ${e.title ? errP(e.title, 'err-idea-title') : ''}</div>
      <div class="field"><label class="label" for="idea-pitch">What to expect</label>
        <textarea id="idea-pitch" class="text-input text-area" maxlength="${PITCH_MAX}" rows="3" placeholder="Dress code, playlist, how it works…" data-input="idea-field" data-key="pitch"${invalid(e.pitch, 'err-idea-pitch')}>${esc(d.pitch)}</textarea>
        ${e.pitch ? errP(e.pitch, 'err-idea-pitch') : ''}</div>
      <label class="check"><input id="idea-ack" type="checkbox" data-input="idea-ack" ${d.ack ? 'checked' : ''}${invalid(e.ack, 'err-idea-ack')}><span>It’s a 21+ night and it isn’t about drinks, drinking games or betting.</span></label>
      ${errP(e.ack, 'err-idea-ack')}
      <p class="hint">Ideas can’t mention drinks, drinking games, raffles, betting, prices, links or phone numbers. New Jersey also bars free-drink, 2-for-1, unlimited-drink and gender-priced nights.</p>
      ${errP(e.limit, 'err-idea-limit')}
      <button type="submit" class="btn btn-primary btn-lg btn-block" data-action="idea-post"${invalid(e.limit, 'err-idea-limit')}>Post idea</button>
    </form>
  </div>`;
}

/* ---------- Venue console: approve or pass ---------- */
export function ideaPanel(v, ctx) {
  const mine = ctx.ideas.filter((x) => x.venueId === v.id && x.endsAt > ctx.now);
  const waiting = mine.filter((x) => x.status === 'pending').sort((a, b) => a.startsAt - b.startsAt);
  const decided = mine.filter((x) => x.status !== 'pending').sort((a, b) => a.startsAt - b.startsAt);
  const review = (x) => {
    const { joins, hype } = ideaCounts(x, ctx.state);
    const exp = expectedTurnout(joins, hype);
    const level = turnoutLevel(exp.high);
    const cover = ctx.console.ideaCover?.[x.id] ?? defaultCover(v);
    return `<article class="idea-review" data-idea="${esc(x.id)}" aria-labelledby="ir-${esc(x.id)}">
      <p class="eyebrow">Needs bar approval${isSlowNight(x.startsAt) ? ' · Slow night' : ''}</p>
      <h3 id="ir-${esc(x.id)}" class="idea-review-title">${esc(x.title)}</h3>
      <p class="hint" style="margin:0">${esc(when(x))} · ${esc(x.theme)}</p>
      <p class="idea-pitch">${esc(x.pitch)}</p>
      <p class="idea-by">${byAvatar(x)}<span>Proposed by ${esc(x.mine ? `${x.by.name} (you)` : x.by.name)} · ${esc(agoLabel(x.postedAt, ctx.now))}</span></p>
      <div class="turnout"><div><p class="eyebrow">Expected turnout</p><p class="turnout-num num" data-turnout="${esc(x.id)}">${exp.low}–${exp.high} people</p></div>
        <p class="turnout-level">${meter(level, { lg: true })}<b>${LEVEL_WORD[level]}</b></p></div>
      <p class="hint" style="margin:0">${joins} said I’m in and ${hype} hyped it.</p>
      <p class="staff-hint">${icon('users', { size: 16 })}<span>Suggestion: ${esc(staffingHint(level))}</span></p>
      <fieldset class="field-group" style="margin-top:4px"><legend class="label">Cover if approved</legend>
        <div class="radio-row cover-picks">${[0, 5, 10].map((c) => `<label class="radio-card"><input type="radio" name="idea-cover-${esc(x.id)}" value="${c}" data-input="idea-cover" data-id="${esc(x.id)}" ${c === cover ? 'checked' : ''}><span>${c === 0 ? 'Free entry' : `$${c}`}</span></label>`).join('')}</div></fieldset>
      <div class="idea-decide">
        <button type="button" class="btn btn-primary" data-action="idea-approve" data-id="${esc(x.id)}">${icon('check', { size: 16 })}Approve<span class="sr-only"> ${esc(x.title)}</span></button>
        <button type="button" class="btn" data-action="idea-decline" data-id="${esc(x.id)}">Decline<span class="sr-only"> ${esc(x.title)}</span></button>
      </div>
    </article>`;
  };
  return `<section class="panel" aria-labelledby="ideas-h">
    <h2 id="ideas-h" tabindex="-1">Community ideas</h2>
    <p class="panel-sub">Theme nights guests asked for. Approve one to add it to Events.</p>
    ${waiting.length ? `<h3 class="label" data-key="ideas-waiting">Waiting for you (${waiting.length})</h3><div class="idea-reviews">${waiting.map(review).join('')}</div>`
      : `<p class="hint">No ideas waiting.</p>`}
    ${decided.length ? `<h3 class="label" style="margin-top:16px" data-key="ideas-decided">Decided</h3><ul class="plain-list">${decided.map((x) => `<li data-key="decided-${esc(x.id)}"><span><b>${esc(x.title)}</b><small>${x.status === 'approved' ? `Approved · ${esc(nightLabel(x.startsAt).split(',')[0])} ${esc(formatTime(x.startsAt))} · ${esc(coverLabel(x.cover))}` : 'Declined'}</small></span><button type="button" class="btn btn-sm" data-action="idea-undo" data-id="${esc(x.id)}">Undo<span class="sr-only"> decision: ${esc(x.title)}</span></button></li>`).join('')}</ul>` : ''}
    
  </section>`;
}

/* ---------- Bar page ---------- */
export function ideasSection(venue, ctx) {
  const rows = ctx.ideas.filter((x) => x.venueId === venue.id && x.status !== 'declined' && x.endsAt > ctx.now).sort((a, b) => a.startsAt - b.startsAt).slice(0, 2);
  return `<section class="ideas" aria-labelledby="ideas-sec-h">
    <div class="section-head"><h2 id="ideas-sec-h">Theme night ideas</h2><span class="eyebrow">Community</span></div>
    ${rows.map((x) => {
      const { joins, hype } = ideaCounts(x, ctx.state);
      return `<a class="idea-row" href="#/events?view=ideas"><span class="food-ic">${icon('bolt', { size: 20 })}</span><span class="idea-row-main"><b>${esc(x.title)}</b><small>${esc(nightLabel(x.startsAt).split(',')[0])} · ${esc(formatTime(x.startsAt))} · ${x.status === 'approved' ? 'Approved' : 'Needs bar approval'}</small></span><small class="num">${joins} in · ${hype} hype</small>${icon('chevronRight', { size: 18 })}</a>`;
    }).join('')}
    <a class="list-link" href="#/events/new?venue=${encodeURIComponent(venue.id)}">${icon('plus', { size: 20 })}<span>Propose a theme night here</span>${icon('chevronRight', { size: 18 })}</a>
    
  </section>`;
}
