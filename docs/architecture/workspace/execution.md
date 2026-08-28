---
type: Architecture
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

Project workspace construction first loads project and user settings under the
documented missing-file semantics and validates every present source. This
shared prerequisite completes before AXM creates an operation snapshot or
derives facts, desired state, plans, closures, previews, inspection results, or
mutation candidates. A settings failure produces only its bounded diagnostic;
the selected operation does not begin and no workspace state changes.

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

After construction succeeds, one operation uses one valid settings-backed
snapshot. Diagnostics may tolerate later invalid workspace state to describe
it, but planning preserves the distinction among missing, invalid, unsupported,
and valid inputs. Closure-local isolation begins at this post-construction
boundary; it does not substitute for an unavailable settings prerequisite.

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

Contributors to one aggregate ownership unit share that unit and therefore join
one closure. An operation touching several of them plans one write of the unit
from the complete contributor set rather than one write per contributor, so no
two steps in a mutation write the same unit and no intermediate state renders a
subset.

## Mutation boundary

Application takes one atomic process lock for the selected AXM workspace
scope. AXM refreshes the lock while its owner runs and a later mutation
reclaims it after abrupt process death. AXM does not add
leases, heartbeats, PID inference, lock stealing, or distributed coordination.

Under the lock, AXM revalidates every material authoritative input and target
preimage used by the plan. A stale plan performs no writes, and `--force` cannot
bypass the check
([AXM-REQ-0007](../../../gen-stack/architecture/surfaces/cli/requirements/constraint/force-bypasses-only-forceable-policies.md)
is canonical for the force boundary).

All production settings and lock changes pass through the shared semantic
mutation boundary. Settings, authoritative lock state, canonical extension
content, and owned outputs needed by one closure commit together. A handled
failure rolls back that closure without undoing independent closures already
committed.

Authoritative files publish through atomic replacement. Canonical directories
publish as complete directories rather than partially populated destinations.
Read-modify-write adapters validate their independently owned entry or region
and preserve all surrounding content, owned and unowned.

## Interruption and recovery

Abrupt process termination must not tear an authoritative file, publish an
incomplete canonical directory, or lose workspace-authored or unowned content.
The next mutation acquires the workspace lock, resolves owned transient state,
then evaluates its requested transition. AXM restores validity; it does not
promise to finish, resume, or roll back the interrupted command.

File placement communicates ownership and lifetime without a transaction
journal, command-intent marker, receipt, or recovery flag:

| State                                     | Placement and lifecycle                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| Durable workspace authority               | Canonical files and packages below `.axm/`                                                  |
| Project-local scratch                     | Unique children of `.axm/tmp/`; the workspace mutex is `.axm/tmp/workspace-transition.lock` |
| Invocation scratch and rollback snapshots | Uniquely prefixed directories in the operating-system temporary directory                   |
| Atomic single-file publication            | Exact `<target>.tmp.<unique>` siblings, swept only by that target's writer                  |
| Atomic canonical-directory publication    | Exact `<canonical>.axm-staging` and `<canonical>.axm-backup` siblings                       |
| Performance-only cache                    | The platform cache directory, including Registry archives and update-check state            |
| Restricted user state                     | The user AXM home, including pending login, file credentials, and install metadata          |

Package creation, import, fork, install, and replacement all populate and
validate the complete sibling staging tree before a same-parent rename makes it
canonical. On the next mutation, backup without canonical restores the prior
tree; backup with canonical is superseded; stale staging is discarded. Recovery
recognizes only these exact owned sibling names and preserves all unrelated
content. Unique scratch children allow concurrent operations without deleting
one another's work, and an empty `.axm/tmp/` is removed after its last owner
finishes.

## Projection adapters

Adapters translate canonical extension content or authoritative inline
configuration into agent-native outputs. Workspace-surface writers do the same
for shared outputs such as instruction files. Each adapter owns observation,
serialization, and durable ownership evidence for its smallest independently
mutable unit—not workspace intent, resolution, or canonical authority.

Every adapter distinguishes missing, incomplete, stale, obsolete, divergent,
unowned collision, and ambiguous ownership. AXM creates, restores, or removes
only proven owned units. Unowned or ambiguous units are preserved and block only
their affected closure.

An adapter receives the complete contributor set its unit requires from shared
planning; it does not derive membership from settings, lock state, canonical
content, or the unit's current content. When the desired-state graph cannot be
resolved completely, the write is blocked and the unit is left as it stands
rather than rewritten from partial knowledge.

An operation's postcondition is established by reading back the units it
claimed to change, as [projection facts](invariants.md#projection-facts)
require. Completing the canonical, settings, and lock work for an extension is
not evidence that its outputs exist or are correct.

## Structural enforcement

Every ownership unit is declared once in a shared unit registry: its target,
whether it carries one contributor or many, and its membership rule. That one
declaration drives planning, reconciliation, projection facts, and the
conformance suite. Render inputs carrying a complete contributor set are
constructed only by shared planning code from the desired-state graph, so an
adapter that could enumerate its own membership has no write path.

Code-package boundaries, workspace service interfaces, plan contracts,
transaction and atomic-publication tests, adapter conformance, and interruption
E2E enforce these relationships. Prose preserves their responsibility without
freezing current symbol names.
