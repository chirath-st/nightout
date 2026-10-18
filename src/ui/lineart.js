/* Simulated "photo" of the line outside a bar door, for the venue console's demo head count.
   Drawn in code, never a camera frame: a brick storefront with 1–2 doors, a sidewalk seen from above
   at 3/4, and anonymous silhouettes (no faces) in one line. The line leaves the first open door, runs
   along the wall briefly, then snakes toward the camera, growing with depth (about 2.5x from the door
   to the front row). Counted heads get a ring and a numbered badge in a .mark group (the CSS pops it);
   Pure: same inputs, same string. */
export const DRAW_MAX = 48;

const TONES = ['#112', '#122', '#222', '#223', '#233']; // night silhouettes, dark grey to blue-grey
const STATUS = ['moving', 'capacity', 'paused', 'closed'];
const NEON = ['#ff4f86', '#3ccfff', '#a48bff', '#ffb547'];

// FNV-1a hash -> mulberry32 stream
function hash(str) {
  let h = 2166136261;
  for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}
function rng(seed) {
  let a = hash(seed);
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// numbers print at 1 decimal without a leading zero; `svg` formats every number put into a template
const q = (v) => Math.round(v * 10) / 10;
const f = (v) => String(q(v)).replace(/^(-?)0\./, '$1.');
const svg = (s, ...v) => s.reduce((o, str, i) => o + (typeof v[i - 1] === 'number' ? f(v[i - 1]) : v[i - 1]) + str);
const pd = (...a) => svg(...a).replace(/ -/g, '-');
const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));

/** Polyline through the waypoints with each corner rounded (quadratic, radius R). */
function route(pts, R) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i += 1) {
    const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const k = Math.min(R, l1 / 2, l2 / 2);
    const p = [b[0] + (a[0] - b[0]) * k / l1, b[1] + (a[1] - b[1]) * k / l1];
    const e = [b[0] + (c[0] - b[0]) * k / l2, b[1] + (c[1] - b[1]) * k / l2];
    for (let j = 0; j <= 6; j += 1) {
      const t = j / 6, m = 1 - t;
      out.push([m * m * p[0] + 2 * m * t * b[0] + t * t * e[0], m * m * p[1] + 2 * m * t * b[1] + t * t * e[1]]);
    }
  }
  return [...out, pts[pts.length - 1]];
}

// perspective: scale 1 at the wall row (y 92), ~2.5 at the front row (y 214); the ground's vanishing line is y 8
const K = (y) => (y - 8) / 84;

/** World length of a polyline: screen length divided by the scale where it is drawn. */
function worldLength(pl) {
  let L = 0;
  for (let i = 1; i < pl.length; i += 1) L += Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]) / K((pl[i][1] + pl[i - 1][1]) / 2);
  return L;
}

/** [x, y, tx, ty]: point and unit tangent at world length d along a polyline (runs on past the end). */
function along(pl, d) {
  for (let i = 1; i < pl.length; i += 1) {
    const [x0, y0] = pl[i - 1], [x1, y1] = pl[i];
    const l = Math.hypot(x1 - x0, y1 - y0);
    if (!l) continue;
    const lw = l / K((y0 + y1) / 2);
    if (d <= lw || i === pl.length - 1) return [x0 + (x1 - x0) * d / lw, y0 + (y1 - y0) * d / lw, (x1 - x0) / l, (y1 - y0) / l];
    d -= lw;
  }
  return [pl[0][0], pl[0][1], 1, 0];
}

/** One door in the wall (frame 36 wide, opening y 28–70). Lit doors spill warm light onto the sidewalk. */
function door({ status }, x, u) {
  const lit = status !== 'closed', dim = status === 'paused' ? ' opacity=".6"' : '';
  let s = `<g class="door" data-status="${status}">`;
  if (lit) s += svg`<ellipse cx="${x}" cy="52" rx="44" ry="30" fill="url(#${u}g)"${dim}/><rect x="${x - 62}" y="70" width="124" height="96" fill="url(#${u}s)"${dim}/>`;
  s += svg`<rect x="${x - 18}" y="25" width="36" height="45" fill="#090606"/><rect x="${x - 15}" y="28" width="30" height="42" fill="${lit ? `url(#${u}d)` : '#19120f'}"${dim}/>`;
  if (!lit) s += svg`<path d="M${x} 28V70" stroke="#000" stroke-opacity=".55"/><path d="M${x - 2.6} 50v4M${x + 2.6} 50v4" stroke="#5c4b40" stroke-width="1.2"/><rect x="${x - 12}" y="37" width="24" height="9" rx="1.5" fill="#2e231d"/><text x="${x}" y="43.6" fill="#eadccb" font-family="system-ui" font-size="6" font-weight="700" text-anchor="middle">Closed</text>`;
  // paused: brass stanchions with a rope bar across the door
  if (status === 'paused') s += svg`<g fill="none" stroke-linecap="round"><path d="M${x - 16} 70V56M${x + 16} 70V56" stroke="#c9a15f" stroke-width="1.8"/><path d="M${x - 16} 57.5Q${x} 63 ${x + 16} 57.5" stroke="#b42a3c" stroke-width="2.4"/></g>`;
  // at capacity: a small red lamp over the door
  if (status === 'capacity') s += svg`<circle cx="${x}" cy="21" r="4.5" fill="#ff5a48" opacity=".22"/><circle cx="${x}" cy="21" r="1.5" fill="#ff6b57"/>`;
  return s + '</g>';
}

/**
 * A drawn line outside a bar door, for the simulated head count. Deterministic for a seed.
 * seed: string; heads: integer 0–400 (people in line); count: how many are marked as counted (0–400);
 * newest: index of the most recently marked figure (-1 for none); doors: [{ id, label, status }] with status one of
 * 'moving' | 'capacity' | 'paused' | 'closed' (1 or 2 doors).
 */
export function lineScene({ seed, heads = 0, count = 0, newest = -1, doors = [{ id: 'main', label: 'Door', status: 'moving' }] } = {}) {
  const key = String(seed ?? '');
  const u = 'l' + (hash(key) % 46656).toString(36); // short per-seed ids (the defs are the same for every seed)
  // separate streams: scene, layout and people never shift each other
  const rs = rng(`${key}|scene`), rp = rng(`${key}|path`), rf = rng(`${key}|line`);
  const n = int(heads, 0, DRAW_MAX), marked = Math.min(int(count, 0, DRAW_MAX), n), fresh = Math.floor(Number(newest));
  const list = (Array.isArray(doors) && doors.length ? doors : [{}]).slice(0, 2)
    .map((d) => ({ status: STATUS.includes(d?.status) ? d.status : 'moving' }));

  // doors sit clear of the corner overlays; the line leaves the first open door toward the middle
  const xs = list.length > 1 ? [100 + (rs() - .5) * 12, 224 + (rs() - .5) * 12] : [rs() < .5 ? 104 + rs() * 24 : 216 - rs() * 24];
  const first = Math.max(0, list.findIndex((d) => d.status !== 'closed'));
  const dx = xs[first], dir = dx < 160 ? 1 : -1;
  const lit = list.some((d) => d.status !== 'closed');
  const ph = rs() * 6.3, neon = NEON[Math.floor(rs() * NEON.length)], pool = 60 + rs() * 200;
  const [w0, w1] = list.length > 1 ? [xs[0] + 32, xs[1] - 32] : dir > 0 ? [dx + 36, 300] : [20, dx - 36];

  // people first (8 draws each): tone, size, shoulders, jitter, lean, spacing (world units; friends close, strangers gap)
  const ppl = Array.from({ length: n }, () => ({ tone: TONES[Math.floor(rf() * TONES.length)], r: 3.6 + rf() * .7, w: 6.4 + rf() * 1.5,
    jx: rf() - .5, jy: rf() - .5, lean: rf() - .5, step: 12.2 * (.92 + rf() * .2) + (rf() < .1 ? 3.5 : 0) }));

  // layout: wall run, a short step down, then R switchback rows spaced evenly in depth down to the front (y 214).
  // Row width is solved so the line's length fits the people drawn: short lines stay near the door, long ones fill it.
  const R = n > 30 ? 4 : n > 18 ? 3 : 2;
  const y0 = 92 + (rp() - .5) * 3, xe = dx + dir * (34 + rp() * 14);
  const rows = Array.from({ length: R }, (_, j) => 8 + 84 * (206 / 84) ** ((j + 1) / R) + (j < R - 1 ? (rp() - .5) * 4 : 0));
  const mid = rows.map(() => 160 + (rp() - .5) * 10);
  const lay = (W) => {
    // row j ends on side +dir (j even) or -dir (j odd); each U-turn drops straight down at the outer of its two rows
    const edge = rows.map((y, j) => [-1, 1].map((sd) => mid[j] + sd * Math.min(146 - Math.abs(mid[j] - 160), W * K(y) / 2)));
    const p = [[dx, y0], [xe, y0], [xe, rows[0]]];
    rows.forEach((y, j) => {
      const sd = j % 2 ? -dir : dir, at = (i) => edge[i][sd > 0 ? 1 : 0];
      let x = j < R - 1 ? (sd > 0 ? Math.max(at(j), at(j + 1)) : Math.min(at(j), at(j + 1))) : at(j);
      if (!j) x = dir > 0 ? Math.max(x, xe + 30) : Math.min(x, xe - 30);
      p.push([x, y]);
      if (j < R - 1) p.push([x, rows[j + 1]]);
    });
    return route(p, 20);
  };
  const need = ppl.slice(0, -1).reduce((a, p) => a + p.step, 0) * 1.03 + 6; // slack for corners (see below)
  let lo = 12, hi = 292 / K(rows[0]);
  if (worldLength(lay(lo)) >= need) hi = lo;
  else for (let i = 0; i < 24; i += 1) { const m = (lo + hi) / 2; if (worldLength(lay(m)) < need) lo = m; else hi = m; }
  const path = lay(hi), squeeze = Math.min(1, worldLength(path) / need); // a very long line stands a touch closer

  let s = `<svg class="line-scene" viewBox="0 0 320 240" width="320" height="240" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><defs>`
    + `<pattern id="${u}k" width="18" height="9" patternUnits="userSpaceOnUse"><path d="M0 .5h18M0 5h18M6 .5V5M15 5v4" fill="none" stroke="#000" stroke-opacity=".32"/></pattern>`
    + `<linearGradient id="${u}p" x2="0" y2="1"><stop stop-color="#35312f"/><stop offset="1" stop-color="#25262b"/></linearGradient>`
    + `<linearGradient id="${u}d" x2="0" y2="1"><stop stop-color="#9a4f22"/><stop offset=".5" stop-color="#ffb968"/><stop offset="1" stop-color="#ffe3b3"/></linearGradient>`
    + `<linearGradient id="${u}r" x2="0" y2="1"><stop stop-color="#ffd3a0" stop-opacity=".9"/><stop offset=".55" stop-color="#ffd3a0" stop-opacity="0"/></linearGradient>`
    + `<radialGradient id="${u}g"><stop stop-color="#ffb066" stop-opacity=".5"/><stop offset="1" stop-color="#ffb066" stop-opacity="0"/></radialGradient>`
    + `<radialGradient id="${u}s" cy="0" fy="0" r="1"><stop stop-color="#ffb066" stop-opacity=".42"/><stop offset=".62" stop-color="#ffb066" stop-opacity="0"/></radialGradient>`
    + `<radialGradient id="${u}c"><stop stop-color="#a9bfe0" stop-opacity=".14"/><stop offset="1" stop-color="#a9bfe0" stop-opacity="0"/></radialGradient>`
    + `<radialGradient id="${u}v" cy=".42" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>`
    + `<filter id="${u}h" filterUnits="userSpaceOnUse" x="0" y="0" width="320" height="240"><feGaussianBlur stdDeviation="2"/></filter></defs>`;

  // sidewalk slabs (joints converge on the vanishing line: 3/4 view), cool street-light pool, curb, street edge
  let joints = 'M0 104H320M0 128H320M0 158H320M0 195H320';
  for (const c of [-1, -.4, .4, 1]) joints += svg`M${160 + c * 62} 70L${160 + c * 224} 232`;
  s += `<rect y="70" width="320" height="162" fill="url(#${u}p)"/><path d="${joints}" stroke="#000" stroke-opacity=".22"/>`;
  s += svg`<ellipse cx="${pool}" cy="200" rx="130" ry="52" fill="url(#${u}c)"/>`;
  s += `<rect y="232" width="320" height="3" fill="#47474d"/><rect y="235" width="320" height="5" fill="#0b0c0f"/>`;

  // storefront wall: brick courses over a stucco plinth, one window on the free stretch
  s += `<rect width="320" height="70" fill="#1c1411"/><rect width="320" height="62" fill="url(#${u}k)"/><rect y="62" width="320" height="8" fill="#150f0d"/>`;
  if (w1 - w0 > 30) {
    const ww = w1 - w0, cx = w0 + ww / 2;
    s += svg`<rect x="${w0 - 3}" y="15" width="${ww + 6}" height="44" fill="#090606"/><rect x="${w0}" y="18" width="${ww}" height="38" fill="${lit ? '#3e2215' : '#0e0b0b'}"/>`;
    if (lit) {
      for (let i = 0; i < 2; i += 1) s += svg`<circle cx="${w0 + 6 + rs() * (ww - 12)}" cy="${24 + rs() * 26}" r="${5 + rs() * 7}" fill="url(#${u}g)"/>`; // bokeh
      const wave = pd`M${cx - 18} 38q4.5 -7 9 0t9 0t9 0t9 0`;
      s += `<g fill="none" stroke="${neon}" stroke-linecap="round"><path d="${wave}" stroke-width="5" stroke-opacity=".28"/><path d="${wave}" stroke-width="1.6"/></g>`;
    }
    s += svg`<path d="M${cx} 18V56M${w0} 32H${w1}" stroke="#090606" stroke-width="2"/>`;
  }
  list.forEach((d, i) => { s += door(d, xs[i], u); });
  s += `<rect width="320" height="240" fill="url(#${u}v)"/>`;

  // place everyone: front of the line (index 0) at the door; on a tight corner, step on until rings clear
  const place = (p, d) => {
    const [px, py, tx, ty] = along(path, d);
    const k = K(py), r = q(p.r * k), w = q(p.w * k);
    const off = (Math.sin(d / 23 + ph) * 1.3 + p.jx * 2) * k * tx * tx; // sideways sway on the straight runs only
    const x = q(px - ty * off), y = q(py + tx * off + p.jy * .8 * k);
    return { ...p, k, r, w, x, y, tx, ty, hx: q(x + p.lean * k), hy: q(y - 5.2 * k), ring: r + 1 + .5 * k };
  };
  const fig = [];
  for (let i = 0, d = 0; i < n; i += 1) {
    const last = fig[i - 1];
    let me = place(ppl[i], d);
    for (let t = 0; t < 8 && last && Math.hypot(me.hx - last.hx, me.hy - last.hy) < me.ring + last.ring + .4; t += 1) me = place(ppl[i], d += 1);
    fig.push(me);
    d += ppl[i].step * squeeze;
  }

  // ground shadow under the line, one stroke per depth band so it widens toward the camera
  const bands = [];
  fig.forEach(({ x, y, k }, i) => {
    let b = bands[bands.length - 1];
    if (!b || k > b.k * 1.18) { b = { k, pts: b ? [b.pts[b.pts.length - 1]] : [] }; bands.push(b); }
    if (i % 4 === 0 || i === n - 1 || !b.pts.length) b.pts.push([x, y + 3.4 * k]);
  });
  if (n) s += `<g fill="none" stroke="#000" stroke-linecap="round" opacity=".45" filter="url(#${u}h)">${bands.map((b) => `<path d="M${b.pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' ')}" stroke-width="${f(7 * b.k)}"/>`).join('')}</g>`;

  let crowd = '';
  const badges = [];
  fig.forEach((p, i) => {
    const { k, r, w, x, y, hx, hy, ring } = p;
    const [a, c, e] = [q(3 * k), q(6.2 * k), q(1.8 * k)]; // shoulders: base offset, height, belly
    let g = svg`<g class="head${i < marked ? ' is-marked' : ''}${i === fresh ? ' is-new' : ''}" style="--i:${String(i)}"${p.tone === TONES[0] ? '' : ` fill="${p.tone}"`}>`
      + svg`<path d="${pd`M${x - w} ${y + a}q0 ${-c} ${w} ${-c}t${w} ${c}q${-w} ${e} ${-2 * w} 0`}"/><circle cx="${hx}" cy="${hy}" r="${r}"/>`;
    if (i < marked) {
      // badge grows with depth (number >= 11 units from the middle rows on). First choice: on the person's own shoulders,
      // just under the ring, which no neighbour uses; else off the head, away from the line's run (outward on vertical
      // stretches). It takes the first spot clear of every head and earlier badge, so marks stay put as the count grows.
      const fs = Math.round(6.6 + 3.4 * k), br = (i < 9 ? .56 : .64) * fs; // one digit or two
      let nx = p.ty, ny = -p.tx;
      if (ny > 0) { nx = -nx; ny = -ny; }
      if (ny > -.45) { nx = x < 160 ? -.95 : .95; ny = -.3; }
      const dirs = [[nx, ny], ...[0, 30, -30, 60, -60, 90, -90, 120, -120].map((deg) => [Math.sin(deg * Math.PI / 180), -Math.cos(deg * Math.PI / 180)])];
      const spots = [[0, 1, .05 * br], ...[0, .5, 1, 1.5].flatMap((more) => dirs.map(([ux, uy]) => [ux, uy, more * br]))]
        .map(([ux, uy, more]) => [Math.round(Math.min(319 - br, Math.max(br + 1, hx + ux * (ring + .5 * br + more)))), Math.round(Math.min(239 - br, Math.max(br + 1, hy + uy * (ring + .5 * br + more))))]);
      // when nothing is clear, lean on people ahead in the line (drawn earlier, so the badge stays on top)
      const clash = ([sx, sy]) => fig.reduce((o, h, j) => o + (j === i ? 0 : (j > i ? 3 : 1) * Math.max(0, br + h.r + 1 - Math.hypot(sx - h.hx, sy - h.hy))), 0)
        + badges.reduce((o, [bx, by, bb]) => o + 2 * Math.max(0, br + bb + .5 - Math.hypot(sx - bx, sy - by)), 0);
      const [bx, by] = spots.find((sp) => clash(sp) === 0) ?? spots.reduce((best, sp) => (clash(sp) < clash(best) ? sp : best));
      badges.push([bx, by, br]);
      // white stroke for the ring; on the badge disc and its number it sits under the fill (paint-order), so it only pads
      g += svg`<g class="mark" stroke="#fff"><circle cx="${hx}" cy="${hy}" r="${ring}" fill="none"/>`
        + (i === fresh ? svg`<circle cx="${hx}" cy="${hy}" r="${ring + 2 + k}" fill="none" stroke-opacity=".45" stroke-width=".8"/>` : '')
        + svg`<circle cx="${bx}" cy="${by}" r="${Math.round(br - .6)}" fill="#fff"/><text x="${bx}" y="${Math.round(by + .35 * fs)}" font-size="${fs}">${String(i + 1)}</text></g>`;
    }
    crowd += g + '</g>';
  });
  // rim light: a top-lit gradient stroke, painted under each fill so only a thin outer edge shows
  s += `<g fill="${TONES[0]}" stroke="url(#${u}r)" stroke-width="1.2" paint-order="stroke" font-family="system-ui" font-weight="700" text-anchor="middle">${crowd}</g>`;
  
  return s + '</svg>';
}
