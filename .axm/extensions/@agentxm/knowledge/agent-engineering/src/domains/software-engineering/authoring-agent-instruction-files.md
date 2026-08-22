---
type: How-to guide
title: How to author agent instruction files
description: How to create or revise a scoped agent instruction system such as AGENTS.md or CLAUDE.md without assuming one coding agent's loading or precedence behavior.
tags:
  [
    agent-instructions,
    instruction-files,
    authoring,
    agents.md,
    claude.md,
    scope,
    progressive-disclosure,
  ]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-15T20:45:15Z }
stale_after: 2027-02-15
sources:
  - id: agent-instruction-files
    resource: agent-instruction-files.md
    title: Agent instruction files
  - id: progressive-disclosure
    resource: ../../context/progressive-disclosure.md
    title: Progressive disclosure
---

# How to author agent instruction files

Use this guide to create or revise `AGENTS.md`, `CLAUDE.md`, or another
persistent agent instruction surface. It supplies a portable authoring
process; the active repository, harness, and their authoritative documentation
must supply current file-discovery and precedence behavior.

For the underlying model and tradeoffs, read
[Agent instruction files](agent-instruction-files.md).

## Goal

Produce a maintainable instruction system that gives supported agents
high-value guidance at the scope where it is true, routes deeper context on
demand, and can be verified from realistic entry points.

## Preconditions

- A bounded repository or workspace
- Representative tasks and working locations
- Access to the active instruction sources and their authoritative behavior
- Authority to change the canonical source or its managed projections

## 1. Resolve the effective instruction contract

Do not begin from a universal assumption about hierarchical files. Establish
the behavior of the consuming environment:

- Which instruction sources are recognized?
- What scope does each source govern?
- Are sources loaded eagerly, conditionally, or on demand?
- Are applicable sources combined, selected, ordered, or replaced?
- Is conflict precedence defined?
- How can the effective instruction set be inspected or tested?

Record only the answers needed for the repository and hosts in scope. Treat
unresolved precedence as a reason to remove conflicts, not an invitation to
guess which instruction wins.

## 2. Establish authority

Identify the canonical instruction source before editing. Distinguish it from
generated files, aliases, imports, symlinks, and host-specific projections.
Change the owner and regenerate or reconcile dependents through their existing
mechanism. Do not create independently maintained copies merely to support
another filename.

## 3. Choose representative work

Select a small set of tasks that exercise the repository's meaningful scopes:

- work governed by repository-wide constraints;
- work inside a component with genuine local differences; and
- adjacent work that must not receive those local instructions.

Include the working locations or target paths from which each task begins.
These cases will drive placement and later verify applicability.

## 4. Inventory the current surface

List applicable instruction sources, their intended scopes, and the distinct
guidance each owns. Follow their routes to local guides, skills, knowledge,
tools, and checks. Mark duplication, stale commands, ambiguous conflicts,
missing routes, and local detail that appears too broadly.

When revising an existing surface, use the
[audit finding classes](agent-instruction-files.md#audit-finding-classes)
to keep findings consistent and evidence-backed.

## 5. Select instruction-worthy content

Keep content that performs one of four jobs:

| Job              | Keep when                                                         |
| ---------------- | ----------------------------------------------------------------- |
| Invariant        | A stable constraint must shape work throughout its scope          |
| Working command  | A non-obvious command materially improves execution or validation |
| Discovery route  | A recognizable condition should load a deeper owner               |
| Environment fact | A stable, non-obvious fact changes the next action                |

Exclude background essays, exhaustive reference, task backlogs, long reusable
procedures, and facts the agent can cheaply and reliably discover from the
repository itself.

## 6. Choose the smallest truthful scope

Place each instruction in the smallest scope that covers all work it governs
without duplicating it across siblings. Keep broad guidance genuinely broad;
put local differences near their owner. Introduce a narrower instruction file
only when it expresses a real applicability boundary.

If a local scope would repeat most of its parent, keep the shared content at
the parent and retain only the difference locally. If the consuming harness
does not support the intended scope, use an established conditional mechanism
or keep the condition explicit in a broader source.

## 7. Write actionable guidance

State what should change the agent's next action. Prefer concise condition,
action, and target shapes:

- “Before changing migrations, read …”
- “After modifying this package, run …”
- “Do not edit generated output; change …”

Name exact commands, paths, or completion evidence when they are stable and
non-obvious. Avoid topic-only labels, vague quality demands, unexplained
preferences, and prose that requires the agent to infer when it matters.

## 8. Route depth to its owner

Keep the instruction surface small by routing rather than copying:

- reusable procedures to skills or guides;
- explanation and reference to knowledge or documentation;
- external observation and action to tools; and
- mechanically decidable conventions to checks, schemas, or policy controls.

Preserve a concise trigger and route whenever moving the body would otherwise
make useful depth undiscoverable.

## 9. Reconcile overlap and conflicts

Give repeated guidance one authoritative owner. Remove parent-child
duplication and reconcile instructions that can apply together. Use explicit
overrides only when the active contract defines their behavior and the
exception is easier to understand than a conflict-free formulation.

Re-read the complete effective surface rather than reviewing each file in
isolation. Locally coherent files can still form a contradictory combined
context.

## 10. Validate representative entry points

For each representative task:

1. Start from its realistic working location or target path.
2. Inspect or otherwise establish the effective instruction sources.
3. Confirm broad guidance appears where intended.
4. Confirm narrower guidance appears only for matching work.
5. Check routes and commands against their current targets.
6. Exercise intentional precedence behavior where the harness defines it.
7. Verify adjacent tasks do not inherit irrelevant local detail.

Test the instruction interface, not only the Markdown. A correct file that is
not loaded—or is loaded too broadly—does not satisfy the goal.

## 11. Assign maintenance ownership

Record who owns each instruction scope and what changes should trigger review,
such as command changes, repository restructuring, harness changes, or moved
canonical documentation. Prefer periodic evaluation against representative
tasks over adding instructions after every isolated failure.

## Final check

- The consuming environment's instruction contract was resolved, not assumed.
- Every instruction performs a high-value persistent job.
- Broad and local scopes have distinct, truthful ownership.
- Procedures and explanations are routed rather than copied.
- Conflicts are removed unless precedence is explicit and intentional.
- Canonical sources and projections cannot silently drift.
- Representative and adjacent entry points produce the intended context.
