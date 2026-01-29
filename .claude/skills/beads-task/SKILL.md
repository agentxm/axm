---
name: beads-task
description: Execute a single bead task. Use when spawning a sub-agent to implement a specific bead.
user-invocable: false
---

# Execute Bead Task

This skill provides the template for sub-agents executing bead tasks.

## Sub-Agent Prompt Template

When spawning a sub-agent to implement a bead task, use this template:

```
You are implementing bead task <bead-id>: <task-title>

**Acceptance Criteria:**
<paste from bd show output>

**Instructions:**
1. Mark task in-progress: `bd update <bead-id> --status=in-progress`
2. <task-specific instructions>
3. Verify acceptance criteria met
4. Close task: `bd close <bead-id>`
```

## Common bd Commands

**Before starting work:**

```bash
# Mark task in-progress
bd update <task-id> --status=in-progress
```

**After completing work:**

```bash
# Close task with reason
bd close <task-id> --reason "Acceptance criteria met"
```

**Query commands:**

```bash
# Show task details and dependencies
bd show <task-id>

# List open tasks
bd list --status=open
```

## Workflow

1. **Read the task** - Use `bd show <bead-id>` to get full details
2. **Check dependencies** - Verify all blockers show ✓ (closed)
3. **Mark in-progress** - `bd update <bead-id> --status=in-progress`
4. **Do the work** - Follow acceptance criteria
5. **Verify** - Confirm all criteria are met
6. **Close** - `bd close <bead-id> --reason "..."`

## Notes

- Dependencies shown with ✓ are closed (satisfied)
- Dependencies shown with ○ are open (blocking)
- Use `--reason` flag (not `--comment`) when closing
- Sub-agents should close their own tasks when done
