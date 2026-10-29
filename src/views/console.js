// Door console (Ship E): what a Night Out ambassador or, as a demo role, a bar's bouncer would use at the door.
// Snap the line (a drawn, simulated photo), count the heads, publish; set each door's status and pace; see every input
// that shaped the guest-facing estimate. SIMULATED: no camera, no image, no real staff; nothing leaves this device.
import { esc, estimateBlock, stateBox, crowdStatus } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { describeEstimate, relativeAge, PACE_COPY } from '../lib/queue.js';
import { doorPace, withObservations, WINDOW } from '../lib/merge.js';
import { lineScene, DRAW_MAX } from '../ui/lineart.js';
import { formatTime } from '../lib/clock.js';
import { dealPanel, backIcon } from './pages.js';
import { ideaPanel } from './ideas.js';
import { impactPanel } from './impact.js';
import { businessHead, redeemPanel, reportPanel, photosPanel, renderVenueLive, BIZ_SECTIONS } from './business.js';
import { LIVE } from '../lib/backend.js';

const ROLE = { ambassador: 'Ambassador', bouncer: 'Bouncer' };
const DOOR_WORDS = [['moving', 'Letting in'], ['capacity', 'One in, one out'], ['paused', 'Paused'], ['closed', 'Closed']];

/** The door state that applies now (this device's, else the seeded one), or null. */
export function currentDoor(v, ctx) {
  const mine = ctx.state.doors?.[v.id];
  const cleared = ctx.state.overrides?.[v.id]?.clearedAt ?? -Infinity;
  const d = mine && mine.at > cleared ? mine : v.obs?.door && v.obs.door.at > cleared ? v.obs.door : null;
  return d && ctx.now - d.at <= 30 * 60_000 ? d : null;
}

/** The venue as guests would get it if this count were published now: the same merge, so a disagreeing photo or a
 *  shut door shows up in the preview too. */
export function previewVenue(count, venue, now, state = {}, role = 'ambassador') {
  const raw = { ...venue, queue: 'rawQueue' in venue ? venue.rawQueue : venue.queue };
  const night = state.clock?.realStart ?? null;
  const draft = { id: 'preview', venueId: venue.id, at: now, night, by: role, heads: count };
  return withObservations(raw, { ...state, counts: [draft, ...(state.counts ?? [])] }, now, { since: state.clock?.base ?? -Infinity, night });
}
export const photoPreview = (count, venue, now, state, role) => describeEstimate(previewVenue(count, venue, now, state, role), now);

/** A seeded queue without a pace source still has the bar's usual pace. */
const withPace = (q) => (q && !q.paceSource && Number.isFinite(q.admitPerMin) && q.admitPerMin > 0 ? { ...q, paceSource: 'typical' } : q);

function paceLine(q) {
  q = withPace(q);
  if (!q || !q.paceSource) return null;
  if (q.paceSource === 'door') return q.admitPerMin == null ? 'Pace: no door is letting people in' : `Pace: ${q.paceDetail}${q.doorsTotal > 1 ? '' : ' a min'}, ${PACE_COPY.door}`;
  if (q.paceSource === 'measured') { const n = parseInt(q.paceDetail, 10) || 1; return `Pace: measured from ${n === 1 ? '1 guest’s' : `${n} guests’`} waits`; }
  if (q.paceSource === 'typical') return `Pace: ${q.admitPerMin} a min, ${PACE_COPY.typical}`;
  return `Pace: assumed ${q.admitPerMin} a min (no door pace yet)`;
}

function mathStrip(v, ctx) {
  // Only a counted photo changes the math: a fresh snap with nothing marked yet would preview a 0-head count.
  const photo = ctx.console.photo?.venueId === v.id && ctx.console.photo.touched ? ctx.console.photo : null;
  const q = v.queue;
  const pace = Number.isFinite(q?.admitPerMin) && q.admitPerMin > 0 ? q.admitPerMin : null;
  let line1;
  if (photo) {
    const pv = previewVenue(photo.count, v, ctx.now, ctx.state, ctx.console.role);
    const pre = describeEstimate(pv, ctx.now);
    const rate = pv.queue?.admitPerMin;
    line1 = pre.waitLow != null && ['fresh', 'aging'].includes(pre.tone) && rate
      ? `<b class="num">${photo.count}</b> counted ÷ <b class="num">${rate}</b> a min ≈ <b class="num">${pre.waitLow}–${pre.waitHigh} min</b>`
      : `<b class="num">${photo.count}</b> counted · ${esc(pre.tone === 'uncertain' ? `${pre.headline}, uncertain (${pre.detail})` : pre.headline)}`;
  } else {
    const est = describeEstimate(v, ctx.now);
    line1 = est.waitLow != null && est.peopleLabel && ['fresh', 'aging'].includes(est.tone)
      ? `<b class="num">${esc(est.peopleLabel.replace(' in line', ''))}</b> in line ÷ <b class="num">${pace}</b> a min ≈ <b class="num">${est.waitLow}–${est.waitHigh} min</b>`
      : esc(est.headline);
  }
  const p = paceLine(q);
  return `<div class="math-strip" aria-live="off">
    <p class="ms-main">${line1}</p>
    ${p ? `<p class="ms-sub">${esc(p)}</p>` : ''}
    ${photo ? (() => { const pv = photoPreview(photo.count, v, ctx.now, ctx.state, ctx.console.role); return `<p class="ms-sub">Guests will see <b data-crowd="${crowdStatus(pv).level}">${esc(pv.headline)}</b> after publishing.</p>`; })() : ''}
  </div>`;
}

/** The line photo panel: snap, count (tap the photo or −/+), publish. Re-rendered on its own while counting. */
export function photoPanel(v, ctx) {
  const photo = ctx.console.photo?.venueId === v.id ? ctx.console.photo : null;
  const door = currentDoor(v, ctx);
  const doors = v.doors.map((d) => ({ ...d, status: door?.list?.[d.id]?.status ?? v.queue?.doorStatus ?? 'moving' }));
  const step = !photo ? 1 : !photo.touched ? 2 : 3;
  const drawn = photo ? Math.min(photo.heads, DRAW_MAX) : 0;
  const scene = lineScene({ seed: photo?.seed ?? `${v.id}:empty`, heads: photo?.heads ?? 0, count: photo?.count ?? 0, newest: photo?.newest ?? -1, doors });
  return `<section class="panel line-photo" id="line-photo" aria-labelledby="lp-h">
    <h2 id="lp-h">Line photo</h2>
    <ol class="story" aria-label="Steps">${['Snap', 'Count', 'Publish'].map((w, i) => `<li class="${i + 1 < step ? 'is-done' : i + 1 === step ? 'is-now' : ''}">${i + 1 < step ? icon('check', { size: 14 }) : `<span class="num">${i + 1}</span>`}${w}${i + 1 < step ? '<span class="sr-only">, done</span>' : ''}</li>`).join('')}</ol>
    <div class="viewfinder lp-view${photo ? ' is-snapped' : ''}">
      ${photo ? `<button type="button" class="scene-btn" data-action="photo-mark" aria-label="Count one more person" aria-describedby="scene-desc count-help">${scene}</button>
        <p class="sr-only" id="scene-desc">Line photo, ${photo.heads} people, ${v.doors.length} door${v.doors.length === 1 ? '' : 's'}.</p>
        <button type="button" class="icon-btn vf-retake" data-action="photo-retake" aria-label="Retake photo">${icon('retake')}</button>` : `${scene}<span class="vf-tag vf-tip">Frame the line, not faces</span>`}
      
      ${photo && photo.heads > DRAW_MAX ? `<span class="beyond-tag">+${photo.heads - DRAW_MAX} beyond the frame</span>` : ''}
    </div>
    ${photo ? `
      <div class="count-row">
        <div><p class="label" id="pc-label">People counted</p><output id="photo-count" class="sr-only" aria-labelledby="pc-label">${photo.count}</output><span class="pc-vis num roll" aria-hidden="true">${photo.count}</span></div>
        <div class="stepper count-step" role="group" aria-labelledby="pc-label">
          ${[[-5, '5 fewer people'], [-1, '1 fewer person'], [1, '1 more person'], [5, '5 more people']].map(([d, l]) => `<button type="button" class="icon-btn" data-action="photo-step" data-delta="${d}" aria-label="${l}" ${(d < 0 && photo.count <= 0) || (d > 0 && photo.count >= 400) ? 'disabled' : ''}><span class="num">${d > 0 ? '+' : '−'}${Math.abs(d)}</span></button>`).join('')}
        </div>
      </div>
      <p class="hint" id="count-help">Tap each head, or use − / +.</p>
      ${ctx.state.business?.on ? '' : `<button type="button" class="btn btn-quiet btn-block" data-action="photo-fill">${icon('check', { size: 16 })}Mark every head</button>`}` : ''}
    ${mathStrip(v, ctx)}
    <div class="photo-cta">${photo
      ? `<button type="button" class="btn btn-primary btn-lg btn-block" data-action="photo-publish"${!photo.touched ? ' aria-disabled="true"' : ''}>${icon('check', { size: 18 })}Publish ${photo.count}</button>`
      : `<button type="button" class="btn btn-primary btn-lg btn-block" data-action="photo-snap">${icon('camera', { size: 18 })}Snap the line</button>`}</div>
  </section>`;
}

function doorsPanel(v, ctx) {
  const door = currentDoor(v, ctx);
  const dp = door ? doorPace(v.doors, door, ctx.now) : null;
  return `<section class="panel" aria-labelledby="doors-h">
    <div class="section-head"><h2 id="doors-h">Doors</h2></div>
    ${v.doors.map((d) => {
      const s = door?.list?.[d.id] ?? { status: v.queue?.doorStatus ?? 'moving', pace: null };
      return `<fieldset class="field-group door-row"><legend class="label">${esc(d.label)}</legend>
        <div class="radio-row door-status">${DOOR_WORDS.map(([val, label]) => `<label class="radio-card"><input type="radio" name="door-status-${esc(d.id)}" value="${val}" data-input="door-status" data-door="${esc(d.id)}" ${s.status === val ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div>
        <div class="pace-row"><span class="label" id="pace-${esc(d.id)}">Pace</span><div class="segmented pace-seg" role="radiogroup" aria-labelledby="pace-${esc(d.id)}" style="--n:4"${[1, 2, 3, 4].includes(s.pace) ? '' : ' data-empty'}>${[1, 2, 3, 4].map((n) => `<label><input type="radio" name="door-pace-${esc(d.id)}" value="${n}" data-input="door-pace" data-door="${esc(d.id)}" ${s.pace === n ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div><span class="hint" style="margin:0">a min</span></div>
      </fieldset>`;
    }).join('')}
    <p class="door-summary">${dp?.pace != null ? `Venue pace: <b>${esc(v.doors.length > 1 ? `${dp.detail} = ${dp.pace}` : String(dp.pace))} a min</b> · ${dp.open} of ${dp.total} door${dp.total === 1 ? '' : 's'} open` : dp && dp.open === 0 ? 'No door is letting people in.' : 'No door pace yet.'}</p>
    
  </section>`;
}

const CHIPS = { sets: ['check', 'Sets the count'], backs: ['check', 'Backs it up'], against: ['alert', 'Doesn’t match'], older: ['clock', 'Older, not used'] };
function inputRow(u, ctx) {
  const x = u.input;
  const age = relativeAge(x.at, ctx.now);
  const what = x.kind === 'photo' ? `${ROLE[x.by] ?? 'Staff'} photo · ${x.heads} heads` : x.kind === 'venue' ? `Venue update · ${x.low}–${x.high}` : x.n > 1 ? `${x.n} earlier crowd reports · ${x.low}–${x.high}` : `Guest report · ${x.low}–${x.high}`;
  const [ic, word] = CHIPS[u.outcome];
  return `<li data-key="in-${esc(x.kind)}-${x.at}"><span class="feed-main">${esc(what)}<small>${esc(age)}</small></span><span class="feed-chip" data-outcome="${u.outcome}">${icon(ic, { size: 13 })}${word}</span></li>`;
}

function paceFeedRow(v, q, ctx) {
  const shut = q.paceSource === 'door' && q.admitPerMin == null;
  const what = shut ? 'Doors · none letting people in'
    : q.paceSource === 'door' ? `Door pace · ${q.paceDetail} a min`
      : q.paceSource === 'measured' ? `Measured waits · ${q.paceDetail} · ~${q.admitPerMin} a min`
        : q.paceSource === 'typical' ? `Typical pace · ${q.admitPerMin} a min` : `No door pace yet · ${q.admitPerMin} a min assumed`;
  const sub = q.paceSource === 'door' ? `${ROLE[currentDoor(v, ctx)?.by] ?? 'Set at the door'}` : q.paceSource === 'measured' ? 'From guests’ “I’m in” times' : 'Assumed';
  const sets = !shut && (q.paceSource === 'door' || q.paceSource === 'measured');
  const [ic, word, outcome] = shut ? ['closed', 'No pace', 'against'] : sets ? ['check', 'Sets the pace', 'sets'] : ['help', q.paceSource === 'typical' ? 'Typical' : 'Assumed', 'older'];
  return `<li data-key="pace"><span class="feed-main">${esc(what)}<small>${esc(sub)}</small></span><span class="feed-chip" data-outcome="${outcome}">${icon(ic, { size: 13 })}${word}</span></li>`;
}

function feedPanel(v, ctx) {
  const q = withPace(v.queue);
  const used = v.inputs ?? (q && q.peopleLow != null && Number.isFinite(q.observedAt) ? [{ input: { kind: q.sourceType === 'venue' ? 'venue' : 'guest', at: q.observedAt, low: q.peopleLow, high: q.peopleHigh, n: q.reportCount ?? 1 }, outcome: 'sets' }] : []);
  const live = used.filter((u) => ctx.now - u.input.at <= WINDOW * 60_000);
  const lead = live.find((u) => u.outcome === 'sets');
  const rest = live.filter((u) => u !== lead).sort((a, b) => b.input.at - a.input.at);
  const paceRow = q?.paceSource ? paceFeedRow(v, q, ctx) : '';
  const rows = [lead && inputRow(lead, ctx), paceRow, ...rest.map((u) => inputRow(u, ctx))].filter(Boolean);
  const shown = rows.slice(0, 4);
  return `<section class="panel" aria-labelledby="feed-h">
    <h2 id="feed-h">Inputs right now</h2>
    ${lead || paceRow ? `<ul class="feed">${shown.join('')}</ul>${rows.length > 4 ? `<p class="hint">+${rows.length - 4} more</p>` : ''}` : '<p class="hint">Nothing in the last 20 minutes. Snap the line to start.</p>'}
    
  </section>`;
}

function guestsPanel(v, ctx) {
  const cleared = ctx.ui.clearedQueue?.venueId === v.id;
  return `<section class="panel" aria-labelledby="prev-h">
        <h2 id="prev-h">What guests see now</h2>
        
        ${estimateBlock(v, ctx.now, { headingId: 'qb-console', showHow: false, headingLevel: 3 })}
        <div class="form-actions">${cleared ? '<button type="button" class="btn" data-action="console-undo-clear">Restore previous estimate</button>' : '<button type="button" class="btn" data-action="console-clear">Clear estimate</button>'}</div>
      </section>`;
}
function auditPanel(v, ctx) {
  const audit = ctx.state.audit.filter((a) => a.venueId === v.id).slice(0, 8);
  return `<section class="panel" aria-labelledby="audit-h">
        <h2 id="audit-h">Change log</h2>
        ${audit.length ? `<ol class="audit">${audit.map((a) => `<li><time>${esc(formatTime(a.at))}</time><span>${esc(a.summary)}</span></li>`).join('')}</ol>` : '<p class="hint">No changes yet.</p>'}
      </section>`;
}

/** Business view (Profile > Business view): the same console, signed in as one venue (a demo login), in sections. */
function renderBusiness(v, ctx) {
  const section = BIZ_SECTIONS.some(([k]) => k === ctx.console.section) ? ctx.console.section : 'tonight';
  const panels = {
    tonight: () => `${photoPanel(v, ctx)}${guestsPanel(v, ctx)}${doorsPanel(v, ctx)}${feedPanel(v, ctx)}${auditPanel(v, ctx)}`,
    // Ideas waiting for this bar's answer come first. The order is fixed when Offers opens (main.js resets ideasFirst on
    // a section or venue change), so approving one doesn't throw the panel under the deal form mid-task.
    offers: () => ((ctx.console.ideasFirst ??= ctx.ideas.some((x) => x.venueId === v.id && x.status === 'pending' && x.endsAt > ctx.now))
      ? `${ideaPanel(v, ctx)}${dealPanel(v, ctx)}` : `${dealPanel(v, ctx)}${ideaPanel(v, ctx)}`),
    redeem: () => redeemPanel(v, ctx),
    report: () => `${impactPanel(v, ctx)}${reportPanel(v, ctx)}`,
    photos: () => photosPanel(v, ctx),
  };
  return `<div class="page console-page biz-page" data-section="${section}" style="max-width:1100px">
    ${businessHead(v, ctx, section)}
    <div class="console-grid biz-grid">${panels[section]()}</div>
  </div>`;
}

export function renderConsole(ctx) {
  // A live team build has no demo console: #/console is Business view for a venue account on the server.
  if (LIVE) return renderVenueLive(ctx);
  const venues = ctx.venues;
  if (!venues.length) return `<div class="page">${stateBox({ iconName: 'door', title: 'No venues to manage', body: 'Restore the venue list first.', actions: '<button type="button" class="btn btn-primary" data-action="dataset" data-kind="demo">Restore venues</button>', headingLevel: 1 })}</div>`;
  const id = ctx.console.venueId && venues.some((v) => v.id === ctx.console.venueId) ? ctx.console.venueId : venues[0].id;
  const v = venues.find((x) => x.id === id);
  if (ctx.state.business?.on) return renderBusiness(v, ctx);
  const role = ctx.console.role ?? 'ambassador';
  return `<div class="page console-page" style="max-width:1100px">
    <div class="biz-head">${backIcon('profile', 'Profile')}<div class="biz-id"><p class="eyebrow biz-badge">Demo login · sample data</p><h1 class="page-title" id="page-h" tabindex="-1">Door console</h1></div></div>
    <p class="page-sub">For bar owners and door staff.</p>
    <p class="console-lede">Wait ≈ people in line ÷ door pace. Anything older than 20 minutes is hidden.</p>
    <div class="field-group" style="margin-top:var(--s-4)">
      <label class="label" for="console-venue">Venue</label>
      <div class="select"><select id="console-venue" data-input="console-venue" style="width:100%;min-height:46px">${venues.map((x) => `<option value="${x.id}" ${x.id === id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>${icon('chevronDown')}</div>
    </div>
    <div class="field-group role-group"><p class="label" id="role-label">Who’s at the door?</p>
      <div class="segmented role-seg" role="group" aria-labelledby="role-label" style="--n:${Object.keys(ROLE).length}">${Object.entries(ROLE).map(([k, w]) => `<button type="button" data-action="console-role" data-role="${k}" aria-pressed="${role === k}">${w}</button>`).join('')}</div>
      <p class="hint">${role === 'ambassador' ? 'Night Out’s street team.' : 'The bar’s door staff. Night Out never pays them.'}</p>
    </div>
    <div class="console-grid">
      ${photoPanel(v, ctx)}
      ${guestsPanel(v, ctx)}
      ${doorsPanel(v, ctx)}
      ${feedPanel(v, ctx)}
      ${dealPanel(v, ctx)}
      ${ideaPanel(v, ctx)}
      ${auditPanel(v, ctx)}
    </div>
  </div>`;
}
