---
type: Explanation
title: OODA as the Gen Stack control loop
description: How Observe, Orient, Decide, and Act govern learning and repair across Gen Stack authorities without becoming another artifact hierarchy.
tags: [ooda, control-loop, signals, observations, orientation, decisions, actions, feedback, self-healing]
status: draft
sources:
  - id: boyd-ooda
    resource: https://www.coljohnboyd.com/documents/1995-06-28__Boyd_John_R__The_Essence_of_Winning_and_Losing__PPT-PDF.pdf
    title: John R. Boyd — The Essence of Winning and Losing
  - id: fowler-generative-stack
    resource: https://chadfowler.com/regenerative-software/3miwhqqvwxc2x/
    title: Chad Fowler — The Generative Stack
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T22:30:00Z
---

# OODA as the Gen Stack control loop

> **Authority:** The [Gen Stack vocabulary and relationship
> model](/glossary.md) is authoritative for canonical terms and relationships.
> This Explanation develops understanding without redefining them. When it
> discusses a profile-governed corpus representation, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) governs that representation.
> This document adds neither semantic authority nor profile-conformance rules.

The Gen Stack and OODA answer different questions. The Gen Stack identifies
the authorities, transformations, realized state, and evidence involved in
software change. OODA explains how a changing system notices new information,
interprets it, selects a response, and learns from acting.

Use OODA as the adaptive control loop around the Gen Stack, not as a replacement
artifact hierarchy:

```text
Observe ──→ Orient ──→ Decide ──→ Act
   ↑                                  │
   └──────────────────────────────────┘

             OODA operates across:

                    Intent
                 shapes both
              ↙              ↘
    Architecture  ⇄  Requirements
              ↘              ↙
                 Compilation
                      ↓
               Implementation
                      ↕
                 Evaluations
```

Boyd's model makes Orientation more than a step between input and decision. It
is shaped by new information, previous experience, cultural context, and
analysis and synthesis; it also shapes what is noticed and which actions are
available. A Decision is a hypothesis and an Action tests it, producing further
observations.[^boyd-ooda]

## Observe

Receive Signals and record contextual Observations from stakeholders,
Evaluations, Implementation, operations, incidents, and environmental change.
Preserve provenance, conditions, time boundaries, and uncertainty before
drawing a conclusion.

Observation does not establish desired state. A failing Evaluation, user
request, runtime anomaly, or changed external condition may draw attention to
any part of the stack without proving which part should change.

## Orient

Interpret the available Observations against Intent, Requirements,
Architecture, Implementation, Evaluations, operational context, prior
decisions, incidents, and other Provenance. Determine what is coherent,
missing, misplaced, stale, conflicting, unsupported, or still unknown.

Orientation is an activity, not another maintained authority. Intent
participates in Orientation because it supplies human direction and desired
outcomes, but Intent is not synonymous with Orientation. Orientation may
conclude that Intent changed, or that Intent is sound and only an Evaluation or
Implementation Unit is defective.

## Decide

Select an authorized repair hypothesis. A Decision may preserve the current
stack, request a discriminating investigation, accept changed Intent, add or
revise a Requirement, correct an Architecture response, repair Implementation,
or improve an Evaluation.

Decision does not mean Architecture Decision Record. An Architecture Decision
Record is one possible durable result when the selected response crosses the
system's architecture-decision threshold. Other decisions remain with their
applicable product, requirements, engineering, assurance, or operational
authority.

## Act

Apply the bounded Decision as a test. An Action may gather more evidence,
change an authority, run Compilation, modify an Implementation Unit, execute an
Evaluation Protocol, deploy an authorized change, or roll it back. Keep the
Action observable, containable, reversible where practical, and explicit about
the expected closure evidence.

The resulting Evaluation Results, runtime behavior, stakeholder responses, and
environmental effects become new Observations. They may support the hypothesis,
contradict it, or leave the outcome unknown; none should be converted into a
pass or a change of Intent automatically.

Apply the glossary's [Trust gradient](../glossary.md#gen-stack): keep the
authority granted to an Action and its blast radius no larger than the
available confidence supports. Strengthen constraints, containment,
observability, reversibility, independent evaluation, and review as
consequence rises or the Action approaches a slower Pace layer.

## OODA crosses every Gen Stack authority

| Gen Stack authority or activity | Relationship to the control loop |
| --- | --- |
| Intent | Human direction used during Orientation; a Decision may preserve, refine, accept, or reject proposed direction through its proper authority. |
| Requirement | Canonical accepted obligation examined during Orientation; an authorized Decision may add, revise, move, or retire it. |
| Architecture | Subjects, boundaries, responsibilities, and responses used during Orientation and changed only through architecture authority. |
| Compilation | One possible Action that transforms Architecture and its Requirements into Implementation Units. |
| Implementation | Realized state that can be observed, diagnosed during Orientation, and changed by an authorized Action. |
| Evaluation Protocol | An assessment contract used to test a Decision or discriminate among competing orientations. |
| Evaluation Execution | An Action applying an exact Protocol revision to identified inputs, environment, and Implementation. |
| Evaluation Result | An Observation produced by an Execution; evidence for the next Orientation, not a Decision. |
| Provenance | Memory that makes Orientation accountable rather than dependent on the latest Signal. |

## Run loops at the pace of the affected authority

The glossary's [Pace layer](../glossary.md#gen-stack) is a decision lens for
these differences, not another physical or semantic layer in the stack.

OODA is not one global serialized workflow. A narrow Implementation and
Evaluation loop may turn quickly when upstream authorities are coherent. A
Requirement or Architecture loop turns more slowly because it changes accepted
meaning or responsibility. Intent and governance loops may be slower still.

Fast loops must not silently outrun slower authorities. Conversely, every
Implementation defect need not reopen Intent. Use the smallest loop whose
authority can explain and correct the Signal, and escalate outward only when
evidence contradicts that authority.

## Boundaries

Adopting OODA does not:

- put Signals or Observations inside Intent;
- map Observe to Evaluations, Orient to Intent, Decide to Architecture, or Act
  to Implementation one-to-one;
- make every Action a production mutation;
- let an agent accept desired state or architecture merely because it can
  diagnose a likely repair; or
- require a linear stage gate when Orientation supplies implicit guidance and
  feedback among activities.

Fowler's Generative Stack supplies the complementary representation and
transformation model: diverse specification inputs, canonical Requirements,
Evaluations, generation, Implementation, and feedback coexist and reinforce
one another.[^fowler-generative-stack] OODA supplies the decision-and-learning
loop governing how that feedback changes—or deliberately does not change—the
stack.

[^boyd-ooda]: [The Essence of Winning and Losing](https://www.coljohnboyd.com/documents/1995-06-28__Boyd_John_R__The_Essence_of_Winning_and_Losing__PPT-PDF.pdf)
    presents Boyd's OODA sketch and its hypothesis, test, feedback, and
    Orientation semantics.
[^fowler-generative-stack]: [The Generative Stack](https://chadfowler.com/regenerative-software/3miwhqqvwxc2x/)
    motivates the layered representations and feedback channels to which this
    control model is applied.
