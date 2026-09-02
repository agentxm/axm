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

Lint validates durable workspace invariants such as ownership safety. Sync
owns derived-output convergence and may plan regeneration from generation
provenance without turning currency into a lint finding.
Publish validation remains separate and may impose fixed distribution
requirements that do not redefine local workspace validity.

Inspection surfaces are bound by the same ownership and authority facts. If an
extension's required contribution to an owned unit is absent or its generation
is stale, sync records reconciliation work. Lint reports only invalid or
unsupported ownership proof, not body currency.

## Authority and reachability facts

The desired-state graph is the sole reachability authority. It derives direct
routes, activation, and Pack dependency routes from settings and authored
manifests. Lock rows, Pack-member maps, canonical content, and native output
never create reachability or cleanup authority.

For sourced MCP servers, the graph distinguishes each local connection node
from its source-resolution closure. Connection nodes own local names and
per-connection realization choices. A closure groups every node and Pack route
that resolves the same source identity, intersects all of their constraints,
and supplies the shared accepted resolution. A conflict in that intersection
blocks the closure before acquisition or mutation.

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
the contributor set the desired state requires of it. Generated documents
record one generation digest for the complete authoritative input set. A
matching digest establishes currency without interpreting the generated body;
a missing or different digest is sync work. Because that digest covers the
aggregate input set, a mismatch establishes divergence only for the ownership
unit; it does not identify which contributor changed. Contributor point markers
may aid humans and diagnostics but are neither currency nor causal evidence.

Structured execution-bearing projections derive currency from decoded native
values and can retain contributor-level observations when their decoded
structure establishes them exactly. Missing units, stale generation, differing
structured values, obsolete owned units, collisions, and ambiguous ownership
remain distinct planning facts. Canonical source content establishes expected
generation, not proof that a projection exists on disk.

## Evaluation and isolation

Settings-source load and schema validity and current-scope lockfile validity are
shared workspace-construction prerequisites. They are evaluated before
invariant facts, desired-state graph construction, semantic closure
identification, or selected command evaluation. Failure of either project or
user settings blocks construction and suppresses every dependent
project-workspace check; a present invalid or unsupported current-scope
lockfile blocks the selected scope. These are not closure-local blockers and
cannot be isolated to one extension.

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

The whole-surface workspace specifications at the root of `specifications/cli/`
own the boundary obligations for invalid-state handling — settings validity gating,
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

The registry's cross-type projection family exercises missing, stale,
obsolete, unowned collision, ambiguous ownership, safe owned removal,
authored inventory outside desired state, unreachable managed content, and
unclassifiable canonical content wherever applicable; type-specific cases add
native merge, ordering, region-boundary, and fallback behavior. Every
aggregate unit registers contributor-change regeneration using the shared
multi-route contributor fixture described by the
[extension testing strategy](../extensions/overview.md#testing-strategy), and
cross-cutting adversarial fixtures cover settings failure, partial closures,
preservation of authored and unowned content, drift, interruption, lock
authority, and direction-specific recovery for older and newer lockfile gates.
Minimized fixtures derived from real incidents are authoritative; live
repositories remain a thin end-to-end confirmation layer.
