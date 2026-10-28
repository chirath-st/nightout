// App Store build stand-in for src/data/social.js: no people, groups, points, rewards, Plus plans or bar cards.
export { LINE_BUCKETS } from '../lib/queue.js';
export const POINTS = Object.freeze({ DAILY: 0, CHECKIN: 0, REPORT: 0, GOT_IN: 0, START: 0 });
export const PEOPLE = Object.freeze([]);
export const groupMembers = () => [];
export const youSeed = (name) => `me-${name || 'you'}`;
export const buildGroups = () => [];
export const groupEndsAt = (g) => (g?.stops?.length ? g.stops[g.stops.length - 1].startsAt : g?.startsAt ?? 0) + 2 * 60 * 60_000;
export const currentStop = () => null;
export const REWARDS = Object.freeze([]);
export const nextReward = () => null;
export const checkedInTonight = () => false;
export const DRINKS_LOCK = '';
export const balanceOf = () => 0;
export const initials = (name) => (name || '?').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
export const validHandle = (h) => /^[A-Za-z0-9._]{1,30}$/.test(h);
export const PLANS = Object.freeze([]);
export const PLUS_PERKS = Object.freeze([]);
export const SAMPLE_BAR_CARDS = Object.freeze([]);
