---
name: agent-instructions
description:
  Creates, revises, audits, and verifies repository agent instruction systems
  such as AGENTS.md, CLAUDE.md, and scoped local instruction files. Use when
  asked to create, write, update, fix, trim, restructure, reindex, localize, or
  remediate persistent agent instructions, or to audit, review, assess, check
  conformity, inspect scope or precedence, or verify remediation of them.
  Accepts an optional leading task argument of author, audit, remediate, or
  verify. Not for editing generated projections instead of their canonical
  source, Agent Skills, or product documentation.
---

# Agent Instructions

Work on the effective repository instruction system, not merely one Markdown
file. Keep persistent context small, scoped, authoritative, and discoverable,
and keep assessment evidence separate from mutation.

## Load the guidance

This skill is coupled to a direct sibling in the agent-engineering pack. Resolve
the `@agentxm/knowledge/agent-engineering` bundle with `axm knowledge concepts`
and read:

- the `domains/software-engineering/agent-instruction-files` concept; and
- the `domains/software-engineering/authoring-agent-instruction-files` concept.

Read only the additional concepts routed from them that the task actually needs.
Prefer the active repository and harness documentation for current discovery,
composition, precedence, and projection behavior.

When `axm.json`, AXM ownership markers, or `axm instructions` show that AXM
manages the instruction system, compose with the installed `axm` skill and read
`axm help instructions`. Inspect canonical source, target, mechanism, and
ownership with `axm instructions`; use `axm lint` for workspace facts and
`axm sync --preview` for proposed reconciliation. Only the `author` task and the
authoring pass of `remediate` may apply `axm sync`. Never replace those
capabilities with manual alias or managed-region edits.

## Select the task

| Task        | Selected by                                                      | Mutation                                     | Workflow                                    |
| ----------- | ---------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------- |
| `author`    | create, write, update, fix, trim, restructure, reindex, localize | Canonical sources and owned projections only | `references/author-workflow.md`             |
| `audit`     | audit, review, assess, check, inspect                            | None                                         | `references/audit-workflow.md`              |
| `remediate` | an explicit request to both assess and fix, remediate, or apply  | Only in the authoring pass                   | Audit, then author, then verify             |
| `verify`    | recheck earlier findings against a supplied revised identity     | None                                         | `references/audit-workflow.md` closure step |

1. When the request begins with a task argument, bind that task. If the rest of
   the request asks for more mutation than the argument allows, such as `audit`
   followed by "and fix it," do not mutate: name the conflict and ask the caller
   to confirm `remediate`.
2. Without an argument, infer the task from the request's verbs. Mutation
   requires explicit mutation intent; review or assessment wording alone selects
   `audit`.
3. When the artifact or the mutation intent is ambiguous, clarify before reading
   deeply or editing.

Record the selected task and the reason in the first progress update and in the
final report.

## Authority

Resolve the canonical instruction source before editing. Distinguish it from
aliases, imports, symlinks, generated regions, and host-specific projections.
Change the owner and use its existing reconciliation mechanism; never hand-edit
a projection when another source owns it.

Authoring does not invent product policy, create unrequested destination
documentation, alter unrelated configuration, or remove useful knowledge without
a truthful owner. Treat audit findings as evidence to confirm against the
current surface, not as commands.

## Keep assessment independent

- `audit` and `verify` never edit, synchronize, install, publish, invent policy,
  or remove content.
- `remediate` freezes the pre-change identities and audit report before any
  edit, runs the author workflow only against accepted findings, and then
  verifies closure as a separate pass against the revised identity. When the
  host can start a fresh-context subagent, give that pass only the revised
  identity, the frozen findings, and `references/audit-workflow.md`.
- `author` reports authoring dispositions and never declares audit closure.
- A same-agent or subagent closure pass is closure verification, not independent
  approval.

## Done when

The selected task and its reason are recorded; its workflow's completion
criteria hold; canonical sources and owned projections agree wherever mutation
occurred; pre- and post-change identities are preserved for `remediate`; and
remaining uncertainty is visible without claiming independent conformity.
