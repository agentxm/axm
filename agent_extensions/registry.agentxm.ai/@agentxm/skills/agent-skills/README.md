# Agent Skills

Create, revise, audit, and verify portable Agent Skills. The skill is a thin
execution layer over the authoritative authoring, trust, and lifecycle guidance
in the coupled `agent-engineering` knowledge bundle.

## Tasks

| Invocation                    | Behavior                                                               |
| ----------------------------- | ---------------------------------------------------------------------- |
| `/agent-skills author ...`    | Create or revise a package                                             |
| `/agent-skills audit ...`     | Static, read-only, snapshot-bound conformity and trust assessment      |
| `/agent-skills remediate ...` | Audit, apply accepted findings, then verify closure in a separate pass |
| `/agent-skills verify ...`    | Decide closure of earlier findings against a supplied revised identity |

Without an argument, the skill infers the task from the request. Assessment
wording selects `audit`; mutation requires explicit intent. An `audit` argument
combined with a request to fix is treated as a conflict to confirm, not as
authority to edit.

Assessment tasks treat the target as data: they never execute bundled code,
installers, helpers, or dependencies, even when asked to observe behavior. A
closure pass runs against the revised identity, in a fresh-context subagent when
the host supports one, and is closure verification rather than independent
approval.

Authoring treats target helpers, package commands, interpreters, and
dependencies as untrusted until their identity, provenance, execution path,
trust, and bounded execution authority are resolved. It labels same-agent
exercises as authoring smoke, never as behavioral proof or approval.

For AXM-managed packages, the skill applies AXM extension-management guidance
independently of the runtime host profiles the target claims, and assessment
tasks use native lint and pack-state inspection only as bounded read-only
evidence.

## Install

```sh
axm install @agentxm/packs/agent-engineering
```

## Examples

> Revise this Agent Skill to address findings A-01 and A-03. Preserve its
> supported routing behavior, validate the package, and record any remaining
> evidence needed for closure.

> `/agent-skills audit` this package against the current skill-engineering
> guidance. Do not modify, run, or publish it.

## Revision 0.2.0

- Previous identity: `agent-skills` `0.1.1`
- Contract delta: the skill no longer authors or assesses versioned evaluation
  source (contracts, cases, fixtures, graders, harness inputs) and no longer
  selects or hands off to an evaluation runner; authoring keeps a bounded,
  labeled authoring-smoke exercise, and the audit reports missing behavioral
  evidence as an open condition
- Lineage delta: adopts the former separate authoring lineage's changes; the
  audit separates declared package relationships and supported cohorts from an
  incidental active catalog, assigns findings to the smallest owning surface,
  and records external conditions separately; authoring and audit check
  generated-file containment, consumer-worktree protection, and release contents
- Suite delta: the package evaluation suite and contract are removed
- Migration: `evaluate-agent-skill` and `agent-skill-evaluator` are retired;
  remove them from workspaces and neighboring catalogs; no replacement is
  provided
- Rollback: restore `agent-skills` `0.1.1` together with the retired evaluation
  packages
- Evidence: AXM package validation only

## Revision 0.1.0

- Previous identities: `author-agent-skill` `0.10.1` and `audit-agent-skill`
  `0.7.4`, both removed
- Contract delta: one skill owns authoring and assessment through explicit
  `author`, `audit`, `remediate`, and `verify` tasks; the static non-execution
  invariant now governs every assessment pass; an assessment argument never
  authorizes mutation; remediation closure runs as a separate pass
- Suite delta: suite `0.1.0` combines both predecessor suites with renumbered
  audit cases, converts former sibling-collision routing cases into task-bound
  positives, and adds task-selection cases; every predecessor critical gate
  remains mapped
- Migration: replace both predecessor names with `agent-skills` in workspace
  settings, pack membership, and neighboring evaluation catalogs; no alias is
  provided
- Rollback: restore pack `0.10.5` with both predecessor packages together
- Evidence: workspace evaluator structural validation only; no behavioral run,
  baseline, or independent approval is claimed
