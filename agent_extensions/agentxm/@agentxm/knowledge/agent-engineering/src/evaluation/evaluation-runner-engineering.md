---
type: Reference
title: Evaluation runner engineering
description: Designs portable evaluation runners with versioned protocols, capability-aware adapters, isolated execution, enforced budgets, recoverable lifecycle, and attributable evidence.
tags: [evaluation-runner, harness, adapters, protocols, isolation, budgets, recovery, evidence]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-22T17:00:00Z }
stale_after: 2027-02-22
sources:
  - id: anthropic-evals
    resource: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    title: Anthropic — Demystifying evals for AI agents
  - id: inspect-running
    resource: https://inspect.aisi.org.uk/running.html
    title: Inspect — Running evaluations
  - id: inspect-logs
    resource: https://inspect.aisi.org.uk/eval-logs.html
    title: Inspect — Evaluation logs
  - id: inspect-errors
    resource: https://inspect.aisi.org.uk/errors-and-limits.html
    title: Inspect — Errors and limits
  - id: inspect-sandboxing
    resource: https://inspect.aisi.org.uk/sandboxing.html
    title: Inspect — Sandboxing
  - id: nist-statistics
    resource: https://www.nist.gov/news-events/news/2026/02/new-report-expanding-ai-evaluation-toolbox-statistical-models
    title: NIST — Expanding the AI evaluation toolbox with statistical models
  - id: otel-genai
    resource: https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/
    title: OpenTelemetry — Generative AI semantic conventions
---

# Evaluation runner engineering

An evaluation runner is deterministic mechanism around a variable target. It
validates versioned source, provisions attempts, invokes target and grader
adapters, enforces controls, preserves observations, and derives reproducible
summaries. It does not choose the decision, repair the instrument during a run,
or approve the target.

## Separate policy, mechanism, and adapters

```text
evaluation workflow → runner protocol → host and grader adapters
        ↓                    ↓                    ↓
 decision and claim     lifecycle and evidence   provider behavior
```

- The workflow binds the decision, target, cases, claim tier, comparison, and
  interpretation.
- The runner owns validation, scheduling, isolation, budgets, durable records,
  recovery, and mechanical aggregation.
- Adapters own provider-specific invocation and observation.

A shared runner should standardize mechanics without becoming the authority
that decides what evidence means. Anthropic similarly separates the evaluation
harness, agent harness, grader, transcript, outcome, task, and trial.[^anthropic-evals]

## Select one runner explicitly

Runner availability, implementation, and selection are separate facts. A
workflow may ship with an active default while remaining open to another
runner. Resolve exactly one mechanism before preflight:

1. select an explicitly bound runner when the caller or versioned evaluation
   source supplies one;
2. otherwise select the configured default only when its lifecycle authority
   reports it active; or
3. reserve the run when neither is available.

Record `explicit` or `pack-default` as the selection source. Do not infer that
a retained package, executable file, command on `PATH`, or previous run makes a
runner active or trusted. A disabled default remains unselected even when its
canonical source is retained for re-enable. Do not auto-discover an alternative
or fall back to a second runner after the selected runner fails preflight.

An explicit runner binding identifies its exact implementation and version or
content identity, invocation adapter, protocol or evidence mapping,
capabilities, and trust and authority boundary. The selected runner may expose
a different native interface from a reference implementation; a declared
adapter may translate it into the evaluation's required evidence model. This
does not permit weaker isolation, observation, provenance, lifecycle, or
uncertainty semantics.

## Make the protocol the durable asset

Version machine-readable contracts for suites, adapter capabilities, trial and
grader requests, responses, attempts, runs, artifacts, and summaries. Reject an
unsupported major version; preserve compatible unknown fields only when doing
so cannot change meaning or authority.

An adapter capability declaration should name:

- compatible protocol versions and operations;
- supported stages and routing-observation mode;
- sandbox, network, filesystem, and credential boundaries;
- enforceable time, output, invocation, token, and cost budgets;
- observable transcripts, tools, processes, files, external state, and usage;
- cancellation, retry, and resume behavior; and
- adapter, runtime, host, model, and dependency identities it can observe.

Fail preflight when a requested claim requires an unavailable capability. A
runner that silently substitutes a proxy, unenforced limit, or weaker sandbox
has changed the evaluation rather than completed it.

## Distinguish native observation from proxies

Routing evidence needs an observation-mode identity:

| Mode | Evidence |
| --- | --- |
| Native routing | Actual host discovery and activation behavior |
| Host simulation | A host-owned approximation that does not observe production activation |
| Catalog-classification proxy | A model classification over names and descriptions |

All three can support engineering work, but only native observation supports
an unqualified native-routing claim. Preserve the mode in every routing trial
and summary.

## Record control strength honestly

For every material identity or control, distinguish:

```text
declared → observed → verified → enforced
```

The statuses are not automatic maturity levels. A caller can declare a model;
an adapter can observe a returned model identifier; a trusted surface can
verify it; a runner may be able to enforce an exact selection. Record the
strongest established status and the evidence for it. Never turn a requested
sandbox, model, budget, or catalog into a verified fact merely by copying the
argument into a run record.

## Preflight before evidence creation

Preflight should resolve and validate:

- exact target, suite, runner, runner-selection source, adapter, dependency,
  and configuration identities;
- selected cases, stages, trial counts, and comparison pairing;
- schema and protocol compatibility;
- routing mode and grader capability;
- sandbox, network, credential, and authority policy;
- enforceable budgets and worst-case invocation count; and
- generated-workspace and retention ownership.

If preflight fails, return a reserved disposition and proposed path without
creating a run directory. This keeps “no run occurred” distinct from a failed
or incomplete run.

## Treat target and trial inputs as untrusted

Provision only declared target payload, dependencies, fixtures, tools, and
policy. Do not execute bundled target code merely because it exists. Prevent
path traversal and symlink escape, withhold expected results and grader
internals, and give intended-independent trials fresh conversation and mutable
state.

Separate credentials needed by the adapter from data visible to the target.
Use environment allowlists rather than inheriting the runner's complete
environment. Default network access to denied or an explicit allowlist. A CLI
sandbox label is not proof that evaluator code, child processes, environment
variables, or credentials are contained; record the actual implementation and
boundary.[^inspect-sandboxing]

## Give lifecycle and recovery first-class records

Write evidence incrementally and atomically. A started run moves through:

```text
running → complete
        → failed
        → canceled
```

Evaluation conclusions are separate from lifecycle. A completed trial can
fail; a failed runner can preserve useful completed trials; an interrupted run
can be resumable without being complete.

Use stable case, configuration, trial, and attempt identifiers. A stochastic
repetition is a new trial. An infrastructure retry is a new attempt linked to
the same trial. Never overwrite the original failure; selective retry can
change the observed distribution.[^inspect-errors]

Resume only after rechecking every material identity. Skip terminal trial
records, append attempts, and refuse a changed target, suite, runner, adapter,
or comparison. Inspect recommends resumable runs and preserving completed
samples rather than restarting them silently.[^inspect-running][^inspect-logs]

## Enforce resources and terminate complete process trees

Budget wall time, output bytes, invocations, retries, tokens, cost, turns, and
tool calls when they affect the contract. Calculate the worst-case invocation
plan before execution. Mark a budget enforced only when the responsible layer
can measure and stop it; otherwise preflight must reject a claim that requires
that control.

Use bounded concurrency independently for provider calls, sandboxes, and
graders. On timeout or cancellation, terminate the complete process tree and
report preserved artifacts and possible external effects. Avoid an opaque
long-running command: emit stable progress and terminal status for automation.

## Preserve evidence before aggregation

Capture transient observations when produced: response, transcript, process
status, timing, usage, tool calls, changed files, external state, and errors.
Malformed or missing adapter output is a harness error, not a target failure.
Self-reported side effects are observations, not proof; prefer structured
runtime evidence.

Keep candidate and baseline configurations first-class and pair equivalent
cases, budgets, and timing. Withhold provenance from judgment graders and
attribute configurations only after verdicts are durable.

Derive summaries reproducibly from immutable trial records. Preserve selected
versus available coverage, routing modes and rates, per-configuration outcomes,
critical gates, unknowns, harness errors, grader disagreements, and suite
findings. A selected subset cannot produce an unqualified whole-suite result.

## Keep statistical claims in the contract

Do not hard-code one meaning of accuracy. A fixed-suite benchmark and a claim
about a task population have different estimands, sampling assumptions, and
uncertainty. Preserve per-case and per-trial observations so a contract can use
appropriate rates, reducers, intervals, bootstrap analysis, or hierarchical
models. NIST emphasizes separating benchmark accuracy from generalized
accuracy and selecting uncertainty methods for the actual claim.[^nist-statistics]

## Export without surrendering the canonical model

Optional exporters may map evidence into a telemetry or hosted-evaluation
system. Keep the runner protocol canonical, pin the exporter schema version,
and record the mapping. Generative-AI telemetry may contain prompts, tool
arguments, outputs, and other sensitive data; default to redaction, truncation,
and explicit retention policy.[^otel-genai]

## Conformance evidence

A reusable runner should maintain deterministic tests for:

- schema and semantic validation, including ambiguous paths and unknown IDs;
- malformed, missing, duplicate, contradictory, and oversized adapter output;
- secret non-inheritance, path escape, and undeclared dependencies;
- timeout, cancellation, process-tree cleanup, retry, and resume;
- target failure versus harness failure attribution;
- baseline pairing, blinding, coverage, thresholds, and critical gates;
- deterministic summary regeneration; and
- provider-free operation through a synthetic adapter.

A provider adapter should pass the same protocol suite without requiring core
changes. Synthetic conformance evidence proves runner mechanics only; it is not
behavioral evidence about an evaluated target.

[^anthropic-evals]: Anthropic — Demystifying evals for AI agents
[^inspect-running]: Inspect — Running evaluations
[^inspect-logs]: Inspect — Evaluation logs
[^inspect-errors]: Inspect — Errors and limits
[^inspect-sandboxing]: Inspect — Sandboxing
[^nist-statistics]: NIST — Expanding the AI evaluation toolbox with statistical models
[^otel-genai]: OpenTelemetry — Generative AI semantic conventions
