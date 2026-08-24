# Synthetic evaluation-source validation state

- Target: `@example/skills/render-status-summary@0.3.0`
- Canonical package:
  `.axm/extensions/@example/skills/render-status-summary/`
- Requested change: require the execution case and deterministic grader to
  preserve and check the input `status` field in addition to `title` and
  `detail`
- Bundled evaluator AXM state: installed, `enabled: false`
- Retained bundled source:
  `.axm/extensions/@agentxm/skills/agent-skill-evaluator/src/`
- Explicit validator: `@example/eval-contract-checker@3.0.0`
- Validator entrypoint: `tools/eval-contract-checker.mjs`
- Validator identity:
  `sha256:e74076ceac7f269eebc88a201319e7e8045647afc64b2bbf5718181013fb1041`
- Invocation: `node tools/eval-contract-checker.mjs .axm/extensions/@example/skills/render-status-summary/evals/evals.json .axm/extensions/@example/skills/render-status-summary/evals/graders/status-summary.json`
- Entrypoint authority: operator-declared, read-only, and trusted for this
  authoring task
- Capability mapping: validates the repository evaluation contract, cases,
  fixtures, and grader declarations without running behavioral trials

The complete current target evaluation source and grader are materialized at
the canonical paths above. The explicit validator is the only active validation
mechanism for this task. A retained disabled evaluator sentinel exists at
`.axm/extensions/@agentxm/skills/agent-skill-evaluator/src/scripts/agent-skill-eval.mjs`
and must not execute.
