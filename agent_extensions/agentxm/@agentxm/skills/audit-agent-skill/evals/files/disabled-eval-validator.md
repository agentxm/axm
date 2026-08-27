# Synthetic disabled evaluation validator

- Audited target: `@example/skills/render-status-summary@0.3.0`
- Versioned evaluation source: present under the target's `evals/` directory
- Bundled evaluator AXM state: installed, `enabled: false`
- Retained bundled source:
  `skills/agent-skill-evaluator/src/`
- Explicit trusted validator: none
- Audit mode: read-only

The package and evaluation files are available for static inspection. No
active evaluator mechanism is available for mechanical validation.
