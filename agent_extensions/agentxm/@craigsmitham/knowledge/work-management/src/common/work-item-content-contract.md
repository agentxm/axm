---
type: Reference
title: Work-item content contract
description: Defines the common semantic slots, their conditional applicability, and the composition order for portable work-item templates.
tags: [work-item, content-contract, template, scope, evidence, completion, verification, next-action]
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:30:08Z }
---

# Work-item content contract

Every portable work item composes four layers adapted from the earlier common
work-item concerns.

```text
common contract → role-specific contract → repository considerations
                → native host representation
```

The layers govern meaning, not mandatory Markdown. Use an exact native field
when it carries the same semantics; use body content only for residual meaning.

## Common semantic slots

| Slot | Include when | Content |
| --- | --- | --- |
| Identity and role | Always | Stable host identity when persisted; Incident Record, Defect Report, or Change role |
| Classification | Established and decision-relevant | Such as Bugfix, maintenance, migration, or another local classification; never infer from a label alone |
| Title and summary | Always for a persisted item | A derived brief of the current body, written last |
| Sources and evidence | Material input exists | Originating occurrences, requests, observations, findings, links, conditions, availability, and limitations |
| Context or motivation | Always | Why the item exists and which situation it concerns |
| Scope and exclusions | A bounded response or case is needed | Included and intentionally excluded outcomes, systems, users, or conditions |
| Constraints and risks | Material | Binding limits, invariants, compatibility conditions, uncertainty, consequences, and residual risk |
| Relationships | Material peers exist | Explicit direction and meaning for dependencies, duplicates, remediation, follow-up, or source evidence |
| Decisions and open questions | A choice has been made or remains | Decision, authority, rationale, state, and the exact unresolved question |
| Completion conditions | A next boundary is being defined | Observable conditions for handoff, disposition, delivery, or closure |
| Verification | A claim needs evidence | Conditions, strategy, bounded result, revision, environment, and observation window |
| Ownership and next action | Active coordination is needed | Who acts, who decides when different, the next authorized action, and any blocker |

## Application rules

- Omit an inapplicable slot instead of printing an empty heading or `N/A`.
- Write **unknown** when a material value is not established and **unavailable**
  when expected evidence cannot be accessed or recovered.
- Keep observations, reports, hypotheses, decisions, plans, and results
  distinguishable.
- Link peer specifications, designs, decisions, tests, and runbooks rather than
  copying them into competing authorities.
- Preserve supplied technical context proportionately, even when it is not yet
  accepted or selected.
- Do not infer priority, assignment, approval, verification, or closure from a
  host status, label, implementation, or absence of objections.
- Put the current reader's most time-sensitive information first. Incident
  Records therefore lead with current state; other roles usually lead with the
  derived brief and case meaning.

Role templates are complete fallbacks for hosts without suitable structured
fields. They apply this contract directly and add only role-specific meaning.
