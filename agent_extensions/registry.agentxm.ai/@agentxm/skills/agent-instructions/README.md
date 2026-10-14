# Agent Instructions

Create, revise, audit, and verify `AGENTS.md`, `CLAUDE.md`, and related scoped
repository instruction systems. The skill resolves the active harness contract
and canonical sources, keeps persistent guidance at the smallest truthful scope,
routes deeper content to its proper owner, reconciles projections, and validates
representative and adjacent entry points.

## Tasks

| Invocation                       | Behavior                                                               |
| -------------------------------- | ---------------------------------------------------------------------- |
| `/agent-instructions author ...` | Create or revise canonical sources and reconcile owned projections     |
| `/agent-instructions audit ...`  | Read-only, snapshot-bound conformity assessment                        |
| `/agent-instructions remediate`  | Audit, apply accepted findings, then verify closure in a separate pass |
| `/agent-instructions verify ...` | Recheck earlier findings against a supplied revised identity           |

Without an argument, the skill infers the task from the request. Assessment
wording selects `audit`; mutation requires explicit intent. An `audit` argument
combined with a request to fix is treated as a conflict to confirm, not as
authority to edit.

A closure pass runs against the revised identity, in a fresh-context subagent
when the host supports one. It is closure verification, not independent
approval.

When AXM manages the instruction system, the skill uses AXM's instruction
inventory, lint, and previewed reconciliation rather than editing aliases or
managed regions directly. Assessment tasks never apply reconciliation.

## Install

```sh
axm install @agentxm/packs/agent-engineering
```

## Examples

> Revise our repository instructions to remove parent-child duplication,
> preserve useful discovery routes, and verify the effective context from the
> root and package working directories.

> `/agent-instructions audit` our AGENTS.md system from the repository root and
> package directories without changing anything.

## Revision 0.2.0

- Previous identity: `agent-instructions` `0.1.1`
- Contract delta: adopts the former separate authoring lineage's instruction
  guidance: authoring and audit express desired outcomes and necessary
  constraints instead of incidental procedure, treat invariants and commands as
  scope-wide only when they truly are, add unproven accretion as an audit
  finding, and require comparative behavioral evidence before claiming
  improvement
- Suite delta: the package evaluation suite and contract are removed, along with
  the archive rule that excluded them
- Migration: none
- Rollback: restore `agent-instructions` `0.1.1`
- Evidence: AXM package validation only

## Revision 0.1.0

- Previous identities: `author-agent-instructions` `0.1.6` and
  `audit-agent-instructions` `0.1.6`, both removed
- Contract delta: one skill owns authoring and assessment through explicit
  `author`, `audit`, `remediate`, and `verify` tasks; an assessment argument
  never authorizes mutation; remediation closure runs as a separate pass
- Suite delta: suite `0.1.0` combines both predecessor suites, converts former
  sibling-collision routing cases into task-bound positives, and adds
  task-selection cases
- Migration: replace both predecessor names with `agent-instructions` in
  workspace settings and pack membership; no alias is provided
- Rollback: restore pack `0.10.5` with both predecessor packages together
- Evidence: workspace evaluator structural validation only; no behavioral run,
  baseline, or independent approval is claimed
