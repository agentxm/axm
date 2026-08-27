---
type: Guide
title: Defining a Process
description: Use when recurring work needs a reusable Process definition; make its value, authority, triggering and closing events, activities, resources, work-item participation, measures, and views explicit.
tags: [process, process-definition, process-modeling, process-design, work-items, workflow, activities, outcomes, value, stakeholders, process-template]
status: draft
sources:
  - id: process
    resource: process.md
    title: Process
  - id: bp-manifesto
    resource: https://bptrends.info/wp-content/manifesto/pdf/BPManifesto_EN_Letter.pdf
    title: BPTrends — Business Process Manifesto
  - id: documenting-process-requirements
    resource: /architecture/requirements/documenting-process-requirements.md
    title: Documenting process requirements
  - id: work-items
    resource: ../work-items/index.md
    title: Software work items
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T19:12:18Z
---

# Defining a Process

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

Use this guide to define one reusable Process around a valuable outcome. The
Process may coordinate people, automation, and several kinds of work items. It
may describe existing work, recommend an improvement, or realize binding
obligations—but its authority must remain explicit.

For the concept and its boundaries, read [Process](process.md).[^process] This
guide does not create a one-time plan, write every participant's procedure,
configure a tracker workflow, or establish a binding obligation merely by
documenting it.

The definition concerns below draw on the Business Process Manifesto's
conceptual treatment of work, value, events, resources, context, motivation,
performance, naming, and models without reproducing its worksheet or
text.[^bp-manifesto]

## Goal

Produce a Process definition that a reader can use to understand:

- why the Process exists and for whom;
- what starts and ends one enactment;
- which work, decisions, roles, and resources transform its inputs or state;
- which work items preserve particular cases and relationships;
- which authorities guide or constrain the work;
- how outcomes and performance will be observed; and
- which diagrams, procedures, workflows, or automation realize selected
  views of the Process.

## Preconditions

- A real outcome, recurring body of work, or concrete coordination problem
- Representative stakeholders and participants who can supply evidence about
  current or intended work
- Known authorities such as Requirements, policies, standards, contracts, or
  local decision rights when they apply
- Enough examples to distinguish the recurring Process from one exceptional
  case

If only one occurrence is known, record the work item or plan first. Extract a
reusable Process after a stable purpose and boundary become visible.

Process definition is progressive. Record what is established, label material
unknowns and assumptions, and name the event or evidence that will resolve
them. Do not fill every template field speculatively during early Intent or
Architecture work; do complete the information that current decisions,
coordination, or enactment depend on.

## Representation

Use the repository's native process notation, workflow model, or executable
format for facts it can express exactly. Let that model own triggers,
activities, decisions, flows, roles, inputs, outputs, and closing outcomes when
supported; add a companion page only for residual purpose, authority,
exclusions, rationale, evidence, or limitations. Without an established native
format, use the [canonical-definition composition](#11-record-the-canonical-definition-and-selected-views)
in this preferred order: purpose and authority, boundary, work and decisions,
work items, guides and constraints, measures, then realizations and views.
Omit empty sections and never maintain a prose transcription of an executable
model.

## 1. Declare the purpose and authority

Write one sentence answering:

> This Process coordinates `[work]` so that `[stakeholders]` receive or retain
> `[intended value or outcome]`.

Then classify the definition:

| Authority | Use when |
| --- | --- |
| **Descriptive** | Recording how work is understood or observed to happen |
| **Recommended** | Proposing a non-binding coordination model or improvement |
| **Normative** | Realizing obligations from identified Requirements, policies, standards, contracts, regulations, or other recognized authority |

Link every normative authority. Do not convert a preference, current tool
configuration, or common habit into an obligation. Name the Process steward
and the steward's maintenance boundary without copying a volatile person
roster.

## 2. Name the intended result

Choose one stable, active, outcome-oriented name. Prefer a verb and meaningful
object such as *Restore service*, *Resolve reported discrepancies*, or *Decide
on proposed system changes*.

Avoid names that primarily encode:

- the current team, role, or organizational unit;
- the tool, queue, meeting, or location used;
- a broad noun such as *management* that hides the result; or
- a status transition such as *move issue to done*.

Record aliases only when an integration or host vocabulary makes them useful.
Use the canonical name throughout the definition and its views.

## 3. Establish value and present need

Identify:

- direct and materially affected stakeholders;
- the outcome or preserved condition they value;
- the wider Intent, Offering, Capability, strategic outcome, service outcome,
  or operational good the Process supports;
- the present problem, risk, performance gap, or coordination need that makes
  definition worthwhile; and
- evidence that would distinguish value from mere completion.

Do not promise that executing the Process creates value automatically. State
the intended contribution and the assumptions through which activities and
outputs are expected to produce it.

## 4. Draw the boundary with events, inputs, and outputs

Define the boundary before decomposing activities:

| Boundary element | Question |
| --- | --- |
| **Context** | Where and under which conditions does this Process apply? |
| **Triggering event** | What occurrence or condition starts one enactment? |
| **Closing outcome** | What observable outcome completes it successfully? |
| **Termination** | When may or must work stop without the successful outcome? |
| **Inputs** | What information, artifacts, materials, requests, or state enter, and from whom or what? |
| **Outputs** | What information, artifacts, decisions, changed state, or services leave, and to whom or what? |
| **Exclusions** | Which adjacent work belongs to another Process, authority, or owner? |

Use business or domain events rather than tracker operations when possible.
“A supported service is materially disrupted” is a trigger; “an issue enters
the incident column” is a possible realization.

## 5. Model activities, decisions, and variation

Describe the smallest set of meaningful activities that explains how inputs
or state become outputs and outcomes. For each activity, name:

- its intended intermediate outcome;
- the role or resource responsible for performing or deciding;
- information required and evidence produced;
- material preconditions and completion conditions; and
- possible next activities, including waits, parallel work, escalation,
  rework, exception, and termination.

Do not force exploratory, incident, or diagnostic work into a single happy
path. Preserve uncertainty and competing hypotheses until the applicable
authority selects a decision. Decompose an activity as a narrower Process only
when its boundary matters independently for responsibility, risk, evidence,
handoff, reuse, or improvement.

## 6. Assign roles and resources

Describe responsibilities through durable roles rather than named people:

- Process stewardship and authority boundaries;
- accountable decision roles;
- participants performing human work;
- services, agents, workflow engines, and other automation;
- information, practical knowledge, tools, facilities, and equipment; and
- continuity, escalation, or handoff expectations.

Separate accountability from execution. A Process steward may maintain the
model while another authority accepts decisions and several people or systems
perform the work.

## 7. Identify guides, constraints, and enablers

Keep three relationships distinct:

| Relationship | Examples |
| --- | --- |
| **Governs or constrains** | Requirement, policy, regulation, contract, standard, decision policy, safety boundary |
| **Guides performance** | Principle, pattern, method, procedure, checklist, runbook, playbook |
| **Enables work** | Capability, service, trained role, data, tool, facility, budget, automation |

A binding Process Requirement should state the durable required outcome and
remain separate from changing steps, tool commands, meeting mechanics, and
tracker fields.[^documenting-process-requirements]

## 8. Map work-item participation

For every work-item type used by the Process, record:

| Concern | Question |
| --- | --- |
| **Purpose** | Which case, occurrence, request, decision, or delivery work does this item preserve? |
| **Creation** | Which event justifies creating it? |
| **Authority** | Which claims or decisions can it own, and which can it only reference? |
| **Lifecycle** | Which semantic states matter independently of the host status field? |
| **Relationships** | What may it source, link, split into, combine with, block, or produce? |
| **Evidence** | Which observations, rationale, actions, and results must remain attributable? |
| **Exit** | Which outcomes permit closure, handoff, deferment, rejection, or reopening? |

Do not model the Process as ticket conversion. Several work items may
participate in one enactment, one item may participate in several Processes,
and semantic authority does not change merely because a host changes an issue
type or status.[^work-items]

## 9. Separate the model from its realizations

Link, rather than absorb:

- procedures for a participant's detailed task;
- tracker states, forms, fields, and automation;
- workflow definitions and runtime behavior;
- scripts, services, agents, and other Implementation;
- diagrams for selected audiences or questions; and
- references containing exhaustive field or interface facts.

State which parts of the Process each realization covers and where known gaps
or manual handoffs remain. A formal diagram or automated workflow does not
make the Process complete, correct, or authoritative.

## 10. Choose measures and evidence

Start from the intended value and the decisions that evidence must inform.
Choose a proportional set across:

- outcome and stakeholder consequence;
- elapsed time, waiting, work in progress, and abandonment;
- quality, rework, recurrence, and residual uncertainty;
- safety, policy, and Requirement conformance;
- participant effort, attention, experience, and resource cost; and
- variation among contexts where comparison is valid.

For each measure, state its source, interpretation, review point, and material
limitations. Avoid activity counts that reward movement without value. Do not
instrument every activity merely because it appears in the model.

## 11. Record the canonical definition and selected views

Keep one maintained definition with the attributes needed to preserve meaning.
Add diagrams as views for specific audiences or questions, using whatever
notation serves them. Give each view the same Process identity and reconcile
it when the definition changes.

Write a one-sentence routing description before the detailed views. Name the
triggering event or condition and the intended closing outcome, adding context
or authority when they distinguish this Process from a neighbor. Do not use a
required tool, permission, or input as a substitute for the trigger.

The following template is a starting structure, not a required OKF schema:

```markdown
# [Outcome-oriented Process name]

Description: When [triggering event or condition] occurs in [context], this
[descriptive | recommended | normative] Process coordinates [work] until
[closing outcome].

## Purpose and authority
- Intended value and stakeholders:
- Strategic, product, service, or operational contribution:
- Present problem, risk, or performance gap:
- Authority: descriptive | recommended | normative
- Governing authorities:
- Process steward and maintenance boundary:

## Boundary
- Context and material exclusions:
- Triggering event:
- Successful closing outcome:
- Other termination conditions:
- Inputs and sources:
- Outputs and recipients:

## Work and decisions
| Activity or decision | Intermediate outcome | Responsible role or resource | Information and evidence | Possible next work |
| --- | --- | --- | --- | --- |

## Work items
| Work-item type | Purpose and creation event | Owned meaning | Relationships and evidence | Exit outcomes |
| --- | --- | --- | --- | --- |

## Guides, constraints, and enablers
- Governing Requirements, policies, standards, or rules:
- Procedures, principles, patterns, playbooks, or runbooks:
- Required capabilities, knowledge, tools, services, or resources:

## Measures and feedback
- Outcome evidence:
- Flow, quality, safety, experience, and cost evidence:
- Review points and improvement triggers:

## Realizations and views
- Procedures and workflows:
- Automation and Implementation:
- Diagrams and their intended audiences or questions:
```

## 12. Exercise representative scenarios

Walk the definition with participants and evidence from at least:

- one ordinary successful enactment;
- one rejection, cancellation, deferment, or unsuccessful termination;
- one ambiguous case requiring investigation or judgment;
- one exception, escalation, rework loop, or handoff; and
- one case involving several related work items when the Process claims to
  coordinate them.

Check whether the Process preserves authority, uncertainty, evidence, and
stakeholder value through every path. Revise the smallest incorrect boundary
or relationship rather than adding speculative branches for every imaginable
future case.

## Final check

- The name communicates an intended result rather than a team, tool, or queue.
- The description lets a reader recognize the triggering condition and
  intended closing outcome before opening the full definition.
- Stakeholders, value, authority, scope, trigger, closing outcome, and
  termination are explicit.
- Inputs, outputs, activities, decisions, roles, resources, and material
  variation form a coherent transformation.
- Work items preserve cases and relationships without becoming the Process.
- Requirements and policies remain distinct from procedures and realization.
- Measures inform real outcome, conformance, or improvement decisions.
- Diagrams are views of one maintained model rather than competing sources.
- Representative scenarios fit without concealing uncertainty or exceptions.

## Related

- [Process](process.md)
- [OODA as the Gen Stack control loop](../control-loop/ooda-control-loop.md)
- [Software work items](../work-items/)
- [Documenting process requirements](/architecture/requirements/documenting-process-requirements.md)

[^process]: [Process](process.md) owns the definition, identity, authority, and
    neighboring-concept boundaries assumed by this authoring procedure.
[^bp-manifesto]: The BPTrends *Business Process Manifesto* is the attributed
    conceptual source for the business-process concerns selectively synthesized
    by this guide.
[^documenting-process-requirements]: [Documenting process requirements](/architecture/requirements/documenting-process-requirements.md)
    defines when a durable obligation belongs in a Process Requirement and why
    current procedures and workflow mechanics remain separate.
[^work-items]: [Software work items](../work-items/) routes to the semantic
    concepts and authoring guides for operational incidents, defect reports,
    Change Specifications, Bugfix Specifications, and their independently
    governed source and delivery work.
