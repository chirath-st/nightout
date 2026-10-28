// Native features in the iOS app (Capacitor 8), each with a plain web fallback so the same code runs in a browser.
// No npm imports: inside the app the Capacitor runtime injects window.Capacitor, and each official plugin is reached by
// name. Every call is best-effort: a missing plugin or a refused permission never breaks the screen that asked.

const cap = () => globalThis.Capacitor;
export const isNative = () => Boolean(cap()?.isNativePlatform?.());
const cache = new Map();
function plugin(name) {
  if (!isNative()) return null;
  if (!cache.has(name)) cache.set(name, cap().registerPlugin?.(name) ?? cap().Plugins?.[name] ?? null);
  return cache.get(name);
}
const quietly = async (fn) => { try { return await fn(); } catch { return undefined; } };

/** Light taps for selection, a medium thump for a commit, success/warning/error notifications. */
export async function haptic(kind = 'light') {
  const h = plugin('Haptics');
  if (!h) return;
  if (kind === 'selection') return quietly(() => h.selectionChanged());
  if (kind === 'success' || kind === 'warning' || kind === 'error') return quietly(() => h.notification({ type: kind.toUpperCase() }));
  return quietly(() => h.impact({ style: kind === 'heavy' ? 'HEAVY' : kind === 'medium' ? 'MEDIUM' : 'LIGHT' }));
}

/** The system share sheet. Resolves 'shared', 'copied', 'cancelled' or 'failed'. */
export async function share({ title, text, url }) {
  const s = plugin('Share');
  try {
    if (s) { await s.share({ title, text, url, dialogTitle: title }); return 'shared'; }
    if (navigator.share) { await navigator.share({ title, text, url }); return 'shared'; }
    await navigator.clipboard.writeText(url ?? text);
    return 'copied';
  } catch (err) {
    const msg = String(err?.message ?? err?.name ?? '');
    return /cancel|abort/i.test(msg) ? 'cancelled' : 'failed';
  }
}

/** Opens a web page (privacy policy, support) in an in-app Safari view; in a browser, a new tab. */
export async function openExternal(url) {
  const b = plugin('Browser');
  if (b) return quietly(() => b.open({ url, presentationStyle: 'popover' }));
  window.open(url, '_blank', 'noopener');
}

/** Apple Maps walking directions to a bar (maps.apple.com opens the Maps app on iPhone). */
export function directionsUrl({ lat, lng, name, address }) {
  const q = new URLSearchParams({ daddr: lat != null ? `${lat},${lng}` : `${address}, New Brunswick, NJ`, dirflg: 'w', q: name ?? '' });
  return `https://maps.apple.com/?${q}`;
}

export async function hideSplash() {
  const s = plugin('SplashScreen');
  if (s) await quietly(() => s.hide({ fadeOutDuration: 200 }));
}

/** Hides the web keyboard's up/down/Done bar above the iOS keyboard (a web-view tell). */
export async function hideKeyboardBar() {
  const k = plugin('Keyboard');
  if (k) await quietly(() => k.setAccessoryBarVisible({ isVisible: false }));
}

export async function styleStatusBar() {
  const sb = plugin('StatusBar');
  if (!sb) return;
  await quietly(() => sb.setStyle({ style: 'DARK' })); // light text on our black UI
}

/** Runs fn when the app comes back to the front (the web 'visibilitychange' covers browsers). */
export function onResume(fn) {
  const a = plugin('App');
  if (a) quietly(() => a.addListener('resume', fn));
}

// Saved state backup. iOS may clear a web view's localStorage under storage pressure, so in the app every save is
// mirrored to native Preferences (UserDefaults), and a launch with empty web storage restores from it first.
const MIRROR = ['app:state:v1', 'app:session:v1'];
export async function restoreStorage(storage) {
  const p = plugin('Preferences');
  if (!p || !storage) return;
  for (const key of MIRROR) {
    if (storage.getItem(key) != null) continue;
    const { value } = (await quietly(() => p.get({ key }))) ?? {};
    if (value != null) { try { storage.setItem(key, value); } catch { /* storage blocked */ } }
  }
}
export function mirrorStorage(key, value) {
  const p = plugin('Preferences');
  if (!p || !MIRROR.includes(key)) return;
  quietly(() => (value == null ? p.remove({ key }) : p.set({ key, value })));
}

// Local reminders (iOS notifications the person schedules; no push, nothing leaves the phone).
export const canRemind = () => Boolean(plugin('LocalNotifications'));

/** Resolves 'granted', 'denied', 'prompt' (not asked yet and ask is false) or 'unavailable'. Asks only when ask is true. */
export async function notificationPermission({ ask = false } = {}) {
  const n = plugin('LocalNotifications');
  if (!n) return 'unavailable';
  try {
    let p = await n.checkPermissions();
    if (p.display !== 'granted' && p.display !== 'denied') {
      if (!ask) return 'prompt';
      p = await n.requestPermissions();
    }
    return p.display === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}

/** Schedules one notification at `at` (ms), replacing any pending one with the same id. Resolves true when scheduled. */
export async function scheduleReminder({ id, at, title, body, extra = {} }) {
  const n = plugin('LocalNotifications');
  if (!n) return false;
  try {
    await quietly(() => n.cancel({ notifications: [{ id }] }));
    await n.schedule({ notifications: [{ id, title, body, schedule: { at: new Date(at), allowWhileIdle: true }, extra }] });
    return true;
  } catch {
    return false;
  }
}

export async function cancelReminder(id) {
  const n = plugin('LocalNotifications');
  if (n) await quietly(() => n.cancel({ notifications: [{ id }] }));
}

/** Ids still waiting to fire, or null when that can't be known (then the app keeps its own list as is). */
export async function pendingReminderIds() {
  const n = plugin('LocalNotifications');
  if (!n) return null;
  const r = await quietly(() => n.getPending());
  return Array.isArray(r?.notifications) ? r.notifications.map((x) => x.id) : null;
}

/** Runs fn(extra) when the person taps a reminder (including one that launched the app). */
export function onReminderTap(fn) {
  const n = plugin('LocalNotifications');
  if (n) quietly(() => n.addListener('localNotificationActionPerformed', (e) => fn(e?.notification?.extra ?? {})));
}

/**
 * The person's location, asked for only when they tap "Use my location" (When In Use). Resolves { lat, lng } or
 * { error: 'denied' | 'unavailable' }. The position is used on the phone to measure distances; it is never stored or sent.
 */
export async function locate() {
  const g = plugin('Geolocation');
  try {
    if (g) {
      let perm = await g.checkPermissions();
      if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') perm = await g.requestPermissions({ permissions: ['location'] });
      if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') return { error: 'denied' };
      const pos = await g.getCurrentPosition({ enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    }
    if (navigator.geolocation) {
      return await new Promise((resolve) => navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        (e) => resolve({ error: e?.code === 1 ? 'denied' : 'unavailable' }),
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
      ));
    }
  } catch (err) {
    return { error: /denied|permission/i.test(String(err?.message ?? err)) ? 'denied' : 'unavailable' };
  }
  return { error: 'unavailable' };
}
