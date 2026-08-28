---
type: Guide
title: Running a change-realization stage
description: Use when shaping, research, investigation, specification, design, planning, implementation, review, or shipping participates in one bounded software change; preserve exact inputs, authority, evidence, corpus impact, readiness, and recoverable handoffs.
tags: [process, software-change, stage-contract, handoff, readiness, authority, provenance, corpus, compaction]
status: draft
sources:
  - id: process-definition
    resource: deciding-and-realizing-software-changes.md
    title: Deciding and realizing bounded software changes
  - id: gen-stack-overview
    resource: ../overview.md
    title: How the Gen Stack operates
generated:
  by: codex/gpt-5.6
  at: 2026-08-27T23:32:00Z
---

# Running a change-realization stage

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](../glossary.md) and the recommended
> relationships in [Deciding and realizing bounded software
> changes](deciding-and-realizing-software-changes.md). It adds neither semantic
> acceptance nor mutation or release authority.

Use this common contract whenever one focused activity participates in a
bounded change. Apply the activity's specific Guide after this one; do not
replace its distinctive evidence, safety, or artifact rules with the common
shape.

## Goal

Produce one truthful, recoverable intermediate outcome whose inputs, authority,
evidence, corpus impact, readiness, and eligible next routes are explicit.

## 1. Bind the stage

Identify:

- the initiating request or preceding handoff;
- the bounded change or diagnostic question;
- exact input artifact and revision identities when they exist;
- the current meaning maturity and action authority;
- the intended intermediate outcome and decision it supports;
- allowed reads, writes, external effects, credentials, and code execution;
- the stopping condition and retry boundary; and
- the next readiness claim this stage could establish.

Do not infer that entering a later stage proves earlier readiness. Direct entry
is valid when its required inputs can be discovered and verified; otherwise
return to the smallest missing activity.

## 2. Orient from evidence and accepted meaning

Inspect material sources and the exact accepted Gen Stack concepts that apply.
Treat current code, tests, telemetry, plans, and work-item status as evidence or
peer authorities, not automatic desired state. Preserve conflicting,
unavailable, stale, and uncertain evidence.

If a valid adopted corpus does not exist, do not invent or initialize one as a
stage side effect. Continue when the stage can remain truthful without it and
report the unmet corpus condition.

## 3. Execute only the stage's responsibility

Produce the smallest sufficient activity outcome. Do not silently perform the
next stage, accept a candidate, change priority, or execute an external final
action merely because enough information is available.

When material evidence changes an upstream constituent:

1. identify whether the affected owner is Pitch, Intent, Requirement,
   Architecture, Change Design, plan, Implementation, Evaluation, operation,
   or Provenance;
2. preserve the evidence and affected exact revision;
3. classify the gap as blocking or non-blocking for the current action; and
4. return to the owning activity or present a real human decision gate.

Local reversible choices may proceed only when they remain inside accepted
meaning and delegated action authority.

## 4. Classify corpus disposition

Use every disposition that materially applies:

| Disposition | Meaning |
| --- | --- |
| `no-impact` | No relevant governed meaning, representation, realization link, or evidence route is implicated |
| `consulted` | Accepted corpus meaning constrained or informed the stage without change |
| `candidate-gap` | Evidence suggests missing, stale, disputed, misplaced, or contradicted meaning awaiting its authority |
| `accepted-semantic-delta` | Explicitly ratified Intent, Requirement, Architecture, decision, or Evaluation Protocol meaning must be encoded or was encoded |
| `representation-maintenance` | Meaning-preserving metadata, navigation, relationship, or placement maintenance is needed or completed |
| `realization-or-evidence-update` | Repository-native realization or Evaluation evidence changed without changing desired-state authority |
| `compaction-opportunity` | Obsolete or duplicate structure may be removed after its conservation and authority conditions are established |

Applying a semantic delta requires both meaning authority and mutation
authority. Representation maintenance must demonstrate that normative meaning
is unchanged. Record an unrelated compaction opportunity and continue; do not
expand the stage into cleanup.

## 5. Verify the intermediate outcome

Check:

- the output against every material input and accepted authority;
- stage-specific completion and failure conditions;
- exact identities and persisted state after any write;
- performed versus planned Evaluation or testing;
- intended versus observed external effects;
- corpus conformance and semantic review when corpus mutation occurred; and
- whether the claimed readiness is no broader than the evidence.

Preserve `unknown`, partial success, and harness or tool failure. A submitted
payload, passing local check, completed task, or polished artifact is not
evidence of a broader state it did not assess.

## 6. Hand off

End with this semantic shape, adapting labels to the native host and omitting
inapplicable empty fields:

```text
Outcome achieved:
Input and output identities:
Canonical artifact source or home:
Exact output revision or content identity:
Meaning maturity:
Action authority:
Evidence produced or consulted:
Material decisions and unknowns:
Blocking and non-blocking gaps:
Corpus disposition:
Readiness established:
Next eligible actions:
```

Link canonical artifacts rather than copying their facts into the handoff.
Use `transient exact output` when complete content is available in the current
conversation but no durable identity exists; do not invent persistence
metadata. State `not established` for a readiness condition whose evidence is
missing. When authorized persistence is the next action, route the exact output
to the artifact-synchronization operation rather than summarizing it in the
handoff.

## Valid exits

A stage may complete with its intended intermediate outcome, return upstream,
route laterally to research or investigation, terminate the Process, or stop on
an explicit blocker. It does not fail merely because no implementation or
shipping follows.

Cancellation, timeout, retry exhaustion, partial mutation, and unavailable
tools must name completed work, preserved artifacts, possible effects, and the
smallest safe recovery action. Never claim rollback unless the reversal was
observed.

## Final check

- The activity's own responsibility is complete or its exact blocker is clear.
- Inputs, outputs, revisions, evidence, and external effects remain attributable.
- Maturity and authority were not inferred from workflow position.
- Upstream meaning changes returned to their owner.
- Corpus consideration was proportional and truthfully dispositioned.
- Readiness and next routes are supported by evidence rather than stage labels.
