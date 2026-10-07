# Playbook record

Use for assessment and judgment in a recurring situation, including choosing,
combining, and adapting responses. Apply the [common profile](../references/profile.md).
The Type contract is normative for profile 0.5.0; other sections guide authoring.

## Type contract

A Playbook MUST identify:

- Observable entry conditions or reader intent, intended outcome, scope,
  subjects, and prerequisites such as access, tools, and initial state.
- Initial impact/urgency assessment, evidence to gather, and interpretation.
- Response options and selection conditions, including reassessment and what
  to do when evidence is inconclusive or no established response applies.
- Roles, communication, coordination, and escalation where needed.
- Resolution criteria, recovery evidence, remaining-work handoff, exercise/use
  evidence or explicit unknown history, limitations, and maintenance triggers.

Every `selects-procedure` edge MUST have a corresponding condition in the body.
Plays MAY remain inline until independent reuse or maintenance warrants Runbooks.
A playbook need not be a menu of procedures or confined to incidents. It MAY
support investigation, facilitated judgment, and coordination. Do not imply
that mitigation always requires identifying a root cause first.
Common draft-gap allowances apply.

## Gather evidence

Use recurring situation accounts, incident or rehearsal evidence, known response
guidance, observability sources, and coordination agreements. Separate observed
symptoms from inferred causes. Do not turn a speculative mitigation into an
established response or invent escalation authority.

## Suggested record

Add supported top-level relationship fields to the frontmatter using the
[relationship forms](../references/profile.md#relationships). Omit unknown
targets and name their gaps in the body.

```markdown
---
type: Playbook
title: <Respond to a recognizable situation>
description: <Observable situation and supported resolution or assessment>
status: draft
---

# <Respond to a recognizable situation>

## Situation, outcome, and scope
## Prerequisites and initial assessment
## Investigation and response selection
## Coordination and escalation
## Resolution and handoff
## Exercise evidence, gaps, and maintenance
```

A useful decision table has observed condition, next investigation/response,
expected evidence, and reassessment/escalation condition. Adapt to the situation;
do not force every play into a table. Use `owned-by`, `applies-to`, `uses-tool`,
and `selects-procedure` when the corresponding records exist.

## Check and maintain

Can a responder select this guidance from its description, gather relevant
evidence, and recognize the limit of established responses? Review after use,
rehearsal, changed symptoms, dependencies, tooling, or coordination agreements.
Record actual exercise scope and limitations; writing is not a rehearsal.
