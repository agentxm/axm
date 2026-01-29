---
name: beads-execute-plan
description: Orchestrate plan execution by spawning sub-agents. Use after /beads-plan when user requests progress, execution, or implementation of a plan scope.
context: fork
agent: general-purpose
allowed-tools: Bash(bd *), Read, Glob, Task, Skill
---

# Execute Markdown Task Plan

Execute the task plan scope specified in `$ARGUMENTS` by spawning sub-agents for each ready bead task.

**CRITICAL: Do NOT use Claude Code's built-in task tools (TaskCreate, TaskUpdate, TaskList, TaskGet).** Use only `bd` CLI commands for task management.

## Orchestrator Role

**CRITICAL: You are the ORCHESTRATOR. You coordinate work but NEVER implement tasks yourself.**

Your responsibilities:

- Query bead status (`bd show`, `bd list`)
- Identify ready tasks (no open dependencies)
- Spawn sub-agents for ALL tasks via `/beads-execute-task`
- Wait for sub-agents to complete
- Check for newly unblocked tasks
- Close epics when phases complete

**NEVER do any of the following in this context:**

- Read source code files (except to understand task scope)
- Write, edit, or create files
- Run tests
- Implement any acceptance criteria

Every task—even "simple" ones—must be spawned to a sub-agent. This ensures:

- Clean context separation
- True parallel execution
- Consistent task tracking via beads

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

**CRITICAL: For parallel execution, you MUST send multiple Task tool calls in a SINGLE message.**

Group all ready tasks and spawn them together:

```
# In a SINGLE message, call the Skill tool multiple times:
Skill(skill="beads-execute-task", args="axm-1.1")
Skill(skill="beads-execute-task", args="axm-1.2")
Skill(skill="beads-execute-task", args="axm-1.3")
```

Each `/beads-execute-task` invocation will:

1. **Mark the task in-progress FIRST** (CRITICAL - before any other action)
2. Read the bead details
3. Implement per acceptance criteria
4. Close the task when done

**DO NOT** spawn tasks one at a time in separate messages—this defeats parallelization.

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

### Step 7: Close phase when complete (REQUIRED)

**CRITICAL: You MUST close phases when all tasks are complete. Do not leave phases open.**

When all tasks in the phase are done:

```bash
# Verify all children show ✓
bd show <epic-id>

# If all children are closed, close the phase
bd close <epic-id> --reason "All phase tasks complete"
```

For phases with document update tasks, invoke `/beads-close-phase <epic-id>` to handle markdown updates.

### Step 8: Run cleanup after plan completion

After the final phase (including human gates), run `/beads-cleanup <plan-epic-id>` to:

- Close any orphaned beads
- Close document update tasks
- Close the root plan epic

**The plan is not complete until all beads are closed.**

## Parallelization Strategy

**Key insight**: The Task tool only runs in parallel when you send multiple calls in ONE message.

### Batch Execution Pattern

1. **Identify ready tasks** — Tasks with no open dependencies (all blockers show ✓)
2. **Spawn batch in ONE message** — Call Skill tool multiple times in a single response
3. **Wait for batch** — All parallel tasks complete before you can respond
4. **Check for newly unblocked** — Run `bd show <epic-id>` to find next batch
5. **Repeat** — Continue until all tasks complete

### Example: Spawning a Parallel Batch

If tasks `axm-1.1`, `axm-1.2`, and `axm-1.3` are all ready (no open dependencies):

```
I'll spawn all three ready tasks in parallel.

[In ONE message, make THREE Skill tool calls:]
- Skill(skill="beads-execute-task", args="axm-1.1")
- Skill(skill="beads-execute-task", args="axm-1.2")
- Skill(skill="beads-execute-task", args="axm-1.3")
```

### Anti-Pattern: Sequential Spawning (WRONG)

```
# DON'T DO THIS - defeats parallelization
Message 1: Skill(skill="beads-execute-task", args="axm-1.1")
[wait for result]
Message 2: Skill(skill="beads-execute-task", args="axm-1.2")
[wait for result]
Message 3: Skill(skill="beads-execute-task", args="axm-1.3")
```

### Anti-Pattern: Doing Work in Orchestrator (WRONG)

```
# DON'T DO THIS - pollutes orchestrator context
Skill(skill="beads-execute-task", args="axm-1.1")  # Spawns sub-agent
[sub-agent completes]
# Then orchestrator starts implementing axm-1.2 directly:
Read(file_path="src/foo.ts")  # WRONG - should spawn sub-agent!
Edit(file_path="src/foo.ts", ...)  # WRONG - orchestrator should not edit!
```

**Why this is wrong:**

- Orchestrator context gets polluted with implementation details
- Breaks parallel execution (orchestrator is busy doing work)
- Inconsistent tracking (some tasks via beads, some ad-hoc)
- Context window fills up with code instead of coordination

**Correct approach:** Spawn `/beads-execute-task` for EVERY task, no exceptions.

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
