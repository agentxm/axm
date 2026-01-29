---
name: beads-task
description: Reference template for manually spawning sub-agents to execute bead tasks. Prefer /beads-execute for automatic sub-agent execution.
user-invocable: false
---

# Bead Task Reference Template

This skill provides the prompt template for manually spawning sub-agents with the
Task tool. For automatic sub-agent execution, use `/beads-execute <bead-id>` instead.

## Sub-Agent Prompt Template

When spawning a sub-agent to implement a bead task, use this template:

```
You are implementing bead task <bead-id>: <task-title>

**Acceptance Criteria:**
<paste from bd show output>

**Instructions:**
1. IMMEDIATELY mark task in-progress (before ANY other action):
   `bd update <bead-id> --status=in-progress`
   Do NOT proceed until this command succeeds.
2. Read the bead details: `bd show <bead-id>`
3. <task-specific instructions>
4. Verify acceptance criteria met
5. Close task: `bd close <bead-id> --reason "Acceptance criteria met"`
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

1. **Mark in-progress FIRST** - `bd update <bead-id> --status=in-progress` (do this before anything else)
2. **Read the task** - Use `bd show <bead-id>` to get full details
3. **Check dependencies** - Verify all blockers show ✓ (closed)
4. **Do the work** - Follow acceptance criteria
5. **Verify** - Confirm all criteria are met
6. **Close** - `bd close <bead-id> --reason "..."`

## Notes

- Dependencies shown with ✓ are closed (satisfied)
- Dependencies shown with ○ are open (blocking)
- Use `--reason` flag (not `--comment`) when closing
- Sub-agents should close their own tasks when done
