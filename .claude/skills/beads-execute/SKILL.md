---
name: beads-execute
description: Implement a single bead task (used by sub-agents). Called by /beads-execute-plan, not directly by users.
context: fork
agent: general-purpose
allowed-tools: Bash(bd *), Read, Write, Edit, Glob, Grep
---

# Execute Bead Task

Execute bead task `$ARGUMENTS`.

**CRITICAL: Do NOT use Claude Code's built-in task tools (TaskCreate, TaskUpdate, TaskList, TaskGet).** Use only `bd` CLI commands for task management.

## Workflow

### Step 1: Mark in-progress (REQUIRED - DO THIS FIRST)

**CRITICAL**: Before ANY other action, mark the task in-progress:

```bash
bd update $ARGUMENTS --status=in-progress
```

This MUST be your first command. Do not read files, check dependencies, or do any work until this command succeeds. This signals to other agents that work has begun and prevents duplicate effort.

### Step 2: Read the bead

```bash
bd show $ARGUMENTS
```

Understand:

- Task title and description
- Acceptance criteria (checklist items)
- Dependencies (verify all show ✓)
- Source reference (TASK-N.M in tasks.md)

### Step 3: Implement the task

Based on the acceptance criteria, implement the required changes:

- Read relevant source files to understand context
- Make necessary code changes
- Run tests if applicable (`pnpm test <pattern>`)
- Verify each acceptance criterion is met

### Step 4: Verify completion

Confirm ALL acceptance criteria are satisfied before closing.

### Step 5: Close the bead

```bash
bd close $ARGUMENTS --reason "Acceptance criteria met"
```

Use `--reason` (not `--comment`) to document completion.

## Output

Summarize:

- What was implemented
- Which acceptance criteria were met
- Any issues encountered
- The bead is now closed
