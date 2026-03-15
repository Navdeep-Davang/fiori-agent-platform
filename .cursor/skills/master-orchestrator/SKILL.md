---
name: master-orchestrator
description: Orchestrates complex multi-phase projects by dynamically spawning subagents. Use when executing action plans, coordinating parallel tasks, or managing multi-step workflows. Provides task parsing, complexity assessment, prompt crafting, and review cycle management.
---

# Master Orchestrator Skill

This skill enables intelligent orchestration of complex projects by dynamically spawning and coordinating subagents.

## Quick Start

When orchestrating an action plan:

1. **Initialize**: Read manifest, check sync status, create scratchpad
2. **Analyze**: Parse tasks, build dependency graph, assess complexity
3. **Execute**: Spawn subagents with crafted prompts, track in scratchpad
4. **Review**: Aggregate reports, validate quality, iterate if needed
5. **Complete**: Update manifest, mark action plan tasks done, report to user

## Task Parsing

### Extracting Tasks from Action Plans

Action plans follow this structure:
```markdown
## Phase N: Phase Name
### Status: PENDING|IN_PROGRESS|COMPLETED

- [ ] **Task N.1**: Task description [SIMULATED]
  - [ ] Subtask description
  - [ ] Subtask description
- [ ] **Task N.2**: Task description
```

**Note on Simulation**: Tasks using mocks or simulations should be tagged with `[SIMULATED]`. This ensures the user is aware of non-production or placeholder behavior.

### Building a Task List

Parse into structured format:
```
Task ID: phase-N-task-M (e.g., phase-1-task-2)
Description: From the task line (including [SIMULATED] if present)
Subtasks: Array of subtask descriptions
Status: Derived from checkbox [ ] or [X]
Simulated: Boolean, true if description contains [SIMULATED]
Dependencies: Inferred from order and descriptions
```

### Identifying Dependencies

1. **Explicit**: Task mentions another task or its output
2. **Sequential**: Within a phase, later tasks may depend on earlier ones
3. **Cross-phase**: Phase N+1 tasks depend on Phase N completion
4. **Implicit**: Backend before frontend integration, schema before queries

### Dependency Graph Example

```
Phase 1:
  task-1-1 (Setup) -> task-1-2 (Implement) -> task-1-3 (Test)
                   \-> task-1-4 (Docs)      # parallel with task-1-2

Phase 2:
  task-2-1 -> depends on phase-1 completion
```

## Complexity Assessment

### Assessment Criteria

| Factor | Simple | Medium | Complex |
|--------|--------|--------|---------|
| Files | 1 file | 2-3 files | 4+ files |
| Lines changed | < 50 | 50-200 | > 200 |
| Requirements | Clear, specific | Some ambiguity | Unclear, needs interpretation |
| Architecture | No impact | Local impact | System-wide impact |
| Dependencies | None | Few, well-defined | Many, complex |
| Testing | Simple unit test | Multiple test types | Integration/E2E needed |

### Scoring Algorithm

```
Score each factor 1-3 (Simple=1, Medium=2, Complex=3)
Total = sum of all factors
Complexity:
  - Total <= 8: Simple (use fast model)
  - Total 9-14: Medium (use default model)
  - Total >= 15: Complex (use default model, consider breaking down)
```

### Quick Heuristics

**Simple tasks** (use `fast` model):
- File renames or moves
- Config file updates
- Adding/removing imports
- Simple documentation fixes
- Boilerplate code generation
- Single function implementation (clear spec)

**Complex tasks** (use default model):
- New feature implementation
- Refactoring across multiple files
- API design decisions
- Database schema changes
- Authentication/authorization logic
- Integration with external services

## Dynamic Prompt Crafting

### Prompt Structure

Every subagent prompt should include:

```markdown
You are executing a specific task as part of a larger project orchestration.

## Task
[One clear sentence describing the objective]

## Context
### Architecture Reference
[Relevant excerpts or references to architecture docs]

### Codebase Patterns
[Examples of similar implementations in the codebase]

### Dependencies
[Libraries, services, or prior work this builds on]

## Detailed Requirements
1. [Specific, actionable requirement]
2. [Another requirement]
...

## Files
### To Create
- `path/to/new/file.ext` - [Purpose and key contents]

### To Modify
- `path/to/existing/file.ext` - [What to change and why]

### To Reference (read-only)
- `path/to/reference/file.ext` - [What patterns to follow]

## Acceptance Criteria
From the action plan, each criterion must be verifiable:
- [ ] [Criterion 1]
- [ ] [Criterion 2]
...

## Testing Requirements
- [What tests to write]
- [How to run verification]

## Report Instructions
When complete, write your report to:
`.cursor/worker-reports/[task-id].md`

Use this format:
---
task_id: [task-id]
status: COMPLETE | PARTIAL | BLOCKED
started: [ISO timestamp when you began]
completed: [ISO timestamp when you finished]
model_used: [fast or default]
---

## Summary
[2-3 sentences on what was accomplished]

## Changes Made
### Files Created
- `path/file.ext` - [description]

### Files Modified
- `path/file.ext` - [what changed]

## Verification
- Tests written: [list]
- Tests passing: [yes/no with details]
- Manual verification: [what was checked]

## Issues
- [Any problems encountered]
- [Blockers if status is BLOCKED or PARTIAL]

## Notes for Master
[Context the orchestrator needs for review]
```

### Context Gathering Checklist

Before crafting prompt, gather:
- [ ] Read task description from action plan
- [ ] Find relevant architecture doc sections
- [ ] Identify similar code patterns in codebase
- [ ] Check dependencies (package.json, imports)
- [ ] Note any constraints from previous tasks
- [ ] Extract acceptance criteria

### Prompt Quality Verification

Before spawning, verify:
- [ ] Objective is unambiguous (single clear goal)
- [ ] Context is sufficient (no external knowledge needed)
- [ ] Files are specific (exact paths, not patterns)
- [ ] Criteria are measurable (can verify completion)
- [ ] Report location is specified

## Model Selection

### Decision Tree

```
Is task clearly defined with < 50 lines change?
├── Yes: Is it a single file with no architectural impact?
│   ├── Yes: Use "fast" model
│   └── No: Use default model
└── No: Use default model
```

### Model Comparison

| Aspect | fast | default |
|--------|------|---------|
| Speed | Very fast | Standard |
| Cost | Lower | Standard |
| Reasoning | Basic | Advanced |
| Best for | Simple, clear tasks | Complex, ambiguous tasks |

### When to Use Fast Model

- Single file modifications
- Configuration changes
- Import/export updates
- Simple function implementations
- Documentation updates
- Code formatting/cleanup
- Boilerplate generation

### When to Use Default Model

- Multi-file implementations
- Architectural decisions
- Complex business logic
- Debugging and troubleshooting
- API design
- Database operations
- Security-sensitive code

### Important: Model Inheritance

**"Default" means inherited model, not a specific model.**

When you omit the `model` parameter in Task tool calls:
- The subagent inherits the parent agent's model (e.g., Gemini 3 Flash if that's what you have configured in Cursor)
- This ensures complex tasks get your full model capabilities

When you specify `model: "fast"`:
- The subagent uses Cursor's optimized fast model
- Best for trivial tasks to save cost and latency

**To use a specific model (like Gemini 3 Flash) for orchestration:**
1. Configure Cursor IDE to use that model as your primary model
2. The master orchestrator will use your configured model
3. Subagents without `model` specified inherit that model
4. Only tasks with `model: "fast"` will use the fast model

**Task Tool Usage:**
```javascript
// Complex task - inherits parent model (e.g., Gemini 3 Flash)
Task(
  description: "Implement authentication",
  prompt: "...",
  subagent_type: "generalPurpose"
  // No model param = uses parent's model
)

// Simple task - explicitly use fast model
Task(
  description: "Update config",
  prompt: "...",
  model: "fast",
  subagent_type: "generalPurpose"
)
```

## Scratchpad Management

### Initialization

Create `.cursor/scratchpad.md` at orchestration start:

```markdown
# Orchestration Scratchpad

## Session Info
- Action Plan: [plan-id]
- Started: [ISO timestamp]
- Architecture Sync: [synced/out_of_sync]

## Current Cycle: 1
## Status: INITIALIZING

## Task Analysis
| ID | Description | Complexity | Model | Deps | Status |
|----|-------------|------------|-------|------|--------|

## Parallel Groups

## Spawned Subagents
| Task | Time | Model | Status | Report |
|------|------|-------|--------|--------|

## Review Notes

## User Questions

## DONE
```

### Updating During Orchestration

After each significant event:
- Task analysis complete: Update Task Analysis table
- Subagent spawned: Add to Spawned Subagents
- Report received: Update status, add Review Notes
- Cycle complete: Increment cycle, update overall Status

### Completion Marker

Write `DONE` in the DONE section only when:
- All tasks show COMPLETE status
- All reports have been reviewed
- Action plan checkboxes updated
- Manifest phase status updated

## Report Aggregation

### Reading Reports

Reports are in `.cursor/worker-reports/[task-id].md`

Parse the YAML frontmatter for:
- `status`: COMPLETE, PARTIAL, or BLOCKED
- `task_id`: Match to your task tracking
- `completed`: Timestamp for tracking

### Status Handling

**COMPLETE**: 
- Verify acceptance criteria in report
- Update task status in scratchpad
- Mark checkbox in action plan

**PARTIAL**:
- Review what's done vs. remaining
- Spawn follow-up subagent for remaining work
- Include completed context in new prompt

**BLOCKED**:
- Identify the blocker
- If resolvable: spawn subagent to unblock
- If needs user input: ask question
- If dependency: wait or reorder

### Quality Review

For each COMPLETE report, verify:
- [ ] All acceptance criteria addressed
- [ ] Tests mentioned and passing
- [ ] No concerning issues noted
- [ ] Implementation matches architecture

## Iteration Management

### Cycle Flow

```
Cycle N:
1. Identify ready tasks (dependencies met)
2. Spawn subagents for ready tasks
3. Wait for reports
4. Review and validate
5. If issues: prepare corrections → Cycle N+1
6. If all complete: finish
```

### Iteration Limits

Default limit: 10 cycles (configurable in hooks)

If limit approaching:
- Summarize completed work
- List remaining/blocked tasks
- Ask user for guidance

### Correction Spawning

When a task needs correction:
```
Prompt includes:
- Original task objective
- What was attempted (from report)
- Specific issue to fix
- Additional guidance/constraints
- Same report location (overwrite)
```

## Integration Points

### With Manifest (`doc/.manifest.json`)

- **Read at start**: Check sync status, current progress
- **Update at end**: Mark phases complete, update timestamps

### With Action Plans (`doc/Action-Plans/*.md`)

- **Parse tasks**: Extract from markdown structure
- **Update progress**: Check/uncheck task boxes
- **Maintain format**: Preserve existing structure

### With Architecture Docs

- **Check sync**: Ensure architecture is current
- **Reference**: Include relevant sections in prompts
- **Alert if stale**: Warn user if out_of_sync

## Detailed Workflow Procedures

These are the step-by-step procedures for each orchestration phase.

### Phase 1: Initialization

1. **Read the action plan** provided by the user
2. **Read the manifest** at `doc/.manifest.json` to check:
   - Sync status of related architecture documents
   - Current phase and task progress
3. **Alert user** if any architecture is `out_of_sync` - ask how to proceed
4. **Initialize scratchpad** at `.cursor/scratchpad.md` using the format above
5. **Create worker-reports directory** if not exists: `.cursor/worker-reports/`

### Phase 2: Task Analysis

1. **Parse tasks** from the action plan into a structured list (see Task Parsing section)
2. **Build dependency graph**:
   - Tasks with subtasks must complete subtasks first
   - Identify explicit dependencies (referenced in task descriptions)
   - Identify implicit dependencies (e.g., backend before frontend integration)
3. **Assess complexity** for each task using the Scoring Algorithm
4. **Group parallel tasks**: Independent tasks that can run simultaneously
5. **Update scratchpad** with complete task analysis

### Phase 3: Dynamic Subagent Spawning

For each task (or parallel group of tasks):

1. **Gather context** for the task:
   - Read relevant sections from architecture documents
   - Identify existing code patterns in the codebase
   - Note any dependencies or constraints

2. **Craft a detailed prompt** using the Prompt Structure template:
   - Clear task objective
   - Context from architecture and codebase
   - Specific files to create/modify
   - Acceptance criteria from the action plan
   - Report format and location

3. **Select model** based on complexity assessment:
   - `fast`: For simple, well-defined tasks (complexity score <= 8)
   - Default (omit parameter): For medium/complex tasks (score > 8)

4. **Spawn using Task tool**:
   ```
   Task tool parameters:
   - description: Short task summary (3-5 words)
   - prompt: Full detailed instructions (crafted above)
   - model: "fast" for simple tasks, omit for complex
   - subagent_type: "generalPurpose"
   ```

5. **Record in scratchpad**: Task ID, spawn time, model used, prompt summary

### Phase 4: Review Cycle

1. **Wait for subagents** to complete
2. **Read all reports** from `.cursor/worker-reports/`
3. **Evaluate quality** for each report:
   - Were all acceptance criteria met?
   - Do tests pass?
   - Are there any blockers or issues?
4. **Handle by status**:
   - **COMPLETE**: Verify criteria, update scratchpad, mark checkbox
   - **PARTIAL**: Spawn follow-up subagent with remaining work context
   - **BLOCKED**: Determine if resolvable or needs user input
5. **Update scratchpad** with review notes
6. **Iterate** if corrections needed (return to Phase 3 for specific tasks)

### Phase 5: Completion

1. **Update action plan**: Mark completed tasks with `[X]`
2. **Update manifest**: Update phase status in `doc/.manifest.json`
3. **Write "DONE"** to scratchpad DONE section
4. **Report to user** with summary:
   - Tasks completed
   - Files created/modified
   - Any issues or notes
   - Time taken

## Best Practices

### Do
- Analyze fully before spawning
- Craft context-rich prompts
- Use fast model for truly simple tasks
- Keep scratchpad current
- Review reports thoroughly
- Ask user when uncertain

### Don't
- Spawn all tasks at once (verify incrementally)
- Use generic prompts (craft per task)
- Ignore PARTIAL/BLOCKED status
- Skip scratchpad updates
- Assume task success without report review
- Exceed iteration limits silently

## Troubleshooting

### Subagent Not Following Instructions
- Check prompt clarity
- Add more specific examples
- Break into smaller task

### Reports Missing
- Verify report path in prompt
- Check worker-reports directory exists
- Spawn retry with explicit instructions

### Dependency Conflicts
- Review dependency graph
- Ensure proper ordering
- Consider sequential execution

### Performance Issues
- Use fast model more aggressively
- Parallelize independent tasks
- Reduce prompt verbosity for simple tasks
