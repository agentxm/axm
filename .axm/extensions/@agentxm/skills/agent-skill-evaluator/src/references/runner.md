# Agent Skill evaluator runner

Use the runner to validate versioned Agent Skill evaluation source, execute
isolated trials through declared adapters, resume compatible interrupted runs,
and derive summaries from preserved evidence. It does not choose an evaluation
strategy or decide whether evidence justifies release.

The commands require Node.js 24 or later. Run them from the active AXM scope
root and resolve the evaluator source once:

```sh
evaluator=.axm/extensions/@agentxm/skills/agent-skill-evaluator/src
```

## Validate source

Validate one package:

```sh
node "$evaluator/scripts/agent-skill-eval.mjs" validate \
  --package .axm/extensions/@example/skills/example \
  --json
```

Omit `--package` in an AXM workspace to validate every workspace-authored
Agent Skill. Contract `3.0.0` requires absolute run-result paths such as
`suite.suite_content_identity`; immutable runner, host-adapter, and
grader-adapter identities and capabilities; exact mappings from every critical
gate to a case assertion; safe fixtures; both routing and execution cases; all
four outcome states; an explicit fixed-suite estimand; and retry and resume
lifecycle semantics. Legacy contract `2.0.0` remains readable for migration but
does not receive the stronger mechanism-identity or assertion-level gate checks.

## Run a suite

```sh
node "$evaluator/scripts/agent-skill-eval.mjs" run \
  --package .axm/extensions/@example/skills/example \
  --adapter "$evaluator/adapters/codex.mjs" \
  --host codex-cli \
  --model <exact-model-id> \
  --configuration-id candidate \
  --catalog-id <catalog-id> \
  --authority-policy-id read-only \
  --sandbox-mode read-only \
  --network-mode unobserved \
  --case-author-id <case-author-id> \
  --runner-id <runner-id> \
  --selection-source pack-default \
  --reviewer-id <reviewer-id> \
  --grader-id <grader-id> \
  --evidence-class authoring-smoke \
  --case 1,6 \
  --json
```

The runner preflights the suite, adapter protocol, routing mode, sandbox,
budgets, baseline, and planned invocation count before creating a run
directory. A failed preflight returns `reserved` and creates no run evidence.
Cases with `forbid-target-execution` deterministic assertions additionally
require structured `tool-calls` evidence from the host adapter.

Useful options:

| Option | Purpose |
| --- | --- |
| `--grader-adapter PATH` | Use a separately identified grader adapter |
| `--selection-source explicit\|pack-default` | Record whether the caller bound this runner directly or selected the active pack default; defaults to `explicit` |
| `--trials N` | Repeat each selected case |
| `--retries N` | Permit bounded infrastructure attempts without replacing the original attempt |
| `--support-path PATH` | Materialize one explicit repository dependency; repeat as needed |
| `--allow-env NAME` | Pass one parent environment variable to the adapter; repeat as needed |
| `--routing-mode MODE` | Require an exact routing observation mode |
| `--network-mode MODE` | Require the adapter's exact denied, allowlist, or unobserved network mode |
| `--baseline-mode without-skill` | Execute a paired execution baseline without activating the target |
| `--baseline-mode package` | Execute `--baseline-package` as the paired baseline |
| `--timeout-ms N` | Enforce wall-clock time per adapter invocation |
| `--max-output-bytes N` | Bound adapter process and result output |
| `--max-invocations N` | Reject a plan or stop execution beyond the invocation budget |
| `--token-budget N` | Require host and grader adapters to report aggregate token usage |
| `--cost-budget-usd N` | Require host and grader adapters to report aggregate cost |

Version 0.2 accepts `authoring-smoke` and `regression`. It rejects `release`
at preflight because the protocol does not yet establish the necessary cohort,
calibration, retention, and independence controls.

CLI exit codes are stable within protocol 1.0:

| Code | Meaning |
| --- | --- |
| `0` | Validation passed, inspection succeeded, or a completed run concluded `Supported` |
| `1` | A completed run concluded below `Supported`, including an evidence-level `Inconclusive` result |
| `2` | Invalid input, validation failure, identity conflict, or reserved preflight disposition |
| `3` | Runner failure or canceled execution |

## Resume and inspect

```sh
node "$evaluator/scripts/agent-skill-eval.mjs" resume --run .work/evals/@example/skills/example/<run-id> --json
node "$evaluator/scripts/agent-skill-eval.mjs" inspect --run .work/evals/@example/skills/example/<run-id> --json
node "$evaluator/scripts/agent-skill-eval.mjs" summarize --run .work/evals/@example/skills/example/<run-id> --json
```

Resume verifies the target, suite, runner, host adapter, and grader adapter
identities before doing work. It skips terminal trial records and appends new
attempts. An identity conflict refuses resume without changing preserved
evidence.

`summarize` deterministically re-derives `summary.json` and `report.md` from
trial records and the identity-bound `contract.json` snapshot. Legacy runs
without a snapshot may be summarized only while the current suite still
matches the recorded suite identity. It preserves a failed or canceled
lifecycle state; a summary does not convert lifecycle completion or evaluation
support.

## Evidence layout

```text
.work/evals/<owner>/skills/<name>/<run-id>/
├── run.json
├── contract.json
├── summary.json
├── report.md
└── trials/<case>/<configuration>/<trial>/
    ├── trial.json
    └── attempts/<attempt>/
        ├── trial-request.json
        ├── response.json
        ├── grade-request.json
        ├── grader-response.json
        ├── grade.json
        ├── attempt.json
        └── adapter logs
```

Each stochastic repetition is a trial. Each infrastructure retry is a distinct
attempt. Run records bind content identities for the target, suite, runner, and
adapters plus the runner selection source; declared, observed, verified, and
enforced statuses remain distinct. Generated text is redacted before retention:
private repository and home roots and common user-path forms become public-safe
placeholders, with enforcement and the changed-file count recorded in
`run.json`.

Summaries count candidate outcomes separately from baselines. For contract v3,
they derive critical failures from the exact mapped assertion results and retain
the gate, case, trial, result, evidence, and grade path. They also preserve
selected versus available coverage, routing mode and trigger rates, unknowns,
harness errors, per-case Wilson 95% intervals, and
limitations. Those intervals are descriptive for the bound fixed suite, not a
task-population generalization. A selected subset receives the
`selected-cases` claim scope, never an unqualified whole-suite conclusion.
When a baseline is present, candidate-first and baseline-first execution order
alternates by trial and each trial records its comparison position; graders
receive only an opaque configuration identifier.

## Adapter contract

Read `references/protocol.md` and the schemas under `schemas/`. An adapter
implements `capabilities`, `trial`, and optionally `grade`. Provider-specific
logic stays outside the runner core.

The bundled Codex adapter reports `catalog-classification-proxy`; it does not
observe Codex's native activation decision. It copies only the selected target,
explicit `--support-path` dependencies, and case fixtures into a disposable
workspace. It does not implicitly install AXM or copy the agent-engineering
knowledge bundle.

The synthetic adapter exists only for conformance testing. Run:

```sh
node "$evaluator/scripts/test-runner.mjs"
```

Synthetic results are never behavioral evidence about a target.

## Security and failure behavior

- The adapter receives only a portable process baseline and variables named by
  `--allow-env`; the full parent environment is not inherited.
- Targets and fixtures are copied as data. The runner does not execute code
  bundled in a target skill.
- Deterministic `forbid-target-execution` assertions inspect normalized command
  observations and override a contradictory model pass.
- Private user and repository paths are replaced before generated text evidence
  is read or retained.
- Fixture, dependency, and artifact paths cannot escape through traversal or
  symlinks.
- Timeouts and cancellation terminate adapter process groups.
- Missing, malformed, contradictory, or oversized adapter results become
  attributable harness errors rather than target failures or passes.
- Routine evidence remains ignored or externally retained and is never written
  to `evals/releases/` by this runner.
