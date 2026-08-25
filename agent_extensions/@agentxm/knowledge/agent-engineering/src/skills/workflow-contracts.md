---
type: Reference
title: Workflow contracts
description: How inputs, outputs, authority, decisions, failures, and completion evidence make instructions executable.
tags: [agent-skills, workflow, inputs, outputs, authority, verification]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T20:25:35Z }
stale_after: 2027-02-14
---

# Workflow contracts

An activated skill must tell an agent how to act, decide, recover, and know it
is finished. A bag of advice can improve prose yet still fail as a workflow.

## Contract checklist

Resolve the fields that change execution. A small skill need not restate a
field already supplied or enforced by its host, and an inapplicable field does
not need placeholder prose.

| Contract | Questions to resolve when applicable |
| --- | --- |
| Start | Which event, request, or artifact begins the job? |
| Inputs | What may the caller supply, and what must the agent discover? |
| Preconditions | Which state, evidence, tools, or permissions must exist? |
| Sequence | Which steps depend on earlier evidence or state? |
| Judgment | Which choices require context, policy, or human acceptance? |
| Authority | Which reads, writes, commands, external actions, and escalations are allowed? |
| Failures | Which conditions retry, degrade, stop, or request help? |
| Output | Which artifact, action, or decision is returned? |
| Presentation | Which fields, labels, relative order, repetition, and visual weight are contractual? |
| Completion | What objective evidence shows the outcome exists? |
| Non-goals | Which adjacent work remains elsewhere? |

## Instruction shape

- Include guidance that changes a decision, preserves a non-obvious invariant,
  or prevents a demonstrated failure. Omit generic competence reminders,
  repeated policy, and speculative edge cases.
- Use outcome and decision criteria when several approaches are valid; use
  imperative steps in execution order when dependencies or fragile mechanics
  make sequence material.
- Name the evidence each material step consumes and produces.
- Branch only where a real decision changes action.
- State destructive or externally mutable behavior before the action.
- Require confirmation when authority cannot be derived from the request.
- Bound retries and state when to degrade, return preserved state, request help,
  or stop—especially for external mutations.
- End with verification proportional to the consequence of failure.

Avoid aspirations such as “ensure quality” without an observer, condition, or
check. Distinguish requirements from recommendations, examples, and local
conventions. Avoid rigid steps where the task legitimately admits several
approaches.

Skill selection or activation does not grant new execution authority. Preserve
the user's selected product, tool, deliverable, and task scope; require separate
authorization before an undeclared external effect or unrelated configuration
change.

## Presentation contracts

Semantic completeness does not imply a stable interaction. When placement or
order changes interpretation, authority, comparison, or downstream use, specify
the presentation separately from the content:

- name required sections and their relative order;
- state which sections are optional and what permits omission or compression;
- require parallel fields and comparable emphasis where alternatives must be
  weighed fairly;
- state whether an item may appear more than once; and
- name the final prompt, handoff, or status the interaction must end with.

Keep one authoritative shape at the step that emits it. Use a strict template
for a measured consistency requirement; do not scatter equivalent rules across
prose and examples.
