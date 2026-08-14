---
status: stable
description: The shared read, plan, and mutation boundaries used by AXM workspace operations.
depends-on:
  - ../principles.md
  - ./overview.md
  - ./invariants.md
---

# Workspace execution

AXM reads a workspace through one coherent snapshot and changes it through one
mutation boundary. This keeps command handlers from developing incompatible
views of settings, accepted resolutions, trust, extension content, inline
configuration, and managed outputs.

## Responsibilities

This document owns the structural relationship among workspace reads, plans,
locks, mutations, transactions, interruption recovery, and agent adapters.

## Non-responsibilities

This document does not define desired-state semantics, command behavior,
settings or lockfile fields, recovery scenarios, or transaction algorithms.
Those belong to the relevant architecture documents, schemas, tests, and code.
It does not promise rollback of remote registry effects.

## Read boundary

Workspace consumers read settings, source policy, lockfile, trust, manifests,
installed extension content, inline configuration, ownership evidence, and
agent and workspace-surface observations through the workspace read model. One
operation uses one snapshot; code does not mix cached and ad hoc reads and then
treat them as a coherent state.

The read model may expose receipt history for presentation and downstream
maintenance, but planning does not consume it as desired, trust, installed, or
resolution state.

Diagnostics may tolerate an invalid derived artifact in order to describe it,
but mutation planning retains enough information to distinguish missing,
invalid, and valid state.

## Planning boundary

Planning, network acquisition, preview, and confirmation occur before AXM takes
the workspace mutation lock. They produce one candidate from one workspace
snapshot. Preview, rendering, confirmation, structured output, and application
refer to that candidate rather than rebuilding equivalent plans independently.

## Mutation boundary

Application takes one OS-backed exclusive lock for the selected AXM workspace
scope. The operating system releases the lock when the process exits. AXM does
not add leases, heartbeats, PID inference, lock stealing, or distributed
coordination to local workspace mutation.

All production settings and trust changes pass through the workspace mutation
boundary. Feature code requests semantic changes rather than writing
authoritative workspace files directly. Receipt history uses its own serialized
post-success persistence boundary.

Under the lock, AXM revalidates every material authoritative input and target
preimage used by the plan. A stale plan writes nothing, and `--force` cannot
bypass that check.

Settings, trust, canonical extension content, inline configuration, and managed
outputs participate in the handled-failure transaction for work that must
change together. A handled failure restores that work without undoing an
independent group already completed.

Receipt history is persisted only after corresponding business work succeeds.
A receipt-write failure leaves that completed state intact and reports the
history-persistence failure separately. Concurrent receipt updates are
serialized and preserve unrelated rows.

## Interruption

Abrupt process termination must not tear an authoritative file or lose
workspace-authored or unowned content. AXM uses staged acquisition, atomic
file replacement, complete-directory publication, and narrow interruption
markers rather than a general write-ahead journal.

A later mutation converges deterministically from the remaining authoritative
state. Abandoned staging is removed only when AXM can prove that it owns the
staged content.

## Agent adapters

Agent adapters translate canonical extension state or authoritative inline
configuration into agent-native outputs. Workspace-surface writers perform the
same role for shared outputs such as instruction files. They own serialization
mechanics, not workspace intent, resolution, or content authority. The same
ownership and collision policy applies even when file formats differ.

## Structural enforcement

Code-package boundaries, the workspace service API, transaction tests, and
end-to-end behavior enforce these relationships. This document preserves their
purpose without mirroring the current symbols that implement them.
