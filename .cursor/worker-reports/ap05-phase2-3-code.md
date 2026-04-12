---
task_id: ap05-phase2-3-code
status: COMPLETE
---

## Summary

Implemented hybrid **XSUAA** auth (replacing dummy in `[hybrid]`), **JWT/Basic**-aware `/api` middleware in `srv/server.js`, **App Router** + README **`cds bind --exec`** flow, **Fiori DevAuth** opt-in Basic for dummy-only, **CAP → Python** trust headers + **`X-Internal-Token`**, Python middleware when **`ACP_INTERNAL_TOKEN`** is set, **`.env.example`** and architecture/README updates. **`[development]`** profile retains dummy users for **`ACP_USE_DUMMY_AUTH`** flows.

## Files changed

| File | Change |
|------|--------|
| `package.json` | `[hybrid]` auth `xsuaa`; `[development]` dummy users; script `start:approuter` |
| `srv/server.js` | `/api`: JWT path (`context` + `auth` + `req.user`), dummy+`ACP_USE_DUMMY_AUTH` Basic, else 401; Python POST headers via `forwardHeadersForPython` |
| `srv/python-trust.js` | **New** — `X-AC-*` + `X-Internal-Token` for Python |
| `srv/governance-service.js` | `runTest` → Python `tool-test` sends same forward headers |
| `approuter/xs-app.json` | `authenticationMethod`: `route` |
| `approuter/package.json` | `start:bind` |
| `xs-security.json` | `oauth2-configuration.redirect-uris` localhost App Router |
| `app/chat|admin/webapp/utils/DevAuth.js` | Opt-in Basic via `acpUseDummyAuth`; `authorizationHeaders()` |
| `app/chat|admin/webapp/Component.js` | OData headers only when dummy headers non-empty |
| `app/chat/webapp/controller/Chat.controller.js` | `credentials: "include"`; merge `authorizationHeaders()` |
| `python/app/main.py` | `InternalTokenMiddleware` for `/chat`, `/tool-test`, `/mcp` when token set |
| `.env.example` | `ACP_INTERNAL_TOKEN`, `ACP_USE_DUMMY_AUTH` notes |
| `README.md` | Bind XSUAA+HANA, `start:approuter` / `start:bind`, App Router entry, dummy opt-in |
| `doc/Architecture/fiori-agent-platform.md` | CAP→Python trust; ADR-7; §9 SOP; overview |
| `doc/Action-Plan/05-cap-public-python-private-production-path.md` | Phase 2–3 tasks checked |

## Verification

- **`node --check`** on `srv/server.js`, `srv/python-trust.js`, `srv/governance-service.js` — OK.
- **`npm run lint`** — **failed**: ESLint 9 expects `eslint.config.*` at repo root; no project flat config present (pre-existing).

## Manual test suggestions

1. **`cf login`**, **`cds bind db --to …`**, **`cds bind --to …`** (XSUAA), **`npm run deploy:hana`**, **`npm run watch`** — open **`http://localhost:4004`** should load CAP; **`/api/agents`** without JWT should return **401**.
2. **`npm run start:approuter`** — log in via App Router → **`/api/agents`** from UI with **`credentials: "include"`** (no Basic) should work.
3. Set **`ACP_INTERNAL_TOKEN`** identically for CAP and Python → chat and admin **runTest** still work; wrong/missing token on Python → **403**.
4. **`cds watch --profile development`** with **`ACP_USE_DUMMY_AUTH=true`**, browser **`localStorage.acpUseDummyAuth=true`** → Basic flow still works.

## Action Plan 05 — Phase 2–3 checkbox sync

Document `doc/Action-Plan/05-cap-public-python-private-production-path.md` updated:

- Phase 2: Tasks **2.1–2.5** → **[x]**
- Phase 3: Tasks **3.1–3.5** → **[x]**

## Notes / limitations

- **Task 3.3:** When **`ACP_INTERNAL_TOKEN`** is **unset**, Python does not enforce the token (trust boundary = network + optional token in prod).
- **`npm run lint`** not restored; use existing ESLint config migration if you want CI lint green.
