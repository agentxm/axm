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

Local byte drift in acquired canonical extension content violates its accepted
package-tree integrity. Lint reports the drift and blocks affected inspection,
projection, reconciliation, and mutation preflight. The content remains
externally sourced, but only explicit `reinstall`, `update`, or `fork` may
establish valid authority again.

## Views

A lint view selects the local snapshot to inspect, such as the worktree or Git
index. Views use the same rules and invariant meanings; selecting a view cannot
turn valid state into a different predicate or add recovery guidance.

The Git-index view reads raw staged and tracked blobs rather than a checkout, so
Git filters and line-ending conversion do not alter the inspected bytes. A
package-tree mismatch in the workspace view with a valid Git-index view is
evidence that the live checkout differs while the bytes intended for commit
remain valid. A mismatch in both views establishes that the intended commit
also differs. Newly acquired untracked files must first be staged before the
index can represent the intended package tree.

## Rule behavior

Rules describe stable conditions rather than particular recovery commands. A
root-cause rule reports the primary violation; rules that depend on that failed
precondition skip instead of emitting cascade symptoms. Independent rules
continue so one broken area does not hide another.

Rule applicability follows declared workspace intent. A compatibility rule
evaluates an extension only when desired state selects it directly or through a
Pack; an extension that the workspace did not select is not a violated
compatibility invariant. Lint may report that absence as an informational
discovery fact without turning it into a manual-attention outcome.

Every catalog severity is a default for local lint. An exact `lint.rules`
entry in the active scope selects that rule's effective local severity:
`off` suppresses its findings, `info` emits informational findings, `warn`
emits warning findings, and `error` emits errors. An absent entry preserves the
catalog default. One effective severity applies to every finding produced by a
rule evaluation.

Counts, the exit category, human output, JSON output, and command success are
derived from those effective findings. `--strict` makes warnings affect the
exit code without relabeling them as errors. A `clean` exit category means no
errors or warnings; informational findings can therefore remain in a clean,
successful result.

Local policy and publication policy have separate authority:

```text
active-scope axm.json                      registry publication
---------------------                     --------------------
lint.rules                                platform canonical defaults
    |                                                |
    v                                                v
effective local findings                   fixed admission findings
    |                                                |
local output and exit                      publication eligibility
```

No local setting crosses into the publication path. The registry publish gate
owns its fixed distribution requirements and remains authoritative for
publishing.

## Specifications

The lint specifications under `specifications/cli/lint/` own lint's binding
obligations: honoring configured local severities, reporting facts without
mutation, and naming the violated invariant with complete diagnostic identity.
The [specification catalog](../../../specifications/catalog.md) indexes them.

Verification separates actor-visible capability from individual predicates:

```text
functional handler decision table
              |
      +-------+--------+
      |                |
      v                v
evaluator matrix   output and exit integration
      |                |
      +-------+--------+
              |
              v
       catalog composition
              |
              v
 per-rule conformance cases and completeness
              |
              v
 focused branch, prerequisite, and interaction tests
```

The generic evaluator owns the Cartesian product of catalog defaults and local
override values. Rule conformance does not repeat that matrix: it proves that
every catalog member has a satisfied case, at least one violation case, its
own identity/default severity/message/location, and prerequisite behavior when
another failed invariant makes the rule inapplicable. Exact catalog-to-case
equality makes a newly added rule fail until its conformance evidence lands.
Full-catalog fixtures and focused tests retain interaction, multiplicity,
ordering, and root-cause suppression evidence. Individual rules receive their
own normative product specification only when the predicate is itself an
independent product obligation, security boundary, or adopted external
contract.
