# Observation — Access & groups (`pageAccess`)

## Current (mock)

- Flat `claimValues` and `assignedAgents` strings per group row.

## Target OData

- **Entity set:** `AgentGroups` — compositions `claimValues` → `AgentGroupClaimValue`, `agents` → `AgentGroupAgent` → `agent`.
- **List row:** show `name`, `claimKey`, `status`; second-line aggregates need **`$expand=claimValues,agents($expand=agent)`** or formatted string built in controller.

## Risks

- N+1 queries if expand not used; large payload if many children.

## Acceptance

- One row per `AgentGroup` from HANA; claim values / agents shown as concatenated strings **or** "—" until expand formatter added.
