---
type: Explanation
title: "Shape Up: Ryan Singer's approach to shaping, betting, and building"
description: How Ryan Singer's Shape Up connects appetite, shaped solution concepts, bounded bets, and team ownership to finishing meaningful work, with explicit distinctions between investment, scope, completion, and outcome evidence.
tags: [shape-up, ryan-singer, basecamp, shaping, appetite, betting, pitch, scope, hill-chart, product-development, pe-foundations]
status: draft
sources:
  - id: introduction
    resource: https://basecamp.com/shapeup/0.3-chapter-01
    title: Ryan Singer — Shape Up, Introduction
  - id: shaping
    resource: https://basecamp.com/shapeup/1.1-chapter-02
    title: Ryan Singer — Principles of Shaping
  - id: boundaries
    resource: https://basecamp.com/shapeup/1.2-chapter-03
    title: Ryan Singer — Set Boundaries
  - id: elements
    resource: https://basecamp.com/shapeup/1.3-chapter-04
    title: Ryan Singer — Find the Elements
  - id: risks
    resource: https://basecamp.com/shapeup/1.4-chapter-05
    title: Ryan Singer — Risks and Rabbit Holes
  - id: pitch
    resource: https://basecamp.com/shapeup/1.5-chapter-06
    title: Ryan Singer — Write the Pitch
  - id: backlogs
    resource: https://basecamp.com/shapeup/2.1-chapter-07
    title: Ryan Singer — Bets, Not Backlogs
  - id: betting
    resource: https://basecamp.com/shapeup/2.2-chapter-08
    title: Ryan Singer — The Betting Table
  - id: modes
    resource: https://basecamp.com/shapeup/2.3-chapter-09
    title: Ryan Singer — Place Your Bets
  - id: responsibility
    resource: https://basecamp.com/shapeup/3.1-chapter-10
    title: Ryan Singer — Hand Over Responsibility
  - id: slice
    resource: https://basecamp.com/shapeup/3.2-chapter-11
    title: Ryan Singer — Get One Piece Done
  - id: scopes
    resource: https://basecamp.com/shapeup/3.3-chapter-12
    title: Ryan Singer — Map the Scopes
  - id: progress
    resource: https://basecamp.com/shapeup/3.4-chapter-13
    title: Ryan Singer — Show Progress
  - id: finishing
    resource: https://basecamp.com/shapeup/3.5-chapter-14
    title: Ryan Singer — Decide When to Stop
  - id: feedback
    resource: https://basecamp.com/shapeup/3.6-chapter-15
    title: Ryan Singer — Move On
  - id: size
    resource: https://basecamp.com/shapeup/4.1-appendix-02
    title: Ryan Singer — Adjust to Your Size
  - id: beginning
    resource: https://basecamp.com/shapeup/4.2-appendix-03
    title: Ryan Singer — How to Begin to Shape Up
  - id: cagan
    resource: cagan-product-strategy.md
    title: Marty Cagan's product strategy
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
---

# Shape Up: Ryan Singer's approach to shaping, betting, and building

Shape Up explains how teams can commit to meaningful work while uncertainty
remains and retain enough freedom to finish it. Ryan Singer developed the
account from Basecamp's product-development practice. It connects three kinds
of work: shaping a plausible solution, deciding whether to invest in it, and
building within the resulting boundaries.[^introduction]

This explanation is for product leaders, designers, and engineers who want to
understand that connection. It follows the online book, including its
adaptations for different team sizes and new products. The book states the
authors' experience and advocated method; it does not independently establish
superior results in every organization. The equipment-rental example is
fictional. Connections to this bundle are editorial interpretations, and this
draft does not establish a mandatory development process.

## The problem Shape Up addresses

A team can be busy while its projects remain difficult to finish. An idea may
be too vague to guide choices, or detailed enough to foreclose useful
alternatives before anyone encounters the implementation. New requests can
consume the capacity originally promised to the project. Singer's response is
to reduce avoidable uncertainty before commitment and give the building team
responsibility for completing a coherent result.[^introduction]

The three activities answer different questions:

| Activity | Question | Result |
| --- | --- | --- |
| Shaping | What solution could address this problem within an acceptable investment? | A bounded concept that can be considered |
| Betting | Is this the work we should commit people and time to now? | A decision to fund and protect a project |
| Building | How do we make the concept work and finish within its boundaries? | An integrated result appropriate to the bet |

This is a synthesis of the book's organization. Shaping creates options; it
does not guarantee that those options will be selected.[^elements]

## Appetite bounds the investment

An **appetite** expresses how much time a problem deserves for a given team
size. An estimate predicts the time required for a particular design. The
direction of reasoning differs: appetite constrains the solution search,
whereas estimation starts from proposed work. Singer calls the resulting
approach fixed time, variable scope.[^boundaries]

Suppose [Northbank Equipment](../northbank-equipment.md) receives a request for
“better reservation management.” Conversations reveal a specific failure:
contractors cannot tell
whether a depot has confirmed their equipment before they dispatch a crew.
Assume leaders judge this uncertainty worth one six-week project with a small
team. That appetite directs attention toward a confirmation flow. It gives no
reason to promise an inventory-system replacement within six weeks.

Basecamp distinguishes projects occupying a full cycle from smaller projects
of roughly one or two weeks grouped within a cycle. Appetite is therefore a
choice about investment, not a claim that every feature takes six weeks.
Narrowing the problem may reveal a much smaller intervention.[^boundaries]

In the example, the immediate problem is uncertainty before dispatch. Whether
confirmation also increases repeat rentals remains a hypothesis requiring
separate evidence.

## Shaping makes an idea concrete enough to bet on

Singer gives shaped work three properties: **rough**, **solved**, and
**bounded**. Roughness leaves room for detailed design. Solved means that the
principal elements of the proposed solution have been worked through and fit
together. Bounded means that the appetite and exclusions indicate where the
project should stop. These properties reduce risk without implying that every
implementation question has an answer.[^shaping]

For the rental service, the concept might add a confirmation state to the
existing reservation page, give depot staff a way to confirm equipment, and
notify the contractor through the existing messaging service. Automatic
substitution and transfers between depots remain outside the project.

Two representations support this level of thinking. A **breadboard** names
places, affordances, and their connections so the shaper can reason through an
interaction without fixing its visual styling. A **fat marker sketch** captures
a rough spatial arrangement when layout is central to the idea. Their value
lies in making solution choices discussable while keeping exploration cheap;
neither requires a particular drawing application.[^elements]

A breadboard for this example would connect the reservation page, the staff
confirmation action, and the contractor's updated status. Walking through it
raises a question: what happens when confirmation never arrives? That missing
path matters more at this stage than the button's color.

**Rabbit holes** are unresolved design problems, technical unknowns, or
dependencies that could make the project expand far beyond its appetite.
Shapers examine the concept, consult technical expertise, and settle dangerous
choices or remove them from scope before presenting it.[^risks] Here, they
could specify an explicit pending state and preserve the existing phone
fallback, while confirming that staff permissions and messaging support the
proposed flow. If dependable confirmation requires replacing inventory
infrastructure, the current concept needs reconsideration.

## A pitch makes the proposed bet discussable

A **pitch** communicates the shaped concept to people deciding where to invest.
Singer identifies five ingredients: problem, appetite, solution, rabbit holes,
and no-gos. Together they explain what makes the option worthwhile and what
keeps it bounded.[^pitch]

The example could be summarized as follows; this table illustrates the
reasoning rather than supplying a complete pitch template.

| Ingredient | Rental example |
| --- | --- |
| Problem | Contractors dispatch crews without knowing whether reserved equipment has been confirmed. |
| Appetite | One six-week cycle for a designer and two engineers. |
| Solution | Staff confirmation, visible reservation status, and a notification using existing channels. |
| Rabbit holes | Check permissions and messaging feasibility; define pending behavior so silence cannot imply confirmation. |
| No-gos | Automated substitution, transfers between depots, and inventory-system replacement. |

A raw request names something wanted. A pitch makes a particular response
available for consideration. A bet commits capacity to it. Confusing these
states turns exploration into an accidental promise.

In this bundle's terms, a pitch can contain proposed behavior and constraints,
but its existence does not settle the authority of every statement inside it.
[Requirements and neighboring artifacts](../solution/requirements/foundations/requirements-and-neighboring-artifacts.md)
explains how a project identifies its accepted obligations. A pitch need not
become a second, competing requirements authority.

## Betting commits capacity and protects attention

Basecamp's **betting table** selects projects during the two-week cool-down
between six-week cycles. Decision-makers consider a few prepared options,
business priorities, and available people. Cool-down also leaves room for
unscheduled fixes and exploration. A bet reserves the team's attention as well
as calendar time; repeatedly borrowing its people breaks that commitment.
Genuine crises can still interrupt work.[^betting]

Singer rejects a centralized backlog that continually demands grooming and
implies accumulated obligations. People can retain requests, bugs, and pitches
in their own lists, then deliberately bring an idea back with a current reason
to consider it. An unselected pitch has no automatic place in the next
cycle.[^backlogs]

The **circuit breaker** makes extension exceptional. When a project fails to
finish within the bet, the default is to stop funding that version, reconsider
the shaping, and assess any future proposal afresh. The organization bets one
cycle at a time, preserving the option to change direction.[^betting]

Suppose the rental pitch competes with a billing correction and a depot search
improvement. A plausible confirmation concept does not itself decide which
deserves the team. Selection still requires judgment about importance,
timing, and capacity. Keeping the rejected options recoverable does not make
them commitments.

## Building teams own the path to completion

The building team receives responsibility for the whole project and discovers
its own tasks. It can make detailed design and implementation choices within
the pitch's boundaries. Singer explicitly distinguishes that freedom from
starting with unrestricted authority to invent a different solution.[^responsibility]

In Basecamp's arrangement, shaping and building overlap on separate tracks:
while a team builds a selected project, shapers explore possible future bets.
An idea can remain on the shaping track or be discarded without consuming a
building team's cycle.[^shaping]

Singer advises integrating one small, demonstrable piece early. Working through
a complete interaction exposes whether interface and implementation fit
together.[^slice] The rental team might first connect a staff confirmation
action to the contractor's visible reservation state. That gives them a real
interaction to assess before they expand notification behavior.

As work reveals dependencies, the team identifies **scopes**: meaningful parts
that can be integrated and finished independently. These emerge from the
project's structure; an initial task list is only a hypothesis about the work.
A scope map can change as that understanding improves.[^scopes]

“Confirm equipment,” “Show reservation status,” and “Notify the contractor” are
candidate scopes in the example. Their usefulness depends on actual
dependencies. If confirmation and status cannot be judged complete separately,
the team should redraw the boundary. Calling something a scope does not make
it independent.

## Progress depends on resolving uncertainty

A completed-task count says little about tasks the team has not discovered.
Singer's **hill chart** distinguishes working out an approach—the uphill
portion—from carrying through an understood approach—the downhill portion.
Each scope has its own position, updated through the team's judgment.
Movement makes changes in understanding visible; a stationary scope invites
a conversation about what remains unresolved.[^progress]

Suppose the notification UI is finished but nobody has established what
happens when a confirmation is revoked before its queued message is sent. The
number of completed UI tasks cannot answer that question. The notification
scope still contains an unknown that could change the design.

The team investigates the actual message flow and discovers that reliably
editing queued messages would require substantial new work. The scope becomes
better understood when they have exercised a viable alternative, not simply
when someone proposes one. Singer emphasizes validating approaches through
building; reasoning in the abstract can create false confidence.[^progress]

The chart therefore expresses situated understanding. It is neither a
calculated completion percentage nor evidence that customers benefit from the
project.

## Finishing requires deliberate scope decisions

Singer compares the proposed result with the customer's present **baseline**.
That comparison helps distinguish a worthwhile improvement from refinements
that could continue indefinitely. **Scope hammering** repeatedly questions
whether work is essential to the chosen use case. Teams separate must-haves
from nice-to-haves and reduce the breadth of the solution while taking
responsibility for the quality of what remains.[^finishing]

In the rental example, the team could replace a message containing a copied
confirmation state with a neutral invitation to check the current reservation
page. Assume that page already retrieves current state dependably. The change
removes the need to synchronize confirmation text across queued notifications
while preserving the contractor's route to a reliable answer. Precise wording
still needs testing with users. A message that incorrectly asserts equipment
is confirmed would defeat the selected problem, even if it were easy to ship.

Singer considers extensions only exceptionally, when remaining work is
essential despite scope reductions and contains no unresolved problems. A
project with substantial unknowns should return to shaping. The cool-down
period is not a routine overflow allowance.[^finishing]

For an existing product, the building team's responsibility reaches deployment,
not merely a completed internal handoff.[^responsibility] Subsequent requests
become inputs to future shaping and compete for another bet rather than
silently extending the original project.[^feedback]

Even a finished confirmation flow leaves the rental service with an outcome
question: do contractors actually obtain dependable answers before dispatch,
and does that affect repeat use? Deployment establishes availability. It does
not establish those effects.

## How Shape Up fits product engineering

The following mapping is this bundle's interpretation of where the method
informs its lifecycle questions. These are overlapping concerns, not required
handoffs.

| Lifecycle question | Contribution and boundary |
| --- | --- |
| [What to solve](../problem/) | Narrow a concrete problem and understand the existing workaround. Evidence must still establish why the problem matters and whether intervention helped. |
| [What to build](../solution/) | Explore a solution within appetite, reduce avoidable risks, and state its boundaries. Accepted obligations need explicit authority. |
| [How to build it](../engineering/) | Give the team responsibility for integration, discovered work, scope decisions, and evidence of behavior. |
| [How to ship it](../delivery/) | Connect commitment to a finishable result and protect capacity. Release engineering and operational readiness require their own practices. |

[Marty Cagan's product strategy](cagan-product-strategy.md) connects strategic
context to problems owned by empowered teams, which discover effective
solutions. In Shape Up's standard arrangement, substantial solution shaping
precedes assignment to the building team.[^cagan][^responsibility] Both leave
room for team judgment, but the decision boundary differs. Combining them
requires saying who owns solution discovery and how the people who will build
participate in shaping; changing the label on a feature assignment does not
establish problem ownership.

[Jobs to Be Done](jobs-to-be-done.md) deepens the inquiry into customer progress
behind the request. [Use cases](use-cases.md) help expose behavior and exceptions
that a shaped interaction must address. [Domain-driven design](domain-driven-design.md)
helps distinguish reservation, confirmation, and allocation in the domain
model. Shape Up's project scopes do not automatically define bounded contexts.

The bundle already treats appetite and rough solution exploration as inputs
to [What to build](../solution/). This explanation supplies their attributed
context. It does not prescribe Basecamp's cadence, staffing model, backlog
policy, or review arrangements. Evidence of outcomes remains owned by
[Outcomes and evidence](../problem/outcomes-and-evidence.md).

## Keep the case's investments distinct

This confirmation bet is episode B of the Northbank case. Automatic substitution,
inter-depot transfers, and inventory replacement remain no-gos. The later
[allocation](../engineering/northbank-allocation-change.md) and
[engineering-system](../engineering/northbank-engineering-system.md) changes
need separate investment decisions; their usefulness does not expand this bet.

Alleman's six-week budgeted pilot is an alternative management illustration
around the same problem, not a restatement of this appetite. The later two-depot
KPI exhibit is also a separate observation scenario. Preserving these boundaries
lets completion, capability, and outcome remain different claims.

## Applicability, limits, and further reading

For the relationship between appetite and project forecasts, read
[Alleman's approach in product engineering](alleman-performance-based-project-management.md#how-this-informs-product-engineering).
That comparison also distinguishes the customer baseline from a performance
measurement baseline, and hill-chart judgments from completion measures.

Singer separates underlying reasoning from organization-specific practices.
Very small teams can alternate shaping and building without formal pitches,
a betting table, or six-week cycles. Larger teams can specialize enough to
protect building time. His account also describes operational and technical
support outside the core product teams.[^size] Our implication is that a team
handling frequent incidents must account for that capacity before promising
uninterrupted project work. Similarly, a dependent team cannot supply protected
time merely because another team's pitch assumes it will.

New-product work also changes the expectation. Singer describes **R&D mode**
as exploration through building, with senior people resolving foundational
questions and no expected customer release at the cycle's end. **Production
mode** uses shaped projects once the core structure is established; before
launch, completion can mean integrated work in the main codebase. **Cleanup
mode** addresses remaining launch necessities with looser team boundaries.
The investment decision remains limited to one cycle at a time.[^modes]

These distinctions matter for the rental example. If investigation reveals
that dependable confirmation requires an unknown architecture or a different
depot operating model, the proposed delivery bet is premature. Calling that
uncertainty a rabbit hole does not remove it. The next investment may need to
establish feasibility or reframe the problem before anyone promises the flow.

For further reading, start with *Principles of Shaping* and *Set Boundaries*
to understand the design constraint. *The Betting Table* develops commitment;
*Map the Scopes* and *Show Progress* develop execution and uncertainty. *Adjust
to Your Size* and *How to Begin to Shape Up* explain adaptation, including
starting with one experiment or with shaping inside an existing scheduling
process.[^beginning] Follow the bundle's
[behavior and commitment route](../reading-product-engineering.md#explore-and-shape-a-candidate)
when the next question concerns accepted behavior and its verification.

[^introduction]: Ryan Singer, [Introduction](https://basecamp.com/shapeup/0.3-chapter-01).
[^shaping]: Ryan Singer, [Principles of Shaping](https://basecamp.com/shapeup/1.1-chapter-02).
[^boundaries]: Ryan Singer, [Set Boundaries](https://basecamp.com/shapeup/1.2-chapter-03).
[^elements]: Ryan Singer, [Find the Elements](https://basecamp.com/shapeup/1.3-chapter-04).
[^risks]: Ryan Singer, [Risks and Rabbit Holes](https://basecamp.com/shapeup/1.4-chapter-05).
[^pitch]: Ryan Singer, [Write the Pitch](https://basecamp.com/shapeup/1.5-chapter-06).
[^backlogs]: Ryan Singer, [Bets, Not Backlogs](https://basecamp.com/shapeup/2.1-chapter-07).
[^betting]: Ryan Singer, [The Betting Table](https://basecamp.com/shapeup/2.2-chapter-08).
[^modes]: Ryan Singer, [Place Your Bets](https://basecamp.com/shapeup/2.3-chapter-09).
[^responsibility]: Ryan Singer, [Hand Over Responsibility](https://basecamp.com/shapeup/3.1-chapter-10).
[^slice]: Ryan Singer, [Get One Piece Done](https://basecamp.com/shapeup/3.2-chapter-11).
[^scopes]: Ryan Singer, [Map the Scopes](https://basecamp.com/shapeup/3.3-chapter-12).
[^progress]: Ryan Singer, [Show Progress](https://basecamp.com/shapeup/3.4-chapter-13).
[^finishing]: Ryan Singer, [Decide When to Stop](https://basecamp.com/shapeup/3.5-chapter-14).
[^feedback]: Ryan Singer, [Move On](https://basecamp.com/shapeup/3.6-chapter-15).
[^size]: Ryan Singer, [Adjust to Your Size](https://basecamp.com/shapeup/4.1-appendix-02).
[^beginning]: Ryan Singer, [How to Begin to Shape Up](https://basecamp.com/shapeup/4.2-appendix-03).
[^cagan]: [Marty Cagan's product strategy](cagan-product-strategy.md), based on his 2020 SVPG strategy series.
