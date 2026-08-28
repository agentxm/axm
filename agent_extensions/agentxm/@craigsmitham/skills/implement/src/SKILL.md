---
name: implement
description: Explicit-only Gen Stack stage that accepts an exact persisted Ready plan, then executes separately authorized bounded implementation and prepares one evidenced candidate for review. Select only for $implement or the corresponding host control. Not for inventing meaning, changing plan intent, treating checkpoint review as final assurance, or shipping.
---

# Implement

Use only after deliberate `$implement` selection. Natural-language similarity
or a Ready plan does not activate this stage.

Read through active AXM scope; in this workspace read:

1. `knowledge/gen-stack/src/processes/running-change-realization-stages.md`;
2. `knowledge/gen-stack/src/processes/deciding-and-realizing-software-changes.md`;
3. `knowledge/gen-stack/src/implementation/implementing-a-change-plan.md`.

## Preflight and acceptance

Recover the canonical target after compaction. Verify the exact plan is
persisted `Ready` with no Open items, its bound Specification and Design are
`Accepted`, all bindings and readback are current, and no concurrent change
exists. Persist plan `Ready → Accepted` before implementation mutation.

Plan acceptance is not mutation authority. Independently verify the user,
repository policy, and host authorize the bounded implementation. Stop before
mutation if either precondition is missing.

## Execute

1. Bind the Change, accepted artifacts, current Implementation, plan boundary,
   repository instructions, checks, review checkpoints, and stopping condition.
2. Preserve unrelated user and agent work.
3. Implement in the plan's safe increments without rewriting its meaning.
4. Execute required Protocol and ordinary verification feedback at the planned
   points. Keep pass, fail, unknown, inconclusive, skipped, stale, and
   harness-error distinct.
5. Use fresh read-only focused review only at planned material checkpoints.
   The implementer owns corrections.
6. Disposition each reviewer action as `resolved`, `returned-upstream`,
   `evidence-needed`, `disputed`, or no-longer-applicable, with exact subject
   and evidence.
7. Re-review claims made stale by material correction.
8. Return changed desired state, durable Architecture, Protocol meaning, or
   plan intent to its owning stage. Do not work around it.
9. Prepare the exact candidate, performed checks, deviations, residual risk,
   corpus effect, and fresh integrated-review handoff.

A same-context self-check is non-independent and may be used only when the plan
permits it. It never satisfies fresh final review.

## Invalidation

If implementation reveals a material flaw in an Accepted Specification,
Design, or plan, apply the shared update-in-place invalidation contract before
dependent work resumes.

## Done

Stop with an evidenced candidate for `$review` or an exact upstream blocker,
using the shared compact handoff.
Review does not accept Implementation, and no checkpoint result grants release
authority. Do not merge, deploy, publish, or perform any other final action;
`$ship` remains explicit and separately authorized.
