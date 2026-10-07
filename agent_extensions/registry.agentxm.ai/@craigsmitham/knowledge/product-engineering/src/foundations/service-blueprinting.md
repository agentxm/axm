---
type: Explanation
title: "Service blueprinting: customer actions, visibility, and supporting processes"
description: How service blueprinting maps customer actions against onstage, backstage, and support activities separated by named lines of interaction, visibility, and internal interaction, and how that exposes touchpoints, fail points, and delivery responsibility.
tags: [service-blueprinting, service-design, visibility, frontstage, backstage, touchpoints, fail-points, customer-journey, process-representation, pe-foundations]
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
generated: { by: claude/opus-5, at: 2026-09-12T02:31:11Z }
---

# Service blueprinting: customer actions, visibility, and supporting processes

A service blueprint represents a service as customer actions over time, together
with the visible and invisible organizational activity that delivers them. Its
distinguishing feature is a named boundary: activity a customer perceives is
drawn above a line of visibility, and activity a customer depends on but never
sees is drawn below it.[^bitner-blueprinting][^nng-blueprint]

The technique comes from services marketing and operations rather than software.
The Northbank application and the comparisons with this bundle's other
representations are this bundle's synthesis. Explaining the technique does not
establish that it improves outcomes in software product work.

## What a blueprint represents

### The five components

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

Two operations produce most of the technique's findings.

**Read a vertical slice.** Take one customer action and read straight down. A
deep column beneath a small visible step shows substantial machinery serving a
brief moment. A visible step with nothing beneath it identifies work the
customer performs that no part of the organization supports.

**Count line crossings.** Crossings of the line of interaction locate where the
customer forms quality judgments. Crossings of the line of internal interaction
locate handoffs. Blueprinting reveals the touchpoints critical to meeting
customer needs and helps identify likely points of service
failure.[^bitner-blueprinting]

### A Northbank confirmation example

[Northbank Equipment](../northbank-equipment.md) needs contractors to understand
what a confirmation commits the business to. This blueprint scopes one scenario:
a small contractor requesting equipment through the portal for a job start, with
collection at the Central depot during the controlled one-depot pilot. Assisted
phone booking, delivery, substitution, and billing are excluded; a blueprint of
those needs its own scenario.

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

Three observations follow from the drawing, and each is a question for
investigation rather than a finding:

- The confirmation the customer perceives sits above a column containing a hold,
  a capacity check, a deposit authorization, and a durable write. The case's
  existing arrangement is that the portal can look reassuring before the
  underlying commitment is secure. In blueprint terms that is a frontstage claim
  crossing the line of interaction before the backstage state supports it.
- Fleet records appear as a support process under three separate customer
  actions. Fresh reads do not establish atomic reservation capability, so the
  same support row carries different obligations at different steps.
- *Ready for handover* sits entirely below the line of visibility until the
  final step, while the customer has treated confirmation as the promise since
  acceptance. The gap between those two judgments is invisible by construction.

A blueprint locates these concerns. Whether the confirmation wording, the hold
policy, or the fleet interface should change requires the evidence that
[requirement specimens](../solution/requirements/authoring/northbank-commitment-requirements.md)
and the [allocation change](../engineering/northbank-allocation-change.md)
examine.

## Origin and what was added later

Attributing the technique carefully matters, because the form most people use is
not the form it was introduced in.

| Contribution | Source | What it established |
| --- | --- | --- |
| Blueprinting as a service design and process-control technique | Shostack, *Designing Services That Deliver*, 1984[^shostack-blueprint] | Mapping the processes constituting the service, isolating fail points, establishing a standard execution time with acceptable deviation, and analyzing profitability |
| Plotting the customer process against organizational structure, and the onstage/backstage distinction | Later work identified in Bitner, Ostrom, and Morgan's account of the technique's evolution, including Shostack's 1987 *Service Positioning Through Structural Change* and Kingman-Brundage's 1989 *The ABC's of Service System Blueprinting*[^bitner-blueprinting] | The visibility division the modern form is built on |
| Physical evidence as a component, and visual, photographic, and video blueprints | Later adaptations identified in the same account[^bitner-blueprinting] | The top row of the standard five |
| The five-component, three-line teaching form | Bitner, Ostrom & Morgan, 2008[^bitner-blueprinting] | The layout, the moments-of-truth reading, and documented organizational applications |

Shostack's 1984 article does not use the term *line of visibility*. It does
distinguish parts of the service the consumer does not see, and argues those
invisible processes matter because changing them can alter how consumers
perceive the service.[^shostack-blueprint] Her four design steps, and especially
fail points and the separation of standard from acceptable execution time, are
the original contribution and are often omitted from later
retellings.[^shostack-blueprint]

Secondary accounts differ on the origin dating, variously citing Shostack's 1977
*Breaking Free from Product Marketing* alongside the 1984
article.[^sdt-blueprint] Treat a specific first-publication claim as unsettled
unless the cited edition is checked.

## Building a blueprint

Bitner, Ostrom, and Morgan describe an order that follows from customer actions
being the foundation.[^bitner-blueprinting]

1. Articulate the service process or sub-process, and specify which customer
   segment is the focus, because organizations modify processes for different
   segments.
2. Delineate customer actions first. Questions such as when the service starts
   and stops from the customer's point of view tend to generate considerable
   discussion.
3. Add onstage and backstage contact employee actions, then support processes.
4. Add the links connecting customer actions to contact activity and to needed
   support functions.
5. Add physical evidence last.

Blueprints are ideally developed by cross-functional teams, possibly including
customers.[^bitner-blueprinting] Published facilitation guidance treats the
workshop, not the artifact, as the primary
mechanism.[^tisdd-methods][^psd-guide]

The level of detail depends on the purpose for which the blueprint is
created.[^bitner-blueprinting] A *concept blueprint* shows only basic steps; any
stage can be expanded into its own sub-process diagram, and other process
diagramming tools may be more appropriate for detailing underlying
systems.[^bitner-blueprinting] Granularity that hides a handoff and granularity
that buries the decision are both failures of selection.

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
| [Wardley map](wardley-mapping/wardley-mapping.md) | Dependency and evolution | A named user need | Included as a dependency network |

Bitner, Ostrom, and Morgan position blueprinting as a visual process notation
that is deliberately less complex and less formal than UML, that accommodates
links to BPMN and UML sub-process documents, and that keeps attention on
human-to-human and human-to-technology interfaces at the firm boundary rather
than at the software engine level.[^bitner-blueprinting] Practitioner accounts
describe the blueprint as the counterpart to a customer journey map, extending
it into organizational infrastructure.[^nng-blueprint]

The boundary against a job map is the sharpest. A blueprint represents a
specific arrangement in full detail; a job map deliberately represents
accomplishment independently of any arrangement. They answer different questions
and neither substitutes for the other.

### Visibility as a named classification

A blueprint supplies what a Wardley map does not: a discrete, named visibility
classification with defined regions either side of a stated line. A
[Wardley map](wardley-mapping/wardley-mapping.md)'s vertical axis expresses
visibility to the user as a position relative to the anchor, without
intermediate bands or units.

Two cautions follow when both representations are in use:

- A blueprint's regions are time-ordered lanes; a Wardley map's heights are
  dependency positions. A component low in a Wardley chain and a support process
  below a blueprint's internal line are not the same claim, and neither ordering
  converts into the other.
- Neither representation's vertical position expresses importance, and neither
  determines sourcing. A blueprint says nothing about how evolved a component
  is, so it cannot inform a build-or-buy judgment; that question belongs to
  evolution and its evidence.

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
- [Wardley mapping](wardley-mapping/wardley-mapping.md) positions the same
  service by dependency and evolution, which a blueprint does not represent.
- [Use cases](use-cases.md) express actor goals and scenarios that can become
  normative behavioral requirements; a blueprint locates where those scenarios
  touch the organization.
- [SLIs, SLOs, and SLAs](service-level-indicators-objectives-and-agreements.md)
  connect a support process's measured behavior to what a customer perceives
  above the line of visibility.

[^shostack-blueprint]: Shostack, Designing Services That Deliver, Harvard Business Review 62/1 (1984).
[^bitner-blueprinting]: Bitner, Ostrom & Morgan, Service Blueprinting: A Practical Technique for Service Innovation, California Management Review 50/3 (2008); components and lines in figure 1.
[^nng-blueprint]: Gibbons, Service Blueprints: Definition, Nielsen Norman Group.
[^nng-template]: Nielsen Norman Group, Service Blueprinting: A Digital Template.
[^sdt-blueprint]: Service Design Tools, Service Blueprint.
[^tisdd-methods]: Stickdorn, Hormess, Lawrence & Schneider, This is Service Design Doing, method library.
[^psd-guide]: Practical Service Design, Practical Service Blueprinting, the guide.
[^kalbach-mapping]: Kalbach, Mapping Experiences.
