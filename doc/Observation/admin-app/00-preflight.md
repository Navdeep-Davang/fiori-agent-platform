# Phase 0 — Pre-flight checklist (admin → OData → HANA)

**Date:** 2026-04-23 (execution pass)  
**Purpose:** Record gates before / while replacing mock admin bindings with `GovernanceService` OData.

## Checklist

| # | Check | How to verify | Result |
|---|--------|----------------|--------|
| 1 | CAP service running | `npm run watch` from repo root (`cds watch --profile hybrid`) | **Operator** — start before UI tests |
| 2 | App Router entry | `http://localhost:5000/admin/webapp/index.html` after login | **Operator** — XSUAA session |
| 3 | `$metadata` reachable | `GET /odata/v4/governance/$metadata` via App Router | Often **200** (may differ by route config) |
| 4 | Entity read with session | Browser Network: `GET /odata/v4/governance/McpServers?$top=10` returns **JSON** | **Required** — curl without cookies may return OAuth HTML |
| 5 | HANA hybrid bind | `cds bind` + `npm run deploy:hana` per README | **Operator** |
| 6 | Admin role | User has **Agent.Admin** (or mix) for writes / actions | Match `srv/governance-service.cds` `@restrict` |
| 7 | Python for MCP actions | `PYTHON_URL` / health on MCP `baseUrl` for `testConnection` / `syncTools` | [`srv/governance-service.js`](../../../srv/governance-service.js) |

## Seed reference (expected rows)

- [`db/data/acp-McpServer.csv`](../../../db/data/acp-McpServer.csv): 2 MCP servers (fixed UUIDs).
- Agents / tools / groups: see sibling CSVs under `db/data/`.

## Notes

- **Source of truth for code:** root `srv/`, `db/` — not `gen/` (gitignored build output).
- After OData wiring, re-run rows **4** and **6** on every environment change.
