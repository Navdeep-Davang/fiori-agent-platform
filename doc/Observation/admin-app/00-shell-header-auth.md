# Observation — Shell header and auth strip

## Current (mock)

- [`app/admin/webapp/App.view.xml`](../../app/admin/webapp/App.view.xml): `adminUserName` / `adminUserMeta` bind to `{mock>/user/displayName}`, `{mock>/user/dept}`, `{mock>/user/roles}`.
- [`Component.js`](../../app/admin/webapp/Component.js): hardcoded `Jamie Chen` user object.
- `onLogoutPress`: toast only; suggests App Router `/logout`.

## Target (production-aligned)

- **Preferred:** Read JWT-backed user from **App Router** (e.g. `/user-api/currentUser` if exposed) or CAP user API — not duplicated in mock.
- **Interim:** Keep `mock` user slice until shell integration is scoped; OData tables still use real governance data independently.

## Risks

- Mixing **anonymous** OData model init before login → 401; model should attach **after** shell has session or use same-origin relative URI so cookies attach.

## Acceptance

- Header shows **real** `email` / `dept` / scopes **or** clearly labeled placeholder until user-api wiring is done; **no** false implication that governance rows are tied to mock user identity.
