# Synthetic disabled default without an override

- Bundled evaluator AXM state: installed, `enabled: false`
- Retained canonical source:
  `.axm/extensions/@agentxm/skills/agent-skill-evaluator/src/`
- Explicit runner binding: none
- Undeclared executable present: `tools/eval-runner`
- Requested evidence tier: regression
- Proposed generated workspace:
  `.work/evals/@example/skills/normalize-release-notes/reserved-run`

The retained canonical source and undeclared executable are observations, not
authorization or active runner selection.
