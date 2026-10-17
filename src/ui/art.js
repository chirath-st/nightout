// Original, code-drawn venue illustrations (SVG). These are placeholders, not photographs of any
// real place; the detail view captions them "Illustration — not a photo". No raster generation.

function rng(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const MOTIFS = {
  lamps(c, r) {
    let s = `<rect x="0" y="86" width="160" height="34" fill="${c[3]}"/><rect x="0" y="84" width="160" height="4" fill="${c[2]}" opacity=".25"/>`;
    for (let i = 0; i < 3; i += 1) {
      const x = 32 + i * 48 + (r() - 0.5) * 8;
      const y = 34 + r() * 16;
      s += `<path d="M${x} 0V${y - 8}" stroke="${c[2]}" stroke-opacity=".5" stroke-width="1.2"/>`;
      s += `<circle cx="${x}" cy="${y + 4}" r="22" fill="${c[1]}" opacity=".10"/><circle cx="${x}" cy="${y + 4}" r="13" fill="${c[1]}" opacity=".18"/>`;
      s += `<path d="M${x - 9} ${y + 2}h18l-4-10h-10Z" fill="${c[1]}"/>`;
    }
    for (let i = 0; i < 6; i += 1) {
      const x = 12 + i * 26;
      s += `<rect x="${x}" y="70" width="6" height="16" rx="2" fill="${c[2]}" opacity=".55"/>`;
    }
    return s;
  },
  stripes(c, r) {
    let s = '';
    for (let i = -6; i < 16; i += 1) s += `<path d="M${i * 16} 0l40 120h8L${i * 16 + 8} 0Z" fill="${i % 2 ? c[1] : c[3]}" opacity="${i % 2 ? 0.85 : 1}"/>`;
    s += `<rect x="0" y="78" width="160" height="42" fill="${c[0]}" opacity=".88"/>`;
    s += `<circle cx="${110 + r() * 20}" cy="98" r="10" fill="${c[2]}" opacity=".9"/><circle cx="${70 + r() * 16}" cy="101" r="7" fill="${c[1]}"/>`;
    return s;
  },
  arches(c) {
    let s = `<rect x="0" y="96" width="160" height="24" fill="${c[3]}"/>`;
    for (let i = 0; i < 3; i += 1) {
      const x = 14 + i * 48;
      s += `<path d="M${x} 96V48a20 20 0 0 1 40 0v48Z" fill="${c[1]}" opacity=".9"/>`;
      s += `<path d="M${x + 6} 96V50a14 14 0 0 1 28 0v46Z" fill="${c[3]}"/>`;
      s += `<path d="M${x + 20} 36v60" stroke="${c[1]}" stroke-width="2" opacity=".6"/>`;
    }
    return s;
  },
  waves(c, r) {
    let s = '';
    for (let i = 0; i < 7; i += 1) {
      const y = 30 + i * 14;
      const a = 6 + r() * 6;
      s += `<path d="M0 ${y} Q20 ${y - a} 40 ${y} T80 ${y} T120 ${y} T160 ${y} V120 H0Z" fill="${i % 2 ? c[1] : c[3]}" opacity="${0.35 + i * 0.09}"/>`;
    }
    s += `<circle cx="124" cy="26" r="9" fill="${c[2]}" opacity=".85"/>`;
    return s;
  },
  embers(c, r) {
    let s = `<rect x="0" y="92" width="160" height="28" fill="${c[3]}"/>`;
    s += `<path d="M30 92a50 50 0 0 1 100 0Z" fill="${c[1]}" opacity=".22"/><path d="M48 92a32 32 0 0 1 64 0Z" fill="${c[1]}" opacity=".4"/><path d="M64 92a16 16 0 0 1 32 0Z" fill="${c[1]}"/>`;
    for (let i = 0; i < 18; i += 1) s += `<circle cx="${20 + r() * 120}" cy="${10 + r() * 70}" r="${0.8 + r() * 1.8}" fill="${c[2]}" opacity="${0.4 + r() * 0.5}"/>`;
    return s;
  },
  grid(c, r) {
    let s = `<rect x="18" y="18" width="124" height="102" rx="3" fill="${c[3]}"/>`;
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 6; x += 1) {
        const lit = r() > 0.55;
        s += `<rect x="${26 + x * 19}" y="${26 + y * 18}" width="12" height="11" rx="1.5" fill="${lit ? c[1] : c[0]}" opacity="${lit ? 0.95 : 0.6}"/>`;
      }
    }
    return s;
  },
  moon(c, r) {
    let s = `<circle cx="112" cy="34" r="16" fill="${c[1]}"/><circle cx="104" cy="28" r="15" fill="${c[0]}"/>`;
    for (let i = 0; i < 14; i += 1) s += `<circle cx="${r() * 160}" cy="${r() * 60}" r="${0.6 + r()}" fill="${c[2]}" opacity=".7"/>`;
    let x = 0;
    let path = 'M0 120V84';
    while (x < 160) {
      const w = 14 + r() * 18;
      const h = 70 + r() * 26;
      path += `H${x}V${h}H${x + w}`;
      x += w;
    }
    s += `<path d="${path}V120Z" fill="${c[3]}"/>`;
    return s;
  },
};

export function venueArt(venue, { title = true } = {}) {
  const c = venue.palette ?? ['#23262D', '#9AA3B2', '#E6E8EC', '#30343C'];
  const r = rng(venue.id);
  const draw = MOTIFS[venue.art] ?? MOTIFS.grid;
  const t = title ? `<title>Illustration for ${venue.name} (not a photo)</title>` : '';
  const a11y = title ? 'role="img"' : 'aria-hidden="true" focusable="false"';
  return `<svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice" ${a11y}>${t}<rect width="160" height="120" fill="${c[0]}"/>${draw(c, r)}</svg>`;
}

/* ---------- Bar card artwork: a code-drawn night storefront per venue ---------- */
let artSeq = 0; // unique gradient ids when the same venue is drawn twice on a page

/**
 * Original illustration of a generic bar front at night, varied per venue (brick tone, lit windows,
 * awning, neon sign color). It is not a picture of the real place. If the team later gets permission to
 * use a venue's real photo, set `venue.photo` (a local path) and it replaces this.
 */
/** `anchor: 'bottom'` keeps the storefront (door, awning) in wide crops such as the card's 4:3 photo slot. */
export function facadeArt(venue, { title = false, anchor = 'middle' } = {}) {
  const c = venue.palette ?? ['#23262D', '#9AA3B2', '#E6E8EC', '#30343C'];
  const r = rng(`${venue.id}-facade`);
  const id = `fa${(artSeq += 1)}`;
  const neon = c[1];
  const t = title ? `<title>Illustration for ${venue.name} (not a photo)</title>` : '';
  const a11y = title ? 'role="img"' : 'aria-hidden="true" focusable="false"';
  let s = `<svg viewBox="0 0 200 240" preserveAspectRatio="xMid${anchor === 'bottom' ? 'YMax' : 'YMid'} slice" ${a11y}>${t}
    <defs>
      <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05060A"/><stop offset="1" stop-color="${c[3]}"/></linearGradient>
      <radialGradient id="${id}g" cx=".5" cy="0" r="1"><stop offset="0" stop-color="${neon}" stop-opacity=".55"/><stop offset="1" stop-color="${neon}" stop-opacity="0"/></radialGradient>
      <linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD9A0"/><stop offset="1" stop-color="${neon}"/></linearGradient>
    </defs>
    <rect width="200" height="240" fill="url(#${id}s)"/>`;
  for (let i = 0; i < 16; i += 1) s += `<circle cx="${(r() * 200).toFixed(1)}" cy="${(r() * 46).toFixed(1)}" r="${(0.4 + r() * 0.8).toFixed(2)}" fill="#fff" opacity="${(0.3 + r() * 0.5).toFixed(2)}"/>`;
  // building
  const top = 34 + Math.round(r() * 14);
  s += `<rect x="10" y="${top}" width="180" height="${206 - top}" fill="${c[0]}"/>`;
  s += `<rect x="10" y="${top}" width="180" height="7" fill="${c[3]}"/>`;
  for (let y = top + 12; y < 150; y += 7) s += `<path d="M10 ${y}H190" stroke="#000" stroke-opacity=".12" stroke-width="1"/>`;
  // upper windows
  const cols = 3 + Math.round(r());
  const w = (150 - (cols - 1) * 14) / cols;
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = 25 + col * (w + 14);
      const y = top + 18 + row * 40;
      const lit = r() > 0.4;
      s += `<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="28" rx="2" fill="${lit ? `url(#${id}w)` : '#0C0E13'}" opacity="${lit ? 0.92 : 1}"/>`;
      s += `<path d="M${(x + w / 2).toFixed(1)} ${y}V${y + 28}" stroke="${c[0]}" stroke-width="2"/>`;
    }
  }
  // neon sign
  const sx = 46 + Math.round(r() * 18);
  s += `<rect x="${sx}" y="146" width="${200 - sx * 2}" height="16" rx="8" fill="none" stroke="${neon}" stroke-width="5" opacity=".28"/>`;
  s += `<rect x="${sx}" y="146" width="${200 - sx * 2}" height="16" rx="8" fill="none" stroke="${neon}" stroke-width="1.8"/>`;
  s += `<path d="M${sx + 10} 154H${200 - sx - 10}" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="${(4 + r() * 6).toFixed(1)} 4" opacity=".9"/>`;
  // awning + storefront
  s += `<path d="M14 168H186L180 178H20Z" fill="${neon}"/><path d="M14 168H186L180 178H20Z" fill="#000" opacity=".25"/>`;
  s += `<rect x="22" y="178" width="156" height="28" fill="#0B0D12"/>`;
  s += `<rect x="28" y="182" width="56" height="24" rx="2" fill="url(#${id}w)" opacity=".85"/><rect x="116" y="182" width="56" height="24" rx="2" fill="url(#${id}w)" opacity=".85"/>`;
  s += `<rect x="90" y="182" width="20" height="24" rx="2" fill="#15171E"/><circle cx="106" cy="195" r="1.2" fill="${c[2]}"/>`;
  // sidewalk + glow
  s += `<rect y="206" width="200" height="34" fill="#0A0B0F"/><ellipse cx="100" cy="208" rx="92" ry="16" fill="url(#${id}g)"/>`;
  s += `<path d="M0 206H200" stroke="${c[2]}" stroke-opacity=".18"/>`;
  return `${s}</svg>`;
}

/** Initials badge in place of a bar's logo (real logos need the bar's permission). */
export function monogram(venue) {
  const STOP = new Set(['the', 'and', 'of', 'on', 'at', 'n']);
  const words = venue.name.replace(/['’]s\b/gi, '').split(/[\s'’&]+/).filter((w) => /^[A-Za-z]/.test(w) && !STOP.has(w.toLowerCase()));
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
}
