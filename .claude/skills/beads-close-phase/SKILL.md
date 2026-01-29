---
name: beads-close-phase
description: Close phase epic and sync markdown. Use when all tasks in a phase show closed in `bd show`.
allowed-tools: Bash(bd *), Read, Edit
---

# Close Phase and Update Markdown

Close phase `$ARGUMENTS` after verifying all tasks are complete and updating the markdown document.

## Workflow

### Step 1: Verify all tasks complete

```bash
bd show $ARGUMENTS
```

Check that all child tasks show ✓ (closed). If any show ○ (open), they must be completed first.

### Step 2: Find the source document

The phase epic or its tasks should reference the source markdown file in their description (look for `**Plan document:**` or `**Source:**`).

### Step 3: Update the markdown

Edit the task plan to check off completed acceptance criteria:

- Change `- [ ]` to `- [x]` for all completed items in the phase
- Update the traceability matrix status if present

### Step 4: Close the document update task

```bash
bd list --status=open | grep "Update Phase"
bd close <update-task-id> --reason "Markdown updated with Phase N completion"
```

### Step 5: Close the phase epic

```bash
bd close $ARGUMENTS --reason "All Phase N tasks complete"
```

### Step 6: Check for newly unblocked work

```bash
bd list --status=open --suggest-next
```

## Common bd Commands

```bash
# List closed tasks in a phase
bd list --status=closed | grep <phase-id>

# Close with reason
bd close <id> --reason "Description of completion"

# Show what's unblocked
bd list --status=open
```

## Automatic Invocation

This skill should be invoked by `/beads-execute-plan` when:

- All tasks in a phase show ✓ (closed)
- The phase has document update tasks

## Output

Summarize:

- Tasks verified complete
- Markdown acceptance criteria updated
- Phase epic closed
- Next available work (if any)

## Important

**Do not leave phases open after all tasks complete.** The orchestrator must either:

1. Call this skill to update markdown and close the phase, OR
2. Directly close the phase with `bd close <epic-id> --reason "..."`
