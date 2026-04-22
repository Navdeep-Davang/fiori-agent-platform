# Orchestration scratchpad — Plan 06

## Task analysis (synced 2026-04-22)

| Area | Status | Notes |
|------|--------|--------|
| Phase 0.1 env / bind / deploy / watch / Python / App Router | **DONE** | Developer confirmed |
| Phase 0.2 OData `$metadata` | **IN PROGRESS** | 401 on bare **:4004** expected (no Bearer); smoke via **:5000** + login or token — see Plan 06 Phase 0 note |
| Phase 0.3–0.4 Admin + Chat UI smoke | **OPEN** | Steps 7–8 of runbook — user will run |
| Phase 1.1–1.3 IAS / hybrid / trust / Python not browser-exposed | **DONE** | Developer confirmed |
| Phase 1.4 JWT scopes + Python logs | **OPEN** | Pending stable chat; **502** CAP→Python — **agent debug only after user go-ahead** |
| Phase 3.3.1 HANA deploy | **DONE** | `npm run deploy:hana` |
| Phase 3.3.2–3.3.3 Skills OData + chat | **OPEN** | After chat path green |
| Phases 4–9 (code) | **COMPLETE** | In repo |
| Phase 2 CF / **2.1.1** mbt | **DEFERRED** | After hybrid green; **make** for MBT on Windows if needed |
| 5.4.x, 6.5, 6b, 7.3, 8.4, 9.5 | **OPEN** | User will progress after hybrid |

**Overall:** Hybrid HANA + identity **in progress**; **Bad Gateway** on chat is the main blocker for closing Phase 0 / 1.4 / 3.3.3.

## Next (developer)

1. Close **0.2** using **`http://localhost:5000/...`** (after login) for `$metadata`, or REST client with JWT — not raw `:4004` alone.  
2. Run **0.3–0.4** (Admin + Chat checklists).  
3. **`GET .../governance/Skills`** as Admin (**3.3.2**).  
4. When ready: **go-ahead** for agent to debug **502** / CAP→Python / **1.4.1–1.4.2**.  
5. **Phase 2 CF** last.

## Session notes

- Prior audits: `.cursor/worker-reports/06-audit-phase*.md`.
