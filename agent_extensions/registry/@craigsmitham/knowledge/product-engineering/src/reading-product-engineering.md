---
type: Guide
title: Reading product engineering
description: Use when entering the bundle or connecting familiar concepts to the wider practice; follow question-led reading routes through value, strategy, behavior, and change, then branch into the relevant lifecycle guidance.
tags: [product-engineering, reading-routes, learning, discovery, value, strategy, behavior, change]
status: draft
sources:
  - id: overview
    resource: overview.md
    title: Product engineering overview
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
---

# Reading product engineering

Use this guide to build an understanding of the bundle across its subject
boundaries. Choose the question closest to yours, skip concepts you already
understand, and follow a branch when it answers your next question. No route
requires adopting every approach it visits.

The [overview](overview.md) explains the lifecycle and where knowledge belongs.
The routes below are editorial reading choices through that structure; they
are not a development process or a sequence of approvals.[^overview] Each
document remains usable on its own, including when found through search.

## Follow a shared case when it helps

[Northbank Equipment](northbank-equipment.md) supplies a fictional business,
product, and engineering system across these routes. Its episode table connects
customer value, confirmation, allocation, tooling/CI/CD, measurement, incidents,
and renewal. Each example remains readable on its own; no route requires
completing the entire case.

For concrete depth, follow [commitment requirements](solution/requirements/authoring/northbank-commitment-requirements.md),
[the allocation change](engineering/northbank-allocation-change.md),
[the engineering-system change](engineering/northbank-engineering-system.md),
and [receipt incident records](delivery/work-items/northbank-receipt-incident.md).
These are related specimens with different authority and evidence, not a
mandatory artifact sequence.

## Choose a question

| Question | Route | What it connects |
| --- | --- | --- |
| Why would this product matter? | [Value and evidence](#value-and-evidence) | Customer progress, economic value, and observed results |
| How do we choose where to invest? | [Strategic choices](#strategic-choices) | Advantage, landscape, and focused team problems |
| How does an intention become dependable behavior? | [Behavior and commitment](#behavior-and-commitment) | Design exploration, coherent behavior, and project commitments |
| How should an existing product change? | [Continuity and change](#continuity-and-change) | Care, renewal, changing conditions, and intervention consequences |

## Value and evidence

Begin here when a proposed feature or offering has a weak account of who it
helps, why they would choose it, or what would count as success.

1. [Value and demand model](problem/value-and-demand-model.md) separates the
   offering, audience, need, job, and value proposition. You can now distinguish
   the proposal from the claims that would make it worthwhile.
2. [Jobs to Be Done](foundations/jobs-to-be-done.md) deepens the account of
   customer progress, circumstances, and alternatives. Follow it when a named
   need leaves the reasons for choice unexplained.
3. [Value-based strategy](foundations/value-based-strategy.md) adds the
   economics of the exchange, including employee and supplier value. Customer
   progress alone does not explain who receives value or whether the offering
   can sustain its costs.
4. [Outcomes and evidence](problem/outcomes-and-evidence.md) connects the value
   hypothesis to observable results. It helps distinguish delivering an
   improvement from establishing that the improvement mattered.
5. [Key performance indicators](foundations/key-performance-indicators.md)
   explains how to select and interpret measures for those results. It connects
   objectives, definitions, targets, and decisions without treating a better
   number as sufficient evidence of customer value.

For example, reliable equipment delivery may help a contractor avoid an idle
crew. That gives a reason to investigate the offering; the contractor's
alternatives, the cost of reliability, and actual repeat use remain questions.
This is an illustrative connection to the rental examples in Foundations,
not additional customer research.

Continue to [Strategic choices](#strategic-choices) when several worthwhile
opportunities compete. Continue to [Behavior and commitment](#behavior-and-commitment)
when the next question is what a selected solution must do. If a solution
conforms to its requirements but produces little benefit, return to the value
proposition and evidence rather than assuming another feature is the answer.

## Strategic choices

Begin here when priorities do not explain where the organization will
participate, how it expects to succeed, or why a team owns a particular problem.
For a comparison before reading the individual accounts, open
[Strategy perspectives and their relationships](foundations/strategy-perspectives.md).

1. [Playing to Win](foundations/playing-to-win.md) develops the coherence of
   arena, advantage, capabilities, and management systems. It makes the choices
   behind a goal such as increasing repeat rentals discussable.
2. [Wardley mapping](foundations/wardley-mapping/wardley-mapping.md) adds needs,
   dependencies, and evolution. A coherent proposal still needs an account of
   the landscape in which it would work and the conditions that could change it.
3. [Marty Cagan's product strategy](foundations/cagan-product-strategy.md)
   connects direction to focused team problems and continuing management.
   The next question becomes what teams should investigate and what their
   learning could change about the strategy.

When improved execution no longer produces worthwhile results, read
[Drucker's theory of the business](foundations/drucker-theory-of-the-business.md)
to examine assumptions about environment, mission, and core competencies before
choosing which commitments to revise.

Use [Value and evidence](#value-and-evidence) when an advantage depends on an
unexamined value claim. Use [Continuity and change](#continuity-and-change)
when new priorities compete with existing responsibilities. These routes can
reopen the choices above: none of the approaches supplies a final strategy
that later learning cannot challenge.

[Where to play](strategy/) locates these decisions in the lifecycle and states
their boundaries. It currently contains no decision guides; the foundation
explanations provide conceptual grounding, not complete practical coverage.

## Behavior and commitment

Begin here when people agree that a problem matters but differ about the
behavior, rules, or evidence a solution should provide.

Choose the branch that matches the unsettled decision. These branches can be
revisited as evidence changes; they do not require combining the authors' methods.

| Unsettled decision | Branch |
| --- | --- |
| Which experience or solution should we pursue, within what investment? | [Explore and shape a candidate](#explore-and-shape-a-candidate) |
| What behavior must remain coherent, authoritative, and verifiable? | [Preserve coherent behavior](#preserve-coherent-behavior) |
| Can the project meet its capability, cost, and timing commitments? | [Check project commitments](#check-project-commitments) |

### Explore and shape a candidate

When the solution concept is still open, begin with
[Bill Buxton's approach to design](foundations/buxton-design.md). It explains
how sketching and comparing experiences can inform the choice. In the rental
example, a calendar, a guided request, and suggested appointments distribute
work differently; choosing among them changes the scenarios and commitments
to examine below. Return to that exploration when a scenario exposes a weak
assumption about the proposed experience.

When the earlier question is how much to invest and what solution could fit,
start with [Shape Up: Ryan Singer's approach to shaping, betting, and building](foundations/shape-up.md).
It connects appetite to a shaped proposal, a commitment of capacity, and team
ownership of completion. Then use the sequence below to examine the behavior
and obligations within that commitment. For its distinction from Cagan's
problem ownership, read [How Shape Up fits product engineering](foundations/shape-up.md#how-shape-up-fits-product-engineering).

### Preserve coherent behavior

1. [Use cases](foundations/use-cases.md) develops actor goals, a selected system
   boundary, success paths, and exceptions. A reservation narrative can expose
   what should happen when equipment becomes unavailable.
2. [Requirements and neighboring artifacts](solution/requirements/foundations/requirements-and-neighboring-artifacts.md)
   distinguishes an exploratory account from an accepted obligation. A use
   case may be an authoritative requirements form when the project accepts it;
   writing a narrative alone does not settle that authority.
3. [Domain-driven design](foundations/domain-driven-design.md) examines the
   language and model through which that behavior works. “Promised equipment”
   and “assigned equipment” may need different meanings. Scenarios inform that
   inquiry without mechanically determining contexts or aggregates.
4. [Fred Brooks on the architect's role](foundations/brooks-architect-role.md)
   asks how independently designed parts preserve an understandable product.
   Follow it to distinguish contribution from decision authority and shared
   commitments from the models used inside bounded contexts.
5. [Designing executable specifications](engineering/designing-executable-specifications.md)
   turns selected accepted rules into readable examples with executable
   evidence. Continue to [Keeping specifications authoritative](engineering/keeping-specifications-authoritative.md)
   when those statements must survive change.

When ready to state or revise obligations, the [Requirements](solution/requirements/)
index branches into development, authoring, review, lifecycle, and local
adaptation. For the distinction between conforming behavior and a useful
solution, read [Verification and validation](solution/requirements/foundations/verification-and-validation.md),
then return to [Outcomes and evidence](problem/outcomes-and-evidence.md).

The [engineering index](engineering/) routes from choosing a test level to
building and operating the admitted suite. Its [repository task interface](engineering/repository-task-interface.md)
route addresses how people and automation invoke that work consistently.
Those are practical continuations once the behavior and evidence questions
are clear. Architecture, construction, and solution-design guidance remain
incomplete; these links do not fill those gaps by implication.

### Check project commitments

When the question is whether the project can meet its capability, cost, and
timing commitments, read [Glen Alleman's performance-based project management](foundations/alleman-performance-based-project-management.md).
It connects plans and resources to risk, demonstrated accomplishment, and
forecasts. The rental example shows why completing screens cannot establish
that an inventory dependency works, and how that finding can lead to a revised
commitment. Its [product-engineering connections](foundations/alleman-performance-based-project-management.md#how-this-informs-product-engineering)
distinguish forecasts from Shape Up's appetite and clarify their different uses
of baseline and progress measures.

Continue to [Defining work-item verification](delivery/work-items/common/defining-verification.md)
when a bounded change needs completion evidence. Return to
[Value and evidence](#value-and-evidence) when the question is whether completing
the project produced a worthwhile result.

## Continuity and change

Begin here when deciding whether and how to change something people already
depend on, including when leaving it alone is a serious option.

1. [Maintenance and the life of software products](maintenance/maintenance-and-the-life-of-software-products.md)
   develops care, situated understanding, intervention, and responsibility.
   It brings existing users, sustaining work, and consequences into view.
2. [Maintenance strategies and their relationships](foundations/maintenance-strategies.md)
   connects software deterioration to intervention triggers. Follow its links
   to run-to-failure, scheduled preventive, and condition-based and predictive
   maintenance to understand the evidence and consequences behind each choice.
3. [Drucker's four disciplines of organizational renewal](foundations/drucker-organizational-renewal.md)
   distinguishes stopping, improving, extending success, and creating new
   possibilities. These are concurrent responsibilities, not a requirement
   that every existing product be replaced.
4. [Wardley mapping](foundations/wardley-mapping/wardley-mapping.md) adds changing
   provision and inertia. It helps question whether familiar investment and
   sourcing choices still fit their circumstances.
5. [Analyzing and specifying requirement change](solution/requirements/lifecycle/analyzing-requirement-impact.md)
   traces a proposed obligation change through dependents and evidence. Use it
   when the intervention affects requirements; it does not cover every kind
   of maintenance decision.

To assess an existing implementation, continue to [Codebase review](engineering/codebase-review/).
To coordinate the resulting work, use [Work items](delivery/work-items/): start
with its taxonomy when deciding whether the concern is an incident, defect, or
change, then follow the role and common guidance. A work item coordinates the
intervention; it does not replace the authority for product behavior.

For the meaning of production promises, read
[SLIs, SLOs, and SLAs](foundations/service-level-indicators-objectives-and-agreements.md).
It connects measured service quality to objectives, agreements, and error-budget
decisions, while preserving the distinction from customer outcomes.

For production responsibilities, [How to run it](operations/) states the scope
and the boundary with incident records. Operational response guides are still
unwritten, as are the flow and release guides in [How to ship it](delivery/).
After an intervention, return to [Outcomes and evidence](problem/outcomes-and-evidence.md)
to examine its effects and to maintenance to reconsider what now needs care.

## Continue across the body of knowledge

Each route is an entry into the same body of knowledge. To widen your view,
follow the unresolved question: value into strategic choice, choice into
behavior, behavior into evidence, and evidence into continuing care or revised
direction. You can enter that loop at any point.

The [bundle index](index.md) remains the complete map of sections and their
current coverage. The [foundation index](foundations/) lets you select a
particular perspective, while the requirements, engineering, work-item, and
codebase-review indexes give progressively narrower practical routes. Stop
following background links when you have enough understanding for the decision
at hand; return when evidence or an unfamiliar concept raises another question.

[^overview]: Product engineering overview, especially “Lifecycle and shared foundations.”
