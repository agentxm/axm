# Runner selection

Select exactly one evaluation runner before capability preflight or run-evidence
creation. Runner selection belongs to the evaluation workflow; the selected
runner owns only its mechanism.

## Inputs

Resolve:

- any explicit runner binding supplied by the caller or versioned evaluation
  source;
- the active AXM scope and installed state when considering the bundled
  evaluator; and
- the requested evidence tier, observation modes, isolation, budgets,
  lifecycle, and evidence fields the runner must support.

An explicit binding must identify the runner version or immutable content,
invocation adapter, protocol or evidence mapping, declared capabilities, and
trust and authority boundary. Executable presence or a content hash alone does
not make evaluator infrastructure trusted.

## Precedence

1. When an explicit binding exists, select it and record `explicit` as the
   selection source.
2. Otherwise inspect current AXM state with `axm list --json`, retaining the
   active `--scope` when it is not project scope. Select
   `@agentxm/skills/agent-skill-evaluator` only when its exact item reports both
   `installed: true` and `enabled: true`, then record `pack-default`.
3. Otherwise reserve preflight, create no run workspace, and return an
   evaluation-level `Inconclusive` result naming the runner binding needed to
   resume.

Explicit selection takes precedence even while the bundled evaluator is
enabled. Do not run both. If explicit-runner capability preflight fails, keep
that reservation; do not fall back to the bundled evaluator.

AXM retains canonical package content when an extension is disabled. Therefore
the canonical path, an agent projection, a previous run, or a command found on
`PATH` is not activation evidence. Never invoke a disabled bundled evaluator
through retained source, including when an explicit binding points back to that
disabled extension. Do not auto-discover another executable.

## Bundled reference runner

For `pack-default`, read the direct pack sibling at
`skills/agent-skill-evaluator/src/references/runner.md`
and use its reference runner. Pass `--selection-source pack-default` when
starting a run so the evidence records how the mechanism was chosen.

For a direct, explicitly selected invocation of that runner, use
`--selection-source explicit`.

## External runner

An external runner does not need to reproduce the bundled evaluator's CLI or
internal schemas. Before execution, establish a declared adapter or mapping
from its native interface and output to the evaluation contract's required
validation, preflight, trial, lifecycle, identity, uncertainty, and evidence
semantics.

Reserve preflight when the mapping is missing, the entrypoint is not explicitly
trusted and authorized, an identity is ambiguous, or a requested capability
cannot be verified or enforced at the required strength. Never weaken the
claim, substitute a proxy, or treat runner failure as target failure.

Every started run must retain one exact runner identity, selection source,
protocol or evidence mapping, capability record, and trust and authority
boundary.
