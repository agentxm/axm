# Synthetic external runner capability gap

- Bundled evaluator AXM state: installed and enabled
- Explicit runner: `@example/lightweight-skill-checker@1.1.0`
- Runner content identity:
  `sha256:5555555555555555555555555555555555555555555555555555555555555555`
- Protocol: `example-eval-evidence/1.0.0`
- Entrypoint: operator-declared and trusted for this evaluation
- Available routing mode: catalog-classification proxy
- Requested routing mode: native routing
- Sandbox control: declared but not observed, verified, or enforced
- Requested evidence tier: regression

The explicit runner cannot provide the requested routing observation or prove
the required isolation control.
