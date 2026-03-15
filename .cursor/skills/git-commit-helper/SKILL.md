---
name: git-commit-helper
description: Propose descriptive, structured commit messages by analyzing git status, staged changes, and current project orchestration state. This skill is for message generation ONLY; the agent must never execute git commit.
---

# Git Commit Helper

This skill helps generate high-quality commit messages that accurately reflect both code changes and project milestone progress.

## IMPORTANT: NO AUTOMATIC COMMITS

This skill is strictly for **proposing** a commit message. The agent MUST NOT execute the `git commit` command. After providing the message, the user will review and manually commit the changes.

## Instructions

When proposing a commit message:

1.  **Analyze Context (Multi-step Verification)**:
    *   **Step A: Initial Status**: Run `git status --short` to see a concise list of changed and untracked files.
    *   **Step B: Diff Summary**: If many files are changed, run `git diff --cached --stat` first to see the scale of changes before reading full content.
    *   **Step C: Targeted Diffs**: Run `git diff --cached` for staged changes AND `git diff` for unstaged changes to understand the complete current state.
        *   *Chunking Strategy*: If a diff exceeds 500 lines or is truncated in the terminal:
            1.  Redirect the output to a temp file: `git diff --cached > .cursor/temp_diff.txt`.
            2.  Use the `Read` tool with `limit: 500` and `offset: 1` to read the first chunk.
            3.  Iteratively read with `offset: 501`, `1001`, etc., until the entire diff is analyzed.
            4.  Delete the temp file when finished: `rm .cursor/temp_diff.txt`.
    *   **Step D: Shell Compatibility**: On Windows (PowerShell), always use `;` instead of `&&` for command sequencing.
    *   **Step E: Orchestration State**: Read `doc/.manifest.json`, `doc/Action-Plan/`, and `.cursor/scratchpad.md` to map changes to project milestones and tasks.

2.  **Follow Conventional Commits**:
    *   Format: `<type>(<scope>): <subject>`
    *   Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`.
    *   Example: `feat(db): implement schema initialization and seed data scripts`

3.  **Structure the Message**:
    *   **Subject**: Concise summary of the main change.
    *   **Body**: List key accomplishments, especially mapping them to Action Plan tasks.
    *   **Footer**: (Optional) Reference related issues or breaking changes.

5.  **Conclusion**:
    *   Present the commit message to the user as a code block for easy copying.
    *   State clearly that the user should review the message and execute the commit manually.
    *   **NEVER** execute `git commit` yourself when using this skill.

## Examples

**Example 1: Initializing Project**
Input: Created .env.example and docker-compose.yml for Phase 1.
Output:
```text
feat(scaffold): initialize project environment and docker configuration

- Create .env.example with all required environment variables
- Define docker-compose.yml for core services (db, backend, gateway, MCPs)
- Add project synchronization rule to .cursor/rules/
```

**Example 2: Database Setup**
Input: Finished Phase 2 tasks: init_db.py and seed_data.py.
Output:
```text
feat(db): implement database initialization and sample data seeding

- Create scripts/init_db.py to set up PostgreSQL with pgvector schema
- Implement scripts/seed_data.py with sample business data for demos
- Add scripts/generate_jwt.py for manual authentication testing
```
