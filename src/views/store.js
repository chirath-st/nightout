// App Store build screens: Profile and About. Only what the shipped app really does: saved bars, the reports this phone
// sent, help, privacy, terms, and Delete my data (required by App Review 5.1.1(v) for the anonymous account a first
// report creates). The site pages live at globalThis.__SITE__ (injected by scripts/build-www.mjs).
import { esc, banner } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { reminderDays, reminderLabel, hourLabel, REMINDER_HOURS } from '../lib/reminders.js';
import { LIVE } from '../lib/backend.js';

const site = (path) => `${(globalThis.__SITE__ ?? '').replace(/\/+$/, '')}/${path}`;
const ext = (path, iconName, label, sub) => `<a class="list-link" href="${esc(site(path))}" target="_blank" rel="noopener">${icon(iconName, { size: 20 })}<span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>${icon('external', { size: 18 })}</a>`;
const row = (href, iconName, label, sub) => `<a class="list-link" href="${href}">${icon(iconName, { size: 20 })}<span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>${icon('chevronRight', { size: 18 })}</a>`;

export function renderProfileStore(ctx, { confirmDelete = false, deleting = false, linked = true, unreachable = 0 } = {}) {
  const st = ctx.state;
  const reports = st.reports.length;
  return `<div class="page">
    <div class="title-row account-title"><h1 class="page-title" id="page-h" tabindex="-1">Profile</h1></div>
    <dl class="fact-strip">
      <div><dt>Reports</dt><dd>${reports}<span class="fact-sub">Sent from this phone</span></dd></div>
      <div><dt>Saved</dt><dd>${st.saved.length}<span class="fact-sub">Bars</span></dd></div>
    </dl>
    <div class="section-head"><h2>Your stuff</h2></div>
    <nav class="list-group" aria-label="Your stuff">
      ${row('#/saved', 'heart', 'Saved bars', `${st.saved.length} saved`)}
    </nav>
    <div class="section-head"><h2>Help</h2></div>
    <nav class="list-group" aria-label="Help">
      ${row('#/about', 'info', 'How estimates work', 'Where the numbers come from')}
      ${ext('support', 'help', 'Help & support', 'Report a problem, contact us')}
      ${ext('bars', 'door', 'For bars', 'Corrections, events and deals')}
    </nav>
    <div class="section-head"><h2>Privacy</h2></div>
    <nav class="list-group" aria-label="Privacy">
      ${ext('privacy', 'shield', 'Privacy policy')}
      ${ext('terms', 'file', 'Terms of use')}
    </nav>
    ${deletePanel({ confirmDelete, deleting, linked, unreachable })}
  </div>`;
}

/** Profile > Your data (App Store build, and the team build's live profile with points: { points: true }). */
export function deletePanel({ confirmDelete = false, deleting = false, linked = true, unreachable = 0 } = {}, { points = false } = {}) {
  return `<section class="panel danger-zone" aria-labelledby="${confirmDelete ? 'delete-confirm-h' : 'delete-h'}">
      ${confirmDelete
        ? `<h2 id="delete-confirm-h" tabindex="-1">Delete all your data?</h2>
          <p class="hint">${linked
            ? unreachable
              ? `This deletes your anonymous account${points ? ', the reports it sent and its points' : ' and the reports it sent'} from our servers, and clears saved bars and settings on this phone. ${unreachable === 1 ? 'One earlier report was' : `${unreachable} earlier reports were`} sent under an older sign-in this phone no longer has${!globalThis.__STORE__ && LIVE ? ', so this can’t delete ' : ': only support can delete '}${unreachable === 1 ? 'it' : 'them'}${!globalThis.__STORE__ && LIVE ? '' : ' (Help)'}. It can’t be undone.`
              : `This deletes your anonymous account${points ? ', every report you sent and your points and reward codes' : ' and every report you sent'} from our servers, and clears saved bars and settings on this phone. It can’t be undone.`
            : unreachable
              ? `This phone is no longer signed in, so it can’t delete the ${unreachable === 1 ? 'report' : `${unreachable} reports`} it sent from our server${!globalThis.__STORE__ && LIVE ? '' : ' (contact support from Help for that)'}. This clears saved bars, settings and report history on this phone. It can’t be undone.`
              : `This phone has no sign-in on our server, so this clears saved bars, settings and report history on this phone only. ${!globalThis.__STORE__ && LIVE ? 'Reports sent before its data was cleared can’t be deleted from here.' : 'Reports sent before its data was cleared can only be deleted through support.'} It can’t be undone.`}</p>
          <div class="actions">
            <button type="button" class="btn btn-danger" data-action="delete-data-confirm" ${deleting ? 'aria-disabled="true"' : ''}>${deleting ? 'Deleting…' : 'Delete my data'}</button>
            <button type="button" class="btn" data-action="delete-data-cancel" ${deleting ? 'aria-disabled="true"' : ''}>Cancel</button>
          </div>`
        : `<h2 id="delete-h">Your data</h2>
          <p class="hint">${points ? 'Reports are anonymous. You can delete them, your points and your account at any time.' : 'Reports are anonymous. You can delete them and your account at any time.'}</p>
          <button type="button" class="btn btn-danger" data-action="delete-data-ask">${icon('trash', { size: 18 })}Delete my data</button>`}
    </section>`;
}

export function renderAboutStore(ctx, { version = '' } = {}) {
  return `<div class="page prose">
    <a class="back-link" href="#/profile">${icon('chevronLeft', { size: 20 })}Profile</a>
    <h1 class="page-title" id="page-h" tabindex="-1">How estimates work</h1>${!globalThis.__STORE__ && LIVE ? '\n    <p><strong>Test version.</strong> Its data comes from a test server.</p>' : ''}
    <p>Each bar’s line estimate comes from three places, and every estimate says which one and how old it is:</p>
    <ul>
      <li><b>Our staff.</b> Our counters walk Easton Ave on busy nights and post head counts from the sidewalk.</li>
      <li><b>Door staff.</b> Some bars’ door staff post how the line is moving.</li>
      <li><b>Guests.</b> People in line send quick, anonymous reports. A guest report changes an estimate only when another report or a staff count backs it up.</li>
    </ul>
    <p>Estimates age out after 20 minutes. When nobody has reported a bar recently, it says so instead of guessing.</p>
    <p>Wait times are estimates, not promises. Bars check ID at the door, and entry is always up to the bar.</p>
    <h2>About the bars</h2>
    <p>Bar names and addresses are public information. Bars listed here aren’t affiliated with us unless a bar page says otherwise. Events and deals appear only when a bar approved them, and prices are set by the bar.</p>
    <p class="hint">Bars can ask for corrections at any time: see “For bars” in Profile.</p>
    ${version ? `<p class="hint">Version ${esc(version)}</p>` : ''}
  </div>`;
}

/**
 * Saved > bell: pick a night and a time to be reminded to check this bar's line. flow = { day, hour, error, busy };
 * existing = the reminder already set for this bar (or null).
 */
export function reminderSheet(venue, flow, existing, now) {
  const days = reminderDays(now);
  const day = days.find((d) => d.key === flow.day) ?? days[0];
  const openHours = day?.hours ?? [];
  return `<div class="sheet-head"><span class="sheet-grabber" aria-hidden="true"></span><h2 class="sheet-title" id="picker-title">Remind me about ${esc(venue.name)}</h2>
      <button type="button" class="icon-btn sheet-close" data-action="close-picker" aria-label="Close">${icon('x')}</button></div>
    <div class="sheet-body remind-sheet">
      ${existing ? `<p class="remind-current">${icon('bellFill', { size: 18 })}<span>Set for <b>${esc(reminderLabel(existing.at, now))}</b></span></p>` : ''}
      <fieldset class="field-group">
        <legend class="eyebrow">Night</legend>
        <div class="remind-opts" style="--n:${Math.max(days.length, 3)}">${days.map((d) => `<label class="remind-opt"><input type="radio" name="remind-day" value="${d.key}" data-input="remind-day" ${d.key === day?.key ? 'checked' : ''}><span>${esc(d.label)}</span></label>`).join('')}</div>
      </fieldset>
      <fieldset class="field-group">
        <legend class="eyebrow">Time</legend>
        <div class="remind-opts" style="--n:${REMINDER_HOURS.length}">${REMINDER_HOURS.map((h) => `<label class="remind-opt"><input type="radio" name="remind-hour" value="${h}" data-input="remind-hour" ${h === flow.hour && openHours.includes(h) ? 'checked' : ''} ${openHours.includes(h) ? '' : 'disabled'}><span class="num">${hourLabel(h)}</span></label>`).join('')}</div>
      </fieldset>
      ${flow.error ? banner('error', 'alert', `<p>${esc(flow.error.text)}</p>`, flow.error.settings ? '<button type="button" class="btn" data-action="open-ios-settings">Open Settings</button>' : '') : ''}
      <div class="dir-links">
        <button type="button" class="btn btn-primary btn-lg btn-block" data-action="remind-set" ${flow.busy || !openHours.includes(flow.hour) ? 'disabled' : ''}>${existing ? 'Change reminder' : 'Set reminder'}</button>
        ${existing ? '<button type="button" class="btn btn-lg btn-block" data-action="remind-clear">Remove reminder</button>' : ''}
      </div>
      <p class="hint">${(globalThis.__STORE__ || LIVE) ? 'A notification from this phone. Nothing is shared.' : 'In the iPhone app this sends a notification at that time.'}</p>
    </div>`;
}

/** Before the first report (App Review 1.2: people agree to the terms before they post). Asked once per phone. */
export function termsSheet() {
  return `<div class="sheet-head"><span class="sheet-grabber" aria-hidden="true"></span><h2 class="sheet-title" id="picker-title" tabindex="-1">Before your first report</h2>
      <button type="button" class="icon-btn sheet-close" data-action="close-picker" aria-label="Close">${icon('x')}</button></div>
    <div class="sheet-body terms-sheet">
      <ul class="terms-points">
        <li>Reports are anonymous.</li>
        <li>Report only what you see right now.</li>
        <li>False or abusive reports are removed, and can pause reports from this phone.</li>
      </ul>
      ${globalThis.__STORE__ ? `<p class="hint"><a href="${esc(site('terms'))}" target="_blank" rel="noopener">Read the Terms of use</a></p>` : ''}
      <div class="dir-links">
        <button type="button" class="btn btn-primary btn-lg btn-block" data-action="terms-agree">${(globalThis.__STORE__ || LIVE) ? 'Agree and send' : 'Agree and add'}</button>
        <button type="button" class="btn btn-lg btn-block" data-action="close-picker">Not now</button>
      </div>
    </div>`;
}
