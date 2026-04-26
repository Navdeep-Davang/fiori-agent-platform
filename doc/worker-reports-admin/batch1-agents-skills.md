# Batch 1 — Agents & Skills hardening (parallel track C)

## Scope

Admin Fiori app only: `app/admin/webapp/view/App.view.xml`, `app/admin/webapp/view/App.controller.js`, `app/admin/webapp/Component.js`. No governance service or CAP changes.

## Agents page

- **Table `tblAgents`**: `noDataText` bound via `formatAgentsTableNoData` using `mock>/governanceMetadataFailed` and `mock>/governanceError` so empty vs OData-unavailable messaging matches the global governance banner.
- **Tools column**: Uses `formatAgentToolCount` on `governance>name` (same logic as before, now visible in the grid).
- **Filters**: Status and model profile dropdowns are populated from **distinct values** read from `/Agents` (`$select=status,modelProfile`) after metadata loads (`_refreshAgentFilterItemsFromGovernance`). Invalid prior keys are cleared. Non-blocking failures set `mock>/agentsFilterError` and fall back to **All** only.
- **Dept gate**: The CDS `Agent` entity has no dept field; the filter row is disabled with a single “All (not filterable on Agent)” option and the info `MessageStrip` documents that access groups cover claims.
- **Warning strip**: Shown when `agentsFilterError` is set. Cleared when governance metadata init succeeds (before filter refresh).

## Skills page

- **Table `tblSkills`**: `noDataText` via `formatSkillsTableNoData` (same governance error inputs as agents).
- **Copy**: Skills `MessageStrip` no longer references “§”; states skills are OData-backed with CRUD on the same service.

## Dialogs

- **`dlgAgent`**: Removed fake **Dept gate** select (not persisted on `Agent`). Replaced misleading numeric **Assigned tools** input with read-only **`agentDlgToolsLabel`** plus short guidance to use **Agent ↔ skills ↔ tools** and access groups. New/edit handlers set the label from `formatAgentToolCount` or a fixed hint for new agents.
- **`dlgSkill`**: Edit path coerces `body` with `o.body != null ? String(o.body) : ""` when the list context omits or nulls `body`.

## Controller / resilience

- **`_applyAgentFilters` / `_applySkillFilters`**: Guard when `mock` is missing before reading filter state.
- **`onAgentRowDelete` / `onSkillRowDelete`**: Appended `.catch` on the delete promise chain; agent delete also calls `_refreshAgentFilterItemsFromGovernance` after success.
- **`onAgentDlgSave`**: After successful create/update, `_refreshAgentFilterItemsFromGovernance` keeps filter lists aligned with data.
- **`_refreshPlaygroundAgentItems`**: Added `.catch` mirroring the existing rejection handler for agent list load.
- **Comment**: Region label `Skills (mock)` → **`Skills (Governance OData)`**.

## Optional / deferred

- **Skills status filter**: Left as static enum-aligned options (matches `Skill.status` in CDS); no OData distinct refresh (lower value than agents; keeps scope small).
- **`skillsFilterError`**: Reserved on `mock` model for future use; not wired in this batch.

## Verification

- Load app with valid governance JWT: agents/skills tables fill; status/model filters show distincts plus All.
- Simulate metadata failure or strip error: `noDataText` shows OData-unavailable line; global strip still primary.
- New agent dialog: no dept field; tool count line is explanatory, not editable.
