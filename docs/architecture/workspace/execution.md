---
type: Architecture
status: stable
description: The shared fact, plan, closure, and mutation boundaries used by AXM workspace operations.
depends-on:
  - ../principles.md
  - ./overview.md
  - ./invariants.md
  - ../decisions/closure-atomicity-and-recovery.md
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
The inventory takes its `leftover` classification from the install-root observation, whose reachability verdict comes from the desired-state graph; it never infers that verdict from path containment.

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
itself merge otherwise independent closures. Cleanup that requires every
desired route to be known is a separate maintenance closure and does not run
while an active Pack's routes are unresolved. A problem confined to one
identified extension blocks that extension's closure alone, and an aggregate
unit renders only when the contributor set for its own extension type is
complete.

Contributors to one aggregate ownership unit share that unit and therefore join
one closure. An operation touching several of them plans one write of the unit
from the complete contributor set rather than one write per contributor, so no
two steps in a mutation write the same unit and no intermediate state renders a
subset.

## Mutation boundary

Application takes one atomic process lock for the selected AXM workspace
scope. AXM refreshes the lock while its owner runs and a later mutation
reclaims it after abrupt process death.

Workspace authority and physical write boundaries answer different questions.
Two workspaces can have independent settings and lock state while reaching the
same native file through aliases or external roots. Their workspace locks
therefore cannot alone prevent one transaction from overwriting another's
output or restoring an obsolete preimage over it.

Active transactions also claim their physical boundaries in a stable namespace
under the operating-system account's home. Environment-selected user scopes,
native roots, and temporary directories cannot move that coordination boundary.
A short admission lock serializes claim publication and retirement, rejecting
equal boundaries and ancestor/descendant overlaps with another active
transaction. Disjoint transactions continue their business writes concurrently.
An invocation holds its claims through postcondition validation and rollback.
A conflict discovered as later targets are protected fails the closure and
restores eligible earlier writes; admission does not promise advance knowledge
of every target the closure will touch.

Claims describe a transient write window and confer no ownership of native
content. They record no desired membership, accepted resolution, or projection
currency. The existing lock implementation supplies lease liveness and
stale-owner recovery. Missing or uncertain coordination evidence cannot justify
displacing a live owner. Normal settlement removes active metadata; an empty
stable runtime directory may remain.

Coordination requires a writable operating-system account home shared by the
participating processes. Bun executables resolve that home through the OS account
service: `getent` on Linux, `dscacheutil` on macOS, and PowerShell's .NET user-profile
lookup on Windows. An unavailable or invalid account lookup refuses mutation;
environment-selected home paths cannot substitute for account identity.
Coordination excludes separate accounts, hosts, or containers
without that shared namespace, and does not detect historical claims by
sequential, otherwise undiscoverable owners. Existing bounded workspace-root
authority checks still apply. Editors, agents, and other filesystem writers do
not participate, so preimage validation and foreign-change-preserving
restoration remain necessary.

Under the lock, AXM revalidates every material authoritative input and target
preimage used by the plan. A stale plan performs no writes, and `--force` cannot
bypass the check (the executable specification
`cli/force-bypasses-only-named-policies` in the
[specification catalog](../../../specifications/catalog.md) owns the force
boundary).

All production settings and lock changes pass through the shared semantic
mutation boundary. Settings, authoritative lock state, canonical extension
content, and owned outputs needed by one closure commit together. A handled
failure rolls back that closure without undoing independent closures already
committed.

Restoration compares the current state with AXM's expected postimage before
replacing it. Foreign edits and additions survive a failed closure. When they
prevent complete restoration, the result reports the affected original paths
and retained recovery paths instead of claiming an exact rollback.

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

File placement communicates transient ownership and lifetime. Bounded local
[insertion receipts](managed-file-ownership.md#insertion-receipts) separately
prove container cleanup; they carry no command intent or workspace authority.

| State                                     | Placement and lifecycle                                                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Durable project workspace authority       | Root `axm.json`, `axm-lock.yaml`, authored roots, and `agent_extensions/`                                                                    |
| Durable user workspace authority          | `~/.axm/workspace/{axm.json,axm-lock.yaml,agent_extensions/}`                                                                                |
| Project-local scratch                     | Unique children of `.axm/tmp/`; the workspace mutex is `.axm/tmp/workspace-transition.lock`                                                  |
| Active physical-boundary claims           | OS account home’s `.axm-runtime/physical-boundaries/`; invocation leases and active metadata retire after settlement or stale-owner recovery |
| Invocation scratch and rollback snapshots | Uniquely prefixed directories in the operating-system temporary directory                                                                    |
| Atomic single-file publication            | Exact `<target>.tmp.<unique>` siblings, swept only by that target's writer                                                                   |
| Atomic canonical-directory publication    | Exact `<canonical>.axm-staging` and `<canonical>.axm-backup` siblings                                                                        |
| Native insertion cleanup evidence         | Selected workspace runtime directory's `projection-containers.json`; removed when its last receipt is retired                                |
| Performance-only cache                    | The platform cache directory, including Registry archives and update-check state                                                             |
| Restricted application state              | `~/.axm/`, including pending login, file credentials, install metadata, and `bin/axm`                                                        |

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
