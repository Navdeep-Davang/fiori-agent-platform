---
name: phase-tracker
description: Tracks phase progression in action plans, validates completion criteria, advances phases, and generates progress reports. Use when managing phase status, checking completion, or generating project progress reports.
---

# Phase Tracker

Manages phase progression and status tracking for action plans.

## Quick Start

When working with phases:

1. **Read current state**: Check action plan and manifest
2. **Verify completion**: All tasks done before advancing
3. **Update status**: Change phase status appropriately
4. **Sync manifest**: Keep manifest in sync with plan

## Phase Status Values

| Status | Description | Transition To |
|--------|-------------|---------------|
| `PENDING` | Not yet started | `IN_PROGRESS` |
| `IN_PROGRESS` | Currently being worked on | `COMPLETED`, `BLOCKED` |
| `COMPLETED` | All tasks finished | - |
| `BLOCKED` | Cannot proceed | `IN_PROGRESS` |

## Core Operations

### Check Phase Completion

Before advancing a phase, verify all tasks are complete:

```javascript
function isPhaseComplete(phaseContent) {
  // Count incomplete tasks (unchecked boxes)
  const incompleteTasks = (phaseContent.match(/- \[ \]/g) || []).length;
  return incompleteTasks === 0;
}
```

### Advance to Next Phase

When current phase is complete:

1. **Update current phase in action plan**:
   ```markdown
   ## Phase 1: Foundation
   ### Status: COMPLETED
   ```

2. **Update next phase**:
   ```markdown
   ## Phase 2: Implementation
   ### Status: IN_PROGRESS
   ```

3. **Update frontmatter**:
   ```yaml
   current_phase: phase-2
   last_updated: 2026-01-25
   ```

4. **Update manifest**:
   ```json
   {
     "phases": [
       {"id": "phase-1", "name": "Foundation", "status": "completed", "completed_at": "2026-01-25T10:00:00Z"},
       {"id": "phase-2", "name": "Implementation", "status": "in_progress", "started_at": "2026-01-25T10:00:00Z"}
     ]
   }
   ```

### Block a Phase

When a phase cannot proceed:

1. **Update phase status**:
   ```markdown
   ### Status: BLOCKED
   ```

2. **Document blocker**:
   ```markdown
   **Blocked by**: Description of what's blocking this phase
   **Unblock criteria**: What needs to happen to unblock
   ```

3. **Update manifest**:
   ```json
   {"id": "phase-2", "status": "blocked", "blocked_reason": "Waiting for API approval"}
   ```

### Generate Progress Report

To report on project progress:

```
=== Project Progress Report ===
Project: my-project
Generated: 2026-01-25T15:00:00Z

Action Plan: feature-auth
  Sync Status: SYNCED
  Overall Progress: 45%
  
  Phase 1: Foundation [COMPLETED]
    - 5/5 tasks complete
    - Completed: 2026-01-20
  
  Phase 2: Implementation [IN_PROGRESS]
    - 3/8 tasks complete
    - Started: 2026-01-21
  
  Phase 3: Testing [PENDING]
    - 0/5 tasks complete
```

### Simulation Tracking

To distinguish between fully functional implementations and those using mocks or simulations, use the `[SIMULATED]` tag in task descriptions.

```markdown
- [X] **Task 5.7**: Create `backend/services/agent_service.py` [SIMULATED]
  - [X] Subtask: Implement `run` with mock logic.
```

When a task is marked as `[SIMULATED]`:
1. It is considered "done" for the current phase progression.
2. It serves as a reminder that refactoring is needed for a "real" implementation later.
3. Users and other agents are alerted that the behavior is simulated.

### Progress Calculation

```javascript
function calculateTaskProgress(planContent) {
  const completedTasks = (planContent.match(/- \[X\]/gi) || []).length;
  const totalTasks = (planContent.match(/- \[[ X]\]/gi) || []).length;
  const simulatedTasks = (planContent.match(/\[SIMULATED\]/gi) || []).length;
  return {
    completed: completedTasks,
    total: totalTasks,
    simulated: simulatedTasks,
    percentage: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
  };
}
```

### Phase-Level Progress

```javascript
function calculatePhaseProgress(phases) {
  const completed = phases.filter(p => p.status === 'completed').length;
  const total = phases.length;
  return {
    completed,
    total,
    percentage: Math.round((completed / total) * 100)
  };
}
```

## Workflow Patterns

### Sequential Phases

Most common pattern - complete phases in order:

```
Phase 1 → Phase 2 → Phase 3 → Done
```

Rules:
- Only one phase `IN_PROGRESS` at a time
- Must complete current phase before starting next
- Cannot skip phases

### Parallel Sub-Phases

For independent work within a phase:

```markdown
## Phase 2: Implementation
### Status: IN_PROGRESS

### 2A: Backend Services
- [X] Task: API endpoints
- [ ] Task: Database layer

### 2B: Frontend Components
- [X] Task: UI components
- [ ] Task: State management
```

Both 2A and 2B can progress simultaneously.

### Iterative Phases

When phases may need revisiting:

```markdown
## Phase 2: Implementation (Iteration 2)
### Status: IN_PROGRESS
```

Track iteration count in phase name or notes.

## Integration with Manifest

### Updating Phase Status

Always keep manifest in sync:

```javascript
function updatePhaseInManifest(manifestPath, planId, phaseId, newStatus) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  const plan = manifest.artifacts.action_plans[planId];
  const phase = plan.phases.find(p => p.id === phaseId);
  
  phase.status = newStatus;
  
  if (newStatus === 'in_progress') {
    phase.started_at = new Date().toISOString();
  } else if (newStatus === 'completed') {
    phase.completed_at = new Date().toISOString();
  }
  
  manifest.last_updated = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}
```

### Querying Phase Status

```javascript
function getPhaseStatus(manifest, planId, phaseId) {
  const plan = manifest.artifacts.action_plans[planId];
  const phase = plan.phases.find(p => p.id === phaseId);
  return phase?.status || 'unknown';
}
```

## Best Practices

1. **Verify before advancing**: Always check task completion
2. **Document blockers**: When blocked, explain why
3. **Keep timestamps**: Track start/end times
4. **Regular updates**: Update status as work progresses
5. **Clear criteria**: Define what "complete" means for each phase

## Error Handling

### Incomplete Phase Advancement

If user tries to advance incomplete phase:

```
⚠️ Cannot advance phase
Phase 1 has 2 incomplete tasks:
- Task 1.3: Configure logging
- Task 1.4: Setup monitoring

Complete these tasks before advancing to Phase 2.
```

### Missing Phase in Manifest

If plan has phases not in manifest:

1. Parse phases from action plan markdown
2. Add missing phases to manifest
3. Set appropriate status based on checkboxes

### Status Mismatch

If action plan and manifest disagree:

1. Treat action plan as source of truth
2. Update manifest to match
3. Log the correction
