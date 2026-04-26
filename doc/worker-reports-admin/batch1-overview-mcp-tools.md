# Batch 1 (track B) — Overview, MCP servers, Tools catalog

## Summary

Improved **empty states** and **error visibility** for the three admin pages bound to live Governance OData, and replaced the static Tools **Server** filter with options loaded from `GET /McpServers` (field `name`) while keeping the same filter semantics (`server/name` equals selected key, or no server filter when "All" is selected).

## Files changed

| File | Changes |
|------|---------|
| `app/admin/webapp/view/App.view.xml` | `pageOverview`: optional Information strip when metadata is missing but the global error strip was cleared; empty-state Information strip when all overview counts are zero and there is no load/error; `overviewError` strip type set to **Error** (was Warning). `pageMcp`: friendly Information strip when `governanceMetadataFailed` and no `governanceError`; `tblMcp` `noDataText` for empty list. `pageTools`: information text updated; metadata-missing strip; `mcpPageError` **Warning** strip (failed load of McpServer names for the filter); Server `Select` `items` bound to `mock>/mcpServerFilterItems` with `core:Item key="{key}" text="{text}"` (id `selToolServer`); `tblTools` `noDataText`. |
| `app/admin/webapp/view/App.controller.js` | `_initGovernanceAfterMeta` success path calls `_refreshToolServerFilterItems()` (wrapper). After MCP test/sync, create, update, and delete, `_refreshToolServerFilterItems()` refreshes the Server dropdown from OData. New method at end of the controller extension: `_refreshToolServerFilterItems` delegates to existing `_refreshMcpServerFilterItems`. |

## Filter semantics (unchanged)

- Mock path `mock>/filterTools/server` still stores the server **name** (or empty for "All").
- `_applyToolFilters` still adds `new Filter("server/name", FilterOperator.EQ, f.server)` when a server is selected.
- Deduplication and invalid-selection reset to "All" remain in `_refreshMcpServerFilterItems`.

## Manual test steps

1. **No OData / metadata failure** (e.g. shell without governance model, or block network): open **Overview** — expect Information strip that governance is unavailable (in addition to any global strip); navigate **MCP** and **Tools** — same pattern; **Tools** Server dropdown should show at least "All" (from default `mcpServerFilterItems`) and must not throw.

2. **OData OK, empty database**: with metadata loaded and zero rows in entities — **Overview** shows the "no rows" Information strip; **MCP** table shows `noDataText`; **Tools** table shows `noDataText` with filters cleared or default.

3. **OData OK, seeded McpServers**: after load, open **Tools** — Server `Select` lists "All" plus one entry per unique `McpServers/name` (no duplicates). Pick a server, confirm the tools table is filtered to that `server/name`; choose "All", confirm filter clears (AND with other filters unchanged).

4. **McpPageError**: simulate or force failure of the McpServers list used only for the filter (e.g. break endpoint temporarily) — **Tools** should show the Warning strip with `mcpPageError` text; other filters and search should still work when `server` is empty.

5. **After MCP changes**: create, edit, or delete an MCP server, or run **Test connection** / **Sync tools** — Server dropdown on **Tools** should refresh to include current server names; selection remains valid or resets to "All" if the name disappeared (existing logic in `_refreshMcpServerFilterItems`).

6. **Overview count errors**: if `/McpServers` (or any parallel count) fails — expect **Error**-type strip with `mock>/overviewError` and loading flag cleared; panels may show previous or zero values depending on load order.

## Notes

- The global `governanceGlobalErrorStrip` and `requestFailed` handler on the governance model remain the primary signal for request-level OData failures; page strips add **context** (overview vs. metadata vs. filter-auxiliary load) without duplicating the same string twice when both are set.
- `_refreshMcpServerFilterItems` (implementation) is unchanged in behavior; only call sites and the new `_refreshToolServerFilterItems` alias were added to match the work-item naming and to refresh after mutations.
