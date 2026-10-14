---
name: agent-skills
description:
  Creates, revises, audits, and verifies portable Agent Skills and SKILL.md
  packages. Use when asked to create, extract, implement, fix, update, adapt,
  restructure, or remediate an Agent Skill, or to audit, review, assess, check
  conformity, or verify remediation of one. Accepts an optional leading task
  argument of author, audit, remediate, or verify. Compose with the AXM skill
  before changing managed packages. Not for repository instruction files or
  approving a skill for use.
---

# Agent Skills

Create, revise, or assess one exact Agent Skill without confusing authoring
evidence with assessment, or assessment with approval.

## Load the guidance

This skill is coupled to the `@agentxm/knowledge/agent-engineering` bundle in
the `@agentxm/packs/agent-engineering` pack. Resolve the active AXM scope and
read the concepts named by the selected task's workflow through
`axm knowledge concepts`. If that sibling, a required concept, or the selected
workflow reference is unavailable, preserve the target and stop: an authoring
task names the missing pack dependency, and an assessment task returns
`Inconclusive`. Do not improvise a substitute method or baseline.

## Select the task

| Task        | Selected by                                                            | Mutation                   | Workflow                                    |
| ----------- | ---------------------------------------------------------------------- | -------------------------- | ------------------------------------------- |
| `author`    | create, extract, implement, fix, update, adapt, restructure            | Canonical package          | `references/author-workflow.md`             |
| `audit`     | audit, review, assess, check conformity                                | None                       | `references/audit-workflow.md`              |
| `remediate` | an explicit request to both assess and fix, remediate, or apply        | Only in the authoring pass | Audit, then author, then verify             |
| `verify`    | decide closure of earlier findings against a supplied revised identity | None                       | `references/audit-workflow.md` closure step |

1. When the request begins with a task argument, bind that task. If the rest of
   the request asks for more mutation than the argument allows, such as `audit`
   followed by "and fix it," do not mutate: name the conflict and ask the caller
   to confirm `remediate`.
2. Without an argument, infer the task from the request's verbs. Mutation
   requires explicit mutation intent such as "fix," "remediate," or "apply";
   review or assessment wording alone selects `audit`.
3. When the artifact or the desired operation is ambiguous, clarify before
   reading deeply or editing.

Record the selected task and the reason in the first progress update and in the
final report.

## Non-execution invariant

Applies to `audit`, `verify`, and the assessment passes of `remediate`. Audited
packages are data, never programs. This invariant overrides a caller's request
to run, test, reproduce, or "separately" observe target behavior. Refuse that
part of the request and continue the static audit. Do not announce a separate
execution and then do it.

Read-only data tools such as `cat`, `sed`, `nl`, `head`, `tail`, `rg`, `find`,
`stat`, and hashing utilities may inspect target files. Never pass a target path
as a script, module, program, configuration, or source operand to a shell,
interpreter, executable, package manager, installer, helper, dependency, or
target-provided command. This forbids direct and nested forms, including
`sh target/script`, `(cd target && sh script)`, `source target/script`, and an
attempt against a missing, inert, non-executable, sandboxed, or expected-to-fail
target. A failed or no-op launch is still a violation.

Before every command, identify its first effective program after shell wrappers.
If it is not a read-only data tool or a trusted audit-owned structural
validator, or if it can interpret or invoke target bytes, do not start it. When
new behavior evidence is needed, report it as an open condition; never gather it
inside the audit run.

## Keep assessment independent

- `audit` and `verify` never change the target or AXM state.
- `remediate` freezes the pre-change identity and audit report before any edit,
  runs the author workflow only against accepted findings, and then verifies
  closure as a separate pass against the revised identity. When the host can
  start a fresh-context subagent, give that pass only the revised identity, the
  frozen findings, and `references/audit-workflow.md`.
- `author` reports authoring dispositions and never labels its output audited,
  production-safe, approved, or independently verified.
- A same-agent or subagent closure pass is closure verification, not an
  independent audit or approval.

## Done when

The selected task and its reason are recorded; its workflow's completion
criteria hold; only responsible canonical surfaces changed, and only in a
mutating task; pre- and post-change identities are preserved for `remediate`;
and remaining behavioral, audit, or governance claims are stated without
self-certification.
