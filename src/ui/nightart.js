/* Placeholder "night photo" for a bar: drawn SVG, no external images, not a likeness of any real venue.
   Final (2026-10-17): adds facade variants (grid / arch / wide windows), an optional blade sign and
   string lights, and darker upper floors so the lit storefront carries the frame in square crops.
   Built to sit in the same slot (and under the same scrims) as a licensed photo later:
   depth haze, lit windows, a neon tube with bloom, a lit door with a short line outside,
   wet-pavement reflection, foreground bokeh, vignette and film grain. */
// Ported from the design study's reference (design/final/src/art.js) as an ES module.
function rng(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}
const P = {
  amber:  { sky: ['#07070b', '#130e0a'], wall: ['#211913', '#0c0907'], win: '#ffc978', neon: '#ff9a3d', trim: '#3a2a1c' },
  rose:   { sky: ['#08060b', '#150a11'], wall: ['#21131a', '#0b0609'], win: '#ffcaa8', neon: '#ff4f86', trim: '#3a1f2b' },
  cyan:   { sky: ['#04070b', '#0a1218'], wall: ['#13202a', '#060a0d'], win: '#bfe3f7', neon: '#3ccfff', trim: '#1d3340' },
  violet: { sky: ['#06050d', '#100b1b'], wall: ['#1a1526', '#08060d'], win: '#ffd7a0', neon: '#a48bff', trim: '#2c2442' },
  green:  { sky: ['#040806', '#0a130e'], wall: ['#13201a', '#060a08'], win: '#ffe1a0', neon: '#3ff0a3', trim: '#1d3a2c' },
  red:    { sky: ['#0b0505', '#170a08'], wall: ['#241411', '#0d0605'], win: '#ffcf8a', neon: '#ff4a36', trim: '#43201a' },
  gold:   { sky: ['#080705', '#15110a'], wall: ['#221c12', '#0c0a06'], win: '#fff0c2', neon: '#ffd24a', trim: '#43381c' },
};

function person(x, base, h, fill, rim, w = 1) {
  const top = base - h;
  const sh = 19 * w;
  return `<g><circle cx="${x}" cy="${top + 11}" r="${10.5 * w}" fill="${fill}"/>` +
    `<path d="M${x - sh} ${base}C${x - sh} ${top + 52} ${x - sh * .7} ${top + 27} ${x} ${top + 27}S${x + sh} ${top + 52} ${x + sh} ${base}Z" fill="${fill}"/>` +
    `<path d="M${x + 7 * w} ${top + 3}a10.5 10.5 0 0 1 0 17M${x + sh * .55} ${top + 30}C${x + sh * .9} ${top + 40} ${x + sh} ${top + 55} ${x + sh} ${base}" fill="none" stroke="${rim}" stroke-opacity=".45" stroke-width="1.4"/></g>`;
}

function art(id, pal = 'amber', opts = {}) {
  const p = P[pal] || P.amber;
  const r = rng(id + pal);
  const u = 'a' + id.replace(/[^a-z0-9]/gi, '');
  const motif = opts.motif || ['tube', 'script', 'ring', 'bars'][Math.floor(r() * 4)];
  const awning = opts.awning ?? r() > 0.5;
  const win = opts.win || ['grid', 'arch', 'wide'][Math.floor(r() * 3)];
  const blade = opts.blade ?? r() > 0.6;
  const lights = opts.lights ?? r() > 0.55;
  const cols = opts.cols || (r() > 0.5 ? 3 : 4);
  const par = opts.par || 'xMidYMid slice';
  const vb = opts.vb || '50 125 300 375';
  const top = 64 + Math.floor(r() * 26);
  const x0 = 22, x1 = 378;
  let s = `<svg width="${vb.split(' ')[2] * 2}" height="${vb.split(' ')[3] * 2}" viewBox="${vb}" preserveAspectRatio="${par}" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><defs>
    <linearGradient id="${u}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[0]}"/><stop offset="1" stop-color="${p.sky[1]}"/></linearGradient>
    <linearGradient id="${u}w" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${p.wall[1]}"/><stop offset=".45" stop-color="${p.wall[0]}"/><stop offset="1" stop-color="${p.wall[1]}"/></linearGradient>
    <linearGradient id="${u}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.win}" stop-opacity=".55"/><stop offset=".6" stop-color="${p.win}"/><stop offset="1" stop-color="${p.win}" stop-opacity=".8"/></linearGradient>
    <linearGradient id="${u}in" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.neon}" stop-opacity=".35"/><stop offset=".5" stop-color="${p.win}" stop-opacity=".75"/><stop offset="1" stop-color="${p.win}" stop-opacity=".25"/></linearGradient>
    <linearGradient id="${u}st" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d0d0d"/><stop offset="1" stop-color="#020202"/></linearGradient>
    <linearGradient id="${u}hz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".72"/><stop offset=".72" stop-color="#000" stop-opacity=".36"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
    <radialGradient id="${u}v" cx=".5" cy=".42" r=".78"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".8"/></radialGradient>
    <filter id="${u}b1" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.1"/></filter>
    <filter id="${u}b3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="${u}b8" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="8"/></filter>
    <filter id="${u}b18" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="18"/></filter>
    <filter id="${u}n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${Math.floor(r() * 99)}" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 .9"/></feComponentTransfer></filter>
  </defs>`;
  // sky + distant skyline haze
  s += `<rect width="400" height="500" fill="url(#${u}s)"/>`;
  let bx = -10;
  let far = '';
  while (bx < 410) {
    const bw = 50 + r() * 70, bh = 120 + r() * 140;
    far += `<rect x="${bx}" y="${top - 60 - bh * .3}" width="${bw}" height="${bh + 200}" fill="#0b0b0e" opacity=".9"/>`;
    for (let i = 0; i < 4; i++) if (r() > .45) far += `<rect x="${bx + 8 + r() * (bw - 16)}" y="${top - 50 - bh * .3 + r() * 70}" width="3" height="4" fill="${p.win}" opacity="${.25 + r() * .4}"/>`;
    bx += bw + 2;
  }
  s += `<g filter="url(#${u}b1)">${far}</g>`;
  s += `<ellipse cx="200" cy="${top}" rx="260" ry="60" fill="${p.neon}" opacity=".07" filter="url(#${u}b18)"/>`;
  // facade
  s += `<rect x="${x0}" y="${top}" width="${x1 - x0}" height="${500 - top}" fill="url(#${u}w)"/>`;
  s += `<rect x="${x0 - 8}" y="${top - 8}" width="${x1 - x0 + 16}" height="12" fill="${p.trim}"/><rect x="${x0 - 8}" y="${top + 4}" width="${x1 - x0 + 16}" height="3" fill="#000" opacity=".5"/>`;
  // brick courses (very faint)
  for (let y = top + 18; y < 300; y += 9) s += `<path d="M${x0} ${y}H${x1}" stroke="#000" stroke-opacity=".22" stroke-width="1"/>`;
  // upper windows (variant: grid panes, arched tops, or one wide band per floor)
  const ww = cols === 3 ? 66 : 50, wh = 76, gap = ((x1 - x0) - cols * ww) / (cols + 1);
  const shape = (x, y, w, h) => win === 'arch'
    ? `M${x} ${y + h}V${y + w / 2}a${w / 2} ${w / 2} 0 0 1 ${w} 0V${y + h}Z`
    : `M${x} ${y}h${w}v${h}h${-w}Z`;
  for (let row = 0; row < 2; row++) {
    const y = top + 26 + row * 104;
    const panes = win === 'wide' ? [[x0 + 26, x1 - x0 - 52]] : Array.from({ length: cols }, (_, c) => [x0 + gap + c * (ww + gap), ww]);
    for (const [x, w] of panes) {
      const lit = win === 'wide' ? r() > .25 : r() > .35;
      s += `<rect x="${x - 4}" y="${y - 6}" width="${w + 8}" height="6" fill="${p.trim}" opacity=".9"/>`;
      if (lit) {
        s += `<rect x="${x - 10}" y="${y - 6}" width="${w + 20}" height="${wh + 16}" fill="${p.win}" opacity=".18" filter="url(#${u}b8)"/>`;
        s += `<path d="${shape(x, y, w, wh)}" fill="url(#${u}g)"/>`;
        const people = win === 'wide' ? 3 : (r() > .45 ? 1 : 0);
        for (let k = 0; k < people; k++) { const px = x + w * (.15 + r() * .7); s += `<g opacity=".55" filter="url(#${u}b3)">${person(px, y + wh, 52, '#1a120c', p.win, .8)}</g>`; }
        s += `<rect x="${x}" y="${y}" width="${w}" height="${wh * .38}" fill="#000" opacity=".18"/>`;
      } else {
        s += `<path d="${shape(x, y, w, wh)}" fill="#050506"/><path d="M${x + 6} ${y + wh - 8}L${x + Math.min(w, 60) - 10} ${y + 10}" stroke="#fff" stroke-opacity=".05" stroke-width="10"/>`;
      }
      const mull = win === 'wide' ? Array.from({ length: 5 }, (_, i) => `M${x + (w / 6) * (i + 1)} ${y}V${y + wh}`).join('') : `M${x + w / 2} ${y + (win === 'arch' ? w / 2 : 0)}V${y + wh}M${x} ${y + wh * .55}H${x + w}`;
      s += `<path d="${mull}" stroke="#0b0806" stroke-width="3"/><path d="${shape(x, y, w, wh)}" fill="none" stroke="${p.trim}" stroke-width="3"/>`;
    }
  }
  s += `<rect x="0" y="0" width="400" height="300" fill="url(#${u}hz)"/>`;
  // sign band + neon
  const sy = 300;
  s += `<rect x="${x0}" y="${sy}" width="${x1 - x0}" height="40" fill="#070707"/><rect x="${x0}" y="${sy + 38}" width="${x1 - x0}" height="3" fill="${p.trim}"/>`;
  let tube = '';
  if (motif === 'tube') tube = `<rect x="120" y="${sy + 9}" width="160" height="22" rx="11" fill="none"/>`;
  else if (motif === 'script') tube = `<path d="M118 ${sy + 26}c14-22 26-22 30 0s16 22 30 0 26-22 30 0 16 22 30 0 26-22 30 0 14 18 26 6" fill="none"/>`;
  else if (motif === 'ring') tube = `<circle cx="200" cy="${sy + 20}" r="13" fill="none"/><path d="M128 ${sy + 20}H176M224 ${sy + 20}H272" fill="none"/>`;
  else tube = `<path d="M130 ${sy + 12}H270M150 ${sy + 20}H250M130 ${sy + 28}H270" fill="none"/>`;
  s += `<g stroke="${p.neon}" stroke-linecap="round" stroke-linejoin="round">
    <g stroke-width="14" opacity=".55" filter="url(#${u}b8)">${tube}</g>
    <g stroke-width="5" opacity=".9" filter="url(#${u}b3)">${tube}</g>
    <g stroke-width="2.2" stroke="#fff" stroke-opacity=".92">${tube}</g></g>`;
  s += `<ellipse cx="200" cy="${sy + 22}" rx="150" ry="46" fill="${p.neon}" opacity=".2" filter="url(#${u}b18)"/>`;
  // awning
  if (awning) {
    s += `<path d="M${x0 - 4} ${sy + 41}H${x1 + 4}L${x1 - 10} ${sy + 60}H${x0 + 10}Z" fill="${p.trim}"/>`;
    for (let i = 0; i < 9; i++) s += `<path d="M${x0 + 6 + i * 40} ${sy + 41}h20l-2 19h-16Z" fill="#000" opacity=".35"/>`;
  }
  // blade sign: a vertical neon on a bracket, projecting from the facade
  if (blade) {
    const bx = r() > .5 ? x0 + 8 : x1 - 34, by = sy - 118;
    s += `<path d="M${bx + 13} ${by - 8}V${by}" stroke="${p.trim}" stroke-width="3"/><rect x="${bx}" y="${by}" width="26" height="96" rx="5" fill="#060606" stroke="${p.trim}" stroke-width="2"/>`;
    const bar = `<path d="M${bx + 13} ${by + 14}V${by + 82}" fill="none"/><circle cx="${bx + 13}" cy="${by + 48}" r="6" fill="none"/>`;
    s += `<g stroke="${p.neon}" stroke-linecap="round"><g stroke-width="10" opacity=".5" filter="url(#${u}b8)">${bar}</g><g stroke-width="4" opacity=".9" filter="url(#${u}b3)">${bar}</g><g stroke-width="1.8" stroke="#fff" stroke-opacity=".9">${bar}</g></g>`;
  }
  // storefront: two windows + lit door
  const gy = sy + (awning ? 60 : 44), gh = 440 - gy;
  const doorX = 172 + (r() - .5) * 40;
  const panes = [[x0 + 14, doorX - 12 - (x0 + 14)], [doorX + 68, x1 - 14 - (doorX + 68)]];
  for (const [px, pw] of panes) {
    s += `<rect x="${px}" y="${gy}" width="${pw}" height="${gh}" fill="url(#${u}in)"/>`;
    for (let i = 0; i < 5; i++) s += `<circle cx="${px + r() * pw}" cy="${gy + 8 + r() * 26}" r="${3 + r() * 6}" fill="${p.win}" opacity="${.4 + r() * .5}" filter="url(#${u}b3)"/>`;
    for (let i = 0; i < 3; i++) s += `<g opacity=".8" filter="url(#${u}b3)">${person(px + 14 + r() * (pw - 28), gy + gh + 6, 46 + r() * 16, '#120c09', p.win, .75)}</g>`;
    s += `<rect x="${px}" y="${gy}" width="${pw}" height="${gh}" fill="none" stroke="${p.trim}" stroke-width="4"/>`;
  }
  s += `<rect x="${doorX}" y="${gy - 6}" width="56" height="${gh + 6}" fill="${p.win}" opacity=".9"/><rect x="${doorX}" y="${gy - 6}" width="56" height="${gh + 6}" fill="url(#${u}in)"/>`;
  s += `<rect x="${doorX - 18}" y="${gy - 20}" width="92" height="${gh + 40}" fill="${p.win}" opacity=".25" filter="url(#${u}b18)"/>`;
  s += `<rect x="${doorX}" y="${gy - 6}" width="56" height="${gh + 6}" fill="none" stroke="#000" stroke-width="5"/>`;
  // string lights across the storefront
  if (lights) {
    const ly = gy + 4;
    let dots = '';
    for (let i = 0; i <= 18; i++) {
      const t = i / 18, x = x0 + 10 + t * (x1 - x0 - 20), y = ly + Math.sin(t * Math.PI * 3) ** 2 * 10;
      dots += `<circle cx="${x}" cy="${y}" r="2.2" fill="#fff6dc"/>`;
    }
    s += `<g filter="url(#${u}b3)" opacity=".85">${dots}</g><g opacity=".9">${dots}</g>`;
  }
  // sidewalk + wet reflection
  s += `<rect x="0" y="440" width="400" height="60" fill="url(#${u}st)"/>`;
  s += `<ellipse cx="${doorX + 28}" cy="462" rx="70" ry="16" fill="${p.win}" opacity=".35" filter="url(#${u}b8)"/>`;
  s += `<ellipse cx="200" cy="470" rx="150" ry="14" fill="${p.neon}" opacity=".22" filter="url(#${u}b8)"/>`;
  for (let i = 0; i < 7; i++) s += `<rect x="${130 + r() * 140}" y="${446 + r() * 40}" width="${8 + r() * 30}" height="1.6" fill="${p.neon}" opacity="${.2 + r() * .3}" filter="url(#${u}b1)"/>`;
  // the line outside
  const n = opts.line ?? (2 + Math.floor(r() * 4));
  let line = '';
  for (let i = 0; i < n; i++) {
    const x = doorX + 86 + i * (30 + r() * 8);
    line += person(x, 512, 104 + r() * 22, '#030303', p.neon, 1 + r() * .12);
  }
  s += `<g filter="url(#${u}b1)">${line}</g>`;
  // foreground bokeh
  for (let i = 0; i < 9; i++) {
    const left = r() > .5;
    const cx = left ? r() * 90 : 310 + r() * 90, cy = 40 + r() * 420, rr = 6 + r() * 22;
    s += `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="${r() > .5 ? p.neon : p.win}" opacity="${.08 + r() * .22}" filter="url(#${u}b3)"/>`;
  }
  s += `<rect width="400" height="500" fill="url(#${u}v)"/>`;
  s += `<rect width="400" height="500" filter="url(#${u}n)" opacity=".16" style="mix-blend-mode:overlay"/>`;
  return s + '</svg>';
}

export { art as nightArt, P as NIGHT_PALETTES };
