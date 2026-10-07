# Synthetic disabled default with an external runner

- Bundled evaluator AXM state: installed, `enabled: false`
- Explicit runner: `@example/skill-eval-runner@2.4.0`
- Runner content identity:
  `sha256:4444444444444444444444444444444444444444444444444444444444444444`
- Protocol: `example-eval-evidence/1.2.0`
- Entrypoint: operator-declared and trusted for this evaluation
- Capability mapping: validates the suite, enforces the requested sandbox and
  budgets, executes both stages, and emits attributable trial and run evidence
- Requested evidence tier: regression

The external runner is the only declared runner for this evaluation.
