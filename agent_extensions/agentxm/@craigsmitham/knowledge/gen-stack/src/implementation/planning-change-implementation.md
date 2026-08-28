---
type: Guide
title: Planning change implementation
description: Use when one coherent Change needs a Ready implementation course; accept the exact Ready Design, bind accepted inputs, sequence realization and proportional review, and plan final evidence and recovery without inventing meaning.
tags: [implementation, planning, change-specification, artifact-lifecycle, open-items, dependencies, sequencing, architecture-realization, evaluation-feedback, focused-review, verification, rollout, rollback]
status: draft
sources:
  - id: change-process
    resource: ../processes/deciding-and-realizing-software-changes.md
    title: Deciding and realizing bounded software changes
  - id: change-specification-guide
    resource: ../work-items/writing-change-specifications.md
    title: Writing change specifications
generated:
  by: codex/gpt-5.6
  at: 2026-08-27T23:32:00Z
---

# Planning change implementation

> **Authority:** This Guide applies Gen Stack meaning without making a plan an
> authority over Requirements, Architecture, Change Design, priority, assignment,
> delivery commitment, or release. A plan is a situated intended course for one
> exact change context.

Use this Guide after applying [Running a change-realization
stage](../processes/running-change-realization-stages.md).

## Goal

Produce a reviewable, evidence-guided implementation plan bound to one exact
coherent Change and its exact artifact revisions so an implementer can realize architecture and
behavior incrementally, use required Evaluations to guide that realization,
use focused review while dependent work can still course-correct, and finish
with exact candidate-revision evidence and a fresh integrated review handoff
without rediscovering material reasoning or making an unresolved product,
Requirement, durable Architecture, or Protocol-semantic decision.

## Plan the change

1. **Verify and accept the inputs.** Identify the Change, exact Accepted Change
   Specification and exact persisted Ready Change Design revisions, accepted Requirements and Architecture, required
   Requirement-satisfaction and Architecture-realization Evaluation Protocols,
   current Implementation revision, constraints, verification conditions,
   authority, and remaining delegated local choices. If required Protocol
   claims, criteria, coverage, or judgment remain unresolved, return to
   Change Specification. If their accepted meaning lacks a technical realization,
   return to Design. Do not plan across either gap. After verifying exact
   bindings, no Open items, persistence, and readback, `$plan` accepts the
   Design in place before dependent planning.
2. **Inspect realized state.** Resolve affected Implementation Units,
   interfaces, dependencies, data and state, existing tests and Evaluation
   machinery, operational paths, and repository instructions. Treat their
   current shape as evidence, not authority to reinterpret the change.
3. **Map realization and evidence.** Map every affected accepted Architecture
   authority and Requirement to planned Implementation Units. Map every
   required Protocol to the Design's executable realization, Suites or Cases,
   seams, instrumentation, data, environments, and evidence path. The plan
   carries exact accepted meaning into work; it does not define missing claims,
   criteria, coverage, or judgment.
4. **Sequence architectural prerequisites.** Put architecture-bearing
   boundaries, contracts, ownership, state, observability, and testability
   seams before behavior that depends on them. Interleave them with behavior
   only when compatibility, migration, safety, or atomicity creates a real
   dependency. This default orders realization without pretending Architecture
   and Requirements were developed in a universal sequence.
5. **Plan the Evaluation feedback loop.** For every required
   Requirement-satisfaction and Architecture-realization Protocol, state:

   - its executable realization and prerequisites;
   - its earliest meaningful execution point;
   - the increments, changes, or cadence that trigger re-execution;
   - how pass, fail, unknown, inconclusive, skipped, stale, or harness-error
     Results permit continuation, require stopping, or return work upstream;
     and
   - its final Execution against the exact candidate Implementation revision or
     declared observation window as exit evidence.

   Make required Protocol Executions available during behavioral realization
   wherever they can distinguish correct from incorrect work. Do not postpone
   them to candidate completion merely because final evidence is also required.
   Do not claim continuous execution for a human, integrated, operational, or
   windowed Evaluation before its real preconditions exist. Keep optional
   Implementation-conformance Evaluations separate and delegated to the
   implementer unless an accepted Design, policy, or assurance input requires
   them.
6. **Choose implementation increments.** Group work by independently
   implementable, reviewable, reversible, and verifiable outcomes. Preserve
   atomic invariants and compatibility windows; do not split work where an
   intermediate state would be invalid or unsafe. Put ordinary checks and
   required Protocol feedback beside the increments they can assess, and name
   parallel work only when its inputs and merge conditions are independent.
7. **Plan focused review feedback.** Disposition `architecture`,
   `requirements`, `evaluations`, and `implementation` for the bounded change.
   For every materially affected area, schedule the earliest stable checkpoint
   where a fresh read-only reviewer can still correct dependent work cheaply:

   - bind the immutable subject shape and applicable authorities;
   - identify evidence and checks available at that point;
   - state what permits continuation;
   - state what requires implementation revision, more evidence, or return to
     Specification or Design; and
   - name changes that make the review stale and trigger re-review.

   Keep those bindings together in one checkpoint record. Do not make an
   implementer reconstruct a checkpoint's authorities, evidence, or upstream
   control from general risk or return-condition sections. A single checkpoint
   may cover more than one focus when they share the same stable subject,
   evidence, and control conditions.

   Mark an inapplicable focus with a reason rather than scheduling four ritual
   reviews. Review assesses realization and evidence; it does not replace a
   required Protocol Execution. Require a fresh integrated review of the exact
   final candidate after checkpoint actions are dispositioned.
8. **Plan rollout and recovery.** State deployment or publication boundaries,
   feature or compatibility transitions, data protection, observability,
   rollback or forward recovery, stopping conditions, and irreversible points
   proportionately.
9. **Expose decisions and uncertainty.** Return upstream when new evidence
   changes desired state, Architecture, or the selected response. Keep
   estimates, assignments, priorities, and target dates absent unless their
   authorities supplied them.
10. **Derive the plan.** Persist the first coherent Draft, then present the
    smallest ordered set of implementation
    increments with
    affected units, dependencies, Protocol feedback, focused review feedback,
    final exit evidence, recovery, and fresh integrated review handoff. Bind it
    to the exact input revision. Keep it Draft while Open items remain and
    persist it Ready in place only after every readiness condition holds.

## Ready plan

A Ready plan establishes:

- exact Change, Change Specification, Change Design, Implementation, and authority inputs;
- affected units and material boundaries;
- exact Architecture and Requirement realization mappings;
- coherent sequencing and dependencies;
- required Protocol realization, earliest execution, feedback cadence,
  Result-driven control, and final exact-revision evidence;
- proportional Architecture, Requirements, Evaluations, and Implementation
  review dispositions, stable checkpoints, continuation and return conditions,
  and re-review triggers;
- other verification work and expected evidence;
- migration, rollout, observability, rollback, and recovery where material;
- decisions still delegated locally versus decisions requiring an upstream
  authority; and
- a clear first action and completion condition.

A Draft plan may support feasibility or decision-making without these
conditions, but it must not authorize implementation. Ready and Accepted plans
contain `- None.` under Open items. A valid `$implement` invocation accepts the
exact persisted Ready plan before mutation; plan acceptance and repository
mutation authority remain separate.

## Canonical portable form

Use semantically matching native fields where available. Otherwise use this
compact form. Conversation may explore details between lifecycle events, but
the first coherent Draft and every state change use the canonical target.

```markdown
# Implementation plan: <bounded change>

> **Artifact:** <stable plan identity and exact revision>
> **State:** `<Draft | Ready | Accepted>`
> **Canonical:** <work item, native field set, body region, or exact link>
> **Bound to:** <exact Accepted Specification and Accepted Design identities>
> **Implementation:** <exact current revision>
> **Mutation authority:** <not granted | exact authorized scope>

## Summary

- **First action:** <smallest safe executable step>
- **Complete when:** <observable candidate and evidence condition>

## Open items

- **OI-1 — <blocker>**
  - **Authority:** <responsible role>
  - **Resolves when:** <observable condition>

## Boundaries and invariants

## Ordered work

### Step 1 — <outcome>

- **Changes:** <affected units and intended change>
- **Depends on:** <prior step, authority, compatibility, or none>
- **Verify:** <performed check or evidence route>
- **Recover:** <reversal, fallback, or safe stop>

## Evaluation checkpoints

### <Protocol identity and role>

- **Realization:** <executable family, Suite, seam, data, and environment>
- **Run first:** <earliest credible point>
- **Run again:** <material re-execution triggers>
- **Result control:** <continue, correct, return, or preserve unknown>
- **Exit evidence:** <final exact-candidate Result>

## Review checkpoints

### <checkpoint and focus>

- **Stable subject:** <increment, diff, interface, or evidence set>
- **Authorities:** <exact comparison sources>
- **Available evidence:** <what the reviewer can inspect>
- **Continue when:** <bounded disposition>
- **Return upstream when:** <definition or evidence condition>
- **Re-review when:** <material invalidation trigger>

## Rollout and recovery

## Decisions, risks, and return conditions

- **Decisions delegated locally:** <bounded implementation choices>
- **Residual risks:** <risk, owner, and observation trigger>
- **Return upstream when:** <Specification, Design, plan, or authority condition>
```

Repeat the vertically labeled work, Evaluation, and review cards as needed.
Omit an Evaluation or review checkpoint only when its owning focus is explicitly
not applicable and the reason remains visible. For `Ready` or `Accepted`, write
`- None.` under Open items.

## Final check

- The plan realizes rather than rewrites its accepted inputs.
- Each step has an outcome and evidence route, not only a file list.
- Architecture-bearing prerequisites precede dependent behavior unless a named
  compatibility, migration, safety, or atomicity dependency requires otherwise.
- Every required Requirement or Architecture Protocol guides realization at
  its earliest credible point and remains final exact-revision exit evidence.
- Implementation-conformance Evaluations remain separate and delegated unless
  an accepted input requires them.
- All four review areas are dispositioned; material areas receive early stable
  checkpoints and inapplicable ones carry reasons.
- Focused review does not replace Protocol Execution or final independent
  review.
- Intermediate states preserve material invariants.
- Recovery is explicit where failure would be consequential.
- Upstream gaps remain visible and block only dependent implementation.
- Open items agree with Draft, Ready, or Accepted state.
- The plan remains one canonical artifact; derived host-native implementation
  records are outside this Guide and Sync Change.
