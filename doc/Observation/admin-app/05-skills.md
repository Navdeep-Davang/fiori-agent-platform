# Observation — Skills (`pageSkills`)

## Current (mock)

- Full CRUD on JSON `skills` / `skillsFull`.

## Target OData

- **Entity set:** `Skills` — fields `name`, `description`, `status`, `modifiedAt`, `body` ([`db/schema.cds`](../../../db/schema.cds)).

## Risks

- **LargeString** `body` in list — consider `$select` excluding body for list, load on edit only.

## Acceptance

- Table lists rows from [`db/data/acp-Skill.csv`](../../../db/data/acp-Skill.csv) after deploy; edit opens dialog with OData-backed load/save when CRUD wired.
