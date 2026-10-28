// Navigation motion (QA plan 5.1–5.3), rebuilt for WebKit after a physical-iPhone report that the card-to-bar-page photo
// morph was laggy. The old version was a View Transition. It froze the screen while the new page rendered and eight
// snapshots were captured, then morphed the photo by animating its group's width and height on the main thread.
//
// Here every moving part is a transform or an opacity animation (Web Animations, cubic-bezier or keyword easing). The
// engine can hand those to the compositor: Core Animation on iOS, which keeps them smooth while the page's main thread
// is busy. The animations start in the same frame as the new page, and nothing waits for an image to decode: the photo
// that flies is a copy of the card's own image, which is already on screen.
//
// Pieces:
//   ghost   the old page's nodes, moved (not copied) into a fixed layer that fades out over the new page (drill-ins,
//           Scan). The photo flights skip it: re-layering a whole page cost WebKit a frame before anything moved.
//   fly     the photo travelling between a card and the bar page's hero: an outer clip box and an inner image, both
//           animated with sampled transform keyframes so the picture never stretches and the crop changes smoothly
//   enter   the new page's content fading or sliding in

const SAMPLES = 24;

/** cubic-bezier(x1, y1, x2, y2) as a function of progress (CSS timing semantics). */
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const x = (t) => ((ax * t + bx) * t + cx) * t;
  const y = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (p) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let t = p;
    for (let i = 0; i < 8; i += 1) { const e = x(t) - p; const d = dx(t); if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break; t -= e / d; }
    if (t < 0 || t > 1 || Math.abs(x(t) - p) > 1e-4) { let lo = 0, hi = 1; t = p; for (let i = 0; i < 30; i += 1) { if (x(t) < p) lo = t; else hi = t; t = (lo + hi) / 2; } }
    return y(t);
  };
}
/** A CSS <time> token's value in ms: "380ms", or "0.38s"/".38s" as the store build's minified CSS writes it. NaN if
 *  it isn't a time (a unitless number counts as ms, as the tokens are written). */
export function cssTimeMs(value) {
  const m = /^\s*(-?[\d.]+(?:e-?\d+)?)\s*(ms|s)?\s*$/i.exec(value ?? '');
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  return m[2]?.toLowerCase() === 's' ? n * 1000 : n;
}
/** "cubic-bezier(a, b, c, d)" (a CSS token's value) as a function; anything else falls back to a decelerating curve. */
export function easeFrom(css) {
  const m = /cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(css ?? '');
  return m ? bezier(...m.slice(1).map(Number)) : bezier(0.32, 0.72, 0, 1);
}

const box = (r) => ({ x: r.left, y: r.top, w: r.width, h: r.height });
const lerp = (a, b, t) => a + (b - a) * t;
const lerpRect = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) });
/** One object-position component as a fraction, or px when it is a length (CSS object-position semantics). */
function posPart(v, axis) {
  const s = (v ?? '').trim();
  if (s.endsWith('%')) return { frac: parseFloat(s) / 100 };
  if (s.endsWith('px')) return { px: parseFloat(s) };
  return { frac: { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 }[s] ?? 0.5, axis };
}
/** Where an object-fit: cover image actually sits on screen inside its box. */
export function coverRect(b, nw, nh, objectPosition) {
  const [px, py] = (objectPosition || '50% 50%').split(/\s+/);
  const c = nw > 0 && nh > 0 ? Math.max(b.w / nw, b.h / nh) : 1;
  const w = nw > 0 ? nw * c : b.w, h = nh > 0 ? nh * c : b.h;
  const ox = posPart(px, 'x'), oy = posPart(py ?? px, 'y');
  return { x: b.x + (ox.px ?? (b.w - w) * ox.frac), y: b.y + (oy.px ?? (b.h - h) * oy.frac), w, h };
}
const fmt = (n) => Math.round(n * 1000) / 1000;
/** Scale factors get more digits: 3 decimals of a 0.45 scale is already ~0.2 px off at the card end. */
const fmtS = (n) => Math.round(n * 1e5) / 1e5;

/**
 * Sampled keyframes for the flight. The clip box goes from B0 to B1 and the image inside it from I0 to I1 (all on-screen
 * rects; the box element is laid out at B1, the image at I1 relative to it). Each sample is a pair of transforms: the box
 * (translate + non-uniform scale) and the image inside it (the inverse of the box's stretch, times the image's own scale),
 * so the picture is uniformly scaled at every sample and only the crop changes. Pure: unit-tested in tests/navmotion.test.mjs.
 */
export function flyFrames(B0, B1, I0, I1, ease, samples = SAMPLES) {
  const outer = [], inner = [];
  const ix0 = I1.x - B1.x, iy0 = I1.y - B1.y;
  for (let i = 0; i < samples; i += 1) {
    const p = i / (samples - 1), e = ease(p);
    const B = lerpRect(B0, B1, e), I = lerpRect(I0, I1, e);
    const sx = B.w / B1.w, sy = B.h / B1.h;
    outer.push({ offset: p, transform: `translate(${fmt(B.x - B1.x)}px, ${fmt(B.y - B1.y)}px) scale(${fmtS(sx)}, ${fmtS(sy)})` });
    const kx = I1.w ? (I.w / I1.w) / sx : 1, ky = I1.h ? (I.h / I1.h) / sy : 1;
    inner.push({ offset: p, transform: `translate(${fmt((I.x - B.x) / sx - ix0)}px, ${fmt((I.y - B.y) / sy - iy0)}px) scale(${fmtS(kx)}, ${fmtS(ky)})` });
  }
  return { outer, inner };
}

/** Ids live on in the new page only (code that looks one up must never find a fading copy), except inside inline SVG:
 *  its gradients and patterns are found by id (fill="url(#…)"), and the ghost comes after #main, so a lookup still finds
 *  the new page's first. */
function stripIds(root) {
  root.querySelectorAll('[id]').forEach((n) => { if (n.closest('svg')) return; n.dataset.ghostId = n.id; n.removeAttribute('id'); });
}

/** The visible corner radii of a photo box, [top-left, top-right, bottom-right, bottom-left]: each corner takes the
 *  largest radius among the box and the clipping ancestors (overflow not visible) whose same corner it sits in. */
export function cornerRadii(el, depth = 4) {
  const b = el.getBoundingClientRect();
  const out = [0, 0, 0, 0];
  const near = (a, c) => Math.abs(a - c) < 1.5;
  const props = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'];
  for (let n = el, i = 0; n && i < depth; n = n.parentElement, i += 1) {
    const cs = getComputedStyle(n);
    if (n !== el && cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
    const r = n === el ? b : n.getBoundingClientRect();
    const at = [near(b.left, r.left) && near(b.top, r.top), near(b.right, r.right) && near(b.top, r.top),
      near(b.right, r.right) && near(b.bottom, r.bottom), near(b.left, r.left) && near(b.bottom, r.bottom)];
    props.forEach((p, k) => { if (at[k]) out[k] = Math.max(out[k], parseFloat(cs[p]) || 0); });
  }
  return out;
}

/** The old page's nodes, moved into a fixed layer where they were, so they can fade out over the new page. Horizontal
 *  scrollers keep their scroll position. Inert and hidden from assistive tech while it fades. */
export function makeGhost(main, extra = [], { page: withPage = true } = {}) {
  const r = main.getBoundingClientRect();
  const scrollers = withPage ? [...main.querySelectorAll('.rail-list, .chips, .sort-seg')].map((el) => [el, el.scrollLeft]) : [];
  // The fading layer is the viewport, not the page: a page-tall layer would have to be painted whole (at 3x on an
  // iPhone) before anything could move.
  const g = document.createElement('div');
  g.className = 'nav-ghost';
  g.setAttribute('aria-hidden', 'true');
  g.inert = true;
  // withPage false: only the bars go into the layer (a heavy page is not re-layered; see main.js pageMotion).
  if (withPage) {
    const page = document.createElement('div');
    page.className = 'nav-ghost-page';
    Object.assign(page.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px` });
    page.append(...main.childNodes);
    g.append(page);
  }
  extra.forEach((el) => { if (!el) return; const c = el.cloneNode(true); const er = el.getBoundingClientRect(); c.classList.add('nav-ghost-part'); Object.assign(c.style, { position: 'fixed', left: `${er.left}px`, top: `${er.top}px`, width: `${er.width}px`, margin: '0' }); g.append(c); });
  stripIds(g);
  document.body.append(g);
  scrollers.forEach(([el, x]) => { el.scrollLeft = x; });
  return g;
}

/**
 * The photo flight. `from` and `to` are the two photo boxes (DOMRect-like) on screen now; `img` is the decoded image to
 * fly (it is cloned). `fromPos`/`toPos` are the two ends' object-position values; `fromImg` instead gives the picture's
 * own rect at the start (a flight that takes over where an interrupted one was). `radius` names the end that is a card
 * and its visible corner radii ({ end: 'from' | 'to', r: [tl, tr, br, bl], squareOther = true }, cornerRadii); the other
 * end, the hero, is square unless squareOther is false. Layers that fade inside the flying box (CSS backgrounds, each
 * optional): `out` fades out early (the start's scrim) and `in` fades in late (the end's scrim). `cardFilter` is the
 * card photo's CSS filter (a closed bar's is gray and dim): a filtered copy shows at the card end and cross-fades with
 * the plain one, opacity only. `start` gives starting opacities ({ under, out, in, dim }) for a flight that takes over
 * from an interrupted one, so nothing changes in its first frame.
 */
export function flyPhoto({ img, from, to, fromPos, toPos, fromImg = null, duration, ease, radius = null, layers = {}, cardFilter = null, start = {} }) {
  const B0 = box(from), B1 = box(to);
  const nw = img.naturalWidth || 0, nh = img.naturalHeight || 0;
  const I0 = fromImg ? box(fromImg) : coverRect(B0, nw, nh, fromPos), I1 = coverRect(B1, nw, nh, toPos);
  const { outer, inner } = flyFrames(B0, B1, I0, I1, ease);
  const timing = { duration, easing: 'linear', fill: 'both' };
  const els = [], anims = [];
  const layer = (box, bg, name) => { const d = document.createElement('span'); d.className = 'nav-fly-layer'; d.dataset.layer = name; d.style.background = bg; box.append(d); return d; };
  /** A clip box laid out at the end, holding a copy of the photo; both move with the sampled transforms. */
  const flyer = (cls) => {
    const ov = document.createElement('div');
    ov.className = cls;
    ov.setAttribute('aria-hidden', 'true');
    Object.assign(ov.style, { left: `${B1.x}px`, top: `${B1.y}px`, width: `${B1.w}px`, height: `${B1.h}px` });
    const pic = img.cloneNode(false);
    pic.removeAttribute('id'); pic.removeAttribute('class'); pic.removeAttribute('style'); pic.removeAttribute('loading');
    pic.alt = '';
    pic.className = 'nav-fly-img';
    Object.assign(pic.style, { left: `${fmt(I1.x - B1.x)}px`, top: `${fmt(I1.y - B1.y)}px`, width: `${fmt(I1.w)}px`, height: `${fmt(I1.h)}px` });
    ov.append(pic);
    els.push(ov);
    return { ov, pic };
  };
  const r = radius?.r?.some((v) => v > 0) ? radius.r : null;
  // Corners: the card end is rounded, the hero end square. Animating border-radius would run on WebKit's main thread, so
  // the box keeps one radius, set in its own (end-size) coordinates: exact at the card end, scaled with the box elsewhere.
  // Under it, a square copy (with the hero's scrim) fades in toward the hero end and fills the corners. Opacity only.
  const under = r && radius.squareOther !== false ? flyer('nav-fly-under') : null;
  const top = flyer('nav-fly');
  let dim = null;
  if (cardFilter && cardFilter !== 'none') {
    dim = top.pic.cloneNode(false);
    dim.dataset.layer = 'dim';
    dim.style.filter = cardFilter;
    top.ov.append(dim);
  }
  if (r) {
    const [sx, sy] = radius.end === 'from' ? [B0.w / B1.w, B0.h / B1.h] : [1, 1];
    top.ov.style.borderRadius = `${r.map((v) => `${fmt(v / sx)}px`).join(' ')} / ${r.map((v) => `${fmt(v / sy)}px`).join(' ')}`;
    const heroLayer = radius.end === 'from' ? layers.in : layers.out;
    if (under && heroLayer) layer(under.ov, heroLayer, 'hero');
  }
  const outLayer = layers.out ? layer(top.ov, layers.out, 'out') : null;
  const inLayer = layers.in ? layer(top.ov, layers.in, 'in') : null;
  document.body.append(...els);

  for (const f of [under, top]) if (f) anims.push(f.ov.animate(outer, timing), f.pic.animate(inner, timing));
  if (dim) anims.push(dim.animate(inner, timing));
  const cardFirst = radius?.end !== 'to'; // which end the card is: its look leaves early or arrives late
  const leave = (o = 1, at = 0.5) => [{ opacity: o }, { opacity: 0, offset: at }, { opacity: 0 }];
  const arrive = (o = 0) => [{ opacity: o }, { opacity: o, offset: 0.5 }, { opacity: 1 }];
  if (under) anims.push(under.ov.animate(cardFirst ? arrive(start.under ?? 0) : leave(start.under ?? 1), timing));
  if (dim) anims.push(dim.animate(cardFirst ? leave(start.dim ?? 1) : arrive(start.dim ?? 0), timing));
  if (outLayer) anims.push(outLayer.animate(leave(start.out ?? 1, 0.35), timing));
  if (inLayer) anims.push(inLayer.animate(arrive(start.in ?? 0), timing));
  return {
    el: top.ov, img: top.pic, under: under?.ov ?? null, outLayer, inLayer, dim, anims,
    remove: () => els.forEach((e) => e.remove()), finished: Promise.all(anims.map((a) => a.finished.catch(() => {}))),
  };
}

/** A copy of the bar page's hero, fixed where it is, for Back: it fades out above the flying photo. With `photo: false`
 *  only its title and buttons show (the photo is the one flying). Inert and hidden from assistive tech. */
export function heroCopy(hero) {
  const r = hero.getBoundingClientRect();
  // The chrome as it is on screen now: a landing reveal or the scroll-driven title fade may be part-way (a clone has no
  // animations), so each child keeps its current opacity and offset.
  const now = [...hero.children].map((el) => (el.matches('img, .hero-scrim') ? null : (({ opacity, transform, translate }) => ({ opacity, transform, translate }))(getComputedStyle(el))));
  const c = hero.cloneNode(true);
  c.removeAttribute('id');
  c.removeAttribute('data-hero');
  c.classList.add('nav-hero-copy');
  c.setAttribute('aria-hidden', 'true');
  c.inert = true;
  Object.assign(c.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  stripIds(c);
  [...c.children].forEach((el, i) => {
    const v = now[i];
    if (!v) return;
    el.style.opacity = v.opacity;
    if (v.transform !== 'none') el.style.transform = v.transform;
    if (v.translate !== 'none') el.style.translate = v.translate;
  });
  document.body.append(c);
  return {
    el: c,
    photo(on) { c.classList.toggle('is-chrome', !on); },
  };
}
