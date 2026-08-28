---
name: investigate
description: Explicitly invoked Gen Stack stage that investigates one bounded observed condition with the smallest safe discriminating evidence. Select only when the user directly invokes `$investigate` or the corresponding host control; never select it from an unprefixed natural-language request, even when that request resembles investigation. Not for broad external research, silently fixing the condition, deciding defect lifecycle or priority, specifying the correction, or shipping it.
---

# Investigate

Answer one bounded diagnostic question with the safest adequate evidence, then
return the result to the authority that owns disposition or correction.

Use only after the user explicitly selects `$investigate` or the corresponding
host control. Natural-language similarity alone does not activate this stage.
Selection alone grants no corrective, mutation, or downstream-stage authority.

This skill belongs to the Gen Stack pack. Resolve knowledge through active AXM
scope; in this source workspace the paths below are exact. Read:

- `knowledge/gen-stack/src/processes/running-change-realization-stages.md`;
- `knowledge/gen-stack/src/work-items/investigating-possible-defects.md`; and
- `knowledge/gen-stack/src/control-loop/diagnosing-and-reconciling-cross-stack-incoherence.md`
  only when the uncertainty is a disagreement among stack authorities and
  evidence.

Do not scan or load the entire bundle. Repository-local accepted sources own
system-specific meaning.

## Boundary

Investigation selects, gathers, and interprets new diagnostic evidence. It may
establish a Defect, including one in the realized system. It does not decide
report identity, priority, lifecycle, remediation, desired state, or release. It is read-only by default;
reproduction or instrumentation that can mutate state requires explicit scope,
authority, safeguards, and a stopping condition.

Recommend `$research` when the governing uncertainty is what existing external
or distributed evidence says, not what explains a concrete observed condition.
Do not activate it from this stage.

## Investigate

1. Bind the trigger, one discriminating question, exact revision, environment,
   observation window, intended decision, evidence permissions, and stop rule.
2. State the expected condition and its authority separately from the observed
   discrepancy. Current code, tests, telemetry, and behavior are evidence, not
   automatic desired state.
3. Form only material competing hypotheses and state what observation would
   support or weaken each.
4. Gather the smallest safe evidence that distinguishes them. Reproduce only
   when the result can change the bounded conclusion; preserve exact inputs,
   conditions, result, and limitations.
5. Keep observations separate from interpretation. Preserve negative,
   conflicting, unavailable, and inconclusive evidence.
6. Stop when the intended decision is supported or the remaining blocker is
   explicit. Do not pursue exhaustive root cause by default.
7. Return tested scope, evidence, conclusion and confidence, affected and
   known-unaffected scope, remaining hypotheses, limitations, reopening
   condition, corpus disposition, and the next decision with its authority.

Use bounded outcomes such as `defect-supported`,
`no-defect-supported-within-tested-scope`, `expectation-indeterminate`,
`inconclusive`, or `blocked`. These are evidence conclusions, not lifecycle
decisions.

## Gen Stack handoff

Consult an established corpus when applicable. Investigation may report a
`candidate-gap`, but evidence does not become accepted Intent, Requirement, or
Architecture automatically. Recommend `$spec` for authorized remediation or
`$research` for unresolved external evidence; return an accepted work item to
its proper triage authority. A recommendation does not activate another stage.

Do not implement a fix. A later Gen Stack implementation requires explicit
`$implement` selection and its own authority.
