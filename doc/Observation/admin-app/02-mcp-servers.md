# Observation — MCP servers (`pageMcp`)

## Current (mock)

- Table `items="{mock>/servers}"`; columns: name, destinationName, baseUrl, transportType, environment, health, status, **lastSync** (not in CDS — mock-only).
- Buttons: test connection / sync tools / add server — mutate JSON + toast.
- Edit/delete: mock arrays.

## Target OData

- **Entity set:** `McpServers` ([`governance-service.cds`](../../../srv/governance-service.cds)).
- **Persistence:** [`acp.McpServer`](../../../db/schema.cds) — field `lastHealthCheck` replaces UI “last sync” semantics for health checks; **sync tools** does not write a “lastSync” column (CAP returns message string only).

## Actions ([`governance-service.js`](../../../srv/governance-service.js))

- `testConnection`: GET `${base}/health`, updates `health`, `lastHealthCheck`.
- `syncTools`: POST Python `/mcp/tools/list`, upserts `Tools` rows.

## UI5 wiring

- List binding: `governance>/McpServers` with columns bound to `governance>` properties; format `lastHealthCheck` with `DateTimeOffset` type or show "—" if null.
- **Selection:** `_getSelectedMcpContext` must use **`governance`** context.
- **Invoke:** `bindContext` + `execute` on `.../testConnection()` and `.../syncTools()` for selected row’s `ID`.
- **Create/Update:** OData V4 `bindList(...).create()` or context `setProperty` + `submitBatch` — dialogs must map `authType` enum (`Destination` from seed).

## Risks

- CSRF on POST (handled by OData V4 model same-origin).
- **Destination** resolution in hybrid without BTP Destination service falls back to `baseUrl` ([`resolveMcpBaseUrl`](../../../srv/governance-service.js)).

## Acceptance

- Table lists **2** seed servers from HANA; test connection updates **health** in DB; sync tools creates/updates **Tool** draft rows.
