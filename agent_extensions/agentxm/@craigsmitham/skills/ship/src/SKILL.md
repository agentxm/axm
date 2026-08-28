---
name: ship
description: Performs one explicitly authorized final action—such as merge, deployment, publication, rollout, or activation—on one exact reviewed revision, then reads back persisted state and reports partial, failed, or observed results. Use only when the user clearly asks to take the final external action and the exact subject, target, review evidence, mutation authority, and release authority are available. Not for planning a release, reviewing readiness alone, treating “looks good” as authorization, or broadening one action across environments.
---

# Ship

Execute one exact authorized final action, verify what actually persisted, and
return the result as bounded evidence and new Observation.

This skill belongs to the Gen Stack pack. Resolve knowledge through active AXM
scope; in this source workspace read:

- `knowledge/gen-stack/src/processes/running-change-realization-stages.md`; and
- `knowledge/gen-stack/src/implementation/shipping-reviewed-changes.md`.

Also obey repository, host, environment, deployment, and release instructions.

## Activation and authority

Activate only for an explicit request to merge, deploy, publish, release,
roll out, activate, or perform another named final action. Do not infer that
authority from invocation alone, a review recommendation, passing checks,
workflow status, or phrases such as “ready” or “looks good.”

Resolve one exact Change, its exact Change Specification and Change Design
revisions, one exact reviewed Implementation revision, one action, one target, required evidence,
meaning authority already exercised, mutation authority, release authority,
executor, credentials, approvals, rollback boundary, and observation window.
Keep credentials symbolic and use only declared destinations. If any material
identity or authority is absent, stop before mutation and name it.

## Ship

1. Verify that the candidate is unchanged since review and that the Change,
   exact artifact revisions, plan, review, required evidence, and corpus delta
   all refer to that exact candidate.
2. Preflight applicable Requirement, Architecture, Design, Implementation,
   Evaluation, operational, compatibility, data, security, observability,
   rollback, and recovery conditions. Preserve real waivers; never invent one.
3. Preview exact effects when the host supports it. A preview is not persistence.
4. Execute once within the authorized target. Bound retries before mutation and
   never repeat an action whose result is unknown.
5. Read back the authoritative external state. Distinguish submitted, accepted,
   applied, available, healthy, and verified conditions.
6. Run only authorized post-action checks and record their revision,
   environment, timing, outcome, and limitations.
7. Report actual effects, changed and unchanged targets, partial or failed
   state, rollback attempted and observed, residual risk, corpus disposition,
   and the smallest safe next action.

Use precise states such as `shipped-and-observed`,
`shipped-awaiting-observation`, `partially-applied`,
`failed-no-observed-effect`, `failed-effect-unknown`, or
`rolled-back-observed` when the host has no more precise state.

Shipping does not turn Results into desired state. Return new Observations to
the Gen Stack control loop and route newly discovered work through Orientation.
