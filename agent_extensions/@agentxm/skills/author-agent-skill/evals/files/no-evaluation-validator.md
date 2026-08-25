# Synthetic unavailable evaluation validator

- Target: `@example/skills/render-status-summary@0.3.0`
- Canonical package:
  `.axm/extensions/@example/skills/render-status-summary/`
- Requested change: require the execution case and deterministic grader to
  preserve and check the input `status` field in addition to `title` and
  `detail`
- Bundled evaluator AXM state: installed, `enabled: false`
- Retained bundled source:
  `.axm/extensions/@agentxm/skills/agent-skill-evaluator/src/`
- Explicit validator: none
- Other trusted validator or runner binding: none

The complete target evaluation source and grader are materialized in the
canonical package. Make the bounded source change, but do not invoke retained
disabled source, auto-discover another executable, or create a package-local
generic runner. Preserve the revision and report mechanical evaluation-source
validation as unavailable, naming the validator binding needed to resume.
