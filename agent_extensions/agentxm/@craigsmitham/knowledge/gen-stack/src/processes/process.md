---
type: Explanation
title: Process
description: How a Process defines bounded, triggered, outcome-oriented work that creates or preserves stakeholder value, and how it differs from a work item, workflow, procedure, practice, capability, and governing obligation.
tags: [process, business-process, process-model, work, activities, events, outcomes, value, stakeholders, resources, workflow, work-items]
status: draft
sources:
  - id: bp-manifesto
    resource: https://bptrends.info/wp-content/manifesto/pdf/BPManifesto_EN_Letter.pdf
    title: BPTrends — Business Process Manifesto
  - id: documenting-process-requirements
    resource: /architecture/requirements/documenting-process-requirements.md
    title: Documenting process requirements
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T19:12:18Z
---

# Process

> **Authority:** The [Gen Stack vocabulary and relationship
> model](/glossary.md) is authoritative for canonical terms and relationships.
> This Explanation develops understanding without redefining them. When it
> discusses a profile-governed corpus representation, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) governs that representation.
> This document adds neither semantic authority nor profile-conformance rules.

A **Process** is a reusable, bounded description of coordinated human and
automated work that begins in response to one or more events, transforms
information or state through activities, and ends in an intended outcome that
creates or preserves value for identified stakeholders.

The definition draws on the Business Process Manifesto's account of work,
outcomes, stakeholders, resources, context, and events while establishing a
distinct Gen Stack synthesis.[^bp-manifesto]
Here *Process* means a work Process within a software-change system—not an
operating-system process, a statistical process, a single executable, or an
unqualified synonym for procedure.

For the authoring procedure, use [Defining a Process](defining-a-process.md).

## Orientation

| | |
| --- | --- |
| **Central question** | What standing arrangement of work turns a meaningful trigger into a valuable outcome? |
| **Unit** | A reusable model of work, not one occurrence or one ticket |
| **Identity** | Intended outcome and boundary, supported by a stable name |
| **Enactment** | One performance of the Process in particular circumstances |
| **Authority** | Must be declared; documentation alone does not make the Process binding |
| **Realization** | People, procedures, workflow definitions, automation, tools, and other resources |

## The shape of a Process

A useful Process description joins concerns that a diagram alone cannot own:

- **Purpose and value** — the stakeholders for whom the Process matters, the
  value it intends to create or preserve, and the wider outcome it supports.
- **Boundary and context** — where the Process applies, what is outside it,
  and the organizational, product, system, or operational setting in which it
  runs.
- **Trigger and completion** — the event or condition that starts one
  enactment and the outcome, termination condition, or decision that ends it.
- **Routing preview** — a one-sentence description that names the triggering
  event or condition and the intended closing outcome so a reader can
  recognize when this Process applies before opening the full definition.
- **Inputs and outputs** — the information, artifacts, materials, state, or
  requests received from stakeholders or upstream Processes and delivered to
  stakeholders or downstream Processes.
- **Activities and decisions** — the work, branches, handoffs, waits, and
  judgments that transform the inputs or state into the intended outcome.
- **Roles and resources** — the accountable stewardship, participants,
  knowledge, technology, facilities, and other capabilities required to do the
  work.
- **Guides and constraints** — the Requirements, policies, standards, rules,
  principles, and procedures that direct or bound the work.
- **Measures and evidence** — the observations used to assess outcomes, flow,
  quality, safety, conformance, and opportunities for improvement.
- **Views and realization** — the prose, tables, diagrams, procedures, and
  workflow or automation definitions through which people understand and
  perform the Process.

These concerns describe one concept from complementary perspectives. They are
not required lifecycle phases or a universal frontmatter schema.

## Definition, enactment, and record

The standing Process, its performance, and its records have different
identities:

| Concept | What it establishes |
| --- | --- |
| **Process definition** | The reusable purpose, boundary, activities, roles, relationships, and intended outcome |
| **Process enactment** | What happened when the Process was performed for particular inputs, events, participants, and conditions |
| **Work item** | A durable case record preserving lifecycle state, evidence, decisions, authority, and relationships relevant to one occurrence or body of work |
| **Process evidence** | Observations about an enactment or aggregate performance, no broader than their sources and methods support |

One Process can be enacted many times. An enactment can involve several work
items, and a work item can participate in several Processes. For example, an
operational incident can activate coordinated response, contribute evidence to
a defect-management Process, and later relate to independently governed
delivery work.

## Process and work item

A Process coordinates work across cases; a work item preserves a case. The
work item's type, fields, and status can support the Process without defining
it completely.

This distinction protects relationships that ticket-conversion pipelines tend
to erase. Several source requests may inform one normalized opportunity; one
defect report may collect several occurrences; an incident may produce several
follow-up items; and one accepted change may address several work items. A
Process should state how those records are created, related, split, combined,
handed off, or closed without pretending that renaming or moving a ticket
transforms its semantic authority.

## Neighboring concepts

| Concept | Difference from a Process |
| --- | --- |
| **Activity or task** | One unit of work; it may be decomposed as a narrower Process when it has an independently meaningful outcome and boundary |
| **Workflow** | A defined coordination or automation that realizes part or all of a Process; a tracker workflow is one host-specific realization |
| **Procedure** | Detailed instructions for performing a bounded activity or role contribution |
| **Plan** | A situated commitment or intended course for a particular objective or occurrence rather than a reusable model |
| **Practice** | The wider social, skilled, normative, and material structure that makes the modeled work intelligible and performable |
| **Capability** | An outcome-oriented ability independent of the Process, people, or technology that realizes it |
| **Process Requirement** | A binding obligation on lifecycle, development, operation, or governance; it states the required outcome without absorbing the full procedure or workflow |
| **OODA control loop** | The adaptive control model that Observes, Orients, Decides, and Acts across Gen Stack authorities and activities; it is not a mandatory four-stage Process template |

A Process may depend on a Capability, participate in a Practice, be realized
by several workflows and procedures, and be constrained by several
Requirements. None of those relationships makes the concepts interchangeable.

## Structured and variable work

A Process need not be rigid or repetitive. The Business Process Manifesto
explicitly includes both highly structured work and loosely structured work
with substantial variation.[^bp-manifesto] A Process can therefore contain
discretion, investigation, competing hypotheses, parallel work, escalation,
or an authorized decision to stop.

Decomposition is recursive: an activity may be treated as a Process at a
narrower level when its outcome and boundary matter independently. Decompose
only far enough to clarify responsibility, risk, evidence, handoff, reuse, or
improvement. A box does not earn independent Process identity merely because a
modeling tool permits another level.

## Value and performance

Completion is not the same as value. A Process can reach its closing state
while producing a poor outcome, imposing disproportionate cost, or shifting
harm to another stakeholder. Measures should therefore connect performance to
the intended outcome and its material consequences, not only to activity
counts or ticket velocity.

Useful evidence commonly spans:

- **outcome** — whether stakeholders received or retained the intended value;
- **flow** — elapsed time, waiting, work in progress, handoffs, and
  abandonment;
- **quality** — correctness, completeness, rework, recurrence, and residual
  uncertainty;
- **safety and conformance** — whether applicable boundaries and obligations
  were respected; and
- **experience and cost** — the attention, effort, resources, and avoidable
  friction borne by participants and stakeholders.

Not every activity needs its own indicator. Add a measure when it informs a
real decision, tests a material assumption, demonstrates an obligation, or
reveals a meaningful performance gap. Measures are witnesses of Process
performance, not the value or authority itself.

## Model and diagram

A **Process model** is the maintained body of meaning about the Process and
its environment. A **Process diagram** is one perspective selected for a
particular audience or question. A notation supplies constructs for expressing
that perspective; it is not the model itself.[^bp-manifesto]

This is why the definition must survive without its picture. A flow diagram
may communicate activities and handoffs well while omitting purpose,
authority, stakeholder value, inputs and outputs, decision rationale,
resources, measures, or exceptions. Store those meanings with the diagram and
keep each view consistent with the same Process identity.

The definition can become more complete as the Process is understood. Early
work may establish purpose and boundary before every activity, resource,
exception, or measure is known. Preserve material unknowns and their review
triggers rather than filling the model with guesses; complete the attributes
that a decision or enactment actually depends on before relying on the model.

The preview is not a substitute for the boundary. A useful shape is: “When
`[trigger]` occurs in `[context]`, this `[descriptive | recommended |
normative]` Process coordinates `[work]` until `[closing outcome]`.” Keep
access, information, and state preconditions in the body; they do not explain
what begins an enactment.

## Descriptive and normative authority

A Process description must state what authority it claims:

- **Descriptive** — how work is understood or observed to happen now.
- **Recommended** — a non-binding way of coordinating the work.
- **Normative** — work required by an identified Requirement, policy,
  standard, contract, regulation, or other recognized authority.

Do not infer normative force from completeness, diagram formality, common
practice, automation, or tracker enforcement. When an accepted obligation on
system work is durable enough to belong with an Architecture subject, the
Process Requirement owns that obligation; the Process model, workflow, and
procedure remain distinct realizations or witnesses.[^documenting-process-requirements]

## Naming and stewardship

Prefer one stable, active, outcome-oriented name within the Process's governed
scope. The name should communicate the intended result without encoding the
current performer, location, tool, or detailed method. This keeps identity
stable when realization changes while leaving room for aliases at integration
boundaries.[^bp-manifesto]

A steward maintains the definition, relationships, and review triggers. The
steward does not thereby acquire authority to change every Requirement,
policy, work item, or system touched by the Process.

## Related

- [Defining a Process](defining-a-process.md)
- [OODA as the Gen Stack control loop](../control-loop/ooda-control-loop.md)
- [Software work items](../work-items/)
- [Documenting process requirements](/architecture/requirements/documenting-process-requirements.md)
- [Capabilities in software architecture](/architecture/capabilities/capabilities.md)

[^bp-manifesto]: The BPTrends *Business Process Manifesto* supplies the
    conceptual source concerning work, value, resources, context, motivation,
    names, models, variation, and performance used in this original synthesis
    without adopting a particular process-management methodology.
[^documenting-process-requirements]: [Documenting process requirements](/architecture/requirements/documenting-process-requirements.md)
    keeps a durable binding outcome separate from the procedure, workflow, or
    automation used to satisfy it.
