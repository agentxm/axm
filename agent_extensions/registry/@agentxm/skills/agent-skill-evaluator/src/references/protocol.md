# Evaluator protocol

Protocol version `1.0.0` separates the provider-neutral runner from host and
grader adapters. JSON Schemas live under `schemas/` and are part of the runner
identity.

Evaluation contract `3.0.0` binds that mechanism by requiring the protocol,
runner identity and selection source, and host and grader adapter identities
and capabilities in every run. It also maps each critical gate to an exact
suite assertion so summary gating is mechanical and attributable. Contract
`2.0.0` remains a migration-only readable format and retains legacy case-level
critical gating.

## Adapter process contract

The runner invokes an executable in one of three modes:

```text
<adapter> capabilities <request.json> <operation-directory>
<adapter> trial        <request.json> <attempt-directory>
<adapter> grade        <request.json> <attempt-directory>
```

The adapter writes `capabilities.json`, `response.json`, or `grade.json` in the
supplied directory. A nonzero exit, missing file, malformed JSON, schema
mismatch, timeout, or output-budget violation becomes `harness-error` evidence.
Trial requests carry the declared run budgets; grader requests carry the
remaining aggregate token and cost allowance after the target invocation.

Capabilities declare compatible protocol versions, supported stages, routing
observation mode, sandbox and network controls, enforceable budgets, evidence
surfaces, credential isolation, and cancellation, retry, and resume behavior.
The runner fails preflight rather than silently replacing a requested
capability.

An execution case may declare a `forbid-target-execution` deterministic
assertion bound to one exact case assertion, safe relative target paths, and
launcher names. Such a case requires the host adapter's `tool-calls` evidence
capability. The adapter returns normalized `command_execution` observations;
the runner derives the assertion result mechanically and overrides a
contradictory model grade. Missing structured observations produce unknown,
never pass.

## Evidence identities

Every material identity records a value and status. Status is one of:

- `declared`: supplied by the contract or caller;
- `observed`: reported by the runtime or adapter;
- `verified`: checked against authoritative evidence; or
- `enforced`: actively constrained by the runner or adapter.

Higher status is not inferred from lower status. Adapter observations are not
automatically verified.

Every run records one runner selection source: `explicit` when the runner was
bound directly, or `pack-default` when an evaluation workflow selected this
active bundled default. The runner does not discover or choose another runner;
selection is complete before its capability preflight begins.

## Trial and attempt identity

One stochastic repetition is a trial. An infrastructure retry is a new attempt
linked to that trial:

```text
case / configuration / trial / attempt
```

Attempts are append-only. Resume skips terminal attempts and refuses to operate
when target, suite, runner, adapter, or material configuration identities have
changed.

## Routing modes

- `native-routing`: observes the host's real discovery and activation surface.
- `host-simulated-routing`: uses a host-owned simulation intended to reproduce
  routing but does not observe production activation.
- `catalog-classification-proxy`: asks a model to classify a names-and-
  descriptions catalog.

Reports must retain the mode. Only `native-routing` supports an unqualified
claim about native host activation.

## Lifecycle and conclusions

Run lifecycle is `running`, `complete`, `failed`, or `canceled`. Evaluation
conclusions are `Supported`, `Partially supported`, `Unsupported`, or
`Inconclusive`; they are analysis and never replace lifecycle state.

Preflight happens before run-directory creation. Failure returns a `reserved`
disposition and proposed path but creates no run evidence.

## Security boundary

Selecting an adapter authorizes execution of that adapter as trusted evaluator
infrastructure. Identity binding is not provenance verification. Review or
acquire adapters through a trusted channel before a run.

The runner passes only a portable process baseline plus environment variables
named by `--allow-env`. A credential required by an adapter must be declared
explicitly and remains subject to the adapter's stated isolation capability.
Targets, fixtures, candidate outputs, and adapter outputs are untrusted. The
runner never executes code bundled in a target skill.

Before adapter-generated text becomes retained evidence, the runner replaces
the exact repository and home roots plus common macOS, Linux, and Windows user
path forms with public-safe placeholders. `run.json` records enforced redaction
and its changed-file count. Binary evidence is not rewritten and remains
subject to the operator's retention policy.
