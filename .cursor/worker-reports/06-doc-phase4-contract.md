# Worker report: Phase 4 thin CAP→Python contract (documentation)

**Task:** Action Plan 06 Phase 4 Task 4.1.1 — document the **target** CAP→Python thin JSON contract in README; optional pointer in `srv/server.js`; this report.

## Delivered

### `README.md`

Added subsection **"CAP → Python (target thin JSON contract)"** immediately after **"Chat UI → CAP contract (baseline)"**.

Documented:

- **JSON (target):** `sessionId`, `agentId`, `toolIds`, `skillIds`, `message`, `userInfo`; clarified that the access token is **not** in the body.
- **Headers (target):** `Authorization: Bearer <access_token>`, `X-Internal-Token` (when `ACP_INTERNAL_TOKEN` is set), `X-AC-*` per Plan 05 with link to `doc/Action-Plan/05-cap-public-python-private-production-path.md` and reference to `srv/python-trust.js` for concrete header names.
- **Explicit implementation caveat:** `srv/server.js` may still POST the **legacy fat** payload until **Phase 4.2** is implemented, with examples of legacy fields (`agentConfig`, `effectiveTools`, `history`, `userToken`).

Cross-links: Action Plan 06 Phase 4 / Task 4.1.1, `srv/server.js`, Plan 05, `srv/python-trust.js`.

### `srv/server.js`

Single-line comment above **`app.post('/api/chat', ...)`** pointing readers to the README subsection and stating legacy fat payload until Phase 4.2 — matches existing file style (minimal route-level comment).

## Not in scope

- No change to runtime behavior or axios headers/payload (Phase 4.2 implementation).
- No edits to Action Plan 06 checkboxes (documentation-only pass).

## Verification

- Read back README subsection for accuracy against `doc/Action-Plan/06-architecture-aligned-e2e.md` Phase 4 and `srv/python-trust.js` header names.
