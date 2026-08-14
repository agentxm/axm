---
status: stable
description: The shared fact, plan, closure, and mutation boundaries used by AXM workspace operations.
depends-on:
  - ../principles.md
  - ./overview.md
  - ./invariants.md
---

# Workspace execution

AXM observes a workspace through one coherent snapshot and changes it through
semantic mutation closures. This keeps command handlers from developing
incompatible views of settings, accepted lock state, canonical content, inline
configuration, ownership, and managed outputs.

## Responsibilities

This document owns the structural relationship among invariant facts, read
models, plans, semantic closures, locks, transactions, interruption recovery,
and projection adapters.

## Non-responsibilities

This document does not define desired-state semantics, command behavior,
settings or lockfile fields, individual recovery scenarios, or transaction
algorithms. Those belong to the relevant architecture documents, schemas,
tests, and code. It does not promise rollback of remote Registry effects.

## Observation and fact boundaries

The workspace read model is cached observation, inventory, and diagnostic
context. It reports what exists without inferring desired membership,
installation, Pack reachability, accepted resolution, or ownership from names,
paths, bytes, or historical state.

A dedicated invariant-fact capability composes:

- the desired-state graph derived from settings and authored manifests;
- authoritative accepted-resolution state from the lockfile;
- canonical-content observations and source authority; and
- adapter-owned observations of agent-native and workspace-native units.

Lint and sync consume the same intrinsic facts. Sync may add live operational
evidence such as source availability or acquisition failure; that evidence does
not become a lint predicate.

One operation uses one snapshot. Diagnostics may tolerate invalid state to
describe it, but planning preserves the distinction among missing, invalid,
unsupported, and valid inputs.

## Planning and semantic closures

Planning, network acquisition, preview, and confirmation occur before AXM takes
the workspace mutation lock. Preview, rendering, confirmation, structured
output, and application refer to the same candidate rather than rebuilding it
independently.

A semantic mutation closure is the smallest unit whose postcondition must hold
together. Work joins one closure through:

- desired reachability relationships;
- combined desired, lock, and canonical-content postconditions;
- a shared native ownership unit; or
- an invariant that requires joint validation.

Physical co-location in a settings file, lockfile, or native file does not by
itself merge otherwise independent closures. Cleanup that requires a complete
desired graph is a separate maintenance closure and does not run when graph
construction is incomplete.

## Mutation boundary

Application takes one atomic process lock for the selected AXM workspace
scope. AXM refreshes the lock while its owner runs and a later mutation
reclaims it after abrupt process death. AXM does not add
leases, heartbeats, PID inference, lock stealing, or distributed coordination.

Under the lock, AXM revalidates every material authoritative input and target
preimage used by the plan. A stale plan performs no writes, and `--force` cannot
bypass the check.

All production settings and lock changes pass through the shared semantic
mutation boundary. Settings, authoritative lock state, canonical extension
content, and owned outputs needed by one closure commit together. A handled
failure rolls back that closure without undoing independent closures already
committed.

Authoritative files publish through atomic replacement. Canonical directories
publish as complete directories rather than partially populated destinations.
Read-modify-write adapters validate their independently owned entry or region
and preserve surrounding unowned content.

## Interruption and recovery

Abrupt process termination must not tear an authoritative file, publish an
incomplete canonical directory, or lose workspace-authored or unowned content.
AXM may use narrow markers identifying the affected closure and owned staging;
markers do not journal command intent or preimages.

The next mutation acquires the OS lock, converges any marked closure from
surviving settings, lock state, canonical content, and ownership facts, then
evaluates its requested transition. AXM restores validity; it does not promise
to finish, resume, or roll back the interrupted command. Abandoned staging is
removed only when AXM can prove ownership.

## Projection adapters

Adapters translate canonical extension content or authoritative inline
configuration into agent-native outputs. Workspace-surface writers do the same
for shared outputs such as instruction files. Each adapter owns observation,
serialization, and durable ownership evidence for its smallest independently
mutable unit—not workspace intent, resolution, or canonical authority.

Every adapter distinguishes missing, stale, obsolete, divergent, unowned
collision, and ambiguous ownership. AXM creates, restores, or removes only
proven owned units. Unowned or ambiguous units are preserved and block only
their affected closure.

## Structural enforcement

Code-package boundaries, workspace service interfaces, plan contracts,
transaction and atomic-publication tests, adapter conformance, and interruption
E2E enforce these relationships. Prose preserves their responsibility without
freezing current symbol names.
