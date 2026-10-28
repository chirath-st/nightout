// Local reminders for saved bars: "check the line at X" at a night and time the person picks. Scheduled on the phone
// as an iOS notification (nothing is sent to a server). App state keeps { venueId: { at, nid } } so Saved can show it.
// Times are the phone's wall clock, so a reminder set for 10 PM fires at 10 PM even across the clock change.

export const REMINDER_HOURS = [21, 22, 23];
const BUSY_DAYS = new Set([4, 5, 6]); // Thu, Fri, Sat: the nights lines form
const LEAD_MS = 60_000; // a reminder must be at least a minute away
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (key, hour) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key ?? ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hour, 0, 0, 0).getTime() : NaN;
};

/** When a day + hour choice fires (ms), or NaN for a bad key. */
export const reminderAt = (key, hour) => fromKey(key, hour);

/** Night choices: today if a time is still ahead, then the next Thu, Fri and Sat; at most `max`. */
export function reminderDays(now = Date.now(), max = 4) {
  const out = [];
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  for (let i = 0; i < 8 && out.length < max; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dayKey(d);
    const hours = REMINDER_HOURS.filter((h) => fromKey(key, h) > now + LEAD_MS);
    if (!hours.length || (i > 0 && !BUSY_DAYS.has(d.getDay()))) continue;
    out.push({ key, label: i === 0 ? 'Tonight' : DAY_SHORT[d.getDay()], hours });
  }
  return out;
}

export const hourLabel = (h) => `${h > 12 ? h - 12 : h || 12}:00 ${h >= 12 ? 'PM' : 'AM'}`;

/** "Tonight, 10:00 PM" or "Fri, 10:00 PM". */
export function reminderLabel(at, now = Date.now()) {
  const d = new Date(at);
  const today = dayKey(new Date(now)) === dayKey(d);
  return `${today ? 'Tonight' : DAY_SHORT[d.getDay()]}, ${hourLabel(d.getHours())}`;
}

/** For a sentence: "tonight at 11:00 PM" or "Fri at 9:00 PM". */
export function reminderPhrase(at, now = Date.now()) {
  const d = new Date(at);
  return `${dayKey(new Date(now)) === dayKey(d) ? 'tonight' : DAY_SHORT[d.getDay()]} at ${hourLabel(d.getHours())}`;
}

/** The card's pill: "10 PM" tonight, else "Fri 10 PM". */
export function reminderShort(at, now = Date.now()) {
  const d = new Date(at);
  const h = d.getHours();
  const t = `${h > 12 ? h - 12 : h || 12} ${h >= 12 ? 'PM' : 'AM'}`;
  return dayKey(new Date(now)) === dayKey(d) ? t : `${DAY_SHORT[d.getDay()]} ${t}`;
}

/** A stable notification id per bar (iOS wants a 32-bit integer), so a new time replaces the old one. */
export function reminderId(venueId) {
  let h = 5381;
  for (const c of String(venueId)) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  return (h % 2_000_000_000) + 1;
}

export const reminderText = (venue) => ({ title: venue.name, body: 'Check the line before you head out.' });

/** Only reminders still ahead, in a clean shape (anything malformed is dropped). */
export function activeReminders(raw, now = Date.now()) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, r] of Object.entries(raw)) {
    if (r && Number.isFinite(r.at) && Number.isInteger(r.nid) && r.at > now) out[id] = { at: r.at, nid: r.nid };
  }
  return out;
}

/** The sheet's starting choice: the saved reminder if any, else the first night at 10 PM (or its first open hour). */
export function defaultChoice(existing, now = Date.now()) {
  const days = reminderDays(now);
  if (existing && Number.isFinite(existing.at)) {
    const d = new Date(existing.at);
    const key = dayKey(d);
    if (days.some((x) => x.key === key && x.hours.includes(d.getHours()))) return { day: key, hour: d.getHours() };
  }
  const first = days[0];
  if (!first) return { day: null, hour: null };
  return { day: first.key, hour: first.hours.includes(22) ? 22 : first.hours[0] };
}
