---
status: active
description:
  How to execute markdown task plan documents with beads—creating a plan epic,
  phase epics, and tasks from the markdown file, annotating the document with
  bead IDs, and updating the plan as work progresses.
---

# Executing Markdown Task Plans with Beads

This guide helps you translate markdown task plans into beads for structured
execution. By modeling tasks in beads upfront, you invest thinking time once—
establishing dependencies, sequencing, and acceptance criteria—so that execution
proceeds without re-analyzing the plan each session. This is particularly
valuable when markdown task lists are incomplete or evolve during execution.

For task plan structure and authoring, see
[Markdown Task Plans](markdown-task-plans.md#task-plan-structure). For OpenSpec
task plans, the same principles apply.

---

## Skills

This guide is also available as Claude Code skills for interactive use:

| Skill                 | Purpose                                          |
| --------------------- | ------------------------------------------------ |
| `/beads-plan`         | Create beads WBS from a markdown task plan       |
| `/beads-execute-plan` | Execute a plan scope by spawning sub-agents      |
| `/beads-execute`      | Execute a single bead task (used by sub-agents)  |
| `/beads-close-phase`  | Close a phase and update the markdown document   |
| `/beads-task`         | Reference template for manual sub-agent spawning |

Skills are in `.claude/skills/` and can be invoked directly or used by Claude
automatically when relevant.

---

## Purpose and Outcomes

Translating a markdown task plan into beads serves three goals:

1. **Accurate task modeling** — Beads capture the full structure of the markdown
   plan: phases, tasks, dependencies, and blocking relationships. The bead
   hierarchy becomes the authoritative execution model, even if the original
   markdown was incomplete or ambiguous.

2. **Rich task metadata** — Each bead includes a meaningful title (verbatim from
   the task plan), a detailed description (with implementation context and
   traceability references), and verifiable acceptance criteria. This metadata
   enables autonomous execution without re-reading the source document.

3. **Bidirectional progress tracking** — As bead tasks complete, corresponding
   entries in the markdown document are updated. This keeps both systems in sync
   and provides visibility for stakeholders who reference the original plan.

### Purpose Checklist

- [ ] **Task modeling complete** — Every markdown task has a corresponding bead
      with correct parent epic and dependencies
- [ ] **Metadata rich** — Each bead has a descriptive title, detailed
      description with Implements refs, and verifiable acceptance criteria
- [ ] **Document update tasks exist** — Bead tasks created to mark markdown
      completion after each phase or logical group
- [ ] **Plan epic links to source** — Plan epic description references the
      source markdown file path
- [ ] **Dependencies captured** — All markdown task dependencies reflected in
      bead relationships

---

## Bead ID Format

Bead IDs are project-specific and depend on your rig's prefix configuration. For
example:

- A project with prefix `beads` will generate IDs like `beads-1`, `beads-2`
- A project with prefix `axm` will generate IDs like `axm-1`, `axm-1.1`

This guide uses placeholder notation like `<plan-epic-id>` and `<phase-epic-id>`
to indicate where you should substitute your actual bead IDs. The actual IDs are
returned when you create each bead—track them as you go.

---

## Quick Reference

_Illustrates: "Plan epic created," "Phase epics linked," "Task beads created,"
"Dependencies set," "Acceptance criteria set," and "Structure verified"_

```bash
# Create plan epic (tracks overall plan completion)
bd create --type=epic --title="User Preferences Feature" --priority=2 \
  --description="Tracks execution of the User Preferences task plan.
**Plan document:** docs/plans/user-preferences/tasks.md"

# Create phase epic under plan epic
bd create --type=epic --title="Phase 1: Core Implementation" --priority=2 \
  --parent=<plan-epic-id>

# Create tasks under phase epic with description and acceptance criteria
bd create --type=task --title="Create database schema" --priority=2 \
  --labels=AUTO --parent=<phase-epic-id> \
  --description="Define PostgreSQL schema for user preferences.
**Implements:** DES-1, REQ-1
**Source:** TASK-1.1 in docs/plans/user-preferences/tasks.md" \
  --acceptance="- [ ] Migration file exists in db/migrations/
- [ ] Schema includes user_id, preference_key, preference_value columns
- [ ] Indexes defined for user_id lookups"

bd create --type=task --title="Implement repository layer" --priority=2 \
  --labels=AUTO --parent=<phase-epic-id> \
  --description="Create data access layer for user preferences.
**Implements:** DES-1, REQ-1
**Source:** TASK-1.2 in docs/plans/user-preferences/tasks.md" \
  --acceptance="- [ ] Repository interface defined
- [ ] CRUD operations implemented
- [ ] Unit tests pass"

# Create document update task (syncs markdown with bead progress)
bd create --type=task --title="Update Phase 1 completion in task plan" \
  --priority=3 --labels=AUTO --parent=<phase-epic-id> \
  --description="Synchronize markdown task plan with completed bead work.
**Source document:** docs/plans/user-preferences/tasks.md" \
  --acceptance="- [ ] All Phase 1 acceptance criteria boxes checked in markdown
- [ ] Traceability matrix status updated to Complete for Phase 1 tasks"

# Set dependencies (bd dep add <blocked> <blocker>)
bd dep add <task-1.2-id> <task-1.1-id>  # TASK-1.2 blocked by TASK-1.1
bd dep add <update-task-id> <task-1.1-id>  # Update task blocked by TASK-1.1
bd dep add <update-task-id> <task-1.2-id>  # Update task blocked by TASK-1.2

# Verify structure
bd list --status=open
bd show <task-1.1-id>
bd show <update-task-id>  # Confirm document update task dependencies
```

### Quick Reference Checklist

- [ ] **Plan epic created** — Run `bd create --type=epic` for entire document
- [ ] **Phase epics linked** — Each phase uses `--parent` to link to plan epic
- [ ] **Task beads created** — Each TASK-N.M uses `--parent` to link to phase
- [ ] **Acceptance criteria set** — Each task uses `--acceptance` with
      verifiable criteria
- [ ] **Document update tasks created** — Tasks exist to update markdown after
      each phase
- [ ] **Dependencies set** — Run `bd dep add` after all tasks exist
- [ ] **Structure verified** — Run `bd list` and `bd show` to confirm hierarchy

### Common bd Commands

**Status management:**

```bash
# Mark task in-progress before starting work
bd update <task-id> --status=in-progress

# Close task with reason when complete
bd close <task-id> --reason "Acceptance criteria met"

# Close epic when all child tasks complete
bd close <epic-id> --reason "All phase tasks complete"
```

**Query commands:**

```bash
# List open tasks (find work to do)
bd list --status=open

# Show task details with dependencies
bd show <task-id>

# List closed tasks (verify progress)
bd list --status=closed | grep <epic-id>
```

---

## When to Use Beads

Beads provide persistent tracking that survives context compaction and enables
multi-agent handoff. TodoWrite works within a single session but loses state
across sessions.

### Beads vs TodoWrite Checklist

- [ ] **Multi-session work** — Use beads when work spans multiple Claude
      sessions
- [ ] **Dependencies exist** — Use beads when tasks have blocking relationships
- [ ] **Multiple agents** — Use beads when different agents will work on tasks
- [ ] **Context compaction** — Use beads when work must survive memory reset
- [ ] **Single-session linear** — Use TodoWrite for simple sequential tasks in
      one session

---

## Sub-Agent Workflow

When spawning sub-agents to implement bead tasks, provide clear context so each
agent can work autonomously.

### Prompt Template for Sub-Agents

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

### Parent Agent Responsibilities

**The parent agent is an ORCHESTRATOR—it coordinates but never implements.**

The orchestrator should ONLY:

- Query bead status (`bd show`, `bd list`)
- Spawn sub-agents for tasks
- Check for newly unblocked work
- Close epics when complete

The orchestrator should NEVER:

- Read source code (except to understand scope)
- Write, edit, or create files
- Run tests or implement acceptance criteria

Every task must go to a sub-agent, even "simple" ones. This ensures clean
context separation and true parallel execution.

Before spawning:

- Check bead status: `bd show <task-id>`
- Verify dependencies are closed (shown with ✓ in output)
- **Group all ready tasks and spawn in ONE message** for parallel execution

**Parallel spawning pattern:**

```
# In a SINGLE message, call Skill multiple times:
Skill(skill="beads-execute", args="axm-1.1")
Skill(skill="beads-execute", args="axm-1.2")
Skill(skill="beads-execute", args="axm-1.3")
```

After sub-agents complete:

- Update the markdown document (check acceptance criteria boxes)
- Close phase epic when all tasks done: `bd close <epic-id> --reason "..."`

### Sub-Agent Workflow Checklist

- [ ] **Dependencies verified** — All blocking tasks show ✓ in `bd show` output
- [ ] **Context provided** — Sub-agent prompt includes bead ID, acceptance
      criteria, and specific instructions
- [ ] **Status commands included** — Prompt tells agent to mark in-progress and
      close when done
- [ ] **Parallel execution** — Ready tasks spawned in ONE message (multiple Skill
      calls) for true concurrency
- [ ] **Batch-then-check** — After batch completes, check for newly unblocked
      tasks before spawning next batch
- [ ] **Document updated** — Parent agent updates markdown after phase completes

---

## Epic Hierarchy

The three-level hierarchy maps markdown structure to beads: plan epic for the
document, phase epics for sections, and task beads for individual work items.
Each phase also includes a document update task that syncs progress back to the
markdown.

_Illustrates: "Three-level hierarchy," "Plan epic created," "Phase epics
linked," and "Document update tasks"_

```
Plan Epic (entire markdown document)
├── Phase 1 Epic
│   ├── TASK-1.1
│   ├── TASK-1.2
│   └── Update Phase 1 in markdown  ← document update task
└── Phase 2 Epic
    ├── TASK-2.1
    └── Update Phase 2 in markdown  ← document update task
```

### Epic Hierarchy Checklist

- [ ] **Three-level hierarchy** — Plan epic contains phase epics which contain
      task beads
- [ ] **One plan epic** — Single epic tracks entire markdown document completion
- [ ] **Phase to plan link** — Each phase epic uses `--parent=<plan-id>`
- [ ] **Task to phase link** — Each task bead uses `--parent=<phase-id>`
- [ ] **Document update tasks** — Each phase includes a task to update the
      markdown document
- [ ] **Cascade closure** — When all phase epics close, close the plan epic

---

## Workflow

### Creating Beads from Markdown

The workflow creates beads in top-down order: plan epic first, then phase epics,
then task beads. Dependencies are added after all beads exist.

_Illustrates: "Plan epic created," "Markdown file referenced," "Phase epics
linked," "Task beads created," "Description includes AC," and "Human gates
modeled"_

**Step 1: Create Plan Epic**

```bash
bd create --type=epic --title="User Preferences Feature" --priority=2
```

The description should reference the source markdown file:

```markdown
Tracks execution of the User Preferences task plan. **Plan document:**
docs/plans/user-preferences/tasks.md
```

**Step 2: Create Phase Epics**

One per phase, linked to plan epic:

```bash
bd create --type=epic --title="Phase 1: Core Implementation" --priority=2 \
  --parent=<plan-epic-id>
```

**Step 3: Create Task Beads**

One per TASK-N.M, linked to phase epic. Use `--description` to provide
implementation context and traceability, and `--acceptance` to specify
verifiable acceptance criteria:

```bash
# TASK-1.1
bd create --type=task --title="Create database schema" --priority=2 \
  --labels=AUTO --parent=<phase-epic-id> \
  --description="Define PostgreSQL schema for user preferences.
**Implements:** DES-1, REQ-1
**Source:** TASK-1.1 in docs/plans/user-preferences/tasks.md" \
  --acceptance="- [ ] Migration file exists in db/migrations/
- [ ] Schema includes user_id, preference_key, preference_value columns
- [ ] Indexes defined for user_id lookups"

# TASK-1.2
bd create --type=task --title="Implement repository layer" --priority=2 \
  --labels=AUTO --parent=<phase-epic-id> \
  --description="Create data access layer for user preferences.
**Implements:** DES-1, REQ-1
**Source:** TASK-1.2 in docs/plans/user-preferences/tasks.md" \
  --acceptance="- [ ] Repository interface defined
- [ ] CRUD operations implemented
- [ ] Unit tests pass"
```

The description should include:

- What the task accomplishes (from the markdown task description)
- **Implements:** references to design decisions and requirements
- **Source:** reference to the original task identifier and markdown file path

**Step 4: Create Document Update Tasks**

For each phase, create a task that updates the markdown document to reflect
completed work. This task depends on all implementation tasks in the phase:

```bash
# Document update task
bd create --type=task --title="Update Phase 1 completion in task plan" \
  --priority=3 --labels=AUTO --parent=<phase-epic-id> \
  --description="Synchronize markdown task plan with completed Phase 1 work.
**Source document:** docs/plans/user-preferences/tasks.md
**Phase:** Phase 1: Core Implementation" \
  --acceptance="- [ ] All Phase 1 acceptance criteria boxes checked in markdown
- [ ] Traceability matrix status updated to Complete for Phase 1 tasks
- [ ] Bead IDs annotated on any tasks that were missing them"
```

These tasks ensure the markdown document stays synchronized with bead progress,
providing visibility to stakeholders who reference the original plan.

**Step 5: Set Dependencies**

After all tasks exist (including document update tasks), create blocking
relationships. Document update tasks should depend on all implementation tasks
in their phase:

```bash
# Implementation task dependency (bd dep add <blocked> <blocker>)
bd dep add <task-1.2-id> <task-1.1-id>  # TASK-1.2 blocked by TASK-1.1

# Document update task depends on all phase tasks
bd dep add <update-task-id> <task-1.1-id>  # Update task blocked by TASK-1.1
bd dep add <update-task-id> <task-1.2-id>  # Update task blocked by TASK-1.2
```

**Human Gates:** Model as HUMAN-labeled tasks that block downstream AUTO tasks.
Use `--type=task --labels=HUMAN` for human gates—there is no separate gate type.

```bash
bd create --type=task --title="Final Verification (Human Gate)" --priority=2 \
  --labels=HUMAN --parent=<plan-epic-id> \
  --description="Human gate for final verification." \
  --acceptance="- [ ] All tests pass
- [ ] Manual verification complete"
```

**Step 6: Annotate the Markdown**

_Illustrates: "Document annotated," "Plan epic ID added," "Phase epic IDs
added," and "Task bead IDs added"_

Add bead IDs to maintain traceability:

```markdown
---
status: active
---

# User Preferences Task Plan

**Plan Epic:** <plan-epic-id>

### Phase 1: Core Implementation [AUTO]

**Epic:** <phase-1-epic-id>

### TASK-1.1: Create database schema [AUTO]

**Bead:** <task-1.1-id> **Implements:** DES-1, REQ-1

**Description:** Define PostgreSQL schema for user preferences.

**Acceptance Criteria:**

- [ ] Migration file exists in db/migrations/
- [ ] Schema includes required columns

**Dependencies:** None

### TASK-1.2: Implement repository layer [AUTO]

**Bead:** <task-1.2-id> **Implements:** DES-1, REQ-1

**Dependencies:** TASK-1.1
```

**Step 7: Verify Structure**

_Illustrates: "Structure verified" and "Dependencies confirmed"_

```bash
bd list --status=open          # Confirm hierarchy
bd show <task-id>              # Confirm dependencies and description
bd show <update-task-id>       # Confirm document update task dependencies
```

### Workflow Checklist

- [ ] **Plan epic created** — Run `bd create --type=epic` for entire document
- [ ] **Markdown file referenced** — Plan epic description includes path to
      source markdown
- [ ] **Phase epics linked** — Each phase uses `--parent=<plan-id>`
- [ ] **Task beads created** — Each TASK-N.M has a bead under its phase epic
- [ ] **Acceptance criteria set** — Each task uses `--acceptance` with
      verifiable criteria
- [ ] **Description includes context** — Task descriptions include Implements
      refs and source task reference
- [ ] **Execution labels applied** — Tasks labeled AUTO, HUMAN, VERIFY, or
      HYBRID
- [ ] **Document update tasks created** — Each phase has a task to update the
      markdown when complete
- [ ] **Dependencies set** — Run `bd dep add` after all tasks exist, including
      document update task dependencies
- [ ] **Human gates modeled** — HUMAN tasks block downstream AUTO tasks
- [ ] **Document annotated** — Markdown updated with Plan Epic, Epic, and Bead
      IDs
- [ ] **Structure verified** — Run `bd list` and `bd show` to confirm

---

## Field Mapping

This table maps markdown elements to bead fields for consistent translation.

| Markdown Element    | Bead Field      | Notes                                |
| ------------------- | --------------- | ------------------------------------ |
| Plan title          | Plan epic       | One epic for entire document         |
| Phase header        | Phase epic      | Link with `--parent`                 |
| Task name           | `--title`       | Use verbatim from markdown           |
| Task description    | `--description` | Include Implements refs, source task |
| Acceptance criteria | `--acceptance`  | Verifiable criteria from markdown    |
| Execution type      | `--labels`      | AUTO, HUMAN, VERIFY, or HYBRID       |
| Task dependencies   | `bd dep add`    | Create after all tasks exist         |

### Field Mapping Checklist

- [ ] **Title matches** — Bead title uses verbatim task name from markdown
- [ ] **Description complete** — Includes task description, Implements refs, and
      source task reference
- [ ] **Acceptance criteria transferred** — Markdown acceptance criteria copied
      to `--acceptance` flag
- [ ] **Label matches type** — Execution type from markdown applied as label
- [ ] **Dependencies captured** — All markdown dependencies created with
      `bd dep add`

---

## Progress Tracking

Track progress by closing beads and executing document update tasks. The
document update tasks (created in Step 4) handle markdown synchronization as
part of the normal bead workflow—no manual coordination required.

### How Document Update Tasks Work

When you complete all implementation tasks in a phase, the document update task
becomes unblocked. Executing this task involves:

1. Opening the source markdown document
2. Checking the acceptance criteria boxes for completed tasks
3. Updating the traceability matrix status column
4. Verifying bead ID annotations are present

This approach has advantages over ad-hoc updates:

- **Explicit tracking** — Document updates are visible in `bd list`
- **Dependency enforcement** — Updates only happen after work completes
- **Audit trail** — Bead closure records when the document was synchronized

### Progress Tracking Checklist

- [ ] **Task closure** — Run `bd close <id>` when task acceptance criteria met
- [ ] **Document update task executed** — When unblocked, update the markdown as
      specified in the task's acceptance criteria
- [ ] **Phase closure** — Close phase epic when all its tasks complete
      (including document update task)
- [ ] **Plan closure** — Close plan epic when all phase epics complete
- [ ] **Session sync** — Run `bd sync` at end of each work session

### Enhanced Traceability Matrix

_Illustrates: "Matrix updated" with bead IDs and status tracking_

```markdown
| Requirement | Design | Tasks    | Beads         | Status      |
| ----------- | ------ | -------- | ------------- | ----------- |
| REQ-1       | DES-1  | TASK-1.1 | <task-1.1-id> | Complete    |
| REQ-1       | DES-1  | TASK-1.2 | <task-1.2-id> | In Progress |
```

---

## Template for Task Plans

Include this block in markdown task plans that will use beads for execution.

_Illustrates: "Document annotated" pattern for new task plans_

```markdown
---

## Beads Execution

Multi-session tracking via beads. See
[Creating Beads WBS from Markdown Task Plans](creating-beads-wbs-from-markdown-task-plans.md).

**After creating beads, annotate this document:**

- `**Plan Epic:** <plan-epic-id>` at document top
- `**Epic:** <phase-epic-id>` below phase headers
- `**Bead:** <task-id>` as first field in each task

**Document update tasks:** Each phase includes a bead task to update this
document when the phase completes. These tasks check acceptance criteria boxes
and update the traceability matrix.
```

### Template Checklist

- [ ] **Template included** — Task plans using beads include the Beads Execution
      block
- [ ] **Link correct** — Template links to this guide
- [ ] **Annotation format documented** — Template specifies Plan Epic, Epic, and
      Bead placement
- [ ] **Update task mentioned** — Template explains document update tasks
- [ ] **Placement appropriate** — Beads Execution block appears at end of task
      plan, before See Also

---

## Beads Execution Checklist

Use this checklist to verify complete bead setup for a markdown task plan. Each
item references the authoritative checklist for that concern.

- [ ] **Workflow complete** — All items in
      [Workflow Checklist](#workflow-checklist) pass
- [ ] **Fields mapped correctly** — All items in
      [Field Mapping Checklist](#field-mapping-checklist) pass
- [ ] **Progress tracking ready** — All items in
      [Progress Tracking Checklist](#progress-tracking-checklist) pass
