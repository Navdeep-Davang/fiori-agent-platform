# Observation — Agents (`pageAgents`)

## Current (mock)

- Columns include **deptGate** and **assignedTools** — **not** on [`acp.Agent`](../../../db/schema.cds) entity.

## Target OData

- **Entity set:** `Agents`.
- **Dept gate:** derive later from `AgentGroup` / claim semantics, or drop column until modeled; MVP shows **"—"**.
- **Tools count:** optional `$count` on `tools` navigation or async enrichment; MVP **"—"** acceptable.

## CRUD

- `createdBy` set on CREATE in service impl.
- Dialog “Save” should become **OData create/patch** — scope for follow-up if not in first pass.

## Acceptance

- List shows seed agents (Procurement Assistant, Invoice Analyst, General Assistant) with **modelProfile**, **identityMode**, **status** from DB.
