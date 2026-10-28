# App Store build stand-ins

`scripts/build-www.mjs --flavor=store` swaps these files in for the team-only modules (see `STORE_STUBS` there).
Each one exports the same names as the module it replaces. Shared helpers keep their real code, and everything that
is sample data or a team-only screen becomes empty. If a store code path ever needs a real team-only export, esbuild
fails the build (a missing export) or `scripts/check-store.mjs` fails it (a banned string). Never add sample data here.

`team-api.js` is the other way round: `--flavor=team` writes it over `lib/api.js`, because the team build (the iPhone
app and the web demo) has no backend and never creates either API client (guest or venue). It exports the same names
(`createApi` and `createVenueApi` throw, `VENUE_KEYS` is empty), so the demo ships no API client, server address, auth
endpoint or session key. The views are shared, so the live-only screens (venue sign-in, live Points) ship in the demo
too, unreachable behind `LIVE = false`. A live team build (`--flavor=team --live=mock|local|staging`) keeps the real
`lib/api.js` instead and writes its own `lib/backend.js`; `tests/live-wiring.test.mjs` keeps the two export lists equal.

A live build is lab-only. `build-www.mjs` refuses `--live` into Capacitor's webDir (`app/www`, from
`capacitor.config.json`), and every live `index.html` carries its own Content-Security-Policy (`script-src 'self'`,
`connect-src` its one server). Before any live build goes onto an iPhone, it needs:
- **BE10**: an iPhone CSP with `script-src 'self'` and `connect-src` the staging project only. A live build holds an
  aal2 venue refresh token, in localStorage and mirrored to UserDefaults.
- **`loggingBehavior: "none"`** in `capacitor.config.json` for that build. Today it is `"debug"`, and W10 only rejects
  `"production"`.
