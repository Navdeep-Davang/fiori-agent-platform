# Observation — Overview page (`pageOverview`)

## Current (mock)

- Tiles: `mock>/overview/*` counts (mcpCount, draftToolCount, activeToolCount, agentCount, activeAgentCount, groupCount, skillCount).
- [`Component.js`](../../app/admin/webapp/Component.js) sets counts from embedded arrays.

## Target OData

| Tile | Source |
|------|--------|
| MCP servers | `GET McpServers/$count` or list length after `bindList("/McpServers")` |
| Tools draft/active | `Tools` with `$filter=status eq 'Draft'|'Active'` counts |
| Agents total/active | `Agents` filters on `status` |
| Access groups | `AgentGroups` count |
| Skills | `Skills` count |

## Implementation note

- Use **one refresh method** on `governance` OData V4 model (e.g. after `dataReceived` or explicit `refreshOverview`) to push numbers into a small **`mock` subset** `overview` **or** bind tiles to formatter-backed read-only JSON updated from OData — avoids OData `$count` expression complexity in XML-only tiles.

## Acceptance

- Opening Overview shows counts **matching** HANA seed (after deploy) for MCP/tools/agents/groups/skills.
