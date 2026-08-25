# Synthetic explicit runner override

- Bundled evaluator: installed and enabled through the agent-engineering pack
- Explicit runner: `@example/skill-eval-runner@2.4.0`
- Runner content identity:
  `sha256:3333333333333333333333333333333333333333333333333333333333333333`
- Protocol: `example-eval-evidence/1.2.0`
- Entrypoint: operator-declared and trusted for this evaluation
- Capability mapping: validates the suite, preflights isolation and budgets,
  executes routing and activated-execution trials, and emits the required
  attributable evidence model
- Requested evidence tier: regression

The explicit runner was supplied with the evaluation invocation. No other
runner should execute.
