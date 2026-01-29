# Spec-Driven Development

End-to-end workflow for planning, specifying, and implementing features through
OpenSpec proposals and beads task execution.

> [Spec-Driven Development](../../CLAUDE.md#spec-driven-development) — critical guidance

## Skills

| Skill                 | Purpose                              |
| --------------------- | ------------------------------------ |
| `/openspec:proposal`  | Create a new change proposal         |
| `/openspec:apply`     | Apply completed change to specs      |
| `/openspec:archive`   | Archive after deployment             |
| `/beads-plan`         | Create beads from markdown task plan |
| `/beads-execute-plan` | Execute plan phases with sub-agents  |
| `/beads-close-phase`  | Close phase epic and sync markdown   |

## Key Resources

- [OpenSpec Agent Instructions](../../openspec/AGENTS.md) — Complete OpenSpec reference
- [Beads Guide](./beads.md) — Task plan format and execution workflow

---

## Workflow Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  1. CREATE PROPOSAL                                             │
│     /openspec:proposal <description or requirements>            │
│     Creates: proposal.md, design.md, tasks.md, spec deltas      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. ITERATE ON PROPOSAL                                         │
│     Edit proposal.md until scope and impact are clear           │
│     - Why: problem statement                                    │
│     - What Changes: bullet list of changes                      │
│     - Impact: affected specs and code                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. ITERATE ON DESIGN                                           │
│     Edit design.md to match proposal.md decisions               │
│     - Context: background and constraints                       │
│     - Goals/Non-Goals: explicit boundaries                      │
│     - Decisions: technical choices with rationale               │
│     - Risks: identified trade-offs and mitigations              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. UPDATE TASKS                                                │
│     Edit tasks.md with TASK-N.M format (see beads.md)           │
│     - Implements: link to DES-N, REQ-N                          │
│     - Acceptance Criteria: verifiable yes/no checks             │
│     - Dependencies: task ordering                               │
│     - Execution types: AUTO, HUMAN, VERIFY, HYBRID              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  5. EXECUTE WITH BEADS                                          │
│     /beads-plan openspec/changes/<change-id>/tasks.md           │
│     /beads-execute-plan <phase>  (or omit for entire plan)      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Create Proposal

Start every non-trivial change with a proposal.

```
/openspec:proposal <describe work, reference linear issue, or paste requirements>
```

This scaffolds:

- `proposal.md` — Why and what changes
- `design.md` — Technical decisions
- `tasks.md` — Implementation plan
- `specs/<capability>/spec.md` — Behavior deltas (if applicable)

**When to create a proposal:**

- New features or capabilities
- Breaking changes (API, schema)
- Architecture changes
- Performance optimizations that change behavior

**Skip proposal for:**

- Bug fixes restoring spec behavior
- Typos, formatting, comments
- Non-breaking dependency updates
- Tests for existing behavior

---

## Step 2: Iterate on Proposal

Refine `proposal.md` until scope is clear.

```markdown
# Change: [Brief description]

## Why

[1-2 sentences on problem/opportunity]

## What Changes

- [Bullet list of changes]
- [Mark breaking changes with **BREAKING**]

## Impact

- Affected specs: [list capabilities]
- Affected code: [key files/systems]
```

**Quality checks:**

- [ ] Problem statement is clear and specific
- [ ] Changes are enumerated, not vague
- [ ] Breaking changes are marked
- [ ] Impact identifies affected areas

---

## Step 3: Iterate on Design

Keep `design.md` consistent with `proposal.md`.

```markdown
## Context

[Background, constraints, stakeholders]

## Goals / Non-Goals

- Goals: [what we will do]
- Non-Goals: [what we explicitly won't do]

## Decisions

- Decision: [What and why]
- Alternatives considered: [Options + rationale]

## Risks / Trade-offs

- [Risk] → Mitigation

## Open Questions

- [Unresolved items]
```

**Quality checks:**

- [ ] Goals align with proposal's "What Changes"
- [ ] Non-goals prevent scope creep
- [ ] Decisions have rationale
- [ ] Risks have mitigations

---

## Step 4: Update Tasks

Write tasks in TASK-N.M format. **Read [beads.md](./beads.md) for format details.**

```markdown
### TASK-N.M: Task Name [TYPE]

**Implements:** DES-N, REQ-N

**Description:** What this task accomplishes (1-2 sentences).

**Acceptance Criteria:**

- [ ] First verifiable criterion
- [ ] Second verifiable criterion

**Dependencies:** TASK-X.Y | Human Gate | None
```

**Execution types:**
| Type | Use for |
| ---------- | ---------------------------------------------- |
| `[AUTO]` | Code writing, tests, file operations |
| `[HUMAN]` | Credentials, approvals, external configuration |
| `[VERIFY]` | Visual review, UX testing, manual QA |
| `[HYBRID]` | AI prepares, human executes in restricted env |

**Quality checks:**

- [ ] Every task has TASK-N.M identifier
- [ ] Every task has execution type marker
- [ ] Acceptance criteria are yes/no verifiable
- [ ] Dependencies explicitly stated
- [ ] AUTO tasks front-loaded before human gates

---

## Step 5: Execute with Beads

### Create Beads from Task Plan

```
/beads-plan openspec/changes/<change-id>/tasks.md
```

This creates:

- Plan epic (entire document)
- Phase epics (one per phase)
- Task beads (one per TASK-N.M)
- Document update tasks (one per phase)

### Execute Plan

```
/beads-execute-plan <scope>
```

- Omit `<scope>` to execute entire plan
- Pass phase name or epic ID to execute specific phase
- Sub-agents spawn for each ready task

### Close Phases

```
/beads-close-phase <phase-epic-id>
```

Syncs markdown and closes the phase epic.

---

## Validation

Before requesting approval, validate the proposal:

```bash
openspec validate <change-id> --strict --no-interactive
```

Common issues:

- Missing scenarios (use `#### Scenario:` format)
- Incomplete requirements (every requirement needs at least one scenario)
- Invalid references (check TASK-N.M, DES-N, REQ-N links)

---

## Complete Example

```bash
# 1. Create proposal
/openspec:proposal Add user authentication with JWT tokens

# 2-4. Iterate on files
# Edit proposal.md, design.md, tasks.md as needed

# Validate before proceeding
openspec validate add-user-auth --strict --no-interactive

# 5. Execute
/beads-plan openspec/changes/add-user-auth/tasks.md
/beads-execute-plan Phase1  # or omit for entire plan
```

---

## See Also

- [OpenSpec AGENTS.md](../../openspec/AGENTS.md) — Full OpenSpec reference
- [Beads Guide](./beads.md) — Task format and execution details
