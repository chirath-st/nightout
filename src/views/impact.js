// Impact (Business view > Report): what Night Out did for a bar, as a venue owner would read it. Built to the venue
// dashboard brief of 2026-10-28 (evidence/b2b-colour-20261028): the outcome a venue can trust first (codes its own staff
// checked at the door), then the recorded journey that led there, each measure with its own unit and nothing summed
// across units. The team demo has no server, so every number here is a SAMPLE, generated per bar and shown with one
// disclosure; a live build shows none of it until the server records these events (it does not yet).
import { esc } from '../ui/components.js';
import { icon } from '../ui/icons.js';

const DAY = 86_400_000;
const PERIOD = 28;
// Relative demand by weekday (Sun..Sat): college-bar nights peak Thursday to Saturday.
const WEEKDAY = [0.55, 0.35, 0.45, 0.6, 1, 1.25, 1.3];

/** The measures, in reading order. `unit` says what one count is; none of them is "unique people over 28 days". */
export const IMPACT_METRICS = Object.freeze([
  { id: 'redemptions', label: 'Staff-confirmed redemptions', short: 'Redemptions', unit: 'codes checked at your door' },
  { id: 'impressions', label: 'Listing impressions', short: 'Impressions', unit: 'times your bar was shown' },
  { id: 'viewers', label: 'Page viewers', short: 'Page viewers', unit: 'people a night' },
  { id: 'actions', label: 'Directions, saves, shares', short: 'Actions', unit: 'people a night' },
  { id: 'interested', label: 'Interested', short: 'Interested', unit: 'said interested, a night' },
  { id: 'going', label: 'Going', short: 'Going', unit: 'said going, a night' },
]);

function rng(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => { h = Math.imul(h ^ (h >>> 13), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 16), 3266489909) >>> 0; return (h >>> 0) / 4294967296; };
}

/** 56 completed nights for one bar (the 28 before tonight, and the 28 before those), the same every time for a bar. */
export function impactSeries(venue, nightStart) {
  const r = rng(`impact:${venue.id}`);
  const pop = (venue.typical ?? []).reduce((s, n) => s + n, 0) || 10;
  const base = 90 + pop * 18;
  return Array.from({ length: PERIOD * 2 }, (_, i) => {
    const date = new Date(nightStart - (PERIOD * 2 - i) * DAY);
    const prior = i < PERIOD;
    const n = (lo, hi) => lo + r() * (hi - lo);
    const impressions = Math.round(base * WEEKDAY[date.getDay()] * n(0.8, 1.2) * (prior ? 0.84 : 1));
    const viewers = Math.round(impressions * n(0.06, 0.09));
    const going = Math.round(viewers * n(0.13, 0.2));
    return {
      date, prior, impressions, viewers,
      actions: Math.round(viewers * n(0.22, 0.32)),
      interested: Math.round(viewers * n(0.08, 0.13)),
      going,
      redemptions: Math.round(going * n(0.25, 0.4)),
    };
  });
}

/** A change between two totals: absolute and percent, "New" when there was nothing to compare with. */
export function change(now, before) {
  const abs = now - before;
  if (!before) return { abs, pct: null, text: now ? 'New' : 'No change', dir: now ? 'up' : 'flat' };
  const pct = Math.round((abs / before) * 100);
  return { abs, pct, dir: abs > 0 ? 'up' : abs < 0 ? 'down' : 'flat', text: `${abs > 0 ? '+' : abs < 0 ? '−' : ''}${Math.abs(abs).toLocaleString('en-US')} (${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)}%)` };
}

/** Totals for the period and the one before, per measure. */
export function impactTotals(series) {
  const sum = (rows, k) => rows.reduce((s, x) => s + x[k], 0);
  const now = series.filter((x) => !x.prior), before = series.filter((x) => x.prior);
  return Object.fromEntries(IMPACT_METRICS.map((m) => [m.id, { now: sum(now, m.id), before: sum(before, m.id), change: change(sum(now, m.id), sum(before, m.id)) }]));
}

/** One finding worth acting on: the weekday with the most page viewers per code redeemed (only with enough data). */
export function needsAttention(series) {
  const now = series.filter((x) => !x.prior);
  const by = Array.from({ length: 7 }, (_, d) => now.filter((x) => x.date.getDay() === d));
  const rows = by.map((xs, d) => ({ d, viewers: xs.reduce((s, x) => s + x.viewers, 0), red: xs.reduce((s, x) => s + x.redemptions, 0) })).filter((x) => x.viewers >= 60);
  if (rows.length < 3) return null;
  const rate = (x) => x.red / x.viewers;
  const avg = rows.reduce((s, x) => s + x.red, 0) / rows.reduce((s, x) => s + x.viewers, 0);
  const worst = rows.reduce((a, b) => (rate(b) < rate(a) ? b : a));
  if (rate(worst) > avg * 0.8) return null;
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date(2023, 0, 1 + worst.d));
  return { day, viewers: worst.viewers, redemptions: worst.red };
}

const fmt = (n) => n.toLocaleString('en-US');
const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
const span = (rows) => `${dateFmt.format(rows[0].date)}–${dateFmt.format(rows[rows.length - 1].date)}`;

function delta(c) {
  const glyph = c.dir === 'up' ? '▲' : c.dir === 'down' ? '▼' : '';
  return `<span class="imp-delta" data-dir="${c.dir}">${glyph ? `<span aria-hidden="true">${glyph}</span> ` : ''}${esc(c.text)}<span class="sr-only"> vs the previous 28 nights</span></span>`;
}

/** The chosen measure night by night: this period (solid) over the previous one (dashed). */
function trend(series, m) {
  const now = series.filter((x) => !x.prior).map((x) => x[m.id]), before = series.filter((x) => x.prior).map((x) => x[m.id]);
  const max = Math.max(...now, ...before, 1);
  const W = 320, H = 120, P = 6;
  const pts = (vals) => vals.map((v, i) => `${(P + (i * (W - 2 * P)) / (vals.length - 1)).toFixed(1)},${(H - P - (v / max) * (H - 2 * P)).toFixed(1)}`).join(' ');
  const t = impactTotals(series)[m.id];
  return `<svg class="imp-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${m.label} each night: ${fmt(t.now)} in the last 28 nights, ${t.change.text} on the 28 before`)}">
      <line x1="${P}" x2="${W - P}" y1="${H - P}" y2="${H - P}" class="imp-axis"/>
      <polyline points="${pts(before)}" class="imp-prior"/>
      <polyline points="${pts(now)}" class="imp-now"/>
    </svg>`;
}

export function impactPanel(v, ctx) {
  const series = impactSeries(v, ctx.state.clock?.base ?? ctx.now);
  const totals = impactTotals(series);
  const now = series.filter((x) => !x.prior), before = series.filter((x) => x.prior);
  const pick = IMPACT_METRICS.find((m) => m.id === ctx.console.impMetric) ?? IMPACT_METRICS[2];
  const hero = totals.redemptions;
  const tiles = IMPACT_METRICS.slice(1);
  const finding = needsAttention(series);
  const journey = ['impressions', 'viewers', 'actions', 'going', 'redemptions'].map((id) => ({ m: IMPACT_METRICS.find((x) => x.id === id), n: totals[id].now }));
  const top = Math.max(...journey.map((j) => j.n), 1);
  const events = (ctx.events ?? []).filter((e) => e.venueId === v.id).slice(0, 3);
  return `<section class="panel imp" aria-labelledby="imp-h">
      <div class="imp-head"><h2 id="imp-h">Impact</h2><p class="imp-range num">Last 28 nights · ${esc(span(now))}<span>vs ${esc(span(before))}</span></p></div>
      <div class="imp-hero">
        <p class="eyebrow">${esc(IMPACT_METRICS[0].label)}</p>
        <p class="imp-big num">${fmt(hero.now)}</p>
        ${delta(hero.change)}
        <p class="imp-method">${icon('check', { size: 14 })}Codes your staff checked at the door. Guests without a code aren’t counted.</p>
      </div>
      <div class="imp-grid" role="group" aria-label="Measures (pick one for the chart)">
        ${tiles.map((m) => `<button type="button" class="imp-tile" data-action="imp-metric" data-m="${m.id}" aria-pressed="${m.id === pick.id}"><span class="imp-tl">${esc(m.short)}</span><span class="imp-tv num">${fmt(totals[m.id].now)}</span>${delta(totals[m.id].change)}</button>`).join('')}
        <div class="imp-tile is-na"><span class="imp-tl">Cost per redemption</span><span class="imp-tv num" aria-label="Not available">—</span><span class="imp-delta" data-dir="flat">No fees agreed</span></div>
      </div>
      <figure class="imp-trend">
        <figcaption><b>${esc(pick.label)}</b><span class="imp-key"><i class="k-now" aria-hidden="true"></i>Last 28 <i class="k-prior" aria-hidden="true"></i>28 before</span></figcaption>
        ${trend(series, pick)}
        <div class="imp-axis-labels num" aria-hidden="true"><span>${esc(dateFmt.format(now[0].date))}</span><span>${esc(dateFmt.format(now[now.length - 1].date))}</span></div>
      </figure>
      <details class="imp-data"><summary>View data</summary>
        <div class="imp-table-wrap"><table><thead><tr><th scope="col">Night</th><th scope="col">${esc(pick.short)}</th><th scope="col">28 nights before</th></tr></thead>
        <tbody>${now.map((x, i) => `<tr><th scope="row">${esc(dateFmt.format(x.date))}</th><td class="num">${fmt(x[pick.id])}</td><td class="num">${fmt(before[i][pick.id])}</td></tr>`).join('')}</tbody></table></div>
      </details>
      <h3 class="biz-h3">Recorded journey</h3>
      <ol class="imp-journey">${journey.map((j) => `<li><span class="ij-label">${esc(j.m.short)}</span><span class="ij-bar" aria-hidden="true"><i style="--w:${Math.max(0.02, Math.sqrt(j.n / top)).toFixed(3)}"></i></span><span class="ij-n num">${fmt(j.n)}</span></li>`).join('')}</ol>
      <p class="hint">Each step counts something different, and people can skip steps.</p>
      ${finding ? `<div class="imp-attn"><p class="eyebrow">Worth a look</p><p><b>${esc(finding.day)}s</b>: ${fmt(finding.viewers)} page viewers, ${fmt(finding.redemptions)} codes redeemed.</p><button type="button" class="btn btn-sm" data-action="biz-section" data-s="offers">${icon('tag', { size: 16 })}Post a ${esc(finding.day)} offer</button></div>` : ''}
      ${events.length ? `<h3 class="biz-h3">Your events</h3><ul class="plain-list imp-events">${events.map((e) => { const going = e.going ?? 0; return `<li><span><b>${esc(e.title)}</b><small>${esc(new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' }).format(new Date(e.startsAt)))}</small></span><span class="imp-ev-n num"><b>${fmt(going)}</b><small>going</small></span></li>`; }).join('')}</ul>` : ''}
      <details class="imp-defs"><summary>How these are counted</summary>
        <ul>${IMPACT_METRICS.map((m) => `<li><b>${esc(m.short)}</b>: ${esc(m.unit)}.</li>`).join('')}<li>Nights end at closing, New York time. A night counts each person once; 28 nights add those up, so they are not unique people.</li><li>Redemptions show what your staff confirmed, not who came because of Night Out.</li></ul>
      </details>
      <p class="biz-gate">${icon('lock', { size: 13 })}Sample numbers until your bar is live.</p>
    </section>`;
}
