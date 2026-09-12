---
type: Decision
status: stable
description: Shared desired-state realization belongs below peer command features and above canonical and projection mechanics.
depends-on:
  - ../workspace/overview.md
  - ./closure-atomicity-and-recovery.md
  - ./package-classification-and-dependency-policy.md
---

# Shared desired-state reconciliation

## Decision

Place shared realization policy in `@agentxm/workspace-reconciliation`, a core
capability in the fixed CLI release cohort. Lifecycle, sync, and authoring are
peer feature consumers. The capability produces existing operation steps and
candidates, using the existing transaction engine and native projection
participants.

Workspace configuration expresses durable intent. Accepted resolutions record
source authority; canonical content and native surfaces realize that intent.
The policy joining these authorities has one owner, while workspace-state
continues to derive graphs and expose narrow readers and writers.

## Context and rationale

Lifecycle commands and direct configuration edits followed by sync must agree
on the resulting managed state. Keeping realization recipes in materialization
and sync-specific planners in a feature allowed separate activation, retention,
and settings-write decisions to develop. A manager that writes declarations
cannot distinguish first acquisition from projection repair using canonical
facts alone.

The shared capability lets features express the requested transition while
managers report type-specific materialization facts. Proposed settings,
accepted resolutions, and prospective Pack manifests can be evaluated without
publishing them to the live workspace. Retention follows the resulting graph;
existing files and lock rows never supply missing intent.

Installation requests name the desired declaration explicitly; derived
materialization supplies no declaration. Source replacements authorize named
subjects. Enclosing closures declare which projections and postconditions
they own, so neither settings permissions nor closure responsibilities depend
on combinations of skip flags.

## Execution and ownership

Dependencies and shared native ownership units determine semantic closures.
Within a closure, acquisition, accepted records, and required outputs settle
together. Independent closures may progress independently. Files shared only
as storage containers, such as settings and the lockfile, do not by themselves
make the whole workspace one domain transition.

Preparation retains authoritative observations and exact candidate inputs.
Execution revalidates the candidate under the workspace lock. Retained and
absent references are part of those inputs as well as user-facing evidence.
Transaction mechanics, restoration, approval, and rendering retain their
existing owners; this capability adds no execution engine or journal.

Effect requirements remain in `R` until application composition. The
capability's failure-conversion Layer supplies the boundary adapter; it does
not capture workspace or manager lifetimes. Published exports and the testing
entry point are the consumer boundaries.

## Alternatives and consequences

Having lifecycle invoke sync would create a peer-feature dependency and make
intent-changing operations depend on a no-intent-change command. Putting
retention in each manager would reproduce graph policy across all extension
types. Putting it in workspace-operations would mix domain decisions with
execution mechanics. The capability boundary keeps these responsibilities
separate while reusing the existing supply chain.

The package is published with the CLI cohort and follows the same dependency
and specification checks. Command requirements remain colocated with their
feature owners; the new package owns shared mechanism tests. There is no
parallel prose requirements corpus. The specification catalog routes readers
to the accepted behavior.

Reconsider this boundary if independent product capabilities acquire genuinely
different authority models, rather than introducing command-specific exceptions
to desired-state realization.
