---
type: Architecture
status: stable
description: Lint responsibilities, diagnostic behavior, and verification strategy.
depends-on:
  - ./overview.md
  - ../principles.md
  - ../workspace/overview.md
  - ../workspace/invariants.md
---

# Lint

`axm lint` explains extension and workspace invariant violations, including
configured-agent, instruction-surface, source-policy, and inline-configuration
state. It helps a person or agent understand what is invalid without guessing
what they intended or directing them through a recovery workflow.

## Responsibilities

Lint reads local authoritative and observed state and reports what is invalid.
Its workspace facts come from the shared invariant model rather than a
lint-specific definition of validity.

Each finding identifies:

- a stable rule;
- severity and scope;
- the affected extension or workspace subject;
- the authoritative source and observed fact;
- the expected invariant; and
- relevant identities and locations.

Messages should be understandable without knowing AXM internals. They state the
problem and its context. A finding whose repair is deterministic may also name
the single operation that performs it; a finding whose repair depends on user
intent states the problem alone and leaves the choice to the reader. Structured
output preserves the same facts and marks which findings are repairable.

The finding is the entry point into recovery, not the complete recovery guide.
It carries enough identity, authority, observed-state, expected-state, and
location information to select the relevant AXM introspection surfaces. Those
surfaces provide the surrounding schema, state model, and available operations.

## Repairable findings

A finding is repairable when the desired state is fully determined by
authoritative local state, so restoring it cannot express a preference. A
missing AXM-owned agent projection whose canonical source is present is the
motivating case: the target's content is a function of the source, so
regenerating it decides nothing.

`axm lint --fix` applies exactly those repairs and reports the remaining
findings. It reuses the same reconciliation sync performs rather than
implementing a second recovery path, so both commands converge on one desired
state. Findings that are not repairable are never guessed at.

## Non-responsibilities

Lint does not report general inventory, available updates, unpublished authored
content, registry availability, recovery classifications, or predictions about
which mutation a finding would block. It does not use the network.

Lint does not guess user intent, choose workspace configuration, install or
remove extensions, or change authoritative lock state. Those responsibilities
belong to the user or to lifecycle commands.

Reconciling agent projections belongs to sync. Lint reaches it only through
`--fix`, only for findings whose desired state is already determined, and only
by delegating to the same reconciliation — never by owning a second definition
of the desired state. Without `--fix`, lint remains read-only.

The presence of unowned native content is not itself an invariant violation.
Lint reports it only when the relevant extension contract makes the state a
collision, an authority ambiguity, or another durable invalid condition.

Local byte drift in externally installed canonical extension content is not by
itself a lint or accepted-resolution violation. The content remains externally
sourced, but only an explicit update or reinstall may replace it.

## Views

A lint view selects the local snapshot to inspect, such as the worktree or Git
index. Views use the same rules and invariant meanings; selecting a view cannot
turn valid state into a different predicate or add recovery guidance.

## Rule behavior

Rules describe stable conditions rather than particular recovery commands. A
root-cause rule reports the primary violation; rules that depend on that failed
precondition skip instead of emitting cascade symptoms. Independent rules
continue so one broken area does not hide another.

Platform invariant errors cannot be disabled or lowered. Warnings may be
disabled, retained, or promoted. `--strict` makes warnings affect the exit code
without relabeling them as errors.

Local lint configuration affects local linting. The registry publish gate owns
its fixed distribution requirements and remains authoritative for publishing.

## Testing strategy

Lint tests own the rule catalog, views, and exact findings. The shared
[workspace invariant design](../workspace/invariants.md) owns exhaustive
recovery coverage. Completeness coverage proves that every lint rule emits the
required diagnostic facts and that the schemas, help, or inspection surfaces
needed to understand its admissible recovery choices remain available.
Cross-type tests prevent mere unowned presence from becoming a generic error
while proving type-specific collision and ambiguity findings.
