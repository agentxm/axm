---
name: beads-execute-plan
description: Orchestrate plan execution by spawning sub-agents. Executes ALL remaining phases by default; optionally scope to a specific phase or epic.
context: fork
agent: general-purpose
allowed-tools: Bash(bd *), Read, Glob, Task, Skill
---

# Execute Markdown Task Plan

Execute the task plan by spawning sub-agents for each ready bead task.

**Default behavior**: Given a file path with no scope argument, execute ALL remaining open phases in order until the plan is complete. To execute only a specific phase, provide a scope argument (phase name or epic ID).

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
- **LOOP to next phase until ALL phases are done** (for full plan execution)

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

- **File path only**: `docs/plans/tasks.md` — Executes ALL remaining phases (default)
- **File path + scope**: `docs/plans/tasks.md Phase 2` — Executes only the specified phase
- **Phase name**: `Phase 3`, `Phase 1: Core Implementation`
- **Epic ID**: `axm-2.3`, `beads-5`

**Default behavior**: If only a file path is provided with no specific phase or epic, execute the ENTIRE plan (all remaining open phases in order).

## Workflow

**CRITICAL LOOP REQUIREMENT**: For full plan execution (the default), you MUST continue executing phases until ALL phases are complete. Do NOT summarize or stop after completing a single phase. The workflow below is a LOOP that repeats for each phase.

### Step 1: Determine execution mode

Parse `$ARGUMENTS` to determine what to execute:

**Full plan execution** (default): If arguments contain only a file path (no phase name or epic ID), execute ALL remaining open phases in order. **You MUST loop through ALL phases—do not stop after one phase.**

**Scoped execution**: If arguments include a phase name or epic ID, execute only that specific scope.

```bash
# List all open epics to see available phases
bd list --status=open --type=epic
```

### Step 2: Get target scope(s)

**For full plan execution:**
Identify ALL open phase epics (type=epic) under the plan. Execute them in order, starting with the lowest phase number.

**For scoped execution:**
Query for tasks under the specific target epic:

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

### Step 8: LOOP — Continue to next phase (full plan execution)

**CRITICAL FOR FULL PLAN EXECUTION: You MUST continue to the next phase. Do NOT summarize or stop here.**

After closing a phase, IMMEDIATELY check for more phases:

```bash
bd list --status=open --type=epic
```

**If open phase epics remain (this is the common case):**

1. Identify the next phase (lowest phase number)
2. **IMMEDIATELY return to Step 2** and execute that phase
3. **Repeat this loop until NO open phases remain**

**STOP ONLY when `bd list --status=open --type=epic` returns NO open epics.**

Do NOT:

- Summarize progress after each phase
- Ask the user if they want to continue
- Stop to report intermediate results
- Output anything except brief status before continuing

### Step 9: Run cleanup after plan completion

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

## Output (ONLY when fully complete)

**Do NOT output a summary until ALL phases are complete or you hit a human gate.**

Only summarize when:

- All phases are closed (for full plan execution), OR
- The scoped phase is closed (for scoped execution), OR
- A human verification gate blocks further progress

Summary should include:

- Execution mode (full plan vs scoped)
- Phases executed and completed
- Tasks spawned and completed per phase
- Any remaining blocked tasks or human gates
- Final plan status
