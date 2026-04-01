---
name: project-orchestrator
description: Manages project orchestration including manifest operations, action plan creation/updates, task tracking, and sync status reporting. Use when working on complex multi-phase projects, creating action plans, updating task progress, or checking project state.
---

# Project Orchestrator

Manages the AI Agent Orchestration System for complex multi-phase projects.

## Quick Start

Before starting work on any project with action plans:

1. **Check for manifest**: Look for `doc/.manifest.json`
2. **If no manifest**: Initialize one using the workflow below
3. **If manifest exists**: Read it to understand project state and sync status

## Core Operations

### Initialize Project Manifest

When starting orchestration for a new project:

```bash
node ~/.cursor/skills/project-orchestrator/scripts/init-manifest.js
```

Or manually create `doc/.manifest.json`:

```json
{
  "version": "1.0",
  "project_id": "<project-name>",
  "created": "<ISO-timestamp>",
  "last_updated": "<ISO-timestamp>",
  "artifacts": {
    "architectures": {},
    "action_plans": {}
  }
}
```

### Check Project State

At the start of each session:

1. Read `doc/.manifest.json`
2. Check `sync_status` of relevant action plans
3. If any are `out_of_sync`, notify user before proceeding

### Create Action Plan

When user requests a new action plan:

1. Create file at `doc/Action-Plans/<plan-id>.md`
2. Use the action plan template format with frontmatter
3. Register in manifest under `artifacts.action_plans`
4. Link to architecture documents if applicable

Template location: `~/.cursor/doc/templates/action-plan-template.md`

### Update Task Status

After completing a task:

1. Update the checkbox in the action plan markdown: `- [ ]` → `- [X]` (**required in the same turn as the implementation**; if work was done by a subagent, the primary agent must still edit the plan after verification).
2. If all tasks in phase complete, update phase status
3. Update manifest `phases` array with new status
4. Update `last_updated` timestamp

**Gap that caused drift:** Delegation without a follow-up edit to `doc/Action-Plan/...` — always pair subagent completion with orchestrator checkbox updates (see `action-plan-guidelines.mdc` §5).

### Mark Plan as Synced

After reviewing architecture changes:

1. Update frontmatter: `sync_status: synced`
2. Update manifest: `sync_status: "synced"`
3. Update `last_synced_hash` to current architecture hash

## Action Plan Structure

### Frontmatter (Required)

```yaml
---
id: unique-plan-id
title: Human Readable Title
architecture_refs:
  - doc/Architecture/relevant.md
sync_status: synced
created: YYYY-MM-DD
last_updated: YYYY-MM-DD
current_phase: phase-1
---
```

### Body Structure

```markdown
# Plan Title

## Architecture Reference
- [Architecture Name](../Architecture/file.md) - Status: SYNCED|OUT_OF_SYNC

## Phase 1: Phase Name
### Status: PENDING|IN_PROGRESS|COMPLETED|BLOCKED

- [ ] **Task 1.1**: Task description
  - [ ] Subtask description
  - [ ] Subtask description
- [ ] **Task 1.2**: Task description

## Phase 2: Phase Name
### Status: PENDING

- [ ] **Task 2.1**: Task description
```

## Manifest Operations

### Add Architecture Reference

When architecture document is created:

```javascript
manifest.artifacts.architectures["arch-id"] = {
  path: "doc/Architecture/filename.md",
  hash: "sha256:<computed-hash>",
  last_modified: new Date().toISOString(),
  description: "Brief description"
};
```

### Add Action Plan

When action plan is created:

```javascript
manifest.artifacts.action_plans["plan-id"] = {
  path: "doc/Action-Plans/filename.md",
  architecture_refs: ["arch-id"],
  sync_status: "synced",
  last_synced_hash: "sha256:<architecture-hash>",
  created: new Date().toISOString(),
  phases: [
    { id: "phase-1", name: "Phase Name", status: "pending" }
  ]
};
```

### Update Phase Status

When phase changes:

```javascript
const plan = manifest.artifacts.action_plans["plan-id"];
const phase = plan.phases.find(p => p.id === "phase-1");
phase.status = "completed";
phase.completed_at = new Date().toISOString();
manifest.last_updated = new Date().toISOString();
```

## Sync Status Workflow

### When Sync Status is "out_of_sync"

1. **Notify User**:
   ```
   ⚠️ Action plan [plan-name] is OUT OF SYNC with its architecture.
   The referenced architecture has been modified since last sync.
   Please review the architecture changes before proceeding.
   ```

2. **Show Architecture Changes**:
   - Read the current architecture document
   - Summarize what might have changed

3. **Get User Confirmation**:
   - Ask if action plan needs updates
   - If yes, update the plan
   - Mark as synced when done

### Marking as Synced

After user confirms plan is up-to-date:

1. Compute current hash of architecture file
2. Update action plan frontmatter: `sync_status: synced`
3. Update manifest:
   ```javascript
   plan.sync_status = "synced";
   plan.last_synced_hash = currentArchHash;
   ```

## Utility Scripts

Located in `~/.cursor/skills/project-orchestrator/scripts/`:

| Script | Purpose |
|--------|---------|
| `init-manifest.js` | Initialize new project manifest |
| `sync-detector.js` | Hook script for sync detection |
| `update-task-status.js` | Update task/phase status |
| `check-sync-status.js` | Report sync status of all plans |

## Best Practices

1. **Always check manifest first** - Before any action plan work
2. **Update status immediately** - After completing tasks
3. **Keep phases focused** - 3-7 tasks per phase is ideal
4. **Use clear task names** - Start with verb (Implement, Create, Configure)
5. **Include completion criteria** - What defines "done"

## Error Handling

### Manifest Not Found
- Offer to initialize a new manifest
- Explain the orchestration system benefits

### Architecture Not Found
- Warn user about missing reference
- Suggest creating the architecture document

### Invalid Sync Status
- Default to "out_of_sync" for safety
- Prompt user to verify and resync
