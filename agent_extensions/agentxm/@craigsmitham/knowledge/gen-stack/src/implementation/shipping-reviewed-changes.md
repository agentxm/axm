---
type: Guide
title: Shipping reviewed changes
description: Use when one exact reviewed revision is proposed for an explicitly authorized merge, deployment, publication, or other final action; verify readiness and target, execute once, read back persisted state, and return new observations without claiming more than the action established.
tags: [shipping, release, merge, deploy, publish, external-mutation, authorization, rollback, observation]
status: draft
sources:
  - id: process-definition
    resource: ../processes/deciding-and-realizing-software-changes.md
    title: Deciding and realizing bounded software changes
  - id: evaluation-evidence
    resource: ../evaluations/evaluation-as-bounded-evidence.md
    title: Evaluation as bounded evidence
generated:
  by: codex/gpt-5.6
  at: 2026-08-27T20:00:00Z
---

# Shipping reviewed changes

> **Authority:** Shipping is an external or consequential mutation. A review
> recommendation, passing Evaluation, workflow status, or invocation of a ship
> skill does not supply release authority. Each action requires an exact subject,
> target, mutation authority, release decision, and executor.

Use this Guide after applying [Running a change-realization
stage](../processes/running-change-realization-stages.md).

## Goal

Perform one explicitly authorized final action on one exact reviewed revision,
verify persisted state, preserve partial or failed effects, and return bounded
Observations to the Gen Stack control loop.

## Ship

1. **Name one action and target.** Distinguish merge, deployment, publication,
   rollout, activation, migration, or another host-native action. Do not treat
   `ship` as blanket authorization for several environments or systems.
2. **Verify the subject is unchanged.** Resolve the exact candidate revision,
   review evidence, required checks, corpus delta, artifacts, environment, and
   target. If the subject changed after review, return to review.
3. **Resolve authority.** Identify meaning authority already exercised,
   mutation authority, release authority, executor, required credentials or
   approvals, and the host's effective controls. Keep credentials symbolic and
   use only declared destinations.
4. **Preflight readiness.** Check applicable Requirement, Architecture, Design,
   Implementation, Evaluation, operational, compatibility, data, security,
   observability, rollback, and recovery conditions. Preserve waiver or
   exception identity; do not invent one to pass the gate.
5. **Preview when the host supports it.** Resolve exact effects, selected
   artifacts, target, and rollback boundary. A preview is evidence about a
   candidate operation, not persistence.
6. **Execute once.** Bound retries before mutation. Do not repeat an operation
   whose outcome is unknown or broaden the target after a failure.
7. **Read back persisted state.** Verify the host's resulting revision,
   deployment, package, record, environment, and status from the authoritative
   system. Separate submitted, accepted, applied, available, healthy, and
   verified states.
8. **Observe and hand off.** Record actual effects, timing or observation
   window, performed post-action checks, residual risk, recovery state, corpus
   disposition, and any new Signal. Results do not update desired state
   automatically.

## Action result

Use this compact portable result when the host has no richer equivalent:

```markdown
# Ship result: <bounded action>

> **Subject:** <exact reviewed revision>
> **Action:** <merge | deploy | publish | roll out | activate | other>
> **Target:** <exact repository, environment, registry, or system>
> **Outcome:** `<host-native state or portable state below>`

## Summary

<What was requested, what actually happened, and whether attention is needed.>

## Authority

- **Mutation authority:** <identity and authorized scope>
- **Release decision:** <identity and exact subject>
- **Executor:** <responsible role or system>

## Observed effects

- **Changed:** <exact targets and resulting identities>
- **Unchanged:** <expected or protected targets>
- **Partial or unknown effects:** <None or exact boundary>

## Verification

- **Authoritative readback:** <performed observation and result>
- **Post-action checks:** <performed checks with revision, environment, and time>
- **Observation window:** <completed or still pending>

## Recovery and residual risk

- **Recovery state:** <not needed | available | attempted | observed | incomplete>
- **Residual risk:** <None or bounded risk, owner, and trigger>
- **Next safe action:** <observation, recovery, or explicit next stage>

## New observations

- <None or exact new Signal or Observation returned to Orientation>
```

Keep the user-visible state and any requested recovery near the top. Link deep
host evidence rather than copying logs. Do not add focused-artifact state to a
ship result; shipping outcomes are a separate dimension.

## Partial and failed outcomes

Report which targets changed, which did not, whether rollback was attempted and
observed, what remains active, and the next safe action. Do not claim atomicity,
health, availability, or recovery that the host did not establish.

Shipping may complete as `shipped-and-observed`, `shipped-awaiting-observation`,
`partially-applied`, `failed-no-observed-effect`, `failed-effect-unknown`, or
`rolled-back-observed`. Use host-native states where they are more precise.

## Final check

- One exact reviewed revision, action, and target were named.
- Mutation and release authority were explicit before execution.
- The action was not retried across unknown state.
- Persisted external state was read back.
- Post-action evidence and remaining unknowns are bounded.
- New Observations return to Orientation rather than becoming automatic approval.
