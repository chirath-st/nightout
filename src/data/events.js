// SIMULATED events, vibe and "who's going" numbers for the demo. No bar has announced these events,
// set these prices or shared crowd ages; every one is shown with a "sample" label. Times are on the demo
// week: day 0 is the demo night (hours < 12 are after midnight), days 1–6 are the following nights.
import { atNightOn } from './venues.js';


/** Music genres and themes used by the Events filters. */
export const GENRES = Object.freeze(['Hip-hop & R&B', 'Top 40', 'House & EDM', 'Throwbacks', 'Live music', 'Karaoke']);
export const THEMES = Object.freeze(['DJ night', 'Theme night', 'Trivia', 'Karaoke', 'Live music', 'Game day']);

// [day, startH, startM, endH|null (late), endM] ; cover in dollars (0 = free) ; going = sample count
const EVENTS = [
  { id: 'ps-retro', venueId: 'pitch-social', day: 0, at: [21, 0], until: null, title: 'Retro Night', theme: 'Theme night', genres: ['Throwbacks', 'Hip-hop & R&B'], music: 'Hip-hop, R&B and throwbacks', host: 'Resident DJ', cover: 10, going: 48 },
  { id: 'sp-neon', venueId: 'scarlet-pub', day: 0, at: [22, 0], until: [2, 0], title: 'Neon Night', theme: 'Theme night', genres: ['Top 40', 'House & EDM'], music: 'Top 40 and house', host: 'DJ set', cover: 5, going: 32 },
  { id: 'hk-late', venueId: 'hueys-knight-club', day: 0, at: [23, 0], until: [2, 0], title: 'Late Night DJ', theme: 'DJ night', genres: ['House & EDM', 'Hip-hop & R&B'], music: 'EDM and hip-hop', host: 'Guest DJ', cover: 10, going: 64 },
  { id: 'oq-karaoke', venueId: 'olde-queens', dow: 6, at: [22, 0], until: [1, 0], title: 'Saturday Karaoke', theme: 'Karaoke', genres: ['Karaoke', 'Throwbacks'], music: 'Sing-along hits', host: 'Karaoke host', cover: 0, going: 21 },
  { id: 'tv-trivia', venueId: 'the-vine', day: 0, at: [23, 0], until: [0, 30], title: 'Late Trivia', theme: 'Trivia', genres: [], music: 'Background playlist', host: 'Quizmaster', cover: 0, going: 18, adults: true },
  { id: 'ob-latenight', venueId: 'olive-branch', day: 0, at: [23, 0], until: [2, 0], title: 'Late Night Throwbacks', theme: 'DJ night', genres: ['Throwbacks', 'Top 40'], music: '2000s and 2010s hits', host: 'DJ set', cover: 5, going: 44 },
  { id: 'sf-replay', venueId: 'stuff-yer-face', day: 0, at: [22, 0], until: [1, 0], title: 'Late Game Replay', theme: 'Game day', genres: [], music: 'Game audio on every screen', host: null, cover: 0, going: 16 },
  { id: 'tb-late', venueId: 'thirty-burgers', day: 0, at: [23, 30], until: [1, 30], title: 'Late Bites & Beats', theme: 'Live music', genres: ['Live music', 'Top 40'], music: 'Acoustic covers', host: 'Live duo', cover: 0, going: 13 },
  { id: 'sf-game', venueId: 'stuff-yer-face', dow: 0, at: [13, 0], until: [17, 0], title: 'Sunday Game Day', theme: 'Game day', genres: [], music: 'Game audio on every screen', host: null, cover: 0, going: 26 },
  { id: 'oq-openmic', venueId: 'olde-queens', day: 3, at: [21, 0], until: [0, 0], title: 'Open Mic', theme: 'Live music', genres: ['Live music'], music: 'Open mic, sign up at the bar', host: null, cover: 0, going: 12 },
  { id: 'aw-quiz', venueId: 'ale-n-wich', day: 4, at: [21, 0], until: [23, 0], title: 'Pub Quiz', theme: 'Trivia', genres: [], music: 'Classic rock playlist', host: 'Quizmaster', cover: 0, going: 15, adults: true },
  { id: 'ev-acoustic', venueId: 'evelyns', dow: 4, at: [21, 0], until: [23, 30], title: 'Acoustic Thursday', theme: 'Live music', genres: ['Live music'], music: 'Acoustic covers', host: 'Live duo', cover: 0, going: 19 },
  { id: 'ob-throwback', venueId: 'olive-branch', dow: 4, at: [22, 0], until: [2, 0], title: 'Throwback Thursday', theme: 'Theme night', genres: ['Throwbacks'], music: '2000s and 2010s hits', host: 'DJ set', cover: 5, going: 37 },
  { id: 'ps-after-dark', venueId: 'pitch-social', dow: 5, at: [21, 0], until: null, title: 'Friday After Dark', theme: 'DJ night', genres: ['Hip-hop & R&B', 'Throwbacks'], music: 'Hip-hop, R&B and throwbacks', host: 'Resident DJ', cover: 10, going: 55 },
  { id: 'tb-beats', venueId: 'thirty-burgers', day: 6, at: [20, 0], until: [23, 0], title: 'Burgers & Beats', theme: 'Live music', genres: ['Live music', 'Top 40'], music: 'Live band covers', host: 'Live band', cover: 0, going: 22 },
];

/** Events on the demo week with absolute times. `endsAt` null means "until late". An event named for a weekday
 *  ("Saturday Karaoke") has `dow` (0 = Sun) and lands on that weekday in the coming week; others keep their `day`.
 *  Calendar math throughout, so a clock change can't shift an event by an hour. */
export function buildEvents(demoStart) {
  const baseDow = new Date(demoStart).getDay();
  return EVENTS.map(({ day, dow, at, until, ...e }) => {
    let d = dow == null ? day : (dow - baseDow + 7) % 7;
    const startOn = (n) => atNightOn(demoStart, n, at[0], at[1]);
    const endOn = (n) => {
      if (!until) return null;
      const end = atNightOn(demoStart, n, until[0], until[1]);
      return end <= startOn(n) ? atNightOn(demoStart, n + 1, until[0], until[1]) : end;
    };
    // A weekday event that already ended before tonight began (e.g. today's afternoon game) moves to next week.
    if (dow != null && (endOn(d) ?? startOn(d) + 5 * 60 * 60_000) <= demoStart) d += 7;
    return { ...e, kind: 'bar', day: d, startsAt: startOn(d), endsAt: endOn(d), adults: true, synthetic: true };
  });
}

// SIMULATED community ideas: fictional people, made-up counts. No bar has seen, hosted or approved any of them;
// approval exists only in the demo venue console on this device. dows = [preferred weekday, fallback] (0 = Sun).
const COMMUNITY = [
  { id: 'ci-y2k', venueId: 'scarlet-pub', dows: [2, 3], at: [21, 0], until: [1, 0], title: 'Y2K Night', theme: 'Theme night', genres: ['Throwbacks', 'Top 40'], music: '2000s pop, R&B and hip-hop', pitch: 'Butterfly clips, frosted tips and a 2000s-only playlist. Dress up if you want to.', by: 'Nina V.', joins: 38, hype: 64, postedH: 30 },
  { id: 'ci-emo', venueId: 'olde-queens', dows: [1, 3], at: [21, 0], until: [0, 0], title: 'Emo Karaoke', theme: 'Karaoke', genres: ['Karaoke', 'Throwbacks'], music: 'Pop-punk and emo sing-alongs', pitch: 'Pop-punk and emo only. Sign-up sheet at the door; bring your loudest friends.', by: 'Marcus T.', joins: 29, hype: 41, postedH: 52 },
  { id: 'ci-trivia', venueId: 'the-vine', dows: [3, 1], at: [21, 0], until: [23, 0], title: 'Sitcom Trivia', theme: 'Trivia', genres: [], music: 'Background playlist', pitch: 'Teams of up to four, three rounds of sitcom questions. Bragging rights, plus a food voucher if the bar agrees.', by: 'Dana K.', joins: 24, hype: 30, postedH: 20 },
  { id: 'ci-hoops', venueId: 'hueys-knight-club', dows: [4, 0], at: [20, 0], until: [23, 0], title: 'Hoops Watch Night', theme: 'Game day', genres: [], music: 'Game audio on the big screens', pitch: 'Every game on the big screens with the sound up for the late one. Wear your team’s colors.', by: 'Andre M.', joins: 17, hype: 22, postedH: 14 },
  { id: 'ci-dj', venueId: 'pitch-social', dows: [3, 1], at: [22, 0], until: [2, 0], title: 'Student DJ Takeover', theme: 'DJ night', genres: ['House & EDM'], music: 'House and Afro house', pitch: 'Three student DJs, 40-minute sets each. House and Afro house all night.', by: 'Theo W.', joins: 12, hype: 19, postedH: 8 },
  { id: 'ci-poetry', venueId: 'evelyns', dows: [1, 2], at: [20, 0], until: [22, 30], title: 'Poetry & Open Mic', theme: 'Live music', genres: ['Live music'], music: 'Spoken word and acoustic sets', pitch: 'Five-minute slots for poems, stories and acoustic songs. Sign up when you arrive.', by: 'Lena B.', joins: 6, hype: 9, postedH: 4 },
];
const HOUR = 60 * 60_000;

/** Each idea goes on the first of its weekdays that is 1–6 nights out and has no bar event at that bar (same `day`). */
export function buildIdeas(demoStart, barEvents = buildEvents(demoStart)) {
  const baseDow = new Date(demoStart).getDay();
  return COMMUNITY.map(({ dows, at, until, by, postedH, ...c }) => {
    const free = (d) => !barEvents.some((e) => e.venueId === c.venueId && e.day === d);
    let day = null;
    for (const dow of dows) {
      for (let d = 1; d <= 6 && day == null; d += 1) if ((baseDow + d) % 7 === dow && free(d)) day = d;
      if (day != null) break;
    }
    if (day == null) return null;
    return {
      ...c, kind: 'community', day, startsAt: atNightOn(demoStart, day, at[0], at[1]), endsAt: atNightOn(demoStart, day, until[0], until[1]),
      by: { name: by }, postedAt: demoStart - postedH * HOUR, cover: null, adults: true, synthetic: true,
    };
  }).filter(Boolean);
}

/** Sample "vibe" per bar: entry age, the age most of the crowd is, and a typical drink price range. */
export const VIBE = Object.freeze({
  'olde-queens': { typicalAge: [21, 24], drinks: [4, 9] },
  'scarlet-pub': { typicalAge: [21, 23], drinks: [3, 8] },
  'hueys-knight-club': { typicalAge: [21, 23], drinks: [4, 9] },
  'pitch-social': { typicalAge: [21, 25], drinks: [5, 10] },
  'the-vine': { typicalAge: [21, 24], drinks: [4, 9] },
  'olive-branch': { typicalAge: [21, 24], drinks: [4, 9] },
  'stuff-yer-face': { typicalAge: [21, 30], drinks: [5, 10] },
  'thirty-burgers': { typicalAge: [21, 28], drinks: [6, 12] },
  evelyns: { typicalAge: [21, 30], drinks: [7, 13] },
  'ale-n-wich': { typicalAge: [22, 35], drinks: [5, 9] },
});

/** Sample "Who's going?" counts per bar for tonight; the viewer's own vote is added on top. */
export const POLL = Object.freeze({
  'olde-queens': [41, 18, 6], 'scarlet-pub': [58, 22, 9], 'hueys-knight-club': [73, 20, 7], 'pitch-social': [64, 28, 8],
  'the-vine': [22, 15, 11], 'olive-branch': [4, 6, 30], 'stuff-yer-face': [19, 17, 9], 'thirty-burgers': [16, 21, 10],
  evelyns: [12, 14, 8], 'ale-n-wich': [14, 9, 7],
});
