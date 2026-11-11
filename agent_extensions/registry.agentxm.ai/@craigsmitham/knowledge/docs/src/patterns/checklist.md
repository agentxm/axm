---
type: Pattern
title: Checklist
description: When known actions, states, or communications are easily missed, place concise, observable prompts at the point of work with an explicit use protocol and response to unmet items.
tags: [docs, documentation-pattern, checklist, checklist-design, verification, coordination, human-factors, validation, authoring]
status: draft
sources:
- id: checklist-design-origin
  resource: https://github.com/craigsmitham/agent-extensions/tree/156c3d4346bee6874ab3d356c19446cf6425713b/skills/checklist-design/src
  title: Craig Smitham — Checklist design skill and references, version 0.1.10
- id: nasa-checklists
  resource: https://www.faa.gov/sites/faa.gov/files/2022-11/NASA%20Ames%20Rpt%20CR%20177549%20.pdf
  title: Degani and Wiener — Human Factors of Flight-Deck Checklists
- id: aapm-checklists
  resource: https://aapm.onlinelibrary.wiley.com/doi/10.1002/acm2.13895
  title: Conroy et al. — Development, implementation, use and maintenance of safety checklists
- id: mrc-process
  resource: https://www.bmj.com/content/350/bmj.h1258
  title: Moore et al. — Process evaluation of complex interventions
- id: betterbirth
  resource: https://pmc.ncbi.nlm.nih.gov/articles/PMC5672590/
  title: Semrau et al. — Outcomes of implementing a coaching-based WHO Safe Childbirth Checklist program in India
generated:
  by: codex/gpt-6
  at: '2026-11-11T17:40:43Z'
---

# Checklist

When known actions, states, or communications are easily missed, **place
concise, observable prompts at the point of work with an explicit use protocol
and response to unmet items**.

A checklist couples its items to how people use them. A checked box records a
response; it does not by itself establish correct execution, sound judgment,
learning, or an effective intervention. This pattern owns the shared design
guidance; the purpose-specific patterns below develop distinct applications.

## Problem and applicability

People who know how to do the work can still omit an action, overlook a
condition, or fail to communicate it. A bounded prompt can make that omission
visible at a useful moment. The user must be able to recognize the situation,
interpret the item, and act on the result.

Establish the outcome, relevant failure, users and expertise, trigger and
completion condition, environment, medium, available resources, and authority.
Consider interruption, time pressure, and the consequences of delay or false
completion. Scale this brief to the decisions it changes.

Choose a different primary aid when another problem dominates:

| Reader's need | Alternative and possible checklist role |
| --- | --- |
| Complete procedural detail | [Runbook](runbook.md); checklist at entry, pause, or completion points |
| Diagnosis and response selection | [Playbook](playbook.md) or decision tree; branch-local checks |
| Judgment across quality dimensions | Rubric; checklist for evidence or coverage |
| Structured data capture | Form; prompts for omissions or follow-up |
| Deterministic prevention | Automation or an interface constraint; checks for exceptions |
| Substantial instruction and practice | [Tutorial](tutorial.md), worked examples, coaching, or simulation; temporary learning prompts |

An ordinary personal to-do list needs little of this machinery. A maintained
checklist is justified by a recurring omission or coordination problem, not by
the availability of checkbox formatting.

## Choose purpose and interaction separately

Select the primary outcome before choosing how users encounter the items:

| Purpose | Pattern |
| --- | --- |
| Carry out known actions without omission | [Execution checklist](execution-checklist.md) |
| Detect incorrect or missing completed work | [Verification checklist](verification-checklist.md) |
| Decide whether conditions permit proceeding | [Readiness checklist](readiness-checklist.md) |
| Make reporting coverage or inspection findings explicit | [Reporting and review checklist](reporting-review-checklist.md) |
| Support practice toward later independence | [Learning checklist](learning-checklist.md) |

These are useful specializations, not an exhaustive taxonomy. Coordination can
serve any of them. Specify who prompts, performs, verifies, records, and has
authority to stop or escalate.

**Read-do** presents a prompt before its action. **Do-confirm** checks work
already performed. **Challenge-response** makes the prompt and observed response
explicit between participants; define whether the response follows execution
or verification. A readiness check can use do-confirm and challenge-response
together. These terms describe separable design choices in this collection,
not a claim that every source uses the same classification. NASA's account
distinguishes directed configuration from subsequent verification and describes
both team exchange and combined use.[^nasa-checklists]

Keep hybrid purposes visible. Reporting coverage can compete with operational
speed; novice explanation can compete with expert attention; scoring can
discourage candid learning. Separate sections or companion artifacts when
the purposes require different wording, roles, evidence, or evaluation.

## Write the items and use protocol

1. **Make selection recognizable.** Name the task or decision, applicability,
   version, trigger, and completion condition. Distinguish neighboring aids.
2. **Make items observable.** Usually ask for one action, question, state, or
   verification per item. Identify the responsible role where it varies and
   the evidence needed to distinguish success from assertion.
3. **Ground critical content.** Trace consequential actions, acceptance limits,
   and failure responses to accountable domain sources, task analysis, incident
   evidence, or an explicit coordination requirement. Do not invent thresholds.
4. **Preserve dependencies and place.** Group by natural work boundaries,
   protect critical early actions, and specify how to resume after interruption.
   A partially completed item needs a recognizable state.
5. **Define negative and unknown results.** State when to correct, stop,
   escalate, record an exception, or consult a neighboring procedure. An unknown
   result cannot silently become a pass. Bound branches by conditions the user
   can recognize; hand substantial diagnosis to another aid.
6. **Fit the medium.** Use legible, accessible wording and structure in the
   actual device, lighting, noise, and hands-busy conditions. Do not rely on
   color, sound, or position alone. Reduce scope or split at useful boundaries
   before shrinking type or crowding the page.

Avoid vague directions such as “ensure quality,” compound checks that hide
partial completion, and yes/no fields where an observed value matters. There
is no universal item count or word limit. The use protocol may be a sentence
for a small personal aid or a separate maintained procedure for team use.

When domain authority is missing for consequential content, a neutral shell
with explicit gaps can still be useful: responsible role, required observation,
source, and failed-item response. Formatting cannot supply the missing domain
decision. Conflicting authorities need resolution by the responsible owner.

## Tradeoffs and failure modes

Prompts can make omissions and handoffs visible, while adding attention and
maintenance costs. Excessive coverage creates irrelevant work; excessive
compression makes interpretation depend on memory. Independence of verification
costs time and coordination. Familiarity can encourage ritual responses.

Challenge a candidate with wrong-aid selection, a missing critical item,
ambiguous wording, impossible actions, interruption, urgent competing work,
and completion without the required state. Consider language and access needs,
hierarchy, incentives, and missing resources. These are design-review scenarios;
imagining them does not establish usability or effectiveness.

## Validate the claim and maintain the aid

Match evidence to the outcome being claimed:

| Claim | Relevant evidence |
| --- | --- |
| Content and fit | Traceable items, task analysis, comparison with feasible alternatives |
| Usability | Representative users selecting, interpreting, using, and resuming the aid |
| Intended use | Observed actions, verification, correction, communication, and escalation |
| Task improvement | Comparative omissions, defects, timing, decisions, recovery, or learning |
| Downstream benefit | Outcomes for affected people, with unintended effects and context considered |
| Durability | Continued performance across users, settings, adaptations, and time |

Evidence for one claim does not automatically establish another. Process
evaluation distinguishes implementation, mechanisms, and context; this is
useful when checklist completion and outcomes diverge.[^mrc-process] In the
BetterBirth trial, improved adherence did not produce a significant improvement
in the primary outcome. That finding concerns its intervention and setting,
not all checklists.[^betterbirth]

For a validation plan, name the claim, version, users and setting, exclusions,
real comparator, representative scenarios, measures and baseline, observation
method, and evidence that would contradict the claim. Include delay, overload,
misselection, workarounds, access differences, and displaced controls. Separate
self-reported use from observed use. Report missing or conflicting evidence
without recasting it as success. Call a source review or walkthrough what it
is; certification and domain approval require the applicable external authority.

Identify the owner, provenance, revision, field-test status, invariant and
adaptable parts, and required training, resources, or companion artifacts.
Set review triggers for incidents, defects, changed work, evidence, users,
tools, or incentives. Record adaptations and the claims needing re-evaluation.
Retire or replace an aid when its purpose disappears or another control serves
it better. AAPM's guidance treats use, maintenance, and retirement as continuing
responsibilities within its domain; this collection generalizes that lifecycle
concern without importing clinical requirements.[^aapm-checklists]

## Examples and evidence boundary

A publication checklist might prompt an editor to inspect the final rendered
file. A handoff checklist might ask participants to state an unresolved issue
and acknowledge its owner. Both need a trigger and observable response, but
their order, medium, and evidence differ. Neither replaces a full procedure or
establishes the quality of the entire publication or handoff. These are
illustrative designs, not evaluated interventions.

This draft reorganizes the repository's earlier checklist guidance into a
documentation pattern and purpose-specific companions.[^checklist-design-origin]
Its synthesis and examples have not been independently field-validated. The
sources support particular distinctions and concerns, not a universal template.

[^checklist-design-origin]: Craig Smitham — Checklist design skill and references, version 0.1.10.
[^nasa-checklists]: Degani and Wiener — Human Factors of Flight-Deck Checklists.
[^aapm-checklists]: Conroy et al. — Development, implementation, use and maintenance of safety checklists.
[^mrc-process]: Moore et al. — Process evaluation of complex interventions.
[^betterbirth]: Semrau et al. — Outcomes of implementing a coaching-based WHO Safe Childbirth Checklist program in India.
