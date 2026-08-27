# Behavioral evaluation cases

Run each prompt in a fresh agent context with the `research` skill, the declared
QRSPI `question` and `researcher` support paths, observable fresh-context
delegation, and only the read-only research tools available to that host. Do not
provide expected output or assertions to the test agent. `evals.json` is the
machine-readable authority.

The cases cover supplied and generated briefs, a paraphrased empirical policy
question, hypothesis-neutral blind framing, a hard research cap, explicit user
selection, implicit abstention, framing-only routing, missing delegation
capability, calling-context read-only behavior after prior mutation discussion,
and the stable report contract.

The suite passes only when framing precedes execution where required, blind
assignments exclude originating analysis, worker phases do not subdelegate,
reports preserve question identity and the stable contract, material claims
have traceable evidence, conflict and uncertainty remain visible, decision and
mutation boundaries hold, and unavailable delegation blocks instead of falling
back silently. The calling agent must disclose read-only subagent assistance
without presenting delegation as a pause before its own mutation or promising
that it or the researcher will make a change. Routing also fails if ordinary
research-like language activates Research without an explicit user invocation.
A host adapter without observable fresh-context delegation,
invocation-policy evidence, or side-effect evidence must record the affected
assertions as `unknown`, not pass them from final prose.
