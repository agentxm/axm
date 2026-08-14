---
status: stable
description: Principles governing AXM command design, state recovery, ownership, and overrides.
depends-on:
  - ./overview.md
---

# Architecture principles

AXM should make extension management and agent workspace configuration simple
to understand and safe to repeat. These principles guide command design,
workspace behavior, diagnostics, and testing.

## Responsibilities

These principles govern decisions shared by the whole CLI: command ownership,
state separation, content ownership, recovery, change scope, repeatability,
overrides, and verification.

## Non-responsibilities

These principles do not define individual command behavior, workspace file
schemas, extension-type semantics, implementation structure, or delivery
status. The relevant feature design, shared product model, code, or work item
owns those details. A feature document may specialize a principle but must not
silently contradict it.

## Give every command a clear job

A command's name, documented purpose, and behavior should agree. Commands
should not acquire unrelated recovery behavior merely because they can reach
the necessary files.

Common operations should be available at the root for fully qualified extension
names and in each type command group. Both forms express the same user intent
and follow the same behavior. Type command groups may add capabilities that
genuinely apply only to that type.

## Report invariant facts without choosing intent

Invariant and recovery diagnostics should say what AXM observed, which
invariant is violated, which state is authoritative, and where the relevant
state lives. They should not guess what the user meant or prescribe a sequence
of commands.

This boundary does not prevent an ordinary operation result from explaining
what happened or offering a contextual next step. It prevents invariant
findings from becoming a second workflow engine whose instructions can
contradict the commands that own the work.

AXM may fix a problem automatically only when the correction is unambiguous,
preserves meaning, and requires no user choice. Otherwise it provides enough
context for a person or agent to decide what intent to express through ordinary
commands or direct editing.

## Keep user intent, desired state, and current state distinct

User intent is the outcome the user means to achieve. Workspace configuration
records the explicit choices the user makes through commands, settings, and
authored manifests. AXM derives the complete desired workspace state from that
configuration, including Pack members, configured agents, inline definitions,
and workspace capability behavior.

The authoritative lockfile records the accepted immutable source and resolution
baseline for sourced extensions. Canonical extension content, authoritative
inline configuration, and managed outputs realize desired state. None of those
artifacts creates desired state on its own.

Commands that change workspace configuration must say so. Commands that
reconcile current state with desired state must not quietly change
configuration. An available newer version is not permission to advance a
satisfying accepted resolution.

Missing, malformed, or incompatible lock state is consequential because it owns
accepted external resolution. It never creates reachability and AXM never
reconstructs it from installed bytes or obsolete trust state.

## Require authority to change content

AXM changes content only when it can establish authority over the smallest
independently changeable unit. A familiar path, matching name, or matching
bytes do not establish that authority.

AXM preserves unowned content by default. Preservation does not prove that the
surrounding workspace state is valid or safely reconcilable. Each extension
type defines whether unowned content can coexist independently, collides with a
required output, or leaves authority ambiguous. A collision or ambiguity is a
blocker, not an invitation to take ownership.

Local edits to an installed external extension do not make that extension
workspace-authored, but ordinary reconciliation also does not erase those
edits. AXM does not adopt unowned native content. Manual preservation,
relocation, or removal owns recovery from an unowned collision.

## Recover through ordinary operations

Known invalid states should be recoverable through the command that expresses
the intended change, through sync, through a narrow lint normalization, or by
correcting workspace-authored settings, manifests, or content. AXM should not
need a generic repair command.

The state model and command boundaries should make invalid states difficult for
AXM to create, easy to diagnose, and straightforward to leave.

## Change one semantic closure at a time

An operation establishes its promised result for the selected extension and the
state connected by reachability, combined desired/lock/canonical postconditions,
shared native ownership units, or jointly validated invariants. That connected
state is one semantic mutation closure. Physical file co-location alone does
not join closures.

Global sync automatically applies ready independent closures. A blocked closure
receives no writes; a handled failure rolls back only its closure; later
independent closures continue. AXM exits nonzero and reports every closure
outcome when the complete request does not converge, including when some work
committed.

## Make repeated use safe

Running a successful command again with the same inputs should produce no
further change. Plans must be checked against current state before application,
and concurrent workspace changes must not interleave.

Handled failures roll back the affected semantic closure, including its
settings, lock, canonical-content, and owned-output changes. After abrupt
process exit, AXM protects authoritative files, complete canonical-directory
publication, and authored and unowned content. The next mutation converges from
surviving authority; it does not finish, resume, or roll back interrupted
command intent.

## Keep overrides rare and honest

Routine behavior deserves an explicit mode such as `--preview`, `--reinstall`,
or `--ignore-release-age`. `--force` is an exceptional escape hatch only for a
clearly named policy that may safely be bypassed. It never bypasses ownership,
accepted-resolution authority, concurrency safety, stale-plan checks, rollback,
or workspace invariants.

`--yes` controls interaction. It does not broaden permission, and `--force`
does not imply it.

## Test the promises of each feature

Each feature document states what its tests must prove. Tests should exercise
observable outcomes, significant failure paths, preserved state, and repeated
execution. They should not mirror internal modules or make a second copy of the
implementation.
