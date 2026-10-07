---
type: Explanation
title: "Use cases: goals, behavior, and incremental delivery"
description: How Cockburn's approach to use cases connects actor goals, system boundaries, success and failure scenarios, organizational alignment, and incremental delivery through user stories and story maps.
tags: [use-cases, alistair-cockburn, actors, goals, scenarios, extensions, behavioral-requirements, user-stories, story-maps, walking-skeleton, incremental-development, pe-foundations]
status: draft
sources:
  - id: mini-use-cases
    resource: "Alistair Cockburn, The Mini-Book on Use Cases, v1.1b, EPUB, Humans and Technology Press, 2025"
    title: Alistair Cockburn — The Mini-Book on Use Cases, v1.1b
  - id: unifying
    resource: "Alistair Cockburn, Unifying User Stories, Use Cases, and Story Maps, second edition, EPUB, Humans and Technology Press, 2025"
    title: Alistair Cockburn — Unifying User Stories, Use Cases, and Story Maps, second edition
  - id: slice-grow
    resource: "Alistair Cockburn, Slice the Problem, Grow the Solution, v0.95b, EPUB, Humans and Technology Press, 2026"
    title: Alistair Cockburn — Slice the Problem, Grow the Solution, v0.95b
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
---

# Use cases: goals, behavior, and incremental delivery

A use case brings together the ways an actor can pursue a particular goal
through interactions with a system, including paths that succeed and paths
that fail. Alistair Cockburn develops this idea, crediting Ivar Jacobson's
definition, into a way to align people on intended behavior, uncover difficult
questions, and support development in small increments.[^mini-use-cases]

This explanation is for product, design, and engineering readers deciding what
a use case tells them and how it relates to other work. It follows Cockburn's
recent books, with an original equipment-rental example. Connections to this
bundle's requirements and product practices are identified separately from
his account. The approach is available to the lifecycle; it is not a required
method for every project.

If the actor's goal is still an assumption, [Jobs to Be Done](jobs-to-be-done.md)
helps investigate why it matters and which alternatives people consider. The
use case develops behavior within a selected system boundary.

## What a use case explains, and why it matters

A **scenario** is one path through an interaction. A **use case** holds related
paths together under the goal they concern. “Reserve equipment” can include
reserving the requested equipment, accepting a substitute, or ending without a
reservation. The failed attempt belongs because the system must respond to it,
even though the actor does not achieve the goal.[^mini-use-cases]

Cockburn puts organizational alignment first among the benefits. Sponsors,
users, developers, testers, and trainers need a shared account of what will be
delivered. His next benefits are a structure for investigating overlooked
conditions, a behavioral specification, and an index around which related
project information can be organized. Readability makes these benefits
possible: an exact account that its intended readers cannot follow loses much
of its value.[^mini-use-cases]

That ordering changes what good writing looks like. A short account that lets
a depot manager identify a mistaken promise can be more useful at an early
stage than a detailed description of every input field. The conversation it
enables is part of the work. Writing alone cannot supply agreement, determine
unknown business rules, or demonstrate that the resulting service is valuable.

### Running example: reserving rental equipment

Consider [Northbank Equipment](../northbank-equipment.md), the fictional rental
company also used in the [DDD explanation](domain-driven-design.md#running-example-equipment-rental).
Customers want suitable equipment when their work requires it; the company
must make promises it can fulfill, sometimes through substitutes. Assume it is
considering a reservation application with an external payment service.

The examples below are illustrative design choices, not observed customer
needs or approved requirements. They distinguish making a reservation from
the longer process of collecting, using, and returning equipment. A confirmed
reservation concerns an agreed equipment capability and period; it need not
assign one physical machine immediately.

## Actors, goals, and the system boundary

An **actor** is something with behavior outside the chosen system boundary.
It can be a person, organization, device, or another software system. The
**primary actor** seeks the service that gives the use case its goal. A
**secondary actor** supplies a service or receives a notification when the
system calls on it. In Cockburn's account, the distinction concerns who
initiates the interaction, not whose work is more important.[^mini-use-cases]

For the reservation application, the customer is the primary actor and the
payment service is secondary. A depot employee using the application to record
equipment collection would be a primary actor in another use case. An actor's
role is relative to the interaction being described.

The **system boundary** says what is inside the subject being described and
what must be named as an external collaborator. Use cases can describe a
software application or a broader business process. Changing that boundary
changes the account.[^mini-use-cases]

| Chosen subject | What the account makes visible |
| --- | --- |
| Reservation application | Customer requests, the application's responses, and interactions with the external payment service |
| Rental business | Customer dealings with the company, including reservation, depot handover, and return; internal software can remain hidden |
| Payment service | Requests from client applications and responses about payment; the reservation application is now outside the boundary |

Keeping the application opaque leaves its internal implementation open while
still naming interactions on every external side. “The application asks the
payment service to authorize the deposit” identifies a dependency and a
responsibility. “The application inserts a payment row and dispatches a worker”
introduces internal design choices. Cockburn's boundary discipline asks business
and technical participants to collaborate: either group alone may miss an
external actor or misunderstand who provides a service.[^mini-use-cases]

This does not make a use case free of all design decisions. Choosing a system
boundary and proposed behavior already shapes a solution. Within this bundle's
[account of design](../overview.md), leaving internal implementation open is
compatible with making a behavioral commitment.

## Goal levels and the relationship between use cases

Goals can contain subgoals. Cockburn uses an altitude metaphor to help readers
recognize the scale of an accomplishment and keep steps at understandable
levels. The durations are orientation aids, not fixed timing requirements or
estimates of development effort.[^mini-use-cases][^unifying]

| Goal level | Meaning | Rental example |
| --- | --- | --- |
| Kite | A broader accomplishment spanning several interactions, potentially over days or longer | Rent equipment for a building job, from reservation through return |
| Sea | A user goal or business task completed in a coherent sitting | Reserve equipment for an agreed period |
| Fish | A supporting subfunction worth elaborating because it is complex or reused | Authenticate the customer |
| Clam | A warning that the fragment is too small to merit a separate use case | Select one date field |

Asking **“How?”** moves toward subgoals. Asking **“In order to accomplish
what?”** moves toward the larger goal. Reserving equipment is one contribution
to renting it; authenticating may contribute to making a reservation. The
question concerns the relationship between accomplishments, so “because it is
important” does not identify a higher goal.[^mini-use-cases]

A use case title names a goal, and an action step can name a subordinate goal
that another use case elaborates. Expansion is useful when the subordinate
interaction has enough complexity or reuse to deserve its own account. Most
steps need no separate document. Excessive fragmentation makes readers
reconstruct the story from many tiny pieces.[^mini-use-cases]

Goal level and precision are independent. A detailed account of the rental
lifecycle remains kite-level; a one-line title for authentication remains
fish-level. A sea-level reservation may require weeks of engineering, while an
important change to a fish-level function may be small. These distinctions keep
the user-goal structure from becoming an accidental project schedule.

## The shape of a use case

Cockburn's compact structure names the goal, system, primary actor, and goal
level, followed by a **main success scenario** and **extensions**. The main
scenario shows a typical successful path. Extensions attach alternative
conditions and their handling to it. Casual prose and numbered steps can
express the same underlying shape.[^mini-use-cases]

A trigger identifies what starts the interaction; a precondition states what
is already assumed when it begins. They are useful when the boundary would
otherwise be unclear. Assuming that a customer is authenticated, for example,
puts the authentication interaction outside this use case's flow. It does not
describe how authentication succeeds or what happens when it fails.

### Reserve equipment — an illustrative account

| Context | Value |
| --- | --- |
| System | Reservation application |
| Primary actor | Customer |
| Secondary actor | Payment service |
| Goal level | Sea |
| Trigger | Customer requests an equipment reservation |
| Precondition | Customer is authenticated to an existing account |
| Successful result | Customer has a confirmed reservation for the agreed capability and period, with the required deposit authorization |

**Main success scenario**

1. Customer supplies the required equipment capability and rental period.
2. Application presents a reservable offer, price, and rental terms.
3. Customer accepts the offer and supplies the required payment information.
4. Application secures the offered capacity for this reservation attempt and
   obtains deposit authorization from the payment service.
5. Application confirms the reservation and presents its reference and
   collection instructions to the customer.

**Selected extensions**

| Condition | Handling |
| --- | --- |
| 2a. Requested capability is unavailable for that period | Application offers available substitutes or other periods. Customer revises the request and resumes at step 2, or ends without a reservation. |
| 4a. The offered capacity can no longer be secured | Application explains the change and returns to step 2 with current offers, or ends if the customer declines. Deposit authorization is not requested. |
| 4b. Payment service declines authorization | Application releases the capacity secured for the attempt. Customer changes payment information and retries from step 4, including securing capacity again, or ends without a reservation. |
| Before step 4, customer withdraws the request | Application ends the attempt without creating a reservation or requesting deposit authorization. |

The account deliberately groups several actions by what they accomplish. Step
4 specifies the required external result and ordering without choosing locks,
queues, database transactions, or a payment protocol. It still needs further
analysis: an uncertain payment result and a failure after authorization are
unresolved, as discussed below. This is a readable working account, not a
complete specification of a payment workflow.

Each step names who acts and what the action accomplishes. “Customer accepts
the offer” leaves room for a voice interface, assisted service, or a screen.
“Customer clicks the green button” ties the account to one interface. In
Cockburn's writing style, the main path states successful actions; the
extensions answer what happens when those actions cannot succeed.[^unifying]

## Extensions: where difficult questions emerge

An **extension condition** is a circumstance requiring another path. Its
**handling** describes the response. Extensions include ordinary alternatives,
recoveries, and failures; they are broader than program exceptions. In numbered
use cases, a label such as `4b` connects the condition to step 4. The letter
distinguishes conditions rather than prescribing their execution order.
[^mini-use-cases]

This structure makes an apparently simple reservation consequential. “Payment
is declined” and “the payment result is unknown” need different handling. If
authorization succeeded but confirmation failed, has the customer reserved
equipment? Is capacity still held? Who resolves the uncertainty? Writing these
conditions exposes missing decisions rather than providing their answers.

The working account leaves at least these questions open:

| Unresolved condition | Decision it exposes |
| --- | --- |
| Payment service does not return a definite result | How the customer learns the attempt's status, how uncertainty is resolved, and what prevents a second authorization |
| Confirmation fails after authorization | Which commitment exists, what happens to held capacity and authorization, and who completes recovery |
| Customer withdraws while authorization is underway | When withdrawal can take effect and how the pending attempt is resolved |

Brainstorming conditions can precede deciding their handling. Cockburn's
sketch-and-expand strategy separates those activities so the team can inspect
the problem's shape before spending effort on every branch. Conditions likely
to conceal cost, risk, or important business policy deserve earlier attention.
The technique helps people discover omissions; it cannot prove that every
possible circumstance has been identified.[^mini-use-cases]

Cancellation also illustrates a scope distinction. Abandoning an unfinished
reservation attempt can be an extension. Cancelling a confirmed reservation
the following day is a new goal with its own entry conditions, refund policy,
and possible failures. It can become another sea-level use case connected by
the kite-level rental process. Treating all later events as extensions to the
original attempt would obscure where that attempt ends.

When a scenario leaves several plausible experiences open,
[Buxton's design account](buxton-design.md#elaboration-and-reduction-developing-alternatives-and-making-choices)
explains how sketching and comparing alternatives can inform the choice.
A use case exposes behavior to consider; it does not uniquely specify an interface.

## Precision, readability, and progressive elaboration

**Precision** concerns how much detail is expressed. A list of actor goals,
short narratives, and more structured scenarios can all be useful at different
points. Cockburn advises deliberately managing precision even after the author
knows more: every known detail need not appear in every account.
[^mini-use-cases][^unifying]

For the rental system, a list containing “Reserve equipment,” “Collect
equipment,” and “Return equipment” already supports a scope discussion. A
kite-level narrative connects them. Expanding the reservation's success path
and listing extension conditions then exposes questions about availability,
payment, and commitments. Resolving selected branches adds precision where it
can influence a decision or near-term implementation.

That is the logic of **sketch-and-expand**: retain a broad view while deepening
the portions that matter next. Writing and development can progress together.
Cockburn also describes circumstances, such as pricing a fixed-scope contract,
that require substantial investigation before implementation. Incremental
elaboration is a strategy to fit the situation, not a claim that preliminary
analysis is always wasteful.[^mini-use-cases]

Detail also has a better home when its shape differs. A payment-data schema,
an interaction prototype, and a response-time obligation answer questions the
behavioral narrative does not settle. Link them from the relevant use case
instead of repeating their contents in every step. Cockburn warns both against
overloading use cases and against forgetting the other requirements entirely.
[^mini-use-cases]

Readable does not mean vague about a consequential branch. The uncertain
payment result may remain an explicit open question during exploration; a
release that actually encounters it needs an agreed treatment. Simplicity is
valuable when it helps the intended readers understand and challenge the
behavior, not when it hides unresolved commitments.

## Growing an implementation from a use case

A use case's coherence does not require implementing it in one increment.
Cockburn distinguishes understanding the complete behavior from writing,
building, and delivering it all at once. His later account emphasizes growing
a functioning system: useful slices connect the parts needed to exercise the
behavior, and successive stages enrich what already works.
[^mini-use-cases][^slice-grow]

A **walking skeleton** is a very small implementation that supports an
end-to-end function. It can expose technical integration problems before the
system has its full capabilities. A skeleton through a business process can
also deliver early value, but technical connectivity alone does not establish
commercial usefulness.[^mini-use-cases][^slice-grow]

For example, a technical skeleton might accept a fixed reservation request,
use a simulated payment response, save a test reservation, and return its
reference. It demonstrates a connected path. A restricted live service needs
more: valid promises about actual capacity, appropriate payment handling, and
a workable handover to the depot. These are different completion claims.

### Dimensions of growth

Cockburn's slicing techniques extend beyond dividing a narrative into steps.
They include branches, partial steps, data, variations in technology, business
rules, and separating learning from implementation.[^mini-use-cases][^slice-grow]

| Dimension | Possible rental increment | What it contributes |
| --- | --- | --- |
| Supported scope | One depot, one equipment category, and a restricted rental period | A smaller operating situation in which the full reservation can be exercised |
| Alternate flow | Let customers accept an available substitute | Another way to achieve the same goal |
| Data and rules | Add multi-item requests after single-item reservations | Broader requests without requiring all combinations initially |
| Interaction variation | Add assisted reservations after customer self-service | Another way to perform the behavior |
| Learning | Investigate uncertain authorization results against a payment-service test environment | Evidence about an integration decision before committing the production implementation |

These are candidate growth dimensions, not a release sequence. Supporting a
payment method also brings its relevant failures into scope; moving a branch
later on a plan does not remove an obligation from a live service. A limited
offering can narrow what it promises, provided the operating arrangement
actually supports that promise.

Cockburn's **disciplined learning** makes learning an explicit part of the
plan. Some early work tests assumptions about the product, technology, team,
or cost. Other work grows delivered value; later refinements may be optional.
His learning–value–tail distinction helps explain why the next useful increment
may resolve uncertainty instead of adding the most visible feature.
[^slice-grow]

Several distinctions follow. A technical increment can be demonstrable without
being ready for customers. A release may combine pieces from several use cases
to support one coherent business process. A learning experiment may inform the
implementation without becoming part of it. This separation lets a team report
what it has learned, built, and released without treating them as the same
accomplishment.

## Use cases, user stories, and story maps

Cockburn gives these artifacts different jobs. In his account, user stories
support conversations and serve as tokens for tracking work; use cases preserve
the behavioral agreement and its alternatives; story maps show how activities
and smaller work items combine into evolving deliveries.[^unifying]

| Artifact | What it keeps visible | Rental example |
| --- | --- | --- |
| Use case | A goal, its interaction context, and success and failure paths | Reserve equipment, including unavailable capacity and payment failure |
| User story | A discussed, bounded piece of work that can fit an iteration | Support an alternative payment method in the reservation flow |
| Story map | The broader process and coherent subsets proposed for delivery | Reservation, depot collection, and return, with successive supported variants |

Cutting a fragment from a use case does not necessarily produce another use
case. It may lack a complete goal-directed interaction and become a user story
or other development assignment. Conversely, a user story can concern data,
presentation, or performance that the use case mentions only briefly. The
relationship is not simply that stories are short use cases.[^unifying]

Cockburn proposes combining the three where their benefits are needed:
communicate the business behavior in use cases, organize delivery through a
story map, and track small pieces with stories. He also describes using fewer
artifacts when circumstances permit. Close collaboration and feedback can make
stories sufficient for small changes; a process spanning departments may need
a durable narrative that travels beyond the planning conversation.[^unifying]

In the rental example, completing many reservation stories could still leave
depot staff unable to recognize and fulfill a booking. A map that includes
collection exposes that missing part of a usable service. It supports a
judgment about delivery coherence; actual use is still needed to establish
whether the service helps customers and staff.

## Place in product engineering, applicability, and limits

Use cases are especially useful when people need to understand an interaction
across roles, investigate alternate behavior, or retain an agreement beyond a
single conversation. Their cost lies partly in the thinking they require:
participants must discover conditions and decide what should happen. A polished
format does not reduce that work to transcription.[^unifying]

### Connections to neighboring concepts

The following connections are this bundle's synthesis:

| Neighbor | Relationship to use cases |
| --- | --- |
| [Jobs to Be Done](jobs-to-be-done.md) | Investigates customer objectives, progress, and circumstances. A use case explores behavior within a selected system boundary; it does not establish the underlying demand or exhaust alternative solutions. |
| [Requirements](../solution/requirements/) | Determines which statements are accepted obligations and how their identity, conditions, and evidence are maintained. A use case can express behavioral requirements when that form is accepted. |
| [Domain-driven design](domain-driven-design.md) | Investigates the language and model behind behavior. A reservation scenario can reveal a distinction between promised capability and assigned equipment; it does not determine aggregates or bounded contexts. |
| [Executable specifications](../engineering/designing-executable-specifications.md) | Can exercise accepted rules through examples. Use case paths suggest cases to examine; the written narrative alone is not an executable check. |
| [Work items](../delivery/work-items/) | Coordinate changes to the product. Links can relate work to affected use cases without making a delivery ticket the permanent behavioral authority. |
| [Outcomes and evidence](../problem/outcomes-and-evidence.md) | Asks whether the delivered behavior produces the intended outcome. Conforming to a use case does not establish customer value. |

Cockburn explicitly permits use cases to serve as behavioral requirements,
including numbering individual steps and extensions for traceability. Their
behavioral focus leaves other parts of the specification to complementary
representations.[^unifying] A use case therefore need not be merely raw material
for a separate set of normative sentences.

This bundle's [requirements boundary](../solution/requirements/foundations/requirements-and-neighboring-artifacts.md)
adds an authority policy: normative behavior belongs in the project's accepted
requirements form. That form may be the use case itself, provided its
obligations satisfy the applicable requirements contract. If a project uses
separate requirement records, they remain authoritative and the narrative links
to them. The choice is project policy rather than a restriction inherent in
Cockburn's method; two independent normative copies would create ambiguity.

Cockburn also describes linking use cases to stories and BDD tests, crediting
Mike Vogel's approach.[^unifying] Such links can connect progress and test
results to behavior. In this bundle, the
[verification and validation distinction](../solution/requirements/foundations/verification-and-validation.md)
still applies: a passing example is evidence about the exercised behavior, not
proof of complete scenario coverage or of the usefulness of the goal.

### Where another representation helps

A use case works well when the information has a recognizable flow with
branches. Many interacting rule combinations may be clearer in a decision
table; a lifecycle with many possible transitions may need a state model;
data definitions need an appropriate data representation. Cockburn permits
combining forms rather than forcing every subject into use case prose.
[^mini-use-cases]

For rental cancellation, a decision table could express charges according to
notice period, equipment category, and booking terms. A state model could show
which operations are possible while payment is uncertain. The use case can
retain the customer-facing interaction and link to those authorities. None of
these representations alone supplies a complete system specification.

### Reading routes and source basis

This explanation draws on the following editions supplied as EPUBs. The source
descriptors identify the reviewed copies without depending on a private file
path. Section names are used where the mini-book's section numbering repeats.
The rental example and cross-concept connections are original synthesis.

| Reading purpose | Source and relevant portions |
| --- | --- |
| Understand the structure and purpose | *The Mini-Book on Use Cases*, v1.1b: “The use case body parts”; Part 2; and Part 4 on precision, goal levels, perspective, and readability |
| Understand progressive elaboration and slices | *The Mini-Book on Use Cases*, Part 3: “Sketch-and-expand, the writing strategy” and “Slicing development, in detail” |
| Relate the artifacts | *Unifying User Stories, Use Cases, and Story Maps*, second edition: Parts 3–6, especially the comparison of stories and use cases, story mapping, and ways to combine them |
| Connect slices to growth and learning | *Slice the Problem, Grow the Solution*, v0.95b: chapters 4, 5, and 8 on growth, disciplined learning, and deriving increments from use cases |

These are Cockburn's explanations and practitioner accounts, not independent
comparative evidence that the method improves every team's results. The
mini-book points to *Writing Effective Use Cases* for fuller treatment; that
earlier book was not part of the reviewed source set.

## From an unfinished account to accepted behavior

Northbank's reservation account deliberately leaves uncertain payment and
post-authorization failure unresolved. The simpler staff-confirmation pilot
and the later automatic allocation change are different scopes; this narrative
does not promise both in one investment.

The [commitment specimens](../solution/requirements/authoring/northbank-commitment-requirements.md)
show competing stakeholder accounts, a fictional acceptance decision, and
bounded replacement rules. The [allocation change](../engineering/northbank-allocation-change.md)
then chooses code responsibilities and evidence. A customer's goal exposes a
rule question; accepting the rule and choosing its transaction boundary are
further decisions. If the provider cannot secure capacity, return to the
solution and operating scope rather than silently weakening “confirmed.”

## Continue exploring

- [Requirements and neighboring artifacts](../solution/requirements/foundations/requirements-and-neighboring-artifacts.md)
  explains when a behavioral account carries an accepted obligation.
- [Domain-driven design](domain-driven-design.md) develops the language and
  models that a scenario can help uncover.
- The [behavior and commitment route](../reading-product-engineering.md#behavior-and-commitment)
  continues from these distinctions into specifications and verification.

[^mini-use-cases]: Alistair Cockburn, *The Mini-Book on Use Cases*, v1.1b, EPUB,
    Humans and Technology Press, 2025. Parts 1–4.
[^unifying]: Alistair Cockburn, *Unifying User Stories, Use Cases, and Story
    Maps*, second edition, EPUB, Humans and Technology Press, 2025. Parts 0–6;
    Part 3's “The fine print” discusses numbered requirements, and section 6.5
    credits Mike Vogel's linking approach.
[^slice-grow]: Alistair Cockburn, *Slice the Problem, Grow the Solution*,
    v0.95b, EPUB, Humans and Technology Press, 2026. Chapters 4, 5, and 8.
