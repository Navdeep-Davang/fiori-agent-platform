# Observation — Tools catalog (`pageTools`)

## Current (mock)

- `items="{mock>/tools}"`; column “MCP server” uses `serverName` string on mock row.
- Filters: server, risk, lifecycle, elevated, search — client-side on JSON.

## Target OData

- **Entity set:** `Tools` with **`$expand=server`** to show `server/name`.
- **Filters:** apply `sap.ui.model.Filter` / `FilterOperator` on list binding, e.g. `riskLevel`, `status`, `elevated`, substring on `name` + `server/name` (AND).

## Actions

- `runTest` exists on `Tools` (Admin-only) — not yet exposed as primary button in mock toolbar (“Activate” / “Set risk” were mock-only).

## Risks

- **Elevated** toggle was disabled in XML — CAP `before('UPDATE', Tools)` enforces Admin for elevated changes ([`governance-service.js`](../../../srv/governance-service.js)).

## Acceptance

- Table shows tools from HANA with correct **server** name via expand; filters narrow OData list.
