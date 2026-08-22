# Runnable smoke harness inputs

Case 1 exercises the real bundled `agent-skill-evaluator` runner against a
public-safe synthetic target. The outer evaluation invocation must materialize
these direct pack siblings with `--support-path`:

- `.axm/extensions/@agentxm/skills/agent-skill-evaluator`
- `.axm/extensions/@agentxm/knowledge/agent-engineering`

The case maps its target-specific deterministic adapter to
`harness/runnable-smoke-adapter.mjs`. That adapter is versioned evaluation
source, not runtime payload or general evaluator infrastructure. It performs no
network access, reads only its runner request, writes only the runner-supplied
output directory, and supports workflow-mechanics evidence only.

Run the outer case with a `workspace-write` sandbox so the evaluated workflow
can create `.work/evals/.../runnable-authoring-smoke`. Do not pass credentials or
promote the resulting same-agent evidence.
