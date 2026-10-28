# App Store build stand-ins

`scripts/build-www.mjs --flavor=store` swaps these files in for the team-only modules (see `STORE_STUBS` there).
Each one exports the same names as the module it replaces. Shared helpers keep their real code, and everything that
is sample data or a team-only screen becomes empty. If a store code path ever needs a real team-only export, esbuild
fails the build (a missing export) or `scripts/check-store.mjs` fails it (a banned string). Never add sample data here.

`team-api.js` is the other way round: `--flavor=team` writes it over `lib/api.js`, because the team build (the iPhone
app and the web demo) has no backend and never creates the API client.
