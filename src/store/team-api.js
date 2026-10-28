// Team build stand-in for src/lib/api.js (scripts/build-www.mjs writes it over lib/api.js in --flavor=team output).
// The team build (the iPhone app and the web demo) has no backend and never creates a client (main.js creates one
// only when globalThis.__STORE__), so it ships no server addresses, sign-in flow or server function names. Same exports.
export class ApiError extends Error {
  constructor(message, { status = 0, code = '', retryable = false, retryAfter = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.retryAfter = retryAfter;
  }
}

export const friendlyError = () => 'Something went wrong. Try again.';

export function createApi() {
  throw new Error('The team build has no backend.');
}
