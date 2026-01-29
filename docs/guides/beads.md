# Beads Guide

Standards for task planning in markdown and executing plans with beads for
multi-session tracking. Covers task structure, execution types, human gates,
dependency management, and the beads workflow for AI-assisted execution.

> [Task Management Workflow](../../CLAUDE.md#task-management-workflow) — critical guidance

## Skills

| Skill                 | Purpose                                          |
| --------------------- | ------------------------------------------------ |
| `/beads-plan`         | Create beads WBS from a markdown task plan       |
| `/beads-execute-plan` | Execute a plan scope by spawning sub-agents      |
| `/beads-execute-task` | Execute a single bead task (used by sub-agents)  |
| `/beads-close-phase`  | Close a phase and update the markdown document   |
| `/beads-cleanup`      | Clean up completed beads after verification      |
| `/beads-task`         | Reference template for manual sub-agent spawning |

**Not covered:** beads CLI installation, configuration, or internal
implementation. For bd command usage, run `bd --help`.

---

## When to Use Beads vs Session-Only Tracking

Beads provide persistent tracking that survives context compaction and enables
multi-agent handoff. Session-only task tracking (like TodoWrite) works within a
single session but loses state across sessions.

| Situation                | Use          |
| ------------------------ | ------------ |
| Multi-session work       | Beads        |
| Tasks with dependencies  | Beads        |
| Multiple agents on tasks | Beads        |
| Context compaction risk  | Beads        |
| Simple linear tasks      | Session-only |
| Quick single-session fix | Session-only |

### When to Use Beads Checklist

- [ ] **Multi-session work** — Use beads when work spans multiple sessions
- [ ] **Dependencies exist** — Use beads when tasks have blocking relationships
- [ ] **Multiple agents** — Use beads when different agents will work on tasks
- [ ] **Context compaction** — Use beads when work must survive memory reset
- [ ] **Single-session linear** — Session-only tracking for simple sequential
      tasks

---

## Markdown Task Plan Structure

Task plans in markdown maximize autonomous AI execution while maintaining clear
handoff points for human intervention.

### Task Identifier Format

Tasks use a hierarchical identifier linking them to design decisions:

| Component      | Format   | Purpose                                 |
| -------------- | -------- | --------------------------------------- |
| Prefix         | `TASK-`  | Distinguishes from REQ-N and DES-N      |
| Major number   | `N.`     | Groups tasks by design decision         |
| Minor number   | `.M`     | Sequence within the group               |
| Execution type | `[TYPE]` | Indicates how task executes (see below) |

Example: `TASK-2.3 [AUTO]` is the third task implementing design decision DES-2,
executed autonomously.

### Required Task Fields

```markdown
### TASK-N.M: <Task Name> [TYPE]

**Implements:** DES-N, REQ-N

**Description:** [What this task accomplishes—one to two sentences]

**Acceptance Criteria:**

- [ ] [First verifiable criterion]
- [ ] [Second verifiable criterion]

**Dependencies:** TASK-X.Y | Human Gate | None
```

### Task Structure Checklist

- [ ] **Identifier format** — Uses TASK-N.M pattern matching design decision
      numbering
- [ ] **Execution marker** — Has [AUTO], [HUMAN], [VERIFY], or [HYBRID] suffix
- [ ] **Implements field** — Lists DES-N and REQ-N references
- [ ] **Description present** — One to two sentences explaining what task
      accomplishes
- [ ] **Acceptance criteria** — Includes verifiable checklist items
- [ ] **Dependencies stated** — Lists blocking tasks, human gates, or "None"

---

## Execution Types

Mark each task with its execution type to clarify who performs the work and what
level of human involvement is required.

| Type       | Performer  | Description                                                 |
| ---------- | ---------- | ----------------------------------------------------------- |
| **AUTO**   | AI only    | Claude Code completes without human input                   |
| **HUMAN**  | Human only | Requires human action AI cannot perform                     |
| **VERIFY** | AI + Human | AI implements, human confirms correctness                   |
| **HYBRID** | AI → Human | AI prepares artifacts, human executes in restricted context |

### When to Use Each Type

**AUTO** — Code writing, file creation, test execution, refactoring

**HUMAN** — Credential provisioning, external service configuration, approvals

**VERIFY** — Visual review, UX testing, manual QA where AI cannot assess

**HYBRID** — Migration scripts, production deployments, security-sensitive
operations

### Execution Types Checklist

- [ ] **Every task marked** — No task lacks an execution type marker
- [ ] **AUTO for code tasks** — Code writing, tests, file operations use AUTO
- [ ] **HUMAN for externals** — Credentials, approvals, external configs use
      HUMAN
- [ ] **VERIFY for assessment** — Visual, UX, and subjective review use VERIFY
- [ ] **HYBRID for sensitive** — Production operations, security tasks use
      HYBRID

---

## Task Sequencing

Task order significantly impacts execution efficiency. Proper sequencing
maximizes autonomous progress and minimizes context-switching for humans.

### Why Sequencing Matters

Poor sequencing forces frequent context switches between AI and human work,
fragmenting both attention and progress. By front-loading autonomous work, AI
completes maximum value before requiring human input. Batching human tasks into
explicit gates consolidates interruptions into predictable checkpoints.

### Phase Organization

Group tasks into phases by execution flow:

| Phase Type     | Contains                                  | Marker     |
| -------------- | ----------------------------------------- | ---------- |
| Implementation | AUTO tasks building core functionality    | `[AUTO]`   |
| Configuration  | HUMAN tasks for external setup            | Human Gate |
| Integration    | AUTO tasks requiring configured externals | `[AUTO]`   |
| Verification   | VERIFY tasks for manual confirmation      | `[VERIFY]` |

### Sequencing Checklist

- [ ] **AUTO front-loaded** — Maximum autonomous tasks before first human gate
- [ ] **HUMAN batched** — Human tasks grouped into explicit gates
- [ ] **VERIFY deferred** — Verification tasks batched at end when possible
- [ ] **Phases labeled** — Task groups have clear phase headers
- [ ] **No scattered types** — Same execution type not spread across phases

---

## Human Gates

When tasks require human intervention, create explicit gates that clearly
communicate what's needed and what's blocked.

### Gate Format

```markdown
─── Human Gate: <Gate Name> ───

**Blocked tasks:** TASK-N.M, TASK-N.M

**Required actions:**

- [ ] [Exact step with specific commands or UI paths]
- [ ] [Another exact step]

**Resumes at:** TASK-N.M
```

### Making HUMAN Tasks Actionable

Vague instructions waste human time and introduce errors. Provide exact steps
with specific commands, URLs, or UI paths.

### Human Gates Checklist

- [ ] **Gate named** — Each gate has a descriptive name after the separator
- [ ] **Blocked tasks listed** — States which TASK-N.M identifiers are waiting
- [ ] **Actions checkboxed** — Required actions as verifiable checklist items
- [ ] **Steps specific** — Actions include exact commands, URLs, or UI paths
- [ ] **Resume stated** — Identifies which task continues after gate completes
- [ ] **Context provided** — Explains what the gate provides to blocked tasks

---

## Dependencies

Dependencies establish execution order and identify blocking relationships.

### Dependency Types

| Type            | Format               | Meaning                              |
| --------------- | -------------------- | ------------------------------------ |
| Task dependency | `TASK-N.M`           | Blocked until specific task complete |
| Human gate      | `Human Gate`         | Blocked until gate actions complete  |
| Multiple        | `TASK-1.2, TASK-1.3` | Blocked until all listed complete    |
| None            | `None`               | Can start immediately                |

Always state dependencies explicitly, even when none exist.

### Dependencies Checklist

- [ ] **Always stated** — Every task has Dependencies field, including "None"
- [ ] **Valid references** — All TASK-N.M references exist in the plan
- [ ] **Human gates linked** — Tasks after gates list "Human Gate" as dependency
- [ ] **No circulars** — No task chains that loop back to themselves
- [ ] **Minimal dependencies** — Each task depends only on what it truly needs

---

## Acceptance Criteria

Acceptance criteria define when a task is complete. They must be specific enough
for both AI and human to verify.

### Writing Verifiable Criteria

Each criterion should be answerable with yes/no.

| Vague (avoid)      | Verifiable (prefer)                             |
| ------------------ | ----------------------------------------------- |
| Works correctly    | Returns 200 for valid input, 400 for invalid    |
| Handles errors     | Throws ValidationError with field name on empty |
| Tests pass         | `pnpm test src/export.test.ts` exits 0          |
| Good performance   | Query executes in <100ms for 10K records        |
| Properly formatted | Follows ESLint config, `pnpm lint` exits 0      |

### Acceptance Criteria Checklist

- [ ] **Checkbox format** — Each criterion uses `- [ ]` prefix
- [ ] **Binary verifiable** — Each criterion answerable with yes/no
- [ ] **Specific outcomes** — States exact files, values, or behaviors
- [ ] **Test commands** — Includes runnable verification commands where
      applicable
- [ ] **No subjective terms** — Avoids "good," "proper," "appropriate"

---

## Beads Workflow

Translating a markdown task plan into beads provides accurate task modeling,
rich metadata, and bidirectional progress tracking.

### Epic Hierarchy

The three-level hierarchy maps markdown structure to beads:

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

### Creating Beads from Markdown

1. **Create plan epic** — One epic for the entire document
2. **Create phase epics** — One per phase, linked to plan epic
3. **Create task beads** — One per TASK-N.M, linked to phase epic
4. **Create document update tasks** — One per phase to sync markdown
5. **Set dependencies** — After all beads exist, create blocking relationships
6. **Annotate the markdown** — Add bead IDs to the document

For the complete workflow with bd commands, see the `/beads-plan` skill.

### Beads Workflow Checklist

- [ ] **Plan epic created** — Run `bd create --type=epic` for entire document
- [ ] **Markdown file referenced** — Plan epic description includes path to
      source markdown
- [ ] **Phase epics linked** — Each phase uses `--parent=<plan-id>`
- [ ] **Task beads created** — Each TASK-N.M has a bead under its phase epic
- [ ] **Acceptance criteria set** — Each task uses `--acceptance` with
      verifiable criteria
- [ ] **Document update tasks created** — Each phase has a task to update
      markdown
- [ ] **Dependencies set** — Run `bd dep add` after all tasks exist
- [ ] **Document annotated** — Markdown updated with Plan Epic, Epic, and Bead
      IDs

---

## Sub-Agent Execution

When executing bead tasks, the parent agent coordinates while sub-agents do
implementation work.

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

### Parallel Execution

Spawn independent tasks in ONE message for parallel execution:

```
# In a SINGLE message, call Skill multiple times:
Skill(skill="beads-execute-task", args="axm-1.1")
Skill(skill="beads-execute-task", args="axm-1.2")
Skill(skill="beads-execute-task", args="axm-1.3")
```

### Sub-Agent Execution Checklist

- [ ] **Dependencies verified** — All blocking tasks show ✓ in `bd show` output
- [ ] **Context provided** — Sub-agent prompt includes bead ID, acceptance
      criteria, and specific instructions
- [ ] **Status commands included** — Prompt tells agent to mark in-progress and
      close when done
- [ ] **Parallel execution** — Ready tasks spawned in ONE message for true
      concurrency
- [ ] **Batch-then-check** — After batch completes, check for newly unblocked
      tasks
- [ ] **Document updated** — Parent agent updates markdown after phase completes

---

## Progress Tracking

Track progress by closing beads and executing document update tasks.

### Common bd Commands

```bash
# Find work to do
bd list --status=open

# View task details and dependencies
bd show <id>

# Mark task started
bd update <id> --status=in-progress

# Close with context
bd close <id> --reason "Acceptance criteria met"
```

### Progress Tracking Checklist

- [ ] **Task closure** — Run `bd close <id>` when task acceptance criteria met
- [ ] **Document update task executed** — When unblocked, update the markdown
- [ ] **Phase closure** — Close phase epic when all its tasks complete
- [ ] **Plan closure** — Close plan epic when all phase epics complete

---

## Traceability Matrix

For non-trivial plans, include a traceability matrix showing coverage:

```markdown
| Requirement | Design | Tasks    | Beads         | Status      |
| ----------- | ------ | -------- | ------------- | ----------- |
| REQ-1       | DES-1  | TASK-1.1 | <task-1.1-id> | Complete    |
| REQ-1       | DES-1  | TASK-1.2 | <task-1.2-id> | In Progress |
```

### Traceability Checklist

- [ ] **Full coverage** — Every REQ-N has corresponding tasks
- [ ] **No orphans** — Every task traces back to a requirement
- [ ] **Status tracked** — Matrix reflects current completion state
- [ ] **DES-N linked** — Design decisions bridge requirements and tasks
