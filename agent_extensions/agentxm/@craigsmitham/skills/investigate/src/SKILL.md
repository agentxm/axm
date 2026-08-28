---
name: investigate
description: Investigates a bounded observed condition, possible defect, failure, discrepancy, or cross-stack incoherence by gathering the smallest safe discriminating evidence and returning a conclusion no stronger than that evidence. Use when diagnosis, reproduction, root-cause isolation, or an evidence gap must be resolved before triage or change definition. Not for broad external research, silently fixing the condition, deciding defect lifecycle or priority, specifying the correction, or shipping it.
---

# Investigate

Answer one bounded diagnostic question with the safest adequate evidence, then
return the result to the authority that owns disposition or correction.

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

Use `research` when the governing uncertainty is what existing external or
distributed evidence says, not what explains a concrete observed condition.

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
Architecture automatically. Route authorized remediation to a Change through
`spec`; route
an unresolved external evidence question to `research`; route an accepted
work item back to its proper triage authority.

Do not implement a fix unless the user separately invokes or requests the
implementation activity.
