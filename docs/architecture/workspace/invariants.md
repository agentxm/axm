---
type: Architecture
status: stable
description: How AXM represents workspace validity and proves every reported invalid state recoverable.
depends-on:
  - ../principles.md
  - ./overview.md
  - ./lockfile.md
---

# Workspace invariants

Workspace invariants describe what must be true across authored configuration,
desired state, authoritative lock state, canonical extension content, inline
configuration, configured agents, workspace capabilities, and managed outputs.
Lint, sync, and intent commands consume the same intrinsic facts for different
purposes.

## Responsibilities

This document owns:

- the shared meaning and ownership of invariant facts;
- the distinction between intrinsic violations and operational blockers;
- root-cause reporting and dependent-check suppression;
- closure-local evaluation and isolation; and
- the recovery-ownership model: every reported lint error and sync blocker has
  a demonstrated restoring transition.

## Non-responsibilities

This document does not inventory current rule IDs, findings, blocker codes,
commands, or fixtures. Catalogs, schemas, code, and behavior tests own those
exact contracts. Lint owns diagnostic presentation, sync owns reconciliation,
and intent commands own durable configuration changes.

## Invariant facts

The dedicated invariant-fact capability records durable relationships among
authority, expectation, and observation. Each fact identifies a stable
predicate, affected subject, scope and view, authoritative source, observed
state, expected invariant, and relevant identities or locations.

Facts do not prescribe user intent or suggested commands. A fact remains true
regardless of which permitted recovery owner later restores validity.

Invariant evaluation is local and deterministic. Temporary network failure,
Registry availability, acquisition failure, or target change after planning may
block sync, but does not thereby become a lint violation.

## Shared consumers

| Consumer        | Use of shared facts                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| Lint            | Renders applicable durable violations without recovery guidance.                                          |
| Sync            | Maps reconcilable facts to closure-local plan steps and other intrinsic or operational facts to blockers. |
| Intent commands | Preflight only facts required by the semantic closure they must establish.                                |

Lint and sync cannot disagree about an intrinsic predicate. Sync may use
additional operational evidence without expanding lint's responsibility.
Publish validation remains separate and may impose fixed distribution
requirements that do not redefine local workspace validity.

Inspection surfaces are bound by the same facts. If an extension's required
contribution to an owned unit is absent or stale, a projection fact records it.
Because inventory, lint, and sync consume the same facts, inventory can never
report an extension as realized while lint and sync find nothing to reconcile.

## Authority and reachability facts

The desired-state graph is the sole reachability authority. It derives direct
routes, activation, and Pack dependency routes from settings and authored
manifests. Lock rows, Pack-member maps, canonical content, and native output
never create reachability or cleanup authority.

This authority binds writers as well as evaluators. Any operation that creates,
restores, or removes an owned output enumerates the contributors it renders
from the fully derived desired-state graph — settings plus Pack expansion —
never from raw settings entries, which omit Pack-contributed members.

Authority facts distinguish conditions a catch-all lifecycle label cannot:

- workspace-authored canonical inventory may exist outside desired state;
- acquired canonical content requires an accepted lock identity and matching
  package-tree integrity before it can serve as projection input;
- bundled content derives authority from the running CLI;
- inline definitions derive authority directly from settings without a
  fabricated lock row or canonical copy;
- unreachable AXM-managed installed content differs from authored inventory;
- unclassifiable canonical content is preserved and reported;
- an AXM-owned output remains traceable to its smallest ownership unit; and
- an unowned collision or ambiguous ownership blocks only affected work.

Observed name, path, or byte equality may support a fact but never establishes
authority by itself. Invalid or incompatible settings and lock state fail
validation.

## Projection facts

The projection fact family is cross-type and relates each owned output unit to
the contributor set the desired state requires of it. A unit is **incomplete**
when it is well formed and correctly owned but renders only part of its
required contributor set. Incomplete is a distinct violation beyond missing,
stale, obsolete, colliding, or ambiguously owned; without it an aggregate unit
can lose content while every other predicate remains satisfied.

Evidence for projection facts is read from the output: the contributor
identities, versions, and content read back from the unit decide which
contributors it carries and whether each is current. The presence, version, or
content of the canonical extension content that produced a unit is never
evidence about the unit, so an extension whose canonical content is installed
and reachable can still be absent from, or stale in, its projection.

## Evaluation and isolation

Settings-source load and schema validity are shared project-workspace
construction prerequisites. They are evaluated before invariant facts,
desired-state graph construction, semantic closure identification, or selected
command evaluation. Failure of either project or user settings blocks
construction and suppresses every dependent project-workspace check; it is not
a closure-local blocker and cannot be isolated to one extension.

After construction succeeds, a failed prerequisite suppresses checks whose
conclusions would be unreliable without it. Those rules do not emit cascade
symptoms. Independent rules continue so one invalid extension does not hide
another.

Facts and operational blockers identify their semantic mutation closure. A
command is blocked only by state relevant to the selected closure. Global sync
applies every ready independent closure automatically, leaves blocked closures
unwritten, and continues after a handled failure in another closure. Cleanup
that depends on a complete graph is a separate maintenance closure.

## Recovery ownership

Every lint error and sync blocker has one demonstrated recovery owner:

- sync for deterministic reconciliation of AXM-managed state;
- an intent command when the user must express a durable workspace choice;
- direct correction of workspace-authored settings or manifests; or
- manual preservation, relocation, or removal of unowned native content.

Recovery ownership is a test classification, not suggested-action metadata.
AXM does not adopt unowned native content, even when it is semantically
equivalent to the required output.

## Recovery-conformance verification

The workspace specifications under `specifications/cli/workspace/` own the
boundary obligations for invalid-state handling — settings validity gating,
non-interleaving, closure-atomic mutation, and lock state never creating
reachability; the [specification catalog](../../../specifications/catalog.md)
indexes them.

Exhaustive restoring-transition coverage is internal verification: a test-only
recovery-conformance registry in `packages/cli/src/root/sync/` is keyed by
every lint error and sync blocker, and a completeness check fails when a
shipped error or blocker lacks a recovery contract. Each entry captures the
minimal perturbation, expected diagnostic facts and dependent-rule
suppression, the recovery owner, permitted and forbidden state changes,
post-recovery state, and second-run idempotence.

The registry's cross-type projection family exercises missing, incomplete,
stale, obsolete, unowned collision, ambiguous ownership, safe owned removal,
authored inventory outside desired state, unreachable managed content, and
unclassifiable canonical content wherever applicable; type-specific cases add
native merge, ordering, region-boundary, and fallback behavior. Every
aggregate unit registers the incomplete case using the shared multi-route
contributor fixture described by the
[extension testing strategy](../extensions/overview.md#testing-strategy), and
cross-cutting adversarial fixtures cover settings failure, partial closures,
preservation of authored and unowned content, drift, interruption, and lock
authority. Minimized fixtures derived from real incidents are authoritative;
live repositories remain a thin end-to-end confirmation layer.
