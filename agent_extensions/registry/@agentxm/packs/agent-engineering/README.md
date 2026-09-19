# Agent engineering pack

Installs one knowledge bundle for designing goal-directed AI agent systems,
plus the workflows for authoring and auditing agent instructions and for
authoring, evaluating, and auditing the Agent Skills that shape them.

The knowledge covers agent behavior, multi-agent coordination, prompts,
context, harness, skills, evaluation, trust, and operations as sections of a
single body rather than as separate bundles. The pack does not add a framework,
runtime, or executable agent.

AXM supplies the extension-manager workflow used when these skills change
managed packages; it is workspace management infrastructure, not an agent
host, and is not installed as a pack dependency.

## Install

```bash
axm install @agentxm/packs/agent-engineering
```

## Contents

| Extension | Purpose |
| --- | --- |
| `@agentxm/knowledge/agent-engineering` | The knowledge bundle |
| `@agentxm/skills/author-agent-instructions` | Create or revise AGENTS.md, CLAUDE.md, and scoped instruction files |
| `@agentxm/skills/audit-agent-instructions` | Audit an instruction system against the knowledge |
| `@agentxm/skills/author-agent-skill` | Create or revise a portable Agent Skill |
| `@agentxm/skills/agent-skill-evaluator` | Default provider-neutral Agent Skill evaluation runner; independently installable and replaceable |
| `@agentxm/skills/evaluate-agent-skill` | Run attributable routing and activated-execution evaluations for an exact Agent Skill revision |
| `@agentxm/skills/audit-agent-skill` | Audit an Agent Skill against the knowledge |

After installation, browse the workspace Knowledge Base or search for concepts
such as agency choice, control loops, tool-use policy, memory policy, handoffs,
human oversight, instruction files, agent threats, and agent-specific
evaluation.

## Evaluation runner choice

A fresh pack installation enables `agent-skill-evaluator` as the default
mechanism unless direct AXM intent already disables it. `evaluate-agent-skill`
selects an explicitly bound trusted runner first, otherwise this active default.
A repository that persistently uses another runner can keep the package managed
but inactive:

```sh
axm skills disable agent-skill-evaluator
```

Use `axm skills enable agent-skill-evaluator` to restore it without
reinstallation. AXM retains canonical files while disabled; their presence does
not authorize the evaluation workflow to invoke them. If no explicit runner is
bound while the default is disabled, preflight is reserved and the evaluation
is `Inconclusive` with no run evidence.

An external runner needs an explicit identity, trusted entrypoint, capabilities,
and adapter or evidence mapping. It does not need to implement the bundled
runner's CLI, and the workflow never auto-discovers or runs two mechanisms.

## License

The pack metadata is MIT licensed. Each dependency retains the license in its
own manifest.

## Revision 0.11.0

- Previous version: `0.10.6`
- Contract delta: selects agent-engineering knowledge `>=0.10.0`, authoring
  `>=0.11.0`, and audit `>=0.8.0` for coherent generated-file guidance across
  canonical policy, execution, review, and AXM distribution checks
- Compatibility: the rule is conditional; extensions that do not generate
  source-adjacent residue gain no required ignore file
- Migration: update the pack as a unit before relying on extension-root
  consumer-worktree protection
- Evidence: package lint, both changed suites, and OKF validation pass; the OKF
  validator retains unrelated pre-existing index warnings

## Revision 0.10.6

- Previous version: `0.10.5`
- Contract delta: selects agent-engineering knowledge `>=0.9.2` and instruction
  authoring and audit skills `>=0.1.6` so structural validation and demonstrated
  behavioral value remain coherent across the pack
- Compatibility and cohort: other member lower bounds are unchanged; instruction
  workflows gain evidence-calibrated value claims without removing existing
  authoring or conformance-audit behavior
- Migration: update the pack as a unit before relying on the new instruction-
  evaluation contract
- Rollback: restore pack `0.10.5` and the prior knowledge and instruction-skill
  versions together
- Evidence: knowledge lint and OKF validation pass with pre-existing index
  warnings; every workspace Agent Skill suite validates; the two new selected
  execution cases pass one same-author smoke trial each after one authoring
  refinement; no release-tier or independent approval is claimed

## Revision 0.10.3

- Previous version: `0.10.2`
- Contract delta: selects audit-agent-skill `>=0.7.2` for the strengthened
  static-execution boundary and evaluator `>=0.2.1` for coherent pass records
- Compatibility and cohort: all other member lower bounds and the contract v3
  evidence model remain unchanged
- Migration: update the pack as a unit before collecting new regression runs
- Rollback: restore pack `0.10.2`, accepting the recorded audit and runner
  behavioral defects
- Evidence: audit case 1 passes three of three trials on the revised identity,
  evaluator conformance passes, and all workspace suites validate; neither
  result is independent release approval
- Bound manifest identity:
  `sha256:be0b46bd8a83cfe727a098292ed1875559f6e87b1b96e6363474448a2588c923`

## Revision 0.10.1

- Previous version: `0.10.0`
- Contract delta: aligns every first-party Agent Skill suite on evaluation
  contract `3.0.0` and the evaluator's mechanical critical-assertion gates
- Compatibility and cohort: all six skill members move together; existing
  contract `2.0.0` packages remain readable outside the pack during migration
- Membership lower bounds select evaluator `>=0.2.0`, audit-agent-skill
  `>=0.7.1`, and the corresponding author, evaluator, and instruction-skill
  patch revisions
- Migration: update the pack as a unit before collecting new regression runs
- Rollback: restore pack `0.10.0` and all prior member constraints together
- Evidence: all workspace suites validate against the v3 evaluator and the
  deterministic conformance suite passes; release-tier evidence and independent
  approval remain outside this revision
- Bound manifest identity:
  `sha256:37d06c4214b6c7395d430c15f99e00d4dd629aee9fb49223b5bc20c329b00d17`
