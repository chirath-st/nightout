// App Store build stand-in for src/data/venues.js: the date helpers and area names stay; no sample bars (live data and
// src/data/directory.js supply the real ones).

/** Absolute time on a night: hours < 12 are treated as after midnight. */
export function atNight(demoStart, hh, mm = 0) {
  const d = new Date(demoStart);
  d.setHours(hh, mm, 0, 0);
  if (hh < 12) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** Absolute time `day` nights after the night (calendar math, so a DST change can't shift it). */
export function atNightOn(demoStart, day, hh, mm = 0) {
  const d = new Date(demoStart);
  d.setDate(d.getDate() + day + (hh < 12 ? 1 : 0));
  d.setHours(hh, mm, 0, 0);
  return d.getTime();
}

export const buildDataset = () => [];
export const AREAS = ['Easton Ave', 'Bartlett & Morrell St', 'Hamilton St'];
export const TYPICAL_HOURS = ['8p', '9p', '10p', '11p', '12a', '1a', '2a'];
