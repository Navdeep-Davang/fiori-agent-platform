# Observation — Agent ↔ skills ↔ tools (`pageAgentSkillTools`)

## Current (mock)

- Unified table built from `agentToolsFull` + `agentSkillToolLinksFull` in [`App.controller.js`](../../app/admin/webapp/App.controller.js) `_buildAgentCapabilityRows`.

## Target OData

- **Sources:** `AgentTools` ($expand=agent,tool), `AgentSkills` ($expand=agent,skill).
- **Skill→tool “link”** in mock is narrative-only; HANA has **no** single entity for “skill exposes tool” — either keep **derived** rows in JSON (filled from two OData reads) or add CDS view later.

## Implementation approach (MVP)

- On init / after governance refresh: `bindList` + `requestContexts` for both entity sets with expands, merge to **same row shape** as today, write to `mock>/agentCapabilities` so existing filters keep working.

## Acceptance

- Rows reflect **AgentTool** and **AgentSkill** seed data; filters still apply on merged JSON.
