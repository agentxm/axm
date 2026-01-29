---
name: beads-plan
description: Create beads WBS from a markdown task plan. Use when starting work on a tasks.md file that needs beads for multi-session tracking.
context: fork
agent: general-purpose
allowed-tools: Bash(bd *), Read, Glob, Edit
---

# Create Beads WBS from Markdown Task Plan

Create a complete beads hierarchy from the markdown task plan at `$ARGUMENTS`.

## Workflow

### Step 1: Read the task plan

Read the markdown file to understand:

- Plan title (becomes plan epic)
- Phases (become phase epics)
- Tasks within each phase (become task beads)
- Dependencies between tasks
- Acceptance criteria for each task

### Step 2: Create plan epic

```bash
bd create --type=epic --title="<Plan Title>" --priority=2 \
  --description="Tracks execution of the task plan.
**Plan document:** $ARGUMENTS"
```

Record the returned bead ID (e.g., `axm-1`).

### Step 3: Create phase epics

For each phase, create an epic under the plan:

```bash
bd create --type=epic --title="Phase N: <Phase Name>" --priority=2 \
  --parent=<plan-epic-id>
```

Record each phase epic ID.

### Step 4: Create task beads

For each task, create a bead under its phase epic:

```bash
bd create --type=task --title="<Task Title>" --priority=2 \
  --labels=AUTO --parent=<phase-epic-id> \
  --description="<Task description>
**Implements:** <spec refs>
**Source:** TASK-N.M in $ARGUMENTS" \
  --acceptance="<acceptance criteria as markdown checklist>"
```

### Step 5: Create document update tasks

For each phase, create a task to update the markdown when the phase completes:

```bash
bd create --type=task --title="Update Phase N completion in task plan" \
  --priority=3 --labels=AUTO --parent=<phase-epic-id> \
  --description="Synchronize markdown task plan with completed work.
**Source document:** $ARGUMENTS" \
  --acceptance="- [ ] All Phase N acceptance criteria boxes checked in markdown
- [ ] Bead IDs annotated on tasks"
```

### Step 6: Set dependencies

After all beads exist, create blocking relationships:

```bash
# Task dependencies (bd dep add <blocked> <blocker>)
bd dep add <task-1.2-id> <task-1.1-id>

# Document update task depends on all phase tasks
bd dep add <update-task-id> <task-1.1-id>
bd dep add <update-task-id> <task-1.2-id>
```

### Step 7: Annotate the markdown

Edit the task plan to add bead IDs:

- Add `**Plan Epic:** <id>` at document top
- Add `**Epic:** <id>` below each phase header
- Add `**Bead:** <id>` as first field in each task

### Step 8: Verify structure

```bash
bd list --status=open
bd show <plan-epic-id>
```

## Output

Summarize what was created:

- Plan epic ID
- Phase epic IDs
- Task bead IDs
- Dependencies set
- Document annotations added
