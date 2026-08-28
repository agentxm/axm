---
name: implement
description: Executes an authorized implementation-ready plan for one exact coherent software change, preserving unrelated work, applying bounded changes, using required Evaluation and focused reviewer feedback, dispositioning review actions, and producing an evidenced candidate for independent final review. Use when the user asks to implement, build, fix, or execute an accepted change plan. Not for inventing missing requirements or architecture, broad opportunistic cleanup, independently changing the plan's meaning, treating checkpoint review as final assurance, or shipping externally.
---

# Implement

Produce one identifiable candidate Implementation revision that realizes the
authorized plan within accepted meaning and is ready for independent review.

This skill belongs to the Gen Stack pack. Resolve knowledge through active AXM
scope; in this source workspace read:

- `knowledge/gen-stack/src/processes/running-change-realization-stages.md`; and
- `knowledge/gen-stack/src/implementation/implementing-a-change-plan.md`.

Also obey repository-local instructions and use applicable technical skills for
the implementation medium.

## Preconditions and authority

Bind the implementation-ready plan, coherent Change, exact Change Specification
and Change Design revisions, current
repository revision, authorized mutation boundary, allowed tools, code
execution, network, credentials, and external effects. Preserve unrelated user
changes. If the plan is exploratory, stale, or no longer coherent with realized
state, stop or return to `plan`.

Implementation may make local reversible choices within delegated boundaries.
It may not decide new product behavior, obligations, durable Architecture,
architecture-significant tradeoffs, or release.

## Implement

1. Reconfirm the current state and first safe step before mutation.
2. Apply bounded changes in coherent increments that preserve invariants,
   compatibility, repository conventions, and recovery options.
3. Run proportionate checks and required Protocol Executions at the point where
   they can distinguish correct from incorrect realization. Preserve exact
   inputs, environment, outcome, limitations, and tool or harness failures.
4. At each planned focused-review checkpoint, bind an exact immutable subject
   and delegate one fresh, read-only `reviewer` assignment with the planned
   Architecture, Requirements, Evaluations, or Implementation focus. Never let
   the reviewer mutate the candidate. If fresh delegation is unavailable, use
   only a plan-authorized fallback and label it non-independent.
5. Disposition every required reviewer action as `resolved`,
   `returned-upstream`, `evidence-needed`, `disputed`, or `superseded`. Record
   the response, resulting revision or route, and evidence. Re-review affected
   claims after material change; do not silently drop or mark a finding fixed.
6. Route discoveries to their owner: `spec` for outcome or obligation changes,
   `design` for durable or architecture-significant response changes, `plan`
   for sequencing changes, and `research` or `investigate` for unresolved
   evidence questions.
7. Record material deviation from the plan or Design, its evidence and reason,
   and whether the responsible authority accepted, rejected, or has not decided
   it. Do not rewrite earlier artifacts to conceal divergence.
8. Inspect the final diff and persisted state. Remove only artifacts created by
   this implementation whose removal is safe and intended.
9. Prepare the exact candidate identity, changed units, realized authorities,
   performed and missing checks, checkpoint review identities and action
   dispositions, residual risks, recovery state, corpus disposition, and handoff
   to a fresh integrated final review. Earlier checkpoint review is evidence,
   not final assurance.

## Completion

Complete with an identifiable candidate, attributable evidence, and reconciled
or blocking deviations and review actions. Report partial state and the next
safe action on failure. Never repeat a mutation whose prior outcome is unknown
or claim a rollback that was not observed.

Implementation completion does not establish Requirement satisfaction,
Architecture realization, verified closure, or release readiness. Route the
candidate to a fresh integrated `review`; do not ship it.
