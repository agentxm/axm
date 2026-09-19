# Evaluate Agent Skill

Produces attributable behavioral evidence for an exact Agent Skill revision by
running routing and activated-execution trials independently, preserving raw
evidence, uncertainty, baselines, environment identity, and claim limits.

Use it to execute a declared Agent Skill evaluation or compare exact revisions.
Use `author-agent-skill` to create or revise the target and evaluation source,
and `audit-agent-skill` to assess conformity, trust, or the reliability of the
resulting evidence. Evaluation does not approve, publish, or promote a skill.

This skill is designed for the `@agentxm/packs/agent-engineering` pack because
it relies on the pack's evaluation knowledge, sibling responsibility
boundaries, and its default `agent-skill-evaluator` runner. The default runner
is replaceable: an explicit trusted runner binding takes precedence, and the
bundled evaluator is used only while AXM reports it enabled.

## Install

```sh
axm install @agentxm/packs/agent-engineering
```

## Example

> Run the declared routing and activated-execution suite for this exact Agent
> Skill revision as regression evidence. Use the previous accepted revision as
> the baseline and keep all generated output in the repository evaluation
> workspace.

## Runner selection

The workflow selects exactly one runner:

1. an explicit runner binding;
2. otherwise the enabled bundled evaluator; or
3. no runner, producing a reserved preflight and `Inconclusive` result without
   run evidence.

Canonical files retained by AXM do not make a disabled evaluator active. The
workflow does not auto-discover executables or fall back to a second runner
after capability preflight fails. External runners may use a different native
interface when a declared adapter or evidence mapping preserves the required
identity, isolation, lifecycle, uncertainty, and evidence semantics.

Disabling the bundled evaluator with
`axm skills disable agent-skill-evaluator` only prevents `pack-default`
selection; it does not select an external runner. Bind an external runner
explicitly in the invocation or versioned evaluation source. With no explicit
binding and no enabled default, the workflow reserves preflight and returns
`Inconclusive` without creating run evidence. Restore the bundled default with
`axm skills enable agent-skill-evaluator`.

## Revision 0.3.2

- Previous version: `0.3.1`
- Contract delta: suite `0.5.0` requires an artifact-producing runnable happy
  path and mechanically grades undeclared-evaluator execution; evaluation
  contract `3.0.0` is unchanged
- Compatibility and cohort: runtime behavior and authority are unchanged; the
  suite requires evaluator `0.2.2` or an equivalent runner with structured
  command observations and deterministic forbidden-execution grading
- Risk delta: a prose-only plan or reserved path cannot satisfy the runnable
  case, and forbidden evaluator execution can no longer rely only on model
  judgment
- Migration: update the `agent-engineering` pack to `0.10.4` before collecting
  new suite `0.5.0` evidence
- Rollback: restore skill `0.3.1`, suite `0.4.1`, pack `0.10.3`, and the
  evaluator dependency lower bound `>=0.2.1` together
- Evidence: structural validation and deterministic harness checks are required;
  authoring or regression runs remain bounded evidence and no release-tier run
  or independent approval is claimed
- Bound identities: package
  `sha256:e9a9c9e813b14cb911e11fa83254d870de1cf75a303f8c4968a8eea278fc69da`
  and suite `sha256:9ead9e65518fc1aa635450338390b258c5fa9e39b0538eafe76bdc3cac83640f`

## License

This package is licensed under the MIT License. See
[`LICENSES/MIT.txt`](../../../../../LICENSES/MIT.txt).
