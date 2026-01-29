---
name: beads-execute-plan
description: Execute a markdown task plan by spawning sub-agents for each bead task. Use when progress/execution/implementation is requested for a plan.
context: fork
agent: general-purpose
allowed-tools: Bash(bd *), Read, Glob, Task
---

# Execute Markdown Task Plan

Execute the task plan scope specified in `$ARGUMENTS` by spawning sub-agents for each ready bead task.

## Arguments

`$ARGUMENTS` can be:

- Phase name: `Phase 3`, `Phase 1: Core Implementation`
- Epic ID: `axm-2.3`, `beads-5`
- Path + scope: `docs/plans/tasks.md Phase 2`

## Workflow

### Step 1: Identify the scope

Parse `$ARGUMENTS` to determine what to execute. If an epic ID is provided, use it directly. If a phase name is given, find the corresponding epic:

```bash
# List open epics to find the phase
bd list --status=open --type=epic
```

### Step 2: Get open tasks in scope

Query for open tasks under the target epic:

```bash
bd show <epic-id>
```

This shows all child tasks with their status (✓ closed, ○ open) and dependencies.

### Step 3: Identify ready tasks

A task is ready when:

- Status is `open`
- All dependencies show ✓ (closed)

From `bd show` output, note which tasks have no open dependencies.

### Step 4: Spawn sub-agents for ready tasks

For each ready task, invoke `/beads-execute <bead-id>`. **Spawn multiple independent tasks in parallel for efficiency.**

Each `/beads-execute` invocation will:

1. Read the bead details
2. **Mark the task in-progress** (CRITICAL)
3. Implement per acceptance criteria
4. Close the task when done

For manual Task tool spawning, use this prompt template:

```
You are implementing bead task <bead-id>: <task-title>

**Acceptance Criteria:**
<paste from bd show output>

**Instructions:**
1. FIRST mark task in-progress: `bd update <bead-id> --status=in-progress`
2. Implement the task per acceptance criteria
3. Verify all criteria are met
4. Close task: `bd close <bead-id> --reason "Acceptance criteria met"`
```

### Step 5: Wait for sub-agents to complete

After spawning, the Task tool returns when each sub-agent finishes. Check that tasks were closed:

```bash
bd list --status=closed | grep <epic-id>
```

### Step 6: Check for newly unblocked tasks

After tasks complete, check if more tasks are now ready:

```bash
bd show <epic-id>
```

If more tasks are unblocked, return to Step 4 and spawn sub-agents for them.

### Step 7: Close phase when complete

When all tasks in the phase are done, invoke the close-phase workflow:

```bash
# Verify all closed
bd show <epic-id>

# Close the phase epic
bd close <epic-id> --reason "All tasks complete"
```

Or invoke `/beads-close-phase <epic-id>` to handle markdown updates.

## Parallelization Strategy

- **Independent tasks**: Spawn in parallel (single message with multiple Task calls)
- **Dependent tasks**: Wait for blockers to close before spawning
- **Check after each batch**: After a batch completes, check for newly unblocked work

## Common bd Commands

```bash
# List open tasks
bd list --status=open

# Show epic with all children
bd show <epic-id>

# Mark task in-progress
bd update <task-id> --status=in-progress

# Close task
bd close <task-id> --reason "..."
```

## Output

Summarize:

- Scope executed (phase name/epic ID)
- Tasks spawned and completed
- Any remaining blocked tasks
- Phase closure status
