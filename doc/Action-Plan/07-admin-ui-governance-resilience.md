---
id: admin-ui-governance-resilience
title: Admin UI — Governance OData, MCP wiring, and resilience
parent_plan: doc/Action-Plan/06-architecture-aligned-e2e.md
architecture_refs:
  - doc/Architecture/fiori-agent-platform.md
observation_refs:
  - doc/Observation/admin-app/
sync_status: draft
created: 2026-04-23
last_updated: 2026-04-26
---

# Action Plan 07 — Admin UI: live governance data, correct MCP, graceful errors

> **Goal:** After (or alongside) wiring the admin app to **`GovernanceService`** and HANA, ensure **wrong or unreachable MCP configuration never takes down the UI**, users always see **actionable feedback** instead of a **blank / white screen**, and **McpServer** rows in the DB reflect **real** endpoints you intend to run.
>
> **Relationship to Plan 06:** [06-architecture-aligned-e2e.md](06-architecture-aligned-e2e.md) stays the **architecture-wide** roadmap. **This file** holds the **admin-specific** checklist—MCP correctness, OData/UI error handling, and verification—so Plan **06** does not become overloaded.
>
> **Governance of implementation:** Do **not** merge large refactors until this plan is reviewed and tasks are explicitly approved (same rule as Plan **06** appendix owner gate).

---

## 1. Problem statement

| Risk | Why it hurts |
|------|----------------|
| **Incorrect `McpServer` rows** (wrong `baseUrl`, bad destination name, Python not listening) | **`testConnection`** / **`syncTools`** in [`srv/governance-service.js`](../../srv/governance-service.js) call external HTTP; failures can surface as **rejected promises**, **500**, or **empty UI** if the client does not handle them. |
| **OData list / metadata failures** (401 after session loss, CSRF, batch errors) | UI5 **OData V4** can leave tables **empty** or the shell **broken** if there is no **`requestFailed` / `dataReceived` error path** and no **user-visible MessageStrip**. |
| **Unhandled action results** | Bound actions return **strings** or errors; if the client assumes success without **try/catch** or **`.catch()`**, users see **nothing** or a stuck busy state. |
| **Seed vs production drift** | CSV seeds may point **`PYTHON_MCP_SERVICE`** / `http://localhost:8000` that are **invalid in CF** or on another machine—**not a code bug**, but it **looks** like one if errors are silent. |

---

## 2. Objectives (definition of done for this plan)

1. **MCP registration** reflects **intentional** servers; operators know how to **fix** URL/destination without reading stack traces.
2. **Every** admin surface that calls **OData or actions** has a **defined** behavior on failure: **MessageBox**, **MessageToast**, **MessageStrip**, or **inline state**—**never** an unexplained white screen.
3. **CAP** continues to return **clear** messages for `testConnection` / `syncTools` / `runTest` (already partially true in service impl); UI **always** displays the message returned or the HTTP error text.
4. **Documentation** links: BTP **Destination** name, **Python** base URL, **hybrid** vs **CF** expectations live in README or runbook, cross-linked from here.

---

## 3. Phase A — Inventory (read-only / review)

- [X] **A.1:** List all admin entry points that trigger **network I/O**: OData entity reads, **`testConnection`**, **`syncTools`**, **`runTool` / `runTest`**, `submitBatch`, `delete`, `create`.
- [X] **A.2:** For each path in **A.1**, note current behavior on failure (controller [`App.controller.js`](../../app/admin/webapp/view/App.controller.js), CAP [`governance-service.js`](../../srv/governance-service.js)).
- [X] **A.3:** Reconcile **seed** [`db/data/acp-McpServer.csv`](../../db/data/acp-McpServer.csv) with **actual** hybrid/CF topology (one row per real MCP, or document “demo only”).
- [X] **A.4:** Read observation notes under [`doc/Observation/admin-app/`](../Observation/admin-app/) and tick gaps vs this plan.

---

## 4. Phase B — MCP correctness (data + ops, minimal code later)

- [X] **B.1:** Document **required** fields for a valid `McpServer` row (`destinationName` vs `baseUrl`, `authType`, `transportType`, `environment`) and **when** `getDestination` is used ([`resolveMcpBaseUrl`](../../srv/governance-service.js)).
- [X] **B.2:** Runbook: **“MCP does not connect”** — check order: Python `/health` → destination in BTP → `baseUrl` in HANA row → App Router session for admin. (Documented in [`doc/Operations/mcp-registration.md`](../Operations/mcp-registration.md) §4.)
- [ ] **B.3:** Decide policy: **e.g.** “**Test connection** must succeed (or user acknowledges risk) before **Sync tools**” — product rule, then enforce in UI (button enablement) + optional CAP guard.
- [ ] **B.4:** CF cutover: replace localhost URLs in **deployed** HDI data or use **destinations-only** rows—track as subtask under Plan **06** Phase **2** when relevant.

---

## 5. Phase C — UI resilience (approved implementation batches)

> Implement in **small PRs** after review; each subtask should be independently testable.

- [X] **C.1 — Global OData error channel:** On the **`governance`** model, attach **`requestFailed`** / equivalent; central handler sets a **view model** flag `adminErrorText` + optional `adminErrorDetails`, and shows a **MessageStrip** at top of `App.view.xml` (dismissible).
- [X] **C.2 — Action wrappers:** Wrap **`_runMcpBoundAction`** (and any similar) so **every** rejection path calls a shared **`_showHttpError(e)`** (extract OData message, status, timeout).
- [X] **C.3 — Empty states:** When list bindings return **0 rows** after successful load, show **IllustratedMessage** or **MessageStrip** (“No servers” / “No tools”) vs empty white table area.
- [X] **C.4 — Metadata / session loss:** If **`$metadata`** or first **GET** fails with **401**, show “Session expired—refresh or log in again” and link to **`/logout`** or login (align with App Router).
- [X] **C.5 — Batch / PATCH failures:** On **`submitBatch`** rejection after MCP/Agent/Skill/Group dialogs, surface **OData error response** in MessageBox (not only toast).
- [X] **C.6 — `lastHealthCheck` / nullable fields:** Table cells that use **`DateTimeOffset`** type must tolerate **null** (formatter or conditional XML) so a **bad row** does not break the whole table binding.

---

## 6. Phase D — CAP service hardening (optional, coordinated with C)

- [X] **D.1:** Ensure **`testConnection`** / **`syncTools`** never leave **partial DB state** without a clear result (already updates `health`; document idempotency of `syncTools`).
- [ ] **D.2:** Consider **max duration** and **user-facing** timeout message for large `syncTools` (many tools).
- [ ] **D.3:** Align HTTP client errors (**ECONNREFUSED**, DNS) with **short, operator-safe** strings returned to the UI (avoid leaking internal hostnames in production if policy requires masking).

---

## 7. Phase E — Verification & sign-off

- [ ] **E.1:** Manual matrix: wrong `baseUrl`, stopped Python, invalid destination name, expired browser session, delete last `McpServer` (if allowed), OData throttling (if any).
- [ ] **E.2:** No **uncaught** errors in browser console for the scenarios in **E.1** (warnings acceptable if documented).
- [ ] **E.3:** Update Plan **06** Phase **0.3** / **7** checkboxes when admin smoke passes with this plan’s criteria.

---

## 8. Long-term alignment — Admin vs chat

**Direction:** Prefer **Fiori Elements (Strategy A)** for **admin** governance screens **whenever practicable**—list report / object page patterns, built-in busy and message handling, and less custom table code. Keep **freestyle UI** (TNT shell, custom layouts, conversational chrome) for **chat**, where the experience does not map cleanly to Elements and speed of iteration matters.

- [ ] **F.1:** Align admin delivery with [06 appendix A.4](06-architecture-aligned-e2e.md) and Plan **01** toward **Elements** as the long-term home; until that migration lands, **Phase C** resilience work still applies to whatever admin shell is in use.
- [ ] **F.2:** After admin is on Elements, re-home **Phase C** items into FE-standard patterns (e.g. list-report / OP message handling, busy states) rather than bespoke controller-only paths where the framework already covers the case.
- [ ] **F.3:** Treat **chat** as **freestyle by default** in architecture and planning documentation so it is not pulled into an unnecessary Elements migration.

---

## Revision log

| Date | Change |
|------|--------|
| 2026-04-23 | Initial plan — split from Plan **06**; MCP + OData resilience + owner approval gate. |
| 2026-04-24 | Fixed repo-relative links (`../../srv`, `../../app`, `../../db`) from `doc/Action-Plan/`. |
| 2026-04-24 | **§8:** Decided direction — **Fiori Elements for admin** when practicable; **freestyle for chat**; tasks F.1–F.3 updated. |
| 2026-04-25 | Marked **C.1** (V4 `attachDataReceived` + metadata catch + shell `MessageStrip` / `governanceError`), **C.3** (overview strips + table `noDataText` / formatters), **A.3** (seed data verified in browser), and **C.6** (nullable dates verified in XML) verified in admin app. |
| 2026-04-26 | Completed Phase A inventory (A.1, A.2, A.4). Audited all network entry points and documented current toast-only behavior for actions/CRUD. |
| 2026-04-26 | Completed **B.1** (MCP Registration Guide) and **C.2/C.5** (Implemented shared `_showHttpError` and updated CRUD/Action handlers to use MessageBox on failure). |
| 2026-04-26 | Completed **C.4** (Session loss detection) and **D.1** (CAP sync hardening with `try/catch` and server status updates). |
| 2026-04-26 | **B.2** runbook: expanded [`mcp-registration.md`](../Operations/mcp-registration.md) §4 with full check order (Python `/health` → BTP destination → HANA `McpServer` row → App Router session + roles). |
| 2026-04-26 | **C.2** (extend): `onMcpBoundAction` / `_runMcpBoundAction` error path now calls `oModel.refresh()` so `health` / `lastHealthCheck` update in the table after a failed `testConnection` or `syncTools`. |
| 2026-04-26 | **C.6** (extend): `lastHealthCheck` cell uses OData V4 default type handling (removed redundant `DateTimeOffset` type on the binding) so timestamps render; **ObjectStatus** shows **Error** state when `health` is `FAIL`. |
| 2026-04-26 | **D.1** (extend): `testConnection` / `syncTools` write `health` + `lastHealthCheck` in `cds.tx` so updates persist when the action returns an HTTP error (no rollback of the health row with `req.reject`). |
