---
name: beads-execute
description: Execute a single bead task. Use when implementing a specific bead from a task plan.
context: fork
agent: general-purpose
allowed-tools: Bash(bd *), Read, Write, Edit, Glob, Grep
---

# Execute Bead Task

Execute bead task `$ARGUMENTS`.

## Workflow

### Step 1: Read the bead

```bash
bd show $ARGUMENTS
```

Understand:

- Task title and description
- Acceptance criteria (checklist items)
- Dependencies (verify all show ✓)
- Source reference (TASK-N.M in tasks.md)

### Step 2: Mark in-progress (REQUIRED)

**CRITICAL**: Always mark the task in-progress before starting work:

```bash
bd update $ARGUMENTS --status=in-progress
```

This signals to other agents that work has begun and prevents duplicate effort.

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
