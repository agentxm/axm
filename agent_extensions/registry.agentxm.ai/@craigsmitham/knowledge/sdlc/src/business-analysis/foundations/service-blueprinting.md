---
type: Explanation
title: "Service blueprinting: customer actions, visibility, and supporting processes"
description: How a service blueprint connects what a customer sees to the work behind it, and why a confirmation can reach a renter before the equipment is ready.
tags: [service-blueprinting, service-design, visibility, frontstage, backstage, touchpoints, fail-points, customer-journey, process-representation, business-analysis]
status: draft
sources:
  - id: shostack-blueprint
    resource: https://hbr.org/1984/01/designing-services-that-deliver
    title: G. Lynn Shostack — Designing Services That Deliver, Harvard Business Review 62/1 (1984)
  - id: bitner-blueprinting
    resource: https://journals.sagepub.com/doi/10.2307/41166446
    title: "Bitner, Ostrom & Morgan — Service Blueprinting: A Practical Technique for Service Innovation, California Management Review 50/3 (2008)"
  - id: nng-blueprint
    resource: https://www.nngroup.com/articles/service-blueprints-definition/
    title: "Sarah Gibbons — Service Blueprints: Definition, Nielsen Norman Group"
  - id: nng-template
    resource: https://www.nngroup.com/articles/service-blueprinting-template/
    title: "Nielsen Norman Group — Service Blueprinting: A Digital Template"
  - id: sdt-blueprint
    resource: https://servicedesigntools.org/tools/service-blueprint
    title: Service Design Tools — Service Blueprint
  - id: tisdd-methods
    resource: https://www.thisisservicedesigndoing.com/methods
    title: Stickdorn, Hormess, Lawrence & Schneider — This is Service Design Doing, method library
  - id: psd-guide
    resource: http://www.practicalservicedesign.com/the-guide/
    title: Practical Service Design — Practical Service Blueprinting, the guide
  - id: kalbach-mapping
    resource: https://experiencinginformation.com/mapping-experiences/
    title: Jim Kalbach — Mapping Experiences, author's book page
generated: { by: codex/gpt-6, at: 2026-11-22T01:50:07Z }
---

# Service blueprinting: customer actions, visibility, and supporting processes

A service blueprint represents a service as customer actions over time, together
with the visible and invisible organizational activity that delivers them. Its
distinguishing feature is a named boundary: activity a customer perceives is
drawn above a line of visibility, and activity a customer depends on but never
sees is drawn below it.[^bitner-blueprinting][^nng-blueprint]

Consider Northbank, a fictional equipment-rental company. A contractor can
receive a confirmation and still arrive to find the machine unavailable.
Tracing the contractor's steps shows when the promise was made and when it
failed. A blueprint can also show which work at the depot had to make those
two moments agree.

## The customer action anchors each column

Bitner, Ostrom, and Morgan describe five components of a typical service
blueprint. Customer actions run chronologically across the top, and the
remaining rows describe the organization supporting them.[^bitner-blueprinting]

| Component | Contains |
| --- | --- |
| Physical evidence | Tangible and digital artifacts the customer encounters at each step |
| Customer actions | Every step the customer takes as part of service delivery |
| Onstage / visible contact employee actions | Contact activity the customer sees, including self-service technology |
| Backstage / invisible contact employee actions | Contact activity the customer does not see, including non-visible interaction such as telephone work and preparation |
| Support processes | Activity by individuals and units who are not contact employees but whose work the service requires |

What separates blueprinting from other flowcharting approaches is that customer
actions are central and are laid out first, so every other activity can be read
as supporting the value offered to or created with the customer.
[^bitner-blueprinting]

### The three lines

Three horizontal lines divide those components, and each carries a distinct
meaning when an activity link crosses it.[^bitner-blueprinting][^nng-blueprint]

| Line | Separates | Meaning of a crossing |
| --- | --- | --- |
| Line of interaction | Customer actions from onstage actions | Direct contact with the customer or a self-service technology; Bitner, Ostrom, and Morgan call each crossing a *moment of truth* |
| Line of visibility | Onstage from backstage actions | The perceptual boundary: everything above is seen by the customer, everything below is invisible |
| Line of internal interaction | Backstage actions from support processes | An organizational boundary between contact employees and the functions supporting them |

The third line appears as *internal line of interaction* in the article's prose
and *line of internal interaction* in its component figure; both name the same
boundary.[^bitner-blueprinting]

Practitioner accounts describe the same structure as relationships among people,
props, and processes tied to the touchpoints of a specific journey, and add
optional rows such as time, regulatory constraint, employee emotion, and success
metrics when a particular question needs them.[^nng-blueprint][^nng-template]

### Variation in how the vertical axis is drawn

The five-row form is a convention, not a requirement of the idea. Some accounts
render the vertical axis as one lane per participating actor — people,
departments, organizations, machines — while retaining the division between
activity above and below the line of visibility.[^sdt-blueprint] The named lines
carry the technique's meaning; the number of lanes follows the service being
represented.

## Reading a blueprint

Across a row, a reader can follow a customer's experience over time. Down a
column, the question changes. What has to happen elsewhere so the service
can deliver at that moment? A link across the line of interaction marks an
encounter at which the customer can judge the service. A link from a support
process can explain what makes that encounter possible.[^bitner-blueprinting]

An empty cell invites investigation. It could mean the customer handles a step
alone, or that the team drawing the blueprint has overlooked someone else's
work. Staff at the depot can help distinguish those possibilities.

### A Northbank confirmation example

| Row | Request | Offer review | Acceptance | Handover day |
| --- | --- | --- | --- | --- |
| Physical evidence | Portal request form | Offer screen with terms | Confirmation screen and message, agreement document | Depot signage, the equipment |
| Customer actions | State capability, period, and site constraints | Review proposed capability, price, and acceptance conditions | Accept the offer and pay the deposit | Arrive at the depot and collect |
| Onstage | Portal accepts the request and displays candidate periods | Portal presents the offer and its acceptance conditions | Portal displays the confirmed reservation | Depot staff complete handover |
| Backstage | Depot console places a hold with an owner and expiry | Capacity check against the requested period | Deposit authorization; reservation recorded as Northbank's commitment | Preparation, inspection, and allocation of a specific asset |
| Support processes | Fleet records supply catalog, location, and readiness | Fleet records supply capacity evidence | Payment provider authorizes; database preserves the reservation; messaging provider delivers | Fleet and depot release judgment for *ready for handover* |

The vocabulary is the case's: a *request* carries no equipment promise, an *offer*
states acceptance conditions, a *hold* is temporary secured capacity, a
*confirmed reservation* is Northbank's recorded commitment, and *allocation*
assigns a physical asset. The blueprint does not redefine those
terms.

The confirmation appears in the acceptance column. Reading down from it shows
why the screen and the depot might tell different stories. A capacity check
can find a free machine at offer review. If the hold expires before acceptance
and another renter takes the last machine, that earlier check is already out
of date. A portal that issues a confirmation from the old check can promise
a machine the depot can no longer supply. The diagram gives staff a specific sequence to check against
booking records.

A second failure can give the contractor the same experience. Even a properly
secured reservation depends on inspection before handover. A machine might
fail inspection after the booking was accepted. Changing the confirmation
screen would leave that failure untouched. The two columns help locate where
the promise first lost its support.

## Origin and what was added later

In G. Lynn Shostack's 1984 shoeshine blueprint, the customer can watch the
polish go on. Someone had to select and purchase it earlier. Exhibit I labels
the boundary between those activities the *line of visibility*. The wrong
color is a marked fail point. Cleaning the shoe and trying again takes time,
so the error changes both the wait and the cost of the shine. A design that
accounts only for the successful visible steps would miss the price of
recovery.[^shostack-blueprint]

Bitner, Ostrom, and Morgan describe how later authors plotted the customer's
process against the structure of the organization, distinguished onstage from
backstage contact work, and gave physical evidence its own place. In their
five-component form the contractor's confirmation is an artifact, receiving
it is an experience, and securing the equipment takes work by people the
contractor may never meet. Each has its own place in the same column.
Shostack's visibility boundary survives in this more detailed account of who
takes part in a service encounter.[^bitner-blueprinting]

## Why the drawing starts with the customer

For Bitner, Ostrom, and Morgan, choosing a customer and a service gives the
blueprint its boundaries. A renter who collects a machine encounters depot
staff. A renter who takes delivery may only meet the driver. Drawing departments
first could hide that difference. Starting with the customer's steps lets the
team work back to the people, processes and physical evidence each encounter
requires.[^bitner-blueprinting]

People with different parts in the service can challenge the drawing. An
employee who sends confirmations may first hear from depot staff that
inspection happens the next day. That is one reason practitioners develop
blueprints together. A broad view can expose the handoff before anyone needs
a more detailed diagram of the inspection itself.[^bitner-blueprinting][^tisdd-methods][^psd-guide]

## Distinguishing blueprints from neighboring representations

Several representations in this bundle organize similar material differently.
Names alone do not settle which one a diagram is; examine what the rows and the
ordering mean.

| Representation | Organizing axes | Perspective | Internal activity |
| --- | --- | --- | --- |
| Service blueprint | Time and visibility | The organization delivering to a specified customer | Included, divided by named lines |
| Journey map | Time | The customer's experience, often with emotion | Not included |
| [Job map](jobs-to-be-done.md) | Stages of accomplishment | Solution-independent by commitment | Excluded by design |
| Process map, BPMN, UML activity | Control flow | The executing organization | Included, without a visibility division |
| Value stream map | Time | Flow of work, with lead and cycle time | Included, measured |
| [Wardley map](wardley-mapping.md) | Dependency and evolution | A named user need | Included as a dependency network |

Bitner, Ostrom, and Morgan position blueprinting as a visual process notation
that is deliberately less complex and less formal than UML, that accommodates
links to BPMN and UML sub-process documents, and that keeps attention on
human-to-human and human-to-technology interfaces at the firm boundary rather
than at the software engine level.[^bitner-blueprinting] Practitioner accounts
describe the blueprint as the counterpart to a customer journey map, extending
it into organizational infrastructure.[^nng-blueprint]

The boundary against a job map is the sharpest. A blueprint represents a
specific service arrangement; a job map deliberately represents
accomplishment independently of any arrangement. They answer different questions
and neither substitutes for the other.

### Visibility as a named classification

A blueprint supplies what a Wardley map does not: a discrete, named visibility
classification with defined regions either side of a stated line. A
[Wardley map](wardley-mapping.md)'s vertical axis expresses
visibility to the user as a position relative to the anchor, without
intermediate bands or units.

Two cautions follow when both representations are in use:

- A blueprint's regions are time-ordered lanes; a Wardley map's heights are
  dependency positions. A component low in a Wardley chain and a support process
  below a blueprint's internal line are not the same claim, and neither ordering
  converts into the other.
- Neither representation's vertical position expresses importance, and neither
  determines sourcing. A blueprint says nothing about how evolved a component
  is, so judging a supplier also requires evidence about available offerings. The blueprint can still show
  which handoffs the supplier would have to support.

## Applicability, limits, and further reading

Blueprinting is useful when a customer-perceived outcome depends on activity
spread across functions that no single group can see. Where the service is
narrow, or where visibility is not the question, its effort may be unjustified.

The reported benefits are practitioner and case-based. Bitner, Ostrom, and
Morgan report a common platform for participation, clearer organizational
vision, and insight into role and relational interdependencies across the
organizations they worked with.[^bitner-blueprinting] Those are documented
applications, not controlled evidence of effectiveness, and this bundle's
Northbank example is invented.

Four limits deserve stating:

- A blueprint of the intended service, without fail points or exceptions,
  removes what Shostack introduced the technique to expose.[^shostack-blueprint]
- One blueprint represents one scenario and one segment. A service normally
  needs several.[^bitner-blueprinting][^nng-blueprint]
- Position below the line of visibility describes perception, not consequence.
  An invisible support process can determine whether the service happens at all.
- The artifact decays. Its value concentrates in the cross-functional work that
  produces it and the interventions that follow.

For further reading: the two primary
sources[^shostack-blueprint][^bitner-blueprinting]; practitioner definitions and
a digital template[^nng-blueprint][^nng-template]; facilitation guidance for
running blueprinting as a workshop[^tisdd-methods][^psd-guide]; a tool-oriented
description including axis variants[^sdt-blueprint]; and Kalbach's treatment of
blueprints alongside journey maps, experience maps, and mental model diagrams as
alignment diagrams.[^kalbach-mapping]

## Continue exploring

- [Jobs to Be Done](jobs-to-be-done.md) supplies the customer progress a
  blueprint's top row should serve, and states the distinction from journey and
  process maps.
- [Wardley mapping](wardley-mapping.md) positions the same
  service by dependency and evolution, which a blueprint does not represent.

[^shostack-blueprint]: Shostack, Designing Services That Deliver, Harvard Business Review 62/1 (1984).
[^bitner-blueprinting]: Bitner, Ostrom & Morgan, Service Blueprinting: A Practical Technique for Service Innovation, California Management Review 50/3 (2008); components and lines in figure 1.
[^nng-blueprint]: Gibbons, Service Blueprints: Definition, Nielsen Norman Group.
[^nng-template]: Nielsen Norman Group, Service Blueprinting: A Digital Template.
[^sdt-blueprint]: Service Design Tools, Service Blueprint.
[^tisdd-methods]: Stickdorn, Hormess, Lawrence & Schneider, This is Service Design Doing, method library.
[^psd-guide]: Practical Service Design, Practical Service Blueprinting, the guide.
[^kalbach-mapping]: Kalbach, Mapping Experiences.
