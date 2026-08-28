---
name: spec
description: Explicit-only Gen Stack stage that accepts an exact persisted Ready Pitch when present, produces one Change Specification, persists its first coherent Draft, and updates state in place. Select only for $spec or the corresponding host control. Not for Change coordination, Design, implementation-level tests, planning, coding, or human-owned semantic decisions.
---

# Spec

Use only after deliberate `$spec` selection. Natural-language similarity or
a next-route recommendation does not activate this stage. Artifact acceptance,
semantic ratification, repository mutation, and downstream action remain
separate authorities.

Read through active AXM scope; in this workspace read:

1. `knowledge/gen-stack/src/processes/running-change-realization-stages.md`;
2. `knowledge/gen-stack/src/work-items/changes.md`;
3. `knowledge/gen-stack/src/work-items/writing-change-specifications.md`.

For established Defect remediation, also read
`knowledge/gen-stack/src/work-items/addressing-defects-through-changes.md`.

## Predecessor

When a Pitch exists, verify its exact current revision, canonical target,
authoritative readback, `Ready` state, and empty Open items. Persist
`Ready → Accepted` in place before Specification work. Stop on Draft,
unpersisted, stale, conflicting, or unverified input.

Direct entry without a Pitch is valid. It may produce a truthful Specification
Draft but must not imply Pitch acceptance or hide missing framing in order to
become Ready.

Pitch acceptance approves framing only. Anticipated Requirements,
Architecture, Protocols, and response contours remain provisional.

## Boundary

Specification owns why and what: sources, outcome, scope, Intent, Requirement
and Architecture dispositions, semantic Requirement-satisfaction and
Architecture-realization Protocols, constraints, risks, decisions, authority,
state, and Open items.

Design owns how and executable Evaluation realization. The Change owns the
canonical target and case coordination. Do not claim Change coherence,
implementation readiness, delivery, or release.

## Work

1. Bind the Change, exact accepted Pitch when present, canonical target,
   sources, classification, authority, and current host revision.
2. Separate observations, evidence, assumptions, proposals, accepted governed
   meaning, and unknowns.
3. State the implementation-independent problem, outcome, scope, boundaries,
   and non-goals.
4. Give every affected Requirement and Architecture authority an exact
   disposition and complete before-and-after meaning. Leave no durable choice
   for Design or implementation to infer.
5. Specify required semantic Evaluation Protocol identity, role, targets,
   claim, coverage, judgment, evidence expectations, lifecycle, authority, and
   blockers without prescribing executable realization.
6. Record material constraints, invariants, non-blocking risks, decisions, and
   authority.
7. Put every next-acceptance blocker in Open items.
8. Reconcile any supplied Design against this exact revision and return
   semantic deltas to their owner.

## Stage completion

Apply the shared lifecycle, persistence, presentation, and invalidation
contract. A Specification is Ready only when the complete Guide contract,
current bindings, verified canonical revision, and `- None.` under Open items
all hold. `$design` accepts that exact revision.

A required human ratification remains a governed decision recorded inside the
artifact; artifact state never substitutes for it.

## Output

Use the exact portable first-screen order and body in `Writing Change
Specifications`. Prefer semantically matching native fields. Do not
reintroduce the former
ready-for-ratification, ratified, rejected, or superseded artifact states.

Recommend `$design`, `$investigate`, or `$research` when eligible without
activating it.
