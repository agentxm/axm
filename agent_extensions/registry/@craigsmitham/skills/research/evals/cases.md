# Behavioral evaluation cases

Run each prompt in a fresh agent context with the `research` skill, its three
conditional references, the declared `researcher` support path, observable
fresh-context delegation, and only read-only research tools. Do not expose
expected outputs or assertions to the trial agent. `evals.json` is the
machine-readable authority.

The cases cover supplied questions, generated and framing-only briefs,
hypothesis-neutral blind framing, an explicit research limit, missing
delegation, invalid execute input, question accounting, evidence conflict,
decision and mutation boundaries, explicit selection, and implicit abstention.

The suite passes only when framing occurs exactly when needed, separate worker
phases never subdelegate, reports preserve question identities and the compact
contract, material claims have traceable evidence, conflict and uncertainty
remain visible, concrete limits produce `Not reached`, and unavailable or
invalid execution fails visibly without mutation. Routing also fails if
ordinary research-like language activates Research without explicit user
invocation.

A host adapter without observable fresh-context delegation, invocation-policy
evidence, or side-effect evidence records the affected assertions as `unknown`,
not pass.
