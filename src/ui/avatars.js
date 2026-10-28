// Illustrated people for the demo (team ask, 2026-10-17: "profile pictures of anyone inside the group ... so people
// could see the vibe"). Original flat portraits drawn in code from a seed: never photos, never real people. Simple dot
// eyes and no detailed faces, so nobody is depicted. Cached as data: URIs (the CSP allows img-src data:).
import { esc } from './components.js';

const SKIN = ['#F3CDB0', '#E7B48F', '#D29A72', '#B97C56', '#94603F', '#6E4430', '#4E2F22'];
const HAIR = ['#17120F', '#2C1D15', '#4A2E1D', '#71472A', '#A26B3B', '#D2A86A', '#9A9A9A', '#C2557A', '#4062B5'];
const SHIRT = ['#E9E6DF', '#1F1F22', '#7A2B33', '#2F4D6B', '#5A6B3A', '#C9893C', '#6E4B87', '#2E7F74', '#B5443B', '#D9D2C4'];
const BG = ['#2A2E38', '#33291F', '#1F3229', '#33233A', '#2B3240', '#3A3024', '#24343A', '#3A2428'];
const STYLES = ['short', 'long', 'curly', 'bun', 'buzz', 'bob', 'side', 'afro', 'waves', 'cap'];

/** Small seeded PRNG (mulberry32 over an FNV-1a hash of the seed). */
function rng(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => {
    h = (h + 0x6D2B79F5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, list, weights) => {
  if (!weights) return list[Math.floor(r() * list.length)];
  let x = r() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i += 1) { x -= weights[i]; if (x <= 0) return list[i]; }
  return list[list.length - 1];
};

/** Hair drawn behind the head (long styles), then in front (fringe / top). */
function hairParts(style, c) {
  switch (style) {
    case 'long': return [`<path d="M18.5 30c0-12 6-18.5 13.5-18.5S45.5 18 45.5 30v17c-3.5 2.5-7 2.5-9 0V31H27.5v16c-2 2.5-5.5 2.5-9 0Z" fill="${c}"/>`, `<path d="M20.5 27c.5-9 5.5-14 11.5-14s11 5 11.5 14c-3-4.5-7-6.5-11.5-6.5S23.5 22.5 20.5 27Z" fill="${c}"/>`];
    case 'bob': return [`<path d="M19 30c0-11 5.5-17.5 13-17.5S45 19 45 30v8c-2.5 2-5 2-7 0V30H26v8c-2 2-4.5 2-7 0Z" fill="${c}"/>`, `<path d="M20.5 26.5c1-8.5 5.5-13 11.5-13s10.5 4.5 11.5 13c-4-3-7-4-11.5-4s-7.5 1-11.5 4Z" fill="${c}"/>`];
    case 'curly': return ['', `<g fill="${c}">${[[22, 22], [26, 17.5], [32, 15.5], [38, 17.5], [42, 22], [20.5, 27], [43.5, 27], [29, 16], [35, 16]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.6"/>`).join('')}</g>`];
    case 'afro': return [`<circle cx="32" cy="24" r="15.5" fill="${c}"/>`, ''];
    case 'bun': return ['', `<circle cx="32" cy="11.5" r="5" fill="${c}"/><path d="M20.5 27c.5-9 5.5-14 11.5-14s11 5 11.5 14c-3-4.5-7-6.5-11.5-6.5S23.5 22.5 20.5 27Z" fill="${c}"/>`];
    case 'buzz': return ['', `<path d="M21 26.5c.5-8 5-12.5 11-12.5s10.5 4.5 11 12.5c-3.5-3-7-4-11-4s-7.5 1-11 4Z" fill="${c}" opacity=".85"/>`];
    case 'side': return ['', `<path d="M20.5 28c-.5-9.5 5-15.5 12-15.5 6.5 0 11.5 5 11 13.5-5-1-11-4-14.5-8.5-1.5 4-4.5 8-8.5 10.5Z" fill="${c}"/>`];
    case 'waves': return ['', `<path d="M20 28c-1-10 5-16 12-16s13 6 12 16c-1.5-2-3-3-4.5-3-1.5-2.5-4-3.5-7.5-3.5s-6 1-7.5 3.5c-1.5 0-3 1-4.5 3Z" fill="${c}"/>`];
    case 'cap': return ['', `<path d="M20.5 24.5c.5-7 5.5-11.5 11.5-11.5s11 4.5 11.5 11.5Z" fill="${c}"/><path d="M19 24.5h30c0 2-1.5 3-4 3H20.5c-1 0-1.5-1.5-1.5-3Z" fill="${c}"/>`];
    default: return ['', `<path d="M20.5 26.5c.5-9 5.5-14 11.5-14s11 5 11.5 14c-3-4-6.5-5.5-11.5-5.5s-8.5 1.5-11.5 5.5Z" fill="${c}"/>`];
  }
}

function portrait(seed) {
  const r = rng(seed);
  const skin = pick(r, SKIN);
  const style = pick(r, STYLES);
  const hair = pick(r, HAIR, [6, 6, 5, 4, 3, 2, 1, 1, 1]);
  const capColor = pick(r, ['#1F1F22', '#7A2B33', '#2F4D6B', '#E9E6DF']);
  const shirt = pick(r, SHIRT);
  const bg = pick(r, BG);
  const glasses = r() < 0.22;
  const earring = r() < 0.25;
  const smile = r() < 0.7;
  const [back, front] = hairParts(style, style === 'cap' ? capColor : hair);
  const capHair = style === 'cap' ? `<path d="M21 26c0-2 1-3.5 2-4.5h18c1 1 2 2.5 2 4.5-3-1.5-7-2-11-2s-8 .5-11 2Z" fill="${hair}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <rect width="64" height="64" fill="${bg}"/>
    ${back}
    <path d="M9 64c1-12 10.5-18.5 23-18.5S54 52 55 64Z" fill="${shirt}"/>
    <path d="M27.5 39h9v8.5c-2.5 2-6.5 2-9 0Z" fill="${skin}"/>
    <path d="M27.5 43.5c3 1.2 6 1.2 9 0v1.5c-3 1.5-6 1.5-9 0Z" fill="#000" opacity=".12"/>
    <ellipse cx="20.8" cy="29.5" rx="2.2" ry="3" fill="${skin}"/><ellipse cx="43.2" cy="29.5" rx="2.2" ry="3" fill="${skin}"/>
    <ellipse cx="32" cy="28" rx="11.2" ry="13" fill="${skin}"/>
    ${capHair}${front}
    <ellipse cx="27.6" cy="29.6" rx="1.25" ry="1.5" fill="#1A1412"/><ellipse cx="36.4" cy="29.6" rx="1.25" ry="1.5" fill="#1A1412"/>
    ${smile ? '<path d="M29 35.4c1.8 1.6 4.2 1.6 6 0" fill="none" stroke="#5A2E25" stroke-width="1.3" stroke-linecap="round"/>' : '<path d="M29.6 35.8h4.8" stroke="#5A2E25" stroke-width="1.3" stroke-linecap="round"/>'}
    ${glasses ? '<g fill="none" stroke="#141414" stroke-width="1.2"><circle cx="27.6" cy="29.6" r="3.6"/><circle cx="36.4" cy="29.6" r="3.6"/><path d="M31.2 29.4h1.6"/></g>' : ''}
    ${earring ? '<circle cx="20.6" cy="33.6" r="1.1" fill="#E8C66A"/>' : ''}
  </svg>`;
}

const cache = new Map();
/** data: URI for a seed (cached). */
export function avatarSrc(seed) {
  if (!cache.has(seed)) cache.set(seed, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(portrait(seed).replace(/\s+/g, ' '))}`);
  return cache.get(seed);
}

/** A person's round picture: illustrated when they have a seed, initials otherwise (e.g. you, with no photo). */
export function personAvatar(person, size = 36, { cls = '' } = {}) {
  if (person.seed) return `<img class="avatar avatar-img${cls ? ` ${cls}` : ''}" style="--size:${size}px" src="${avatarSrc(person.seed)}" alt="" width="${size}" height="${size}" decoding="async">`;
  return `<span class="avatar${cls ? ` ${cls}` : ''}" style="--size:${size}px" aria-hidden="true">${esc(person.initials ?? '')}</span>`;
}
