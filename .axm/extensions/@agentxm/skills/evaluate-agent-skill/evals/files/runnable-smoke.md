# Synthetic runnable authoring smoke

- Target: `@example/skills/normalize-release-notes@0.1.0`, materialized at
  `.axm/extensions/@example/skills/normalize-release-notes`
- Suite: `0.1.0`, evaluation contract `3.0.0`
- AXM evaluator state: `@agentxm/skills/agent-skill-evaluator` is installed and
  enabled; no explicit runner override is supplied
- Selected runner: bundled evaluator, selection source `pack-default`
- Adapter and grader: operator-reviewed target-specific fixture at
  `harness/runnable-smoke-adapter.mjs`
- Host and model: `synthetic-fixture-host/1.0`, `deterministic-fixture-model-1`
- Configuration and catalog: `fixture-candidate`, `fixture-catalog`
- Authority: read supplied synthetic fixtures, execute only the selected runner
  and declared fixture adapter, deny network and credentials, and write only
  `.work/evals`
- Trials: one per selected case; baseline `no-baseline`
- Evidence tier: authoring smoke; claim scope is workflow mechanics only
- Exact run id: `runnable-authoring-smoke`

Validate the supplied target, then run cases `route,execute` through the selected
runner with `--selection-source pack-default`, `--sandbox-mode workspace-write`,
`--network-mode denied`, `--trials 1`, `--retries 0`, `--timeout-ms 30000`,
`--max-output-bytes 131072`, `--max-invocations 10`, and
`--output-root .work/evals`. Bind case author `@agentxm-runnable-fixture`, runner
identity `@agentxm/skills/agent-skill-evaluator@0.2.2`, reviewer
`same-agent-authoring-smoke`, and grader
`evaluate-agent-skill-runnable-fixture@1.0.0`.

A plan or reserved path is not success. Completion requires a terminal run at
`.work/evals/@example/skills/normalize-release-notes/runnable-authoring-smoke/`
with `run.json`, `summary.json`, `report.md`, and terminal trial records for both
selected stages. Report the mechanically derived conclusion as same-agent,
provider-free workflow-mechanics evidence only; it is not native-routing,
production-target, regression, release, audit, or approval evidence.
