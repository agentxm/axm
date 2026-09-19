---
type: Explanation
title: "Bill Buxton's approach to design: sketching, alternatives, and experience"
description: How Bill Buxton connects experience, sketching, alternative concepts, and prototype evaluation, with an interpretation for choosing and revising product commitments.
tags: [bill-buxton, design, sketching, user-experience, interaction-design, alternatives, elaboration, reduction, prototypes, fidelity, critique, pe-foundations]
status: draft
sources:
  - id: why-sketch
    resource: https://saul.cpsc.ucalgary.ca/sketchbook/wp-content/uploads/Chapter-1.2a-WhyShouldISketch.ppt
    title: Greenberg, Carpendale, Marquardt, and Buxton — Why Should I Sketch? Workbook presentation
  - id: what-is-a-sketch
    resource: https://saul.cpsc.ucalgary.ca/sketchbook/wp-content/uploads/Chapter-1.2b-WhatIsASketch.ppt
    title: Greenberg, Carpendale, Marquardt, and Buxton — What Is a Sketch? Workbook presentation
  - id: prototypes
    resource: https://www.oreilly.com/library/view/sketching-user-experiences/9780123740373/OEBPS/B9780123740373500596.htm
    title: Bill Buxton — Sketches are not Prototypes, public chapter preview
  - id: experience
    resource: https://news.microsoft.com/speeches/bill-buxton-mix09/
    title: Bill Buxton — MIX09 keynote transcript
  - id: alternatives-study
    resource: https://www.billbuxton.com/rightDesign.pdf
    title: Tohidi, Buxton, Baecker, and Sellen — Getting the Right Design and the Design Right (CHI 2006)
  - id: user-sketches
    resource: https://www.billbuxton.com/UserSketches.pdf
    title: Tohidi, Buxton, Baecker, and Sellen — User Sketches (NordiCHI 2006)
  - id: workbook
    resource: https://sketchbook.cpsc.ucalgary.ca/
    title: Sketching User Experiences — The Workbook, authors' companion resources
  - id: overview
    resource: ../overview.md
    title: Product engineering overview
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
---

# Bill Buxton's approach to design: sketching, alternatives, and experience

Bill Buxton gives exploration a central place in product development.
Sketching helps teams consider different experiences before committing to
one.[^why-sketch]

This explanation is for product, design, and engineering colleagues who want
to understand how representations support those choices. It draws on the
authors' teaching materials accompanying *Sketching User Experiences: The
Workbook*, Buxton's public talk and chapter preview, and two coauthored
studies. It is a focused account of these ideas, not a survey of his entire
work. The rental-service example is fictional; its judgments and the
connections to this bundle are editorial interpretations.

The case follows Northbank's confirmation exploration. Its later allocation
and engineering-system episodes are separate investments, not capabilities
assumed to exist in the sketches below.

## Getting the right design and getting the design right

**Getting the right design** concerns which concept is worth developing.
**Getting the design right** concerns improving the chosen concept. Buxton
and his coauthors explain why repeated improvements to one proposal can leave
better possibilities unexplored. Developing alternatives makes comparison
possible; refining one idea alone supplies no such comparison.[^why-sketch]

Imagine [Northbank Equipment](../northbank-equipment.md), whose customers
struggle to arrange equipment delivery. A team could make its booking calendar easier to read and operate.
That could improve the calendar while leaving an earlier question unanswered:
should customers have to work out the delivery arrangement themselves?
A guided request or a few suggested appointments might distribute that work
differently. Each deserves examination before the calendar becomes the
assumed solution.

The distinction identifies two kinds of uncertainty. It does not require a
complete design phase before engineers participate. An inventory constraint
can make a proposed appointment impossible; exploring that constraint can
change the concept. Likewise, a usability problem can reveal that the team
needs a different interaction rather than another adjustment to the same one.

## The experience is the subject of design

In his MIX09 keynote, Buxton separates an object's appearance from its
interface and the experience of using it. He emphasizes time, pacing, and
the alternative paths an interaction can take. His demonstrations use simple
representations to explore sequences and transitions before implementing
them.[^experience]

For the rental service, the experience includes arranging a crew, requesting
delivery, waiting for a reply, understanding whether equipment is promised,
and responding when circumstances change. A confirmation screen is one
moment in that sequence. A screen that looks reassuring could still leave
the customer uncertain about whether to send the crew to the site.

Different representations expose different questions. A sequence of frames
can show when the customer learns about a delay. An enactment between a
customer and dispatcher can expose who must act next. A transition diagram
can make the difference between a request, an offer, and a confirmed booking
visible. These are illustrative choices of medium; the question determines
which detail needs to be represented.

## Sketching as a way of thinking

The workbook's account treats sketching as a means to express, develop, and
communicate ideas. Making a representation can change what its maker sees;
sharing it makes the proposal available for others to question.[^why-sketch]

Its teaching materials describe sketches as quick, timely, disposable, and
plentiful. They leave room for interpretation, use only the detail needed for
their purpose, and signal how provisional the underlying idea remains. A
sketch's finish should fit the state of the concept.[^what-is-a-sketch]

Suppose the team draws a delivery offer with an acceptance button. Adding the
next frame raises a new question: what happens if another customer takes that
appointment first? The representation has helped uncover a decision. Making
the button visually polished would not answer it.

Deliberate incompleteness still needs a focus. Leaving colors undecided may
help the team discuss the booking sequence. Leaving the meaning of acceptance
undecided prevents it from discussing whether the customer can rely on the
offer. In this example, useful roughness means omitting distractions while
making the uncertain commitment visible enough to examine.

## Elaboration and reduction: developing alternatives and making choices

**Elaboration** generates possibilities; **reduction** selects those worth
pursuing. The workbook presents these as recurring movements: develop
alternatives, compare them, elaborate promising directions, and narrow again.
Its presentation credits Paul Laseau's *Graphic Thinking for Architects &
Designers* for this account. Buxton's approach therefore includes ideas
developed by other designers, rather than originating every element it
uses.[^why-sketch]

For the rental problem, the first comparison might look like this:

| Candidate experience | What it lets the customer do | Assumption to examine |
| --- | --- | --- |
| Availability calendar | Browse and select a delivery appointment | Customers can interpret availability and coordinate it with their work |
| Guided request | Describe equipment, site, and timing constraints for a dispatcher to resolve | Customers can tolerate waiting, and dispatchers can respond reliably |
| Suggested appointments | Compare a small set of feasible offers | The service has enough trustworthy information to generate useful offers |

These concepts allocate effort and responsibility differently. Three color
schemes for the same calendar would leave those differences unexplored.

Reduction also creates new questions. If suggested appointments look promising,
the team could explore alternative ways to explain why an appointment is
offered, hold it temporarily, or request an exception. Features from one
candidate may inform another: a guided request could become the fallback when
no suggested appointment works.

For this example, discarding a concept means retaining the reason it was set
aside: perhaps the calendar concealed delivery constraints, or dispatcher
response time was incompatible with the customer's deadline. That reason
makes the choice revisable if conditions change. It does not require preserving
every sketch as a permanent record.

### Follow one sketch across the product

In Northbank's guided-request sketch, a pending response must remain visibly
pending in the contractor portal, staff console, and notification. Enacting a
missed response exposes who must act and whether the phone fallback is credible.
It can change the concept before a transaction design is selected.

The [requirement specimens](../solution/requirements/authoring/northbank-commitment-requirements.md)
show how selected obligations later acquire authority. A sketch revealing a
race for capacity is a question for [domain modeling](domain-driven-design.md),
not evidence that a particular lock or queue is the right design.

## Sketches and prototypes serve different purposes

Buxton explicitly distinguishes sketches from prototypes even though both
represent a design concept. His chapter preview associates sketching with
early ideation; the workbook materials develop the contrast as one of purpose,
with form varying along a continuum.[^prototypes][^what-is-a-sketch]

The following comparison applies that distinction to the booking example:

| Purpose | Representation in this example | What the team seeks |
| --- | --- | --- |
| Open possibilities | Several rough booking sequences | Different ways to organize the customer's experience |
| Resolve a selected question | An operable paper sequence for accepting an offer | Whether people understand when a booking becomes binding |
| Examine implementation behavior | A working slice connected to realistic availability data | Whether the proposed interaction survives delays and competing requests |

Paper can support a focused evaluation, and code can support an exploratory
idea. The medium alone does not identify the purpose. Likewise, a prototype
can expose a failure serious enough to reopen the concept choice; calling it
a prototype does not make that choice irreversible.

Investment and visible finish also deserve separate attention. A polished
booking demo may be cheap to generate but still look settled to its audience.
A rough drawing may conceal a costly commitment to a particular workflow.
In this example, the team needs to make both the open questions and the
actual willingness to change explicit.

Further fidelity is useful when it exposes something the rough representation
cannot. Paper may reveal confusion about acceptance, while a working
interaction is needed to examine keyboard behavior or responses to delayed
availability. Successful paper interaction cannot establish those properties
of the built product.

## Design develops through shared criticism

The social setting changes what a team learns. In a 2006 study, Tohidi,
Buxton, Baecker, and Sellen compared feedback from 48 participants who saw
either one paper interface or three alternatives for a home climate-control
system. Designs received higher ratings in isolation, and participants were
more reluctant to criticize. Multiple alternatives did not, by themselves,
produce the hoped-for constructive redesign suggestions. This is evidence
about feedback in that study, not a universal rule about how many concepts
every team must test.[^alternatives-study]

A related study added user sketching to usability evaluation. The authors
reported that drawing helped participants reflect on, develop, and communicate
design proposals. The implication is that users can contribute through making
representations as well as reacting to ones prepared for them. The study
supports that possibility within its setting; it does not establish that
every participant or design question benefits equally.[^user-sketches]

Applied to the rental example, a review can place the candidate sequences
where customers, dispatchers, designers, and engineers can refer to the same
moments. A dispatcher might identify an offer the service cannot honor; a
customer might draw the missing point at which they notify their crew. The
designer can explore how those concerns alter the interaction.

The resulting reasons matter more than a vote for the favorite presentation.
A customer's proposed screen can reveal a need without settling the solution.
An engineer's concern can reveal a constraint without settling the interaction.
Responsibility for the design includes reconciling those contributions and
identifying which claims still need evidence.

## A worked choice: developing the booking experience

Suppose the team now favors suggested appointments. For this fictional
decision, assume customers need a prompt answer, reliable availability exists
for routine rentals, and dispatchers can handle exceptional requests. These
assumptions favor suggestions with a guided fallback over a dispatcher-led
process for every booking.

The team develops a paper prototype around a concrete uncertainty: can a
customer distinguish an available appointment from an appointment the service
has committed to provide? If participants treat viewing an offer as securing
it, the concept needs a clearer transition. The team might explore temporary
holds, explicit acceptance, or a different promise altogether.

Even a convincing interaction leaves an engineering question. A working slice
can expose what happens when two customers accept the same remaining capacity.
If the service cannot provide the assumed availability guarantee, the team may
need to return to a request-and-confirm experience. That is a change to the
customer's promise, not merely an implementation adjustment.

The example connects exploration, focused evaluation, and construction without
pretending that one kind of evidence settles every question. It also shows
why the reasons for the choice matter: if dispatcher response becomes fast
enough, or availability data proves unreliable, a previously rejected concept
may become preferable.

## How this informs product engineering

This bundle's [definition of design](../overview.md#where-design-fits) remains
the authority for its terminology. The following connections interpret
Buxton's ideas within that practice; they are not additional claims about his
method.[^overview]

[Jobs to Be Done](jobs-to-be-done.md) can clarify the customer progress a
booking experience should support. [Use cases](use-cases.md) can expose actor
goals, boundaries, and exceptions. Sketching gives the team ways to explore
different forms that might serve those goals; a goal or scenario does not
uniquely determine an interface.

[What to build](../solution/) owns the solution and interaction choices.
[Requirements and neighboring artifacts](../solution/requirements/foundations/requirements-and-neighboring-artifacts.md)
explains when exploratory material becomes an accepted obligation. A sketch's
annotation is not automatically a requirement. Once the team accepts a
particular promise, it needs a statement that can be disputed and maintained.
The disposable representation and the durable obligation serve different jobs.

[How to build it](../engineering/) owns construction and verification, whose
evidence can reopen the choice. [Outcomes and evidence](../problem/outcomes-and-evidence.md)
keeps the intended benefit in view: customers completing bookings does not
establish that equipment arrives reliably or that fewer crews wait idle.

The existing practice adopts consideration of alternatives, deliberate
resolution, and revisable commitment. Buxton's account helps explain those
choices. Particular media, sketch counts, workshop formats, and amounts of
exploration remain contextual. A known correction to a familiar interaction
may need little concept exploration; a change in who bears scheduling
responsibility deserves more. None of this establishes a mandatory sequence
of approval gates.

[Shape Up](shape-up.md#shaping-makes-an-idea-concrete-enough-to-bet-on) adds a
perspective on how much solution detail makes a bounded investment discussable.
Sketching explores alternatives; a shaped pitch supports a bet. The
[Brooks explainer](brooks-architect-role.md) then examines responsibility for
keeping the chosen experience coherent as multiple contributors develop it.

For practice with the media themselves, the authors' [workbook resources](https://sketchbook.cpsc.ucalgary.ca/)
offer exercises and teaching material on representing experiences over time.[^workbook]
For the next product decision, follow [Explore and shape a candidate](../reading-product-engineering.md#explore-and-shape-a-candidate)
into scenarios, obligations, domain meaning, and executable evidence. Detailed
local guides for facilitating sketching and design reviews remain unwritten.

[^why-sketch]: Greenberg, Carpendale, Marquardt, and Buxton, [Why Should I Sketch?](https://saul.cpsc.ucalgary.ca/sketchbook/wp-content/uploads/Chapter-1.2a-WhyShouldISketch.ppt), presentation accompanying *Sketching User Experiences: The Workbook*.
[^what-is-a-sketch]: Greenberg, Carpendale, Marquardt, and Buxton, [What Is a Sketch?](https://saul.cpsc.ucalgary.ca/sketchbook/wp-content/uploads/Chapter-1.2b-WhatIsASketch.ppt), companion presentation summarizing Buxton's account.
[^prototypes]: Buxton, [Sketches are not Prototypes](https://www.oreilly.com/library/view/sketching-user-experiences/9780123740373/OEBPS/B9780123740373500596.htm), public preview from *Sketching User Experiences*.
[^experience]: Buxton, [MIX09 keynote transcript](https://news.microsoft.com/speeches/bill-buxton-mix09/).
[^alternatives-study]: Tohidi, Buxton, Baecker, and Sellen, [Getting the Right Design and the Design Right: Testing Many Is Better Than One](https://www.billbuxton.com/rightDesign.pdf), CHI 2006.
[^user-sketches]: Tohidi, Buxton, Baecker, and Sellen, [User Sketches: A Quick, Inexpensive, and Effective Way to Elicit More Reflective User Feedback](https://www.billbuxton.com/UserSketches.pdf), NordiCHI 2006.
[^workbook]: Greenberg, Carpendale, Marquardt, and Buxton, [Sketching User Experiences: The Workbook](https://sketchbook.cpsc.ucalgary.ca/), authors' companion resources.
[^overview]: [Product engineering overview](../overview.md), especially “Where design fits” and “Lifecycle and shared foundations.”
