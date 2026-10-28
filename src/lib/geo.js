// Distance from "you" to each bar. The prototype never asks for your location (out of scope in the
// implementation brief), so distances are measured from a fixed demo spot and labeled that way.
// Straight-line ("as the crow flies") distance; walking routes are a little longer.

/** Default "you are here": the College Ave & Hamilton St corner (OpenStreetMap node 104342030, read 2026-10-17). */
export const DEMO_SPOT = Object.freeze({ id: 'demo-spot', label: 'College Ave & Hamilton St', lat: 40.49903, lng: -74.44766 });

const EARTH_MILES = 3958.8;
const rad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in miles between two {lat, lng} points; null when either is missing. */
export function milesBetween(a, b) {
  if (!a || !b || ![a.lat, a.lng, b.lat, b.lng].every(Number.isFinite)) return null;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Where distances are measured from: the fixed campus spot, or the person's own location once they tap "Use my location"
// (App Store build). The location stays in memory on the phone: never saved, never sent.
let origin = DEMO_SPOT;
export const currentOrigin = () => origin;
export const usingDeviceLocation = () => origin.id === 'you';
/** Set the origin to a device location ({lat, lng}); anything else (or null) goes back to the campus spot. */
export function setOrigin(o) {
  origin = o && Number.isFinite(o.lat) && Number.isFinite(o.lng) ? Object.freeze({ id: 'you', label: 'where you are', lat: o.lat, lng: o.lng }) : DEMO_SPOT;
}
/** "College Ave & Hamilton St" or "where you are", for "0.2 mi from …". */
export const originLabel = () => origin.label;

/** Miles from `from` (default: the current origin) to a venue with `geo: {lat, lng}`; null if the venue has no coordinates. */
export const distanceTo = (venue, from = origin) => milesBetween(from, venue?.geo);

/** "0.2 mi", "<0.1 mi", "1.4 mi", "12 mi"; null stays null (shown as "Distance n/a"). */
/** Walking time at about 3 mph (20 min a mile), rounded, at least 1 minute; null without a distance. */
export function walkMinutes(mi) {
  if (mi == null || !Number.isFinite(mi)) return null;
  return Math.max(1, Math.round(mi * 20));
}

export function formatMiles(mi) {
  if (mi == null || !Number.isFinite(mi)) return null;
  if (mi < 0.1) return '<0.1 mi';
  if (mi < 10) return `${(Math.round(mi * 10) / 10).toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
}
