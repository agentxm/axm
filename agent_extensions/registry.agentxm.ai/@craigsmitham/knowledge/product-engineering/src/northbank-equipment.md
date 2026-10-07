---
type: Explanation
title: "Northbank Equipment: a product-engineering case"
description: A fictional rental business connects customer value, strategic choices, domain behavior, code, tooling, delivery, operation, and continuing care through related episodes with explicit assumptions.
tags: [product-engineering, worked-example, rental, northbank, business-context, engineering-system]
status: draft
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
---

# Northbank Equipment: a product-engineering case

Northbank Equipment is the fictional business used across this bundle. Its
customers need equipment to keep work moving; its staff and software must make
promises they can honor. The case connects business choices to customer
experience, domain rules, application code, tooling, infrastructure, delivery,
and continuing care. Technical discoveries can reopen those choices.

All people, decisions, observations, and results in the case are invented.
They illustrate reasoning, not market research, evidence of a method's
effectiveness, or a production design ready to deploy. Each linked example
states its relevant assumptions and remains readable on its own.

## Business, people, and alternatives

Northbank operates Central and Riverside depots in one regional service area.
It owns equipment, uses maintenance suppliers, and occasionally obtains
replacement equipment from partner depots. Customers use a contractor portal
or assisted phone booking; staff use a depot console. Physical preparation,
delivery or collection, support, and billing are part of the service.

The focal customers are small contractors coordinating equipment with a job
start. An owner or administrator may buy the rental, a supervisor coordinates
the crew, and an operator uses the equipment. One person can hold several
roles; that does not make their goals identical. Depot staff, dispatchers,
repair suppliers, support colleagues, and engineers have additional needs.

Alternatives include owning, borrowing, another rental provider, rescheduling,
and buying an operated service. Flexible pickup renters provide a contrasting
segment. Northbank's strategic hypothesis is that dependable fulfillment and
recovery can earn repeat preference and enough premium to cover reserves,
staff effort, delivery, and support. Higher utilization can conflict with
reserves; quick confirmation can conflict with a trustworthy promise.

[Value and demand](problem/value-and-demand-model.md) distinguishes the offering
from the audience, need, job, and proposition. [Strategy perspectives](foundations/strategy-perspectives.md)
examines the different questions behind the investment. Neither establishes
that the hypothesis is true.

## The existing arrangement

The software grew around assigning a particular machine to a booking at one
depot. Across two depots, staff now compensate for stale records, breakdowns,
and ambiguous confirmation through calls and spreadsheets. The portal can
look reassuring before the underlying commitment is secure.

Three responsibility groups collaborate: booking/product experience, depot
systems/integrations, and platform/operations. These are not automatically
bounded contexts or separate deployments. Product and depot leadership decide
service obligations; design and engineering contribute alternatives and
feasibility evidence; technical owners choose implementations within those
obligations. Incident coordination has an explicitly assigned owner.

| Part of the system | Responsibility and tension |
| --- | --- |
| Portal and staff console | Show and act on commitments; different screens must preserve the meaning of confirmation |
| Shared application package | Booking, provider integration, access, documents, and runtime helpers have accumulated mixed responsibilities |
| Fleet product | Supplies catalog, location, and readiness information; fresh reads do not establish atomic reservation capability |
| Payment and messaging providers | Supply authorization and communication; an unknown result differs from a decline, and delivery differs from comprehension |
| Database and durable work | Preserve reservations, allocations, operation history, and pending publication |
| Receipt workers | Render financial documents from committed data; replay must not initiate another charge |
| Tooling and CI/CD | Build, validate, identify, and deploy artifacts; duplicated check lists and custom boundary tooling obscure guarantees |
| Infrastructure and operations | Provide storage, queues, compute, access, telemetry, recovery, and cost control |
| People and physical resources | Prepare, inspect, move, and substitute equipment; software does not supply missing capacity |

## The promise and its vocabulary

For the selected offering, a customer buys access to an agreed capability for
a period under agreed terms. The physical assignment can change within those
terms. A named-machine agreement or a prohibition on substitution is a
different case; remodeling software cannot silently change it.

| Term | Meaning in the selected offering |
| --- | --- |
| Request | Desired capability, period, site constraints, and decision deadline; no equipment promise yet |
| Offer | Proposed capability, period, price, and terms, with stated acceptance conditions |
| Hold | Temporarily secured capacity with an owner and expiry |
| Confirmed reservation | Northbank's recorded commitment after its required capacity and deposit conditions are established |
| Allocation | Assignment of a physical asset to fulfill the reservation |
| Ready for handover | The fleet/depot release judgment, distinct from capacity to promise for a future period |
| At risk | Evidence threatens fulfillment and calls for recovery; the commitment has not silently become an unaccepted request |
| Withdrawal | Explicit withdrawal under an accepted policy, including communication and applicable consequences |
| Fulfilled | The agreed service was actually supplied, assessed separately from confirmation |

Confirmation is not a claim that breakdowns are impossible. Withdrawal terms
must be explicit; software cannot manufacture permission to break a promise.
During a controlled pilot, staff may secure capacity. A later design can use
software enforcement. Silence means neither approval nor confirmation.

## Related episodes, not one oversized project

| Episode | Situation | Explore |
| --- | --- | --- |
| A — Choose a dependable service | Failed first rentals motivate investigation of customer progress, reserve capacity, and alternatives | [JTBD](foundations/jobs-to-be-done.md), [value](foundations/value-based-strategy.md), [strategic choice](foundations/playing-to-win.md), [team focus](foundations/cagan-product-strategy.md) |
| B — Make confirmation understandable | Compare calendar, guided request, and suggested appointments; consider a bounded staff-confirmation flow | [Design exploration](foundations/buxton-design.md), [use cases](foundations/use-cases.md), [conceptual integrity](foundations/brooks-architect-role.md), [Shape Up](foundations/shape-up.md) |
| C — Discover the inventory constraint | The assumed API cannot prevent competing allocations; reconsider a two-depot commitment and choose a controlled one-depot pilot | [Project evidence](foundations/alleman-performance-based-project-management.md), [requirement specimens](solution/requirements/authoring/northbank-commitment-requirements.md) |
| D — Separate commitment from allocation | A later investment establishes allocation ownership and policy-governed replacement | [DDD](foundations/domain-driven-design.md), [worked allocation change](engineering/northbank-allocation-change.md) |
| E — Simplify the engineering system | Resolve mixed responsibilities, duplicated validation, and obsolete plumbing; verify replacements and migrate | [Wardley mapping](foundations/wardley-mapping/wardley-mapping.md), [worked engineering-system change](engineering/northbank-engineering-system.md) |
| F — Observe and respond | A later two-depot period supplies measurement examples; a receipt-worker incident exposes recovery and coordination concerns | [KPIs](foundations/key-performance-indicators.md), [service levels](foundations/service-level-indicators-objectives-and-agreements.md), [incident records](delivery/work-items/northbank-receipt-incident.md), [maintenance triggers](foundations/maintenance-strategies.md) |
| G — Renew or retire | Preserve invoice customers' continuity, reconsider an old export, and investigate demand for operated services | [Care](maintenance/maintenance-and-the-life-of-software-products.md), [business assumptions](foundations/drucker-theory-of-the-business.md), [renewal](foundations/drucker-organizational-renewal.md) |

Engineering care continues during discovery and delivery. An incident can
reopen the business hypothesis. A later episode needs its own decision; it is
not work silently included in an earlier commitment.

Shape Up's six-week appetite and Alleman's six-week, $120,000 commitment are
alternative management illustrations around B/C. The former bounds a designer
and two engineers' confirmation project and excludes automated substitution,
inter-depot transfers, and inventory replacement. The latter examines an
initial two-depot plan, new evidence, a revised forecast, and an authorized
one-depot scope. The methods and the meanings of their numbers remain distinct.

## What the numbers establish

The numerical exhibits have separate scopes. Do not combine them into a
company history, financial forecast, or claim of causal improvement.

| Exhibit | Assumption and limit |
| --- | --- |
| Value-stick and employee-surplus amounts | Fixed illustrative exchanges expose creation and distribution of value; they are not measured Northbank willingness to pay or sell |
| Project budget and forecast ranges | Fictional assumptions explain commitment, actuals, forecast, and revision; they are not derived from a spending ratio |
| Confirmation KPI: 82% baseline, 89% observed, 92% target | A later two-depot population under one declared definition; not the one-depot pilot's results |
| Read SLI: 99.91%, with 90% of error budget consumed | The million-attempt calculation is an arithmetic exhibit, not claimed pilot traffic or fulfillment evidence |
| Worker headroom and time-to-exhaustion | A conditional resource projection; changed workload can invalidate it |

The KPI counts requests; the SLI counts read attempts; actual fulfillment and
crew disruption concern later experiences. A passing allocation test, an
available status page, and a satisfied customer are different claims requiring
different evidence. [Outcomes and evidence](problem/outcomes-and-evidence.md)
explains the connection without treating one observation as proof of the whole.

## Follow the context at different scales

The service view includes people and physical resources. A product Wardley
view examines dependencies and evolution relative to the contractor's need;
an engineering Wardley view can instead anchor on the team's need to change
and release dependably. DDD context maps describe meaning and relationships;
module graphs describe imports; task graphs describe execution dependencies;
deployment views locate processes, persistence, and external effects.

These views correspond but do not have identical units. A capability can use
several packages and a purchased service. Strategic importance does not dictate
dependency direction, and a package is not automatically a bounded context.
Use the [allocation](engineering/northbank-allocation-change.md) and
[engineering-system](engineering/northbank-engineering-system.md) episodes to
follow a concrete connection down to code and supporting artifacts.

For a broader entry, [Reading product engineering](reading-product-engineering.md)
keeps its question-led routes. Follow an episode only while it helps answer
your question. The examples illustrate selected decisions; they do not fill
the bundle's unwritten general architecture, construction, release, or
operational guides.
