---
name: btp-development
description: Directs SAP BTP local and hybrid development (CAP, Fiori, HANA, XSUAA, app router): which repo skills and docs to use, how to verify with browser MCP and official SAP search, and when to amend this skill after fixing one-off issues so later runs stay accurate.
---

# BTP development (direction skill)

This file gives **where to look and how to verify** — not step-by-step product tutorials. Prefer repo automation and SAP primary sources; drill from links and search terms.

## First: repo-specific automation (use before improvising)

| Topic | Skill / asset |
|--------|----------------|
| BTP CLI, role collections, `cds bind`, CF target | `.cursor/skills/btp-cli-orchestration/SKILL.md` |
| BTP Security REST (role collections, apiaccess) | `.cursor/skills/btp-api-orchestration/SKILL.md` |
| IAS / SCIM users and attributes | `.cursor/skills/ias-api-orchestration/SKILL.md` |
| HANA row counts / SELECT smoke (read-only) | `.cursor/skills/hana-readonly-observability/SKILL.md` |
| Architecture vs delivery | `doc/Architecture/`, `doc/Action-Plan/` |

If the task matches a skill above, **read and follow that skill** instead of guessing CF/BTP cockpit clicks.

## Verify the UI (browser MCP)

When the user cares about **blank screens, 404s, OData, or login redirects**:

1. List MCP tool schemas under `mcps/<server>/tools/*.json`, then call tools (e.g. `browser_navigate`, `browser_snapshot`, `browser_get_console_logs`).
2. Reproduce on the **same URL** the user uses (often app router, e.g. `http://localhost:5000/...`), not only CAP direct port.
3. Treat **Network + Console** as source of truth: failed module loads (`sap/...js` 404), `Unsupported event` on OData V4 model, 401/403 on `/odata/`.

**UI5 / CAP gotchas to remember (direction, not exhaustive):**

- `sap.m.URLHelper` is **not** a standalone module — use `sap/m/library` and `mobileLibrary.URLHelper` ([OpenUI5 #3216](https://github.com/SAP/openui5/issues/3216)).
- **OData V4** (`manifest` odata 4.0): no `requestFailed` / `parseError` on `v4.ODataModel` like V2 — use `dataReceived` (error param), `submitBatch` / binding promises, and `getMetaModel().requestObject("/")` rejection for metadata ([SAP Help / community](https://help.sap.com/docs/SAP_UI5)).

## Where to search (SAP)

Use **current** SAP Help and API docs; prefer **Help Portal** + **API Reference** over random blogs unless cross-checking.

| Need | Start here |
|------|----------------|
| UI5 API / behavior | `https://ui5.sap.com/#/api` — search control/model by name; check **Module**, **Events**, **since** version. |
| UI5 topics / best practices | `https://sapui5.hana.ondemand.com/#/topic` — search OData V4, routing, manifest. |
| CAP Node | `https://cap.cloud.sap/docs/` — cds, hybrid, auth, OData. |
| BTP / CF / HANA Cloud | `https://help.sap.com/docs/btp` — search *SAP HANA Cloud*, *Cloud Foundry*, *HDI*, *SAP BTP Cockpit*. |
| Narrow errors | SAP Community Q&A + issue trackers (**openui5**, **cloud-mta-build-tool**) with exact error text. |

Search pattern: **product + component + exact symbol** (e.g. `OData V4 attachDataReceived`, `cds bind hybrid`).

## Hybrid local checklist (direction)

1. `cf target` matches `.cdsrc-private.json` bindings (see prior work: `cds env --profile hybrid` for resolved `requires.db` / `auth`).
2. After schema/data changes: `npm run deploy:hana` (or project script) against **bound** HDI — not DBADMIN Explorer view; app tables live in **HDI container** ([SAP HDI overview](https://help.sap.com/docs/SAP_HANA_PLATFORM/2cfbc5cf684bc40a8da052fe444a2e99/cf590e825aae42d2b4e5db817bbe6f64.html)).
3. Fiori entry through **app router** when testing auth and destinations.

## When this skill misled or was too thin (self-update)

If you fixed a **non-obvious** issue (wrong UI5 module id, V2-vs-V4 event, PowerShell quoting for HANA script, wrong Explorer connection, etc.):

1. Add a **short bullet** under the relevant section above (or a new subsection) — **one principle**, optional link; no long case narrative.
2. Keep **terminology stable** (HDI vs instance, OData V4 vs V2, app router vs CAP port).
3. Save → future agents inherit the correction.

Do not duplicate full procedures that belong in specialized skills; **link or name** them and add only the missing delta.
