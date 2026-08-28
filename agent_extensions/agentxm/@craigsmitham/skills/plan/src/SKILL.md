---
name: plan
description: Produces an implementation-ready, evidence-guided plan for one exact coherent Change and its exact Change Specification and Change Design revisions, sequencing architectural realization, required Evaluation feedback, focused Architecture, Requirements, Evaluations, and Implementation review checkpoints, affected units, migration, rollout, recovery, and handoffs without rewriting accepted meaning. Use when a defined change needs implementation decomposition or execution sequencing. Not for creating external work items, clarifying desired state, selecting unresolved architecture, inventing Evaluation Protocol meaning, implementing, prioritizing, or treating an exploratory outline as authorization.
---

# Plan

Turn one exact coherent Change into a safe, reviewable implementation
course that an implementer can execute without rediscovering material reasoning.

This skill belongs to the Gen Stack pack. Resolve knowledge through active AXM
scope; in this source workspace read:

- `knowledge/gen-stack/src/processes/running-change-realization-stages.md`; and
- `knowledge/gen-stack/src/implementation/planning-change-implementation.md`.

## Preconditions and boundary

Bind the plan to the exact Change, Change Specification, Change Design, accepted Requirement and
Architecture, required Requirement-satisfaction and Architecture-realization
Evaluation Protocols, current Implementation, and authority revisions. Verify
the change-coherence gate. Missing or disputed Protocol claims, criteria,
coverage, or judgment return to `spec`; missing technical realization of an
accepted Protocol returns to `design`.

A plan sequences realization. It does not accept Requirements or Architecture,
choose an unresolved response, set priority, assignment, estimate, target date,
create external work items, or release. An exploratory plan may support a
decision but must say it is not implementation-ready. Route an explicitly
requested projection of the exact plan into host-native implementation records
to `sync-change` after the plan exists.

## Plan

1. Inspect the current realized state, repository instructions, affected
   Implementation Units, interfaces, dependencies, data, tests, Evaluation
   machinery, and operational paths.
2. Map each affected accepted Architecture authority and Requirement to its
   planned Implementation Units, and map every required Protocol to the
   Design's executable realization and evidence path. Do not invent missing
   semantic or technical meaning.
3. Sequence architecture-bearing boundaries, contracts, ownership, state,
   observability, and testability seams before behavior that depends on them.
   Interleave only when compatibility, migration, safety, or atomicity creates
   a real dependency; Architecture-first is a dependency rule, not a rigid
   phase boundary.
4. For every required Requirement-satisfaction and Architecture-realization
   Protocol, plan its executable realization, earliest meaningful execution,
   re-execution triggers or cadence, Result-driven continue, stop, or upstream
   return behavior, and final execution against the exact candidate revision.
   Use Protocol Executions as feedback during bounded behavioral increments,
   not only as terminal checks. Keep Implementation-conformance Evaluations as
   separately delegated local work unless an accepted input requires them.
5. Group work into independently implementable, reviewable, reversible, and
   verifiable increments while preserving atomic invariants and compatibility
   windows. Put ordinary checks and required Protocol feedback beside the work
   they can meaningfully assess; do not claim continuous execution for a human,
   integrated, operational, or windowed Evaluation before its preconditions
   exist.
6. Disposition focused review feedback for `architecture`, `requirements`,
   `evaluations`, and `implementation`. For each materially affected area,
   schedule the earliest stable checkpoint where a fresh read-only reviewer can
   still correct dependent work cheaply. Bind its exact subject shape,
   authorities, evidence, continue condition, upstream return condition, and
   re-review trigger. Mark an inapplicable checkpoint with a reason instead of
   scheduling four ritual reviews. Keep review judgment separate from Protocol
   Execution and require a fresh integrated review of the final candidate.
   Record every scheduled checkpoint as one self-contained entry with these
   fields: `focus`, `stable subject`, `authorities`, `available evidence`,
   `continue when`, `return upstream when`, and `re-review when`. Do not rely on
   a general risks or return-conditions section to supply a field that is
   missing from an individual checkpoint. One checkpoint may cover multiple
   focuses when the same stable subject, evidence, and control conditions apply.
7. Plan migration, rollout, data protection, stopping conditions,
   observability, rollback or forward recovery, and irreversible points
   proportionately.
8. Identify local delegated choices, upstream decisions, risks, unknowns, and
   the evidence that would trigger return to specification or design.
9. Produce the smallest ordered plan with affected units, dependencies,
   Evaluation feedback and exit evidence, focused review feedback, final review
   handoff, recovery, corpus disposition, and completion condition.

## Output

State exact input identities, plan maturity and implementation authority,
boundaries and invariants, Architecture and Requirement realization mappings,
ordered outcome-oriented work, required Protocol feedback and final exit
evidence, focused review checkpoints, other verification and recovery, rollout
and observation, risks, upstream return conditions, corpus disposition, first
safe action, final integrated review handoff, and completion condition.
Make each focused-review checkpoint self-contained and easy to scan; do not
leave its authorities, evidence, or control conditions implicit elsewhere in
the plan.
Preserve absent, pending, inconclusive, skipped, stale, and harness-error
evidence rather than turning it into pass or fail.

Only an `implementation-ready` plan with explicit mutation authority is
eligible for `implement`. Do not implement merely because the plan is complete.
