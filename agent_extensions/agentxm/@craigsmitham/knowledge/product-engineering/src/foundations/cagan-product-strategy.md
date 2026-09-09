---
type: Explanation
title: Marty Cagan's product strategy
description: How Marty Cagan connects product vision and business objectives to team problems through focus, insights, actions, and active management, with discovery and delivery feeding learning back into strategy.
tags: [marty-cagan, svpg, product-strategy, product-vision, strategic-context, empowered-teams, focus, insights, team-objectives, okrs, product-discovery, pe-foundations]
status: draft
sources:
  - id: overview
    resource: https://www.svpg.com/product-strategy-overview/
    title: Marty Cagan — Product Strategy – Overview
  - id: context
    resource: https://www.svpg.com/coaching-strategic-context/
    title: Marty Cagan — Coaching – Strategic Context
  - id: focus
    resource: https://www.svpg.com/product-strategy-focus/
    title: Marty Cagan — Product Strategy – Focus
  - id: insights
    resource: https://www.svpg.com/product-strategy-insights/
    title: Marty Cagan — Product Strategy – Insights
  - id: actions
    resource: https://www.svpg.com/product-strategy-actions/
    title: Marty Cagan — Product Strategy – Actions
  - id: management
    resource: https://www.svpg.com/product-strategy-management/
    title: Marty Cagan — Product Strategy – Management
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
---

# Marty Cagan's product strategy

Marty Cagan describes product strategy as the approach, and the reasoning behind
it, for realizing a product vision while meeting the company's needs along the
way. Its practical question is which problems product teams should work on.
Product discovery determines effective solutions to those problems; product
delivery builds solutions and brings them to market.[^overview]

This explanation is for product leaders and teams trying to understand that
connection. It follows Cagan's January–February 2020 SVPG articles. They state
his advocated approach; they do not independently establish that it produces
better results in every organization. The example below is fictional, and the
connections to this bundle are an editorial interpretation.

If the relationship to business strategy is unclear, read
[Strategy perspectives and their relationships](strategy-perspectives.md#strategic-context-and-team-problems).
It connects team problems to choices about advantage without requiring a handoff.

## Strategy connects a future to present choices

Cagan places product strategy within a broader **strategic context**. The
company mission supplies purpose; the product vision describes a future worth
creating. Company objectives identify current business priorities, while the
company scorecard describes business health. Product principles express values
that inform tradeoffs. Strategy connects the longer-term vision and nearer-term
objectives to the work of teams with different capabilities.[^context]

These concepts answer different questions:

| Concept | Question it answers |
| --- | --- |
| Product vision | What future are we trying to create? |
| Company objectives | Which business results matter now? |
| Product strategy | Which problems and opportunities should receive concentrated effort, and why? |
| Team objectives | What problem is this team responsible for, and how will progress be measured? |
| Discovery | Which solution could actually solve that problem? |
| Delivery | How do we build and bring that solution to market? |

The table combines Cagan's strategic-context account with his distinction
between strategy, discovery, and delivery.[^context][^overview][^actions]
A revenue target names a desired result. A roadmap of features names proposed
work. The strategic reasoning explains why that work should move the business
toward its vision and objectives.[^overview]

## Focus: concentrate effort where it can matter

Focus requires leaders to choose a small number of consequential problems and
commit enough attention and capacity to make progress. Cagan distinguishes this
from distributing engineering time among stakeholders: ranking requests can
still leave the organization pursuing too many things. Each major initiative
also consumes leadership attention, decisions, and coordination. Saying no to
some work is insufficient if the remaining commitments still overwhelm the
organization.[^focus]

Consider [Northbank Equipment](../northbank-equipment.md), the fictional rental
service. Its vision is to let small
contractors obtain the equipment they need without disrupting a job. Its current
business objective is to increase repeat rentals. Leaders could distribute
capacity across loyalty rewards, fleet expansion, account dashboards, and
booking improvements. Instead, suppose they concentrate on failed first rentals,
deferring the loyalty program and dashboard redesign. The choice becomes
meaningful because it reserves capacity for a specific obstacle to repeat use.

Focus alone leaves a question unanswered: why should failed first rentals be
the most promising place to intervene? That requires insight.

## Insights: explain the opportunity

Cagan identifies four recurring sources of insight: quantitative analysis,
qualitative research, enabling technology, and industry developments. An insight
can originate anywhere, including a team or an engineer; leaders need enough
preparation to recognize its significance. His account rejects the idea that
filling in a framework can substitute for studying customers, the business,
and its circumstances.[^insights]

In the rental example, suppose data shows that customers whose first reservation
fails rarely return. Interviews reveal that uncertain availability makes
contractors unwilling to risk a second disrupted job. Recent inventory-system
improvements make reliable confirmation technically plausible. Together these
observations suggest a strategic hypothesis: improving reservation reliability
could make the service dependable enough to become a recurring choice.

The example also shows a limit. Correlation between successful first rentals and
return visits does not establish causation. Perhaps frequent renters already
know which depots have reliable stock. That competing explanation changes what
the team needs to learn before attributing retention gains to its intervention.

Cagan also distinguishes evaluative learning about a proposed solution from
generative learning that reveals another opportunity. Discoveries made while
solving one problem can therefore influence which problems deserve attention
next. Leaders must connect and share learning across teams for this to inform
strategy.[^insights]

## Actions: give the reasoning an owner

In Cagan's empowered-team model, leaders translate strategy into problems that
particular teams own, explain the strategic context, and establish which results
to measure. The team has room to discover and deliver an effective solution.
Objectives and Key Results can formalize that arrangement: the objective states
the problem, and key results measure progress. Cagan treats OKRs as optional;
they cannot supply missing strategic thinking, capable teams, or delegated
authority.[^actions]

For the rental service, the booking team might own reducing first reservations
that fail because equipment is unavailable. The intended business connection is
increased repeat use. The team could investigate inventory freshness, reservation
holds, substitute equipment, or depot confirmation. Each remains a candidate
solution. Assigning “build a confirmation screen” would settle a solution choice
before learning whether that screen addresses the failure.

Cagan nevertheless acknowledges that feature teams can benefit from a strong
strategy. His additional argument for empowerment concerns who discovers the
solution and how much freedom they have to achieve the result.[^actions]

## Management: sustain progress and revise understanding

Strategy remains a leadership responsibility after objectives are assigned.
Cagan describes active coaching and assistance with obstacles such as shared
platform dependencies, missing capabilities, stakeholder concerns, and urgent
customer issues. Regular conversations make progress and new learning visible;
urgent problems should be raised immediately. The leader helps teams resolve
issues while preserving their ability to make decisions.[^management]

Suppose the booking team learns that inaccurate depot records cause most failed
reservations, but the depot-systems team is occupied elsewhere. Leadership must
resolve the capacity conflict. Asking the booking team to work harder cannot
remove it. If better records reduce failures but repeat use remains unchanged,
the original strategic hypothesis needs reconsideration. If failures do not
decline, the intervention itself remains in question. Those are different
reasons to change course.

The four elements therefore form an ongoing relationship: focus concentrates
effort, insights explain its direction, actions establish responsibility, and
management supports progress as reality changes. Learning can reopen earlier
choices.[^overview][^management]

## How this account fits product engineering

This bundle separates decisions that Cagan discusses together under product
strategy. The following mapping preserves both vocabularies:

- [Where to play](../strategy/) owns choices about participation, advantage,
  and value capture. Those choices constrain which product opportunities matter.
- [What to solve](../problem/) owns problems, outcomes, and evidence. Cagan's
  account explains how leadership selects and concentrates effort on team
  problems within that context.
- [What to build](../solution/) owns solution exploration and commitment.
  Strategic direction provides context for that exploration.

His term *product delivery* includes building and bringing a solution to market;
it spans concerns this bundle separates into [How to build it](../engineering/)
and [How to ship it](../delivery/). These are different organizing schemes,
not a requirement for sequential handoffs.

The account supports the connection between strategic direction, problem
selection, solution exploration, and outcome evidence. It does not make OKRs or
Cagan's coaching cadence mandatory, or by itself establish competitive
advantage. [Strategy perspectives and their relationships](strategy-perspectives.md)
compares its contribution with coherent strategic choices, value economics,
landscape, and renewal, including how learning can reopen those questions.

For the original argument, start with Cagan's overview. The focus and insights
articles develop why particular problems deserve attention; actions and
management explain how that reasoning reaches teams and stays connected to
their work. Strategic Context locates strategy among the other information
teams need to make decisions.

## Engineering discoveries can change the problem investment

Northbank's integration improvements make reliable confirmation plausible,
but the later experiment finds that fresh reads do not prevent competing
allocations. That distinction is consistent with an initial insight followed
by new evidence. The [project scenario](alleman-performance-based-project-management.md#a-worked-example-reliable-rental-confirmation)
examines the resulting scope and forecast decision; the [allocation episode](../engineering/northbank-allocation-change.md)
shows a later bounded design.

Platform work can be necessary to progress on the product problem. It still
needs a reason and an owner: [unifying validation](../engineering/northbank-engineering-system.md)
addresses omitted evidence, while replacing runtime plumbing addresses a
specific maintenance burden. Neither should become an unlimited platform
rewrite under the label of product strategy.

## Continue exploring

- [Shape Up: Ryan Singer's approach to shaping, betting, and building](shape-up.md#how-shape-up-fits-product-engineering)
  examines the boundary between assigning a team a problem and assigning a
  shaped solution concept, then connects investment to completion.
- [Jobs to Be Done](jobs-to-be-done.md) deepens the customer-progress inquiry
  behind a proposed team problem.
- [Outcomes and evidence](../problem/outcomes-and-evidence.md) examines whether
  delivered work produces the expected result.
- The [strategic choices route](../reading-product-engineering.md#strategic-choices)
  connects team focus back to advantage and landscape.

[^overview]: Marty Cagan, [Product Strategy – Overview](https://www.svpg.com/product-strategy-overview/), February 17, 2020.
[^context]: Marty Cagan, [Coaching – Strategic Context](https://www.svpg.com/coaching-strategic-context/), January 9, 2020.
[^focus]: Marty Cagan, [Product Strategy – Focus](https://www.svpg.com/product-strategy-focus/), February 18, 2020.
[^insights]: Marty Cagan, [Product Strategy – Insights](https://www.svpg.com/product-strategy-insights/), February 19, 2020.
[^actions]: Marty Cagan, [Product Strategy – Actions](https://www.svpg.com/product-strategy-actions/), February 20, 2020.
[^management]: Marty Cagan, [Product Strategy – Management](https://www.svpg.com/product-strategy-management/), February 21, 2020.
