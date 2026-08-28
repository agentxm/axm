---
type: Explanation
title: Changes
description: How one Change coordinates a bounded proposed or authorized software change while its Change Specification, Change Design, delivery state, and evidence retain distinct responsibilities and authority.
tags: [change, work-item, coordination, change-specification, change-design, bugfix, lifecycle, coherence, delivery, evidence]
status: draft
sources:
  - id: gen-stack-vocabulary
    resource: ../glossary.md
    title: Gen Stack vocabulary and relationship model
  - id: change-process
    resource: ../processes/deciding-and-realizing-software-changes.md
    title: Deciding and realizing bounded software changes
generated:
  by: codex/gpt-5.6
  at: 2026-08-27T23:32:00Z
---

# Changes

> **Authority:** The [Gen Stack vocabulary and relationship
> model](../glossary.md) owns the canonical terms. This Explanation clarifies
> their use without accepting a proposed change or authorizing delivery.

A **Change** is the durable coordination case for one bounded proposed or
authorized software change. It answers a different question from its two main
artifacts:

| Concern | Artifact | Owns |
| --- | --- | --- |
| Why and what must change | Change Specification | Intended outcome, scope, affected Intent, Requirement and Architecture meaning, constraints, and semantic Evaluation Protocol changes |
| How the change should be realized | Change Design | Technical response, alternatives, realization choices, executable evaluation approach, risks, and technical reconciliation |
| What case is moving through decision and delivery | Change | Canonical target, identity, classification, source relationships, current artifact states and bindings, delivery and evidence links, and next action |

The Change coordinates these concerns; it does not absorb their authority. One
tracker item normally acts as the canonical envelope for current Pitch,
Specification, Design, and plan regions or exact links. This removes the need
for a separate coordination handoff without merging artifact responsibilities.

## Three first-class work-item roles

Gen Stack uses three software work-item roles:

- **Operational Incident Record** for coordinated response to current or
  imminent operational impact;
- **Defect Report** for an observation, concern, or finding that may indicate a
  Defect; and
- **Change** for a bounded proposal or authorized change.

Investigation is an activity. Tasks, stories, epics, and similar records are
host-native planning mechanics. A Change may coordinate them without making
them additional Gen Stack roles.

## Classification, including Bugfix

Classification describes a Change; it does not create a different artifact
contract. A **Bugfix** is a Change whose explicit remedial purpose is to
remediate one or more established Defects. Remediation may correct the
defective work product or apply an accepted compensation that removes or
controls its unacceptable effect.

Investigation, diagnosis, deferment, monitoring, or acceptance of risk alone
does not make a Change a Bugfix. Nor does routine maintenance merely because
someone informally calls the work a bug. Mixed work remains one Change when it
has one coherent outcome and authority boundary; record Bugfix as one
classification and make any evolutionary scope explicit.

Use [Addressing defects through Changes](addressing-defects-through-changes.md)
when this classification applies.

## Relationships are a network

Cardinality is deliberately many-to-many:

- one Change may respond to several Signals, Defect Reports, or established
  Defects;
- one Defect Report may inform several Changes;
- one Defect may require several Changes with different authority, rollout, or
  recovery boundaries; and
- completing a Change does not automatically close its source Defect Reports.

Use host-native relationship types when their semantics are exact. Otherwise
use a concise qualified link. Gen Stack does not require a global Change
relationship ontology.

## Lifecycle and readiness

Pitch, Change Specification, Change Design, and plan share `Draft`, `Ready`,
and `Accepted`. Each current artifact is updated in place and contains explicit
Open items. `Ready` and `Accepted` have none. A valid forward-stage invocation
accepts the exact persisted Ready predecessor; a material edit returns the
affected artifact and dependent artifacts to Draft.

Keep these other dimensions separate:

- proposal and authorization state;
- shared focused-artifact state and exact revision;
- Change coherence;
- implementation, review, and final-action state;
- evidence state; and
- source-record disposition.

Artifact polish, implementation completion, or a passing check cannot advance
another dimension without its own authority and evidence. A Change is coherent
for planning only when the exact Specification is Accepted, the exact
persisted Design is Ready for `$plan`, their bindings agree, all required
semantic Protocols exist, and neither has Open items. The valid `$plan`
invocation accepts that Design before dependent planning.

A missing required Requirement-satisfaction or Architecture-realization
Protocol may be recorded in Draft, but blocks readiness, coherence, and
dependent planning. This gate is the same for every Change, including a
Bugfix.

## Representation

Prefer exact native host fields for identity, classification, relationships,
workflow, assignment, and delivery state. When another location is canonical,
link the exact Change Specification and Change Design revisions rather than
copying their content. When this work-item body or its exact native field set is
the canonical home, store the complete artifacts there under their own
contracts; that is canonical representation, not duplication.

Focused stages persist the first coherent Draft and every state change. Use
[Synchronizing change artifacts with work-item
hosts](synchronizing-change-artifacts.md) only for a user-requested manual
checkpoint or repair.

When no richer host exists, use this compact Markdown fallback. Keep Summary,
Next, and Current artifacts. Omit optional detail when no material content
exists instead of filling the envelope with `Not applicable` scaffolding.

```markdown
# Change: <bounded outcome>

> **Change:** <stable identity and exact revision>
> **Canonical:** <work item or exact link>
> **Coordination:** <proposal, authorization, ownership, and lifecycle state>

## Summary

<The bounded outcome and current coordination condition.>

## Next

- **Action:** <one eligible next action or recovery>
- **Owner or authority:** <responsible role>
- **Blocked by:** <None or stable Open-item and decision identities>

## Current artifacts

| Artifact | Exact identity | State | Canonical location and Open items |
| --- | --- | --- | --- |

## Sources and classification

<Optional when material: Bugfix or other classifications; exact Signals,
Defect Reports, incidents, and provenance links.>

## Delivery and evidence

<Optional when material: plan, tasks, candidates, reviews, Results, rollout,
recovery, and observed external state as exact links with their own status.>
```

This fallback is a presentation contract, not a new authority layer. A native
host may satisfy the same contract with exact fields and omit inapplicable
body sections.

## Completion

A Change can close because it was declined, deferred, replaced, or delivered
and verified within declared limits. Closure records the disposition, exact
artifact and implementation revisions, evidence boundary, residual risk,
recovery state, and source-record effects. It never implies that linked Defect
Reports, incidents, Requirements, or Architecture records share the same
lifecycle.

## Related

- [Writing Change Specifications](writing-change-specifications.md)
- [Developing a Change Design](../design/developing-a-change-design.md)
- [Addressing defects through Changes](addressing-defects-through-changes.md)
- [Maintaining work-item identity, relationships, and lifecycle](maintaining-work-item-identity-relationships-and-lifecycle.md)
