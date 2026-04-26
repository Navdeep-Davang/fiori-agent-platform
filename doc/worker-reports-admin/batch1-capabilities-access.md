# Batch 1 (parallel track D) — Agent ↔ skills ↔ tools & Access & groups

## Summary

Capability page **Agent** and **Tool** filter dropdowns now load **display names from governance** (`/Agents` and `/Tools` via `bindList` … `requestContexts`), stored on the existing mock paths `mock>/agentNameFilterItems` and `mock>/toolNameFilterItems`, bound with `Select items="{mock>/…}"` and `core:Item key="{mock>key}" text="{mock>text}"`. Filter logic (`_applyAgentCapabilityFilters`) is unchanged: keys remain agent/tool **names** as before.

A file-local helper **`refreshCapabilityAgentToolFilterItemsFromGovernance`** (before `Controller.extend`) performs the OData reads and invalidates selected filter keys when names disappear. The controller exposes **`_refreshCapabilityFilterAgentsAndToolsFromGovernance`**, invoked after governance metadata init, MCP actions that refresh data, and agent/tool CRUD paths that affect names.

**Skill** filter item lists are still derived only from merged capability rows via **`_updateCapabilitySkillFilterItems`** (renamed/split from the old combined dropdown updater); there is still no Skill `Select` on this page.

### Empty / error UI

- **Capabilities:** `MessageStrip` bindings for `mock>/capabilityFilterListsError`, `mock>/agentCapabilitiesError`, and `mock>/agentCapabilitiesInfo`. Informational “no rows in DB” messaging moved from the error field to **`agentCapabilitiesInfo`** so the error strip stays for real failures. **`tblAgentCapabilities`** uses **`noDataText="{mock>/agentCapabilitiesNoDataText}"`**, updated inside **`_applyAgentCapabilityFilters`** (filtered empty vs no data vs OData error). Failed OData load clears **`agentCapabilitiesFull`** and reapplies filters.
- **Access:** **`tblGroups`** uses **`mode="SingleSelectLeft"`**, **`noDataText="{mock>/groupsTableNoDataText}"`**, and **`_applyGroupFilters`** sets that text (filters vs metadata/governance banner failure).

### Access group dialog — `onOpenEditClaims`

- **Row selected:** Opens with **`editClaimsRow`**, fills name, claim key, and **description** as claim-values scratch; agents field shows a neutral note that **AgentGroupAgents** is not loaded. **Save** persists name, claimKey, and description via existing OData batch (same interim pattern as row edit).
- **No selection:** **`editClaimsTemplate`** with empty fields and **`accessDlgIsTemplateOnly`**; dialog shows an **Information** `MessageStrip` that the flow is **template-only**. **Save** shows a toast and **does not** call `AgentGroups` create (fixes the previous bug where mock “Edit claims” used `_accessDlgMode === "edit"` and fell through to **create** a new group).

### Files touched

- `app/admin/webapp/view/App.view.xml` — capability strips, bound Selects, table `noDataText`, groups table selection + `noDataText`, access page copy, `dlgAccessGroup` template strip and placeholder copy.
- `app/admin/webapp/view/App.controller.js` — helper, refresh wiring, `_updateCapabilitySkillFilterItems`, info/error split, `_applyAgentCapabilityFilters` / `_applyGroupFilters` no-data text, `onOpenEditClaims` / `onAccessGroupSave` / cancel / new group, `uiDlg.accessDlgIsTemplateOnly`.
- `app/admin/webapp/Component.js` — `agentCapabilitiesInfo`, `capabilityFilterListsError`, `agentCapabilitiesNoDataText`, `groupsTableNoDataText` (and related defaults as already present in repo).

### Constraints verified

- Capability **table rows** remain the merged mock/JSON projection from **`_refreshAgentCapabilitiesFromGovernance`** (OData-backed content flattened into `mock>/agentCapabilities`).
- **`onCapabilityRowDelete`** OData deletes for **AgentTool** / **AgentSkill** are unchanged.

## Follow-ups (out of scope)

- Expand **AgentGroups** table cells from `—` to real **claim values** and **member agents** via `$expand` or dedicated reads.
- Dedicated **AgentGroupClaimValue** (and membership) entities in the dialog instead of storing claim text in **description**.
