// SIMULATED events, vibe and "who's going" numbers for the demo. No bar has announced these events,
// set these prices or shared crowd ages; every one is shown with a "sample" label. Times are on the demo
// week: day 0 is the demo night (hours < 12 are after midnight), days 1–6 are the following nights.
import { atNight } from './venues.js';

const DAY = 24 * 60 * 60_000;

/** Music genres and themes used by the Events filters. */
export const GENRES = Object.freeze(['Hip-hop & R&B', 'Top 40', 'House & EDM', 'Throwbacks', 'Live music', 'Karaoke']);
export const THEMES = Object.freeze(['DJ night', 'Theme night', 'Trivia', 'Karaoke', 'Live music', 'Game day']);

// [day, startH, startM, endH|null (late), endM] ; cover in dollars (0 = free) ; going = sample count
const EVENTS = [
  { id: 'ps-retro', venueId: 'pitch-social', day: 0, at: [21, 0], until: null, title: 'Retro Night', theme: 'Theme night', genres: ['Throwbacks', 'Hip-hop & R&B'], music: 'Hip-hop, R&B and throwbacks', host: 'Resident DJ', cover: 10, going: 48 },
  { id: 'sp-neon', venueId: 'scarlet-pub', day: 0, at: [22, 0], until: [2, 0], title: 'Neon Night', theme: 'Theme night', genres: ['Top 40', 'House & EDM'], music: 'Top 40 and house', host: 'DJ set', cover: 5, going: 32 },
  { id: 'hk-late', venueId: 'hueys-knight-club', day: 0, at: [23, 0], until: [2, 0], title: 'Late Night DJ', theme: 'DJ night', genres: ['House & EDM', 'Hip-hop & R&B'], music: 'EDM and hip-hop', host: 'Guest DJ', cover: 10, going: 64 },
  { id: 'oq-karaoke', venueId: 'olde-queens', day: 0, at: [22, 0], until: [1, 0], title: 'Saturday Karaoke', theme: 'Karaoke', genres: ['Karaoke', 'Throwbacks'], music: 'Sing-along hits', host: 'Karaoke host', cover: 0, going: 21 },
  { id: 'tv-trivia', venueId: 'the-vine', day: 0, at: [23, 0], until: [0, 30], title: 'Late Trivia', theme: 'Trivia', genres: [], music: 'Background playlist', host: 'Quizmaster', cover: 0, going: 18, adults: true },
  { id: 'sf-game', venueId: 'stuff-yer-face', day: 1, at: [13, 0], until: [17, 0], title: 'Sunday Game Day', theme: 'Game day', genres: [], music: 'Game audio on every screen', host: null, cover: 0, going: 26 },
  { id: 'oq-openmic', venueId: 'olde-queens', day: 3, at: [21, 0], until: [0, 0], title: 'Open Mic', theme: 'Live music', genres: ['Live music'], music: 'Open mic, sign up at the bar', host: null, cover: 0, going: 12 },
  { id: 'aw-quiz', venueId: 'ale-n-wich', day: 4, at: [21, 0], until: [23, 0], title: 'Pub Quiz', theme: 'Trivia', genres: [], music: 'Classic rock playlist', host: 'Quizmaster', cover: 0, going: 15, adults: true },
  { id: 'ev-acoustic', venueId: 'evelyns', day: 5, at: [21, 0], until: [23, 30], title: 'Acoustic Thursday', theme: 'Live music', genres: ['Live music'], music: 'Acoustic covers', host: 'Live duo', cover: 0, going: 19 },
  { id: 'ob-throwback', venueId: 'olive-branch', day: 5, at: [22, 0], until: [2, 0], title: 'Throwback Thursday', theme: 'Theme night', genres: ['Throwbacks'], music: '2000s and 2010s hits', host: 'DJ set', cover: 5, going: 37 },
  { id: 'ps-after-dark', venueId: 'pitch-social', day: 6, at: [21, 0], until: null, title: 'Friday After Dark', theme: 'DJ night', genres: ['Hip-hop & R&B', 'Throwbacks'], music: 'Hip-hop, R&B and throwbacks', host: 'Resident DJ', cover: 10, going: 55 },
  { id: 'tb-beats', venueId: 'thirty-burgers', day: 6, at: [20, 0], until: [23, 0], title: 'Burgers & Beats', theme: 'Live music', genres: ['Live music', 'Top 40'], music: 'Live band covers', host: 'Live band', cover: 0, going: 22 },
];

/** Events on the demo week with absolute times. `endsAt` null means "until late". */
export function buildEvents(demoStart) {
  return EVENTS.map(({ day, at, until, ...e }) => {
    const startsAt = atNight(demoStart, at[0], at[1]) + day * DAY;
    const endsAt = until ? atNight(demoStart, until[0], until[1]) + day * DAY : null;
    return { ...e, day, startsAt, endsAt: endsAt != null && endsAt <= startsAt ? endsAt + DAY : endsAt, adults: true, synthetic: true };
  });
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
