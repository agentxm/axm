# Sync

`axm sync` makes AXM-managed installed state and agent projections agree with
desired state. It is reconciliation, not updating, workspace configuration
editing, or generic repair.

## Responsibilities

Sync derives desired state from workspace configuration and trusted extension
metadata. It compares that target with the lockfile, canonical packages, trust,
bundled content, projections, and safe operational evidence. It produces a plan
that:

- creates a locked resolution for a desired extension that lacks one;
- reacquires missing external canonical content at its locked resolution;
- materializes required bundled content;
- creates or restores required AXM-owned projections; and
- removes obsolete AXM-owned projections when the dependency graph is complete.

`axm sync --preview` shows the same plan that application would attempt.

## Non-responsibilities

Sync does not change workspace configuration, advance a satisfying locked
resolution, publish content, or overwrite unowned paths. It does not choose
between conflicting explicit choices.

Present external canonical byte drift is left alone by ordinary sync. Use an
explicit update or reinstall when the user intends AXM to replace that content.

## Resolution and locking

A desired extension without a locked resolution may resolve once. A locked
resolution satisfying desired state pins that exact result. If its external
canonical content is missing, sync may reacquire the same version; a newer
available version is update's responsibility.

Registry pack dependencies participate in resolution only from a trusted
registry manifest or a local manifest that matches it. A divergent local copy
cannot silently redefine the registry dependency graph.

## Projection reconciliation

Every agent adapter applies the same decisions:

| Observed projection                       | Sync behavior                   |
| ----------------------------------------- | ------------------------------- |
| Required and missing                      | Create it.                      |
| Required, AXM-owned, and stale            | Restore it.                     |
| No longer required and AXM-owned          | Remove it.                      |
| Required path occupied by unowned content | Block and preserve the content. |

These decisions apply to skills and every other projected extension type.
Unmanaged agent content outside required paths is not a sync concern.

## Blockers and partial progress

Sync groups extensions that must change together because of their dependencies.
A blocker leaves that entire group untouched. Independent ready groups may
still apply, and the result reports both completed and blocked work honestly.

Cleanup that requires a complete dependency graph does not run when any missing
or invalid input prevents that graph from being known. This avoids deleting
content whose reachability cannot yet be determined.

## Failure and interruption

Before writing, sync checks that authoritative inputs and target state still
match the plan. A stale plan writes nothing, and `--force` cannot bypass that
check. Two changes to the same workspace scope must not interleave.

Handled application failure rolls back the extensions that were changing
together, including lockfile changes. Independent groups already completed
remain truthful completed work.

Abrupt termination must not leave a partly written authoritative file or lose
authored or unmanaged content. A later run finishes safely from authoritative
state without a general repair command.

## Testing strategy

Sync tests own the reconciliation scenarios. Every shipped blocker needs a
recovery test that begins from valid state, introduces the smallest blocking
change, preserves forbidden targets, exercises the owning recovery path, and
ends converged and idempotent. Cross-cutting tests cover preview/application
identity, dependency-group isolation, adapter ownership parity, rollback, stale
plans, concurrency, and interruption. A completeness check should fail when a
new blocker lacks recovery coverage.
---

status: stable
description: Desired-state reconciliation, projection recovery, and failure semantics for AXM sync.
---
