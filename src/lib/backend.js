// Which server this build talks to. The repo copy is this stub: no server, so the team build (the public web demo and
// the iPhone app) stays the on-device demo and ships no server address. `node scripts/build-www.mjs --flavor=team
// --live=mock|local|staging` writes the build's own copy of this file (never this one; scripts/check.mjs keeps it the
// stub) with { env, url, key } and LIVE = true. Only publishable keys ever appear here; production is refused.
export const BACKEND = null;
export const LIVE = false;
