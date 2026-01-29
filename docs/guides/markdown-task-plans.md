---
status: active
description:
  Best practices for creating markdown-based task plans with execution markers,
  dependencies, and human gates for AI-assisted execution.
---

# Markdown Task Plans

Standards for writing task plans in markdown that maximize autonomous AI
execution while maintaining clear handoff points for human intervention. Covers
task structure, execution types, sequencing, and quality criteria.

---

## Quick Example

_Illustrates: "Task identifier format," "Execution type markers," and "Human
gate pattern"_

```markdown
### Phase 1: Core Implementation [AUTO]

### TASK-1.1: Create database schema [AUTO]

**Implements:** DES-1, REQ-1

**Description:** Define PostgreSQL schema for user preferences.

**Acceptance Criteria:**

- [ ] Migration file exists in db/migrations/
- [ ] Schema includes user_id, preference_key, preference_value columns
- [ ] Indexes defined for user_id lookups

**Dependencies:** None

### TASK-1.2: Implement repository layer [AUTO]

**Implements:** DES-1, REQ-1

**Dependencies:** TASK-1.1

─── Human Gate: Database Configuration ───

**Blocked tasks:** TASK-2.1

**Required actions:**

- [ ] Create PostgreSQL database in Neon dashboard
- [ ] Run: `pulumi config set db-url <connection-string> --secret`

**Resumes at:** TASK-2.1

### Phase 2: Integration [AUTO]

### TASK-2.1: Add integration tests [AUTO]

**Implements:** DES-2, REQ-2

**Dependencies:** Human Gate
```

The identifier chain (TASK-1.1 → TASK-1.2 → Human Gate → TASK-2.1) ensures
sequential execution with clear handoff points. Execution markers ([AUTO])
indicate autonomous completion. For multi-session work, see
[Creating Beads WBS from Markdown Task Plans](creating-beads-wbs-from-markdown-task-plans.md).

---

## At a Glance

This guide covers task structure, execution types, sequencing, and human gates
for markdown-based task plans. Each section ends with a verification checklist.
Start with [Task Structure](#task-structure) for the foundational format, then
see [Execution Types](#execution-types) to choose the right marker for each
task. The [Task Quality Checklist](#task-quality-checklist) provides end-to-end
verification before execution.

---

## Task Structure

Each task follows a consistent format that enables traceability and
verification.

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

Each task includes these fields:

```markdown
### TASK-N.M: <Task Name> [TYPE]

**Implements:** DES-N, REQ-N

**Description:** [What this task accomplishes—one to two sentences]

**Acceptance Criteria:**

- [ ] [First verifiable criterion]
- [ ] [Second verifiable criterion]

**Dependencies:** TASK-X.Y | Human Gate | None
```

For multi-session work, add bead IDs after creating issues. See
[Creating Beads WBS from Markdown Task Plans](creating-beads-wbs-from-markdown-task-plans.md).

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

### Execution Type Definitions

| Type       | Performer  | Description                                                 |
| ---------- | ---------- | ----------------------------------------------------------- |
| **AUTO**   | AI only    | Claude Code completes without human input                   |
| **HUMAN**  | Human only | Requires human action AI cannot perform                     |
| **VERIFY** | AI + Human | AI implements, human confirms correctness                   |
| **HYBRID** | AI → Human | AI prepares artifacts, human executes in restricted context |

### When to Use Each Type

**AUTO** — Code writing, file creation, test execution, refactoring:

_Illustrates: "AUTO for code tasks"_

```markdown
### TASK-1.1: Create ExportButton component [AUTO]

**Implements:** DES-1, REQ-1

**Acceptance Criteria:**

- [ ] Component exists in components/ExportButton.tsx
- [ ] Accepts data and filename props
- [ ] Shows loading state during export
```

**HUMAN** — Credential provisioning, external service configuration, approvals:

_Illustrates: "HUMAN for externals"_

```markdown
### TASK-2.1: Configure OAuth application [HUMAN]

**Implements:** DES-2, REQ-2

**Action Required:**

1. Create OAuth app in GitHub Developer Settings
2. Copy Client ID and Client Secret
3. Run: `pulumi config set github-client-id <id>`
4. Run: `pulumi config set github-client-secret <secret> --secret`

**Provides:** OAuth credentials for TASK-3.1
```

**VERIFY** — Visual review, UX testing, manual QA where AI cannot assess:

_Illustrates: "VERIFY for assessment"_

```markdown
### TASK-4.1: Verify export functionality [VERIFY]

**Implements:** DES-1, REQ-1

**Verification Steps:**

- [ ] Export button visible on all data views
- [ ] Clicking export downloads valid CSV file
- [ ] Loading indicator displays during generation
- [ ] Large datasets (1000+ rows) export without timeout
```

**HYBRID** — Migration scripts, production deployments, security-sensitive
operations:

_Illustrates: "HYBRID for sensitive"_

```markdown
### TASK-5.1: Execute database migration [HYBRID]

**Implements:** DES-3, REQ-3

**AI Prepares:**

- Migration script in db/migrations/003_add_preferences.sql
- Rollback script in db/migrations/003_add_preferences_rollback.sql
- Verification queries in db/verify/003_preferences_check.sql

**Human Executes:**

1. Review migration script for correctness
2. Run migration in staging: `psql $STAGING_URL -f db/migrations/003_*.sql`
3. Verify with: `psql $STAGING_URL -f db/verify/003_*.sql`
4. Run migration in production after staging verification
```

### Execution Types Checklist

- [ ] **Every task marked** — No task lacks an execution type marker
- [ ] **AUTO for code tasks** — Code writing, tests, file operations use AUTO
- [ ] **HUMAN for externals** — Credentials, approvals, external configs use
      HUMAN
- [ ] **VERIFY for assessment** — Visual, UX, and subjective review use VERIFY
- [ ] **HYBRID for sensitive** — Production operations, security tasks use
      HYBRID

---

## Sequencing Guidelines

Task order significantly impacts execution efficiency. Proper sequencing
maximizes autonomous progress and minimizes context-switching for humans.

### Why Sequencing Matters

Poor sequencing forces frequent context switches between AI and human work,
fragmenting both attention and progress. By front-loading autonomous work, AI
completes maximum value before requiring human input. Batching human tasks into
explicit gates consolidates interruptions into predictable checkpoints.
Deferring verification until implementation completes prevents premature review
of incomplete work. See the [Sequencing Checklist](#sequencing-checklist) for
verification items.

### Good vs Poor Sequencing

_Good sequencing (batched gates):_

_Illustrates: "AUTO front-loaded," "HUMAN batched," "VERIFY deferred," and
"Phases labeled"_

```markdown
### Phase 1: Core Implementation [AUTO]

TASK-1.1 [AUTO]: Create database schema TASK-1.2 [AUTO]: Implement repository
layer TASK-1.3 [AUTO]: Add API endpoints TASK-1.4 [AUTO]: Write unit tests

─── Human Gate: External Configuration ───

TASK-2.1 [HUMAN]: Configure database credentials TASK-2.2 [HUMAN]: Create OAuth
app in provider

─── Resume Autonomous Work ───

### Phase 2: Integration [AUTO]

TASK-3.1 [AUTO]: Add integration tests TASK-3.2 [AUTO]: Implement error handling

### Phase 3: Verification [VERIFY]

TASK-4.1 [VERIFY]: Manual testing of auth flow TASK-4.2 [VERIFY]: Visual review
of UI components
```

_Poor sequencing (interleaved interruptions):_

_Illustrates: violations of "AUTO front-loaded," "HUMAN batched," "VERIFY
deferred," and "No scattered types"_

```markdown
TASK-1.1 [AUTO]: Create schema TASK-1.2 [HUMAN]: Get credentials ← blocks too
early TASK-1.3 [AUTO]: Implement layer TASK-1.4 [HUMAN]: Configure service ←
another interruption TASK-1.5 [AUTO]: Write tests TASK-1.6 [VERIFY]: Review UI ←
scattered verification TASK-1.7 [AUTO]: Add endpoints TASK-1.8 [VERIFY]: Test
flow ← more scattered verification
```

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

Vague instructions waste human time and introduce errors. Provide exact steps.

_Vague (avoid):_

```markdown
### TASK-2.1: Configure Database Credentials [HUMAN]

Configure the database connection for the application.
```

_Actionable (prefer):_

```markdown
### TASK-2.1: Configure Database Credentials [HUMAN]

**Implements:** DES-2, REQ-2

**Action Required:**

1. Create PostgreSQL database in Neon dashboard
   - Navigate to https://neon.tech/console
   - Click "New Project" → name it "agentxm-staging"
   - Select region: us-east-1
2. Copy the connection string from "Connection Details"
3. Run: `pulumi config set db-url <connection-string> --secret`
4. Verify: `pulumi config get db-url` shows `[secret]`

**Provides:** Database connection for TASK-3.1 integration tests

**Dependencies:** TASK-1.4
```

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

### Dependency Format

Always state dependencies explicitly, even when none exist:

```markdown
### TASK-1.1: Create schema [AUTO]

**Dependencies:** None

### TASK-1.2: Implement repository [AUTO]

**Dependencies:** TASK-1.1

### TASK-2.1: Add integration tests [AUTO]

**Dependencies:** TASK-1.2, Human Gate
```

### Circular Dependencies

Circular dependencies indicate a design problem. If A depends on B and B depends
on A, restructure:

- Split one task into independent subtasks
- Identify the true ordering constraint
- Move shared setup to a prerequisite task

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

### Criteria Format

Use checkbox format for scannability:

```markdown
**Acceptance Criteria:**

- [ ] Component exists at src/components/ExportButton.tsx
- [ ] Props interface exported with `data: unknown[]` and `filename: string`
- [ ] Loading state shown during export (spinner visible)
- [ ] File downloads with correct filename on completion
- [ ] `pnpm test src/components/ExportButton.test.tsx` passes
```

### Acceptance Criteria Checklist

- [ ] **Checkbox format** — Each criterion uses `- [ ]` prefix
- [ ] **Binary verifiable** — Each criterion answerable with yes/no
- [ ] **Specific outcomes** — States exact files, values, or behaviors
- [ ] **Test commands** — Includes runnable verification commands where
      applicable
- [ ] **No subjective terms** — Avoids "good," "proper," "appropriate"

---

## Traceability Matrix

For non-trivial plans, include a traceability matrix showing coverage:

```markdown
## Traceability Matrix

| Requirement | Design | Tasks              | Status      |
| ----------- | ------ | ------------------ | ----------- |
| REQ-1       | DES-1  | TASK-1.1, TASK-1.2 | Pending     |
| REQ-2       | DES-2  | TASK-2.1           | In Progress |
| REQ-3       | DES-3  | TASK-3.1, TASK-3.2 | Complete    |
```

For multi-session work with beads, add a Beads column. See
[Creating Beads WBS from Markdown Task Plans](creating-beads-wbs-from-markdown-task-plans.md#enhanced-traceability-matrix).

### Traceability Checklist

- [ ] **Full coverage** — Every REQ-N has corresponding tasks
- [ ] **No orphans** — Every task traces back to a requirement
- [ ] **Status tracked** — Matrix reflects current completion state
- [ ] **DES-N linked** — Design decisions bridge requirements and tasks
- [ ] **Matrix maintained** — Matrix updated as tasks complete during execution

---

## Task Quality Checklist

Use this checklist to verify task plan completeness before execution.

### Structure

- [ ] **Identifier format** — All tasks use TASK-N.M pattern
- [ ] **Execution markers** — Every task has [AUTO], [HUMAN], [VERIFY], or
      [HYBRID]
- [ ] **Required fields** — Each task has Implements, Description, Acceptance
      Criteria, Dependencies
- [ ] **Phases organized** — Tasks grouped into logical phases by execution flow

### Execution Flow

- [ ] **AUTO front-loaded** — Maximum autonomous progress before human gates
- [ ] **HUMAN batched** — Human tasks grouped into explicit gates
- [ ] **VERIFY deferred** — Verification batched at end when possible
- [ ] **Gates explicit** — Human gates have clear names, blocked tasks, and
      actions

### Quality

- [ ] **HUMAN actionable** — Human tasks include exact steps, not vague
      instructions
- [ ] **Criteria verifiable** — Acceptance criteria answerable with yes/no
- [ ] **Dependencies valid** — All task references exist and no circulars
- [ ] **Matrix included** — Non-trivial plans have traceability matrix

For multi-session work with beads, see the
[Beads Execution Checklist](creating-beads-wbs-from-markdown-task-plans.md#beads-execution-checklist).
