---
name: beads-cleanup
description: Reconcile bead state with markdown. Use after human verification gates pass or when tasks.md shows complete but beads remain open.
allowed-tools: Bash(bd *), Read, Edit
---

# Beads Cleanup

Clean up beads for `$ARGUMENTS` (plan epic ID or task plan path).

## When to Use

- After human verification gates pass
- When tasks.md shows all checkboxes complete but beads remain open
- To reconcile markdown state with bead state

## Workflow

### Step 1: List all open beads in scope

```bash
bd list --status=open
```

Identify beads related to the plan being cleaned up.

### Step 2: Categorize open beads

Group into:

- **Leaf tasks** - Implementation tasks (e.g., axm-1.2.3)
- **Document update tasks** - Tasks to update markdown (contain "Update Phase")
- **Phase epics** - Phase groupings (e.g., axm-1.2)
- **Plan epic** - Root epic (e.g., axm-1)
- **Human gates** - Verification checkpoints

### Step 3: Verify leaf tasks are actually complete

For each open leaf task, check if the work is done:

- Read the corresponding section in tasks.md
- If acceptance criteria show `[x]`, the task is complete

### Step 4: Close in dependency order

Close beads bottom-up:

1. **Leaf tasks first** (no children):

   ```bash
   bd close <task-id> --reason "Implementation verified complete per tasks.md"
   ```

2. **Document update tasks** (if markdown already updated):

   ```bash
   bd close <task-id> --reason "Document already updated"
   ```

3. **Phase epics** (after all children closed):

   ```bash
   bd close <phase-id> --reason "All phase tasks complete"
   ```

4. **Human gates** (after verification passed):

   ```bash
   bd close <gate-id> --reason "Verification passed"
   ```

5. **Plan epic** (last):
   ```bash
   bd close <plan-id> --reason "Plan complete"
   ```

### Step 5: Handle blocked beads

If `bd close` fails due to blocked dependencies:

- Use `--force` only if the blocking task is actually complete
- Otherwise, investigate why the blocker is still open

## Output

Summarize:

- Number of beads closed
- Categories closed (tasks, phases, epics)
- Any beads that couldn't be closed and why
