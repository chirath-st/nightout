// Team build stand-in for src/lib/api.js (scripts/build-www.mjs writes it over lib/api.js in --flavor=team output).
// The team demo (the iPhone app and the web demo) has no backend and never creates a client (main.js creates them
// only when globalThis.__STORE__ or a live build's LIVE), so it ships no API client, server address, auth endpoint or
// session key. The views are shared with the live profile, so its screens (venue sign-in, live Points) ship too, but
// unreachable: LIVE is false in the demo's backend.js. Same exports.
export class ApiError extends Error {
  constructor(message, { status = 0, code = '', retryable = false, retryAfter = null, pgCode = null, authCode = null, data = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.retryAfter = retryAfter;
    this.pgCode = pgCode;
    this.authCode = authCode;
    this.data = data;
  }
}

export const friendlyError = () => 'Something went wrong. Try again.';
export const VENUE_KEYS = [];

export function createApi() {
  throw new Error('The team build has no backend.');
}

export function createVenueApi() {
  throw new Error('The team build has no backend.');
}
