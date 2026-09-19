---
type: Explanation
title: "Glen Alleman's performance-based project management: capabilities, credible plans, and evidence of progress"
description: How Glen Alleman's five project-management principles connect needed capabilities, plans, resources, risk, and demonstrated progress, with an interpretation for forecasting and revising product commitments.
tags: [glen-alleman, project-management, performance-based-project-management, capabilities, planning, scheduling, resources, uncertainty, risk, baseline, forecasting, earned-value, pe-foundations]
status: draft
sources:
  - id: principles
    resource: https://pmworldjournal.com/wp-content/uploads/2023/04/pmwj128-Apr2023-Alleman-5-Immutable-Principles-of-Project-Success.pdf
    title: Glen B. Alleman — 5 Immutable Principles of Project Success (2023)
  - id: capabilities
    resource: https://www.projectmanagement.com/articles/267184/what-does-done-look-like-
    title: Glen Alleman — What Does Done Look Like? (2011), public excerpt
  - id: planning
    resource: https://www.research.fsu.edu/media/5277/impims-step-by-step.pdf
    title: Glen B. Alleman — Integrated Master Plan / Integrated Master Schedule Step-by-Step (2017)
  - id: risk
    resource: https://www.linkedin.com/pulse/all-risk-comes-from-uncertainty-glen-alleman
    title: Glen Alleman — All Risk Comes From Uncertainty (2023)
  - id: pmb
    resource: https://pmworldlibrary.net/wp-content/uploads/2015/09/pmwj38-Sep2015-Alleman-Coonce-Price-CPM-Series-Article.pdf
    title: Alleman, Coonce, and Price — Building a Credible Performance Measurement Baseline (2015)
  - id: practices
    resource: https://www.projectmanagement.com/pdf/attask-project-leadership-lessons-from-40-ppm-experts.pdf
    title: Glen B. Alleman — Principles of Performance-Based Project Management, in Project Leadership
  - id: change
    resource: https://www.linkedin.com/pulse/plan-work-glen-alleman-b68cc
    title: Glen Alleman — Plan the Work, Work the Plan (2024)
  - id: outcomes
    resource: ../problem/outcomes-and-evidence.md
    title: Outcomes and evidence
  - id: shape-up
    resource: shape-up.md
    title: "Shape Up: Ryan Singer's approach to shaping, betting, and building"
  - id: overview
    resource: ../overview.md
    title: Product engineering overview
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
---

# Glen Alleman's performance-based project management: capabilities, credible plans, and evidence of progress

Glen Alleman's approach asks whether a project can deliver the needed
capability, and whether observed performance still supports that expectation.
His five principles concern completion, the path to it, sufficient resources,
impediments, and evidence of progress.[^principles]

This explanation is for product and engineering colleagues assessing a
project commitment or interpreting a progress report. It follows Alleman's
published accounts and selected coauthored work. He calls the principles
**immutable** and argues for their applicability across project methods;
that is his position, not an independently established guarantee of
success.[^principles] The rental-confirmation project below is fictional.
Its numbers, choices, and connections to this bundle are editorial examples
and interpretations, rather than reported results from his work.

## Performance connects commitments to evidence

Consider [Northbank Equipment](../northbank-equipment.md), whose customers need
dependable equipment confirmation before dispatching a crew. A project report
says that half the
budget has been spent and most screens are finished. The investment decision
still needs an answer to a different question: can the service make and honor
the confirmation customers need?

A useful account connects the intended capability to intermediate
accomplishments, the work and resources needed to produce them, the remaining
uncertainty, and the evidence available now. Each connection can fail. The
screens may work while inventory data is unreliable; the integration may work
while depot staff cannot support the process; the capability may work while
its cost exceeds the investment the organization is willing to make.

Alleman uses planning and measurement to support decisions in the presence of
change. His later account explicitly recognizes that change happens and calls
for assessing its consequences for money, time, risk, and customer
value.[^change] Our reading is that a credible plan makes those consequences
discussable. A plan that hides an inconvenient finding loses that function.

## Define what done means

Alleman's starting point is the capability the customer needs and the reason
for investing in it. Requirements need that reason, and delivery needs
tangible evidence that the agreed capability exists.[^capabilities]

In the example, “add a confirmation screen” names a candidate deliverable.
The needed capability is broader: a contractor can obtain an equipment
commitment before sending a crew, and depot staff can honor or explicitly
withdraw that commitment. This includes behavior, information, and an
operating arrangement. A screen alone cannot supply it.

Suppose the project initially covers routine rentals at two depots. Its
acceptance conditions could address who may confirm, how conflicting
allocations are prevented, what happens when confirmation is withdrawn, and
whether customers can identify the current state. These are illustrative
conditions to investigate and agree, not requirements established by this
explanation. Naming the audience, operating conditions, and exclusions makes
the proposed completion boundary assessable.

Alleman distinguishes several kinds of measure:[^principles]

| Measure | Question it supports |
| --- | --- |
| Measure of Effectiveness (MoE) | Does the capability serve its operational purpose under the stated conditions? |
| Measure of Performance (MoP) | Does the system achieve the required functional or physical performance? |
| Key Performance Parameter (KPP) | Which essential characteristic would force reconsideration if its threshold were missed? |
| Technical Performance Measure (TPM) | How is a technical attribute progressing against its required or expected level? |

For this project, a field observation of successful pre-dispatch confirmation
could inform effectiveness; measured delay in displaying a withdrawal could
inform performance. Whether that delay is critical enough to become a KPP
depends on its consequences. The labels organize judgments; they do not set
the thresholds or prove the relationship between the measures.

A [key performance indicator](key-performance-indicators.md#how-kpis-relate-to-allemans-measures-and-service-levels)
identifies a measure selected for an important objective and decision. That
selection can apply to an MoE or MoP; it does not turn KPI into a synonym for
KPP. The linked explanation develops the distinction between what a measure
establishes and why it receives management attention.

## Explain the path to done

Alleman's Integrated Master Plan describes events, the accomplishments needed
for those events, and criteria for recognizing accomplishment. The Integrated
Master Schedule connects the work to time and dependencies. Together they
connect expected maturity with when it must be demonstrated.[^planning]

The rental project might need three increasingly demanding demonstrations:

| Accomplishment | Illustrative evidence | Dependency exposed |
| --- | --- | --- |
| The promise is understood | Customers and depot staff can distinguish a request, confirmation, and withdrawal in representative scenarios | Agreement about the operating meaning |
| The promise survives competing actions | Integrated behavior prevents conflicting allocations and handles withdrawal | Reliable inventory integration and domain rules |
| The pilot can operate dependably | Staff use the workflow, support can recover failures, and agreed acceptance conditions hold at both depots | Training, support, deployment, and operational access |

The table describes a possible maturity sequence. A schedule adds the work,
durations, resource availability, and dependencies needed to achieve it.
Putting “integration complete” on a date without stating what completion
requires would leave the most consequential assumption hidden.

The distinction also helps with partial progress. Finishing interface work
may support the first accomplishment while contributing little evidence for
the second. A flat list of completed tasks would make that difference hard
to see. The plan needs enough structure to explain what a result enables.

## Establish whether the resources are sufficient

Alleman's third question covers the people, time, money, facilities, and
other resources needed to reach the agreed result.[^principles]

In the example, having developers available is insufficient if nobody with
inventory-system knowledge can participate until after the planned pilot.
Likewise, depot training and support consume capacity even when they do not
appear in a software backlog. Naming those dependencies changes the
credibility of the commitment before implementation begins.

For illustration, suppose the initial commitment is a six-week pilot with a
$120,000 budget. That is an agreed target. The estimate supporting it should
make clear which work is included, whose availability is assumed, what prior
experience informs the durations, and what remains uncertain. A desired date
does not supply that evidence.

If uncertainty is material, a forecast range is more informative than an
unqualified point date. The range still needs a basis: dependency information,
observations, comparable work, or an explicit model. Attaching “80% confidence”
to an unsupported number would add an appearance of knowledge without
improving the decision. This is an application judgment about credible
communication, not a probability calculation prescribed here.

## Understand what could prevent success

Alleman relates risk to uncertainty affecting objectives. He distinguishes
missing knowledge that investigation can reduce from variability that the
chosen model treats as irreducible. His treatments emphasize learning and
risk-handling work for the former, and cost, schedule, or technical margins
for the latter.[^risk]

Suppose the team does not know whether the inventory API can reserve equipment
atomically. A focused experiment can reduce that uncertainty. Ordinary
variation in depot response time may remain even after the workflow is well
understood. The team needs to account for that variation in the operating
promise and its schedule assumptions. The appropriate treatment depends on
which uncertainty is actually present; calling all delay “risk” conceals the
choice.

A useful risk statement in this example connects a condition to a consequence:
if the API cannot prevent competing reservations, the proposed confirmation
promise may require additional integration work. It also identifies who will
investigate, when the answer is needed, and what alternative will be considered.
The investigation consumes real project capacity.

Once the API is shown to lack the operation, that fact is an observed problem.
The time required for a remedy may still be uncertain. Treating both as
undifferentiated entries in a risk list would hide the action now required.
Neither a list of possible problems nor an unallocated buffer demonstrates
that the project has a workable response.

## Measure demonstrated progress

Alleman calls for physical completion against meaningful criteria. Elapsed
time and consumed resources alone cannot establish progress toward the
intended result.[^principles]

For software, “physical” can mean observable evidence that specified behavior
works. It need not mean a tangible manufactured object. A tested integrated
confirmation flow can supply evidence; a developer's statement that the flow
is nearly finished leaves its completion criteria unresolved.

The unit of completion matters. Finishing three of six screens is 50% of a
screen count. It does not establish 50% of the work, capability, or risk
reduction. A completion percentage needs a defined denominator and a credit
rule that fits the work. For this small project, reporting each accomplishment
and its evidence may be clearer than combining them into one percentage.

In their baseline paper, Alleman, Coonce, and Price argue that earned-value
measures need technical and quality evidence. Earned value represents budget
credited to accomplished work; cost and schedule indices alone do not show
that the resulting system performs as required.[^pmb]

Suppose a work package has an agreed budget of $20,000 and earns completion
credit only after its integrated acceptance criteria pass. Spending $18,000
does not establish $18,000 of earned value. Nor does earning the full $20,000
establish that customers received $20,000 of economic benefit. This simplified
example exposes the distinction without prescribing an earned-value system
for every software team.

Alleman's planning guide also connects observed performance to forecasts of
final cost.[^planning] In this example, the important next question is what
the completed work and remaining dependencies imply for the rest of the
project. The answer can change before the agreed target changes.

## How the principles become a management system

Alleman separates principles from the practices that enact them. His five
practices identify needed capabilities, establish a requirements baseline,
develop a performance measurement baseline, execute against it, and manage
risk continuously. His governing processes organize the project; plan,
schedule, and budget work; capture actual costs; analyze performance; and
maintain revisions and data.[^practices]

These are connected responsibilities. Continuous risk management influences
the plan and the work being performed; performance analysis can reveal a
requirement or resource assumption that must be reconsidered. The five
practices are not five successive approval gates.

The **performance measurement baseline** connects planned work, timing, and
budget so actual accomplishment can be assessed. Alleman and his coauthors
emphasize integrating those commitments with technical maturity and risk
evidence.[^pmb] The following distinctions apply that account to the example:

| Record | Meaning in the rental project |
| --- | --- |
| Baseline | The approved scope, schedule, and budget against which performance is assessed |
| Actuals | Work accomplished and resources consumed, with the relevant evidence |
| Forecast | The current expectation for finishing, given remaining work, risks, and assumptions |
| Authorized revision | A decision changing the commitment, with its reason and impact retained |

A forecast of eight weeks can coexist with a six-week baseline. That
difference is information decision-makers need. Quietly replacing the baseline
with the forecast would remove the comparison. Keeping the old target while
suppressing the forecast would remove the warning. An authorized revision can
change the commitment while preserving both the earlier expectation and why
it changed.

Alleman's account of change asks what a proposed change costs in time, money,
risk, and customer value.[^change] For this project, the practical consequence
is that the same review must consider both the revised promise and the work
needed to honor it. A new date alone does not explain either.

## A worked example: reliable rental confirmation

Return to the illustrative six-week, $120,000 pilot. At the end of week three,
the team has spent $60,000. Customers understand the prototype, and the
confirmation interface is implemented. The inventory experiment now shows
that competing reservations cannot be prevented through the assumed API.
The integrated accomplishment has therefore not been demonstrated.

The team revises its remaining-work estimate. For illustration, its assessment
now suggests seven to nine weeks in total and $140,000–$180,000 if both depots
and the original promise remain in scope. These ranges are invented for the
example, not derived from the spending ratio. In a real report, they would
need supporting estimates, assumptions, and evidence.

The project has a decision to make:

| Option | Consequence to assess |
| --- | --- |
| Retain both depots and the original promise | Authorize the additional investment and assess the revised forecast |
| Pilot at one depot with a controlled allocation process | Test whether the smaller operating boundary can still provide a dependable promise |
| Stop delivery work and fund a bounded feasibility investigation | Delay the capability while establishing whether a credible solution exists |

Suppose decision-makers choose the one-depot pilot. They must assess staffing,
withdrawal handling, and whether the manual allocation process can meet the
same essential promise. They also need to change the accepted scope and
affected evidence. They cannot honestly report the original two-depot
capability as delivered.

The report can now preserve four distinct facts: what was originally agreed,
what has been demonstrated, what is currently expected, and what change was
authorized. This is the value of connecting the principles: the dependency
failure becomes a concrete investment and capability decision.

### Carry the revised commitment into its artifacts

The one-depot pilot is Northbank's episode C. The [requirement specimens](../solution/requirements/authoring/northbank-commitment-requirements.md)
show how accepted scope and later changes remain identifiable. A changed plan
must reach the acceptance evidence, staff operating arrangement, migration,
and release decision. Completed screens or a passing source build cannot
establish that the controlled allocation writer exists in the deployed pilot.

The [later allocation design](../engineering/northbank-allocation-change.md)
and two-depot KPI period are separate scenarios requiring additional decisions.
The six-week appetite in Shape Up is likewise a different kind of statement.
The invented budget and forecast ranges here explain this management judgment;
they are not Northbank accounts or consequences of another method's numbers.

## Project accomplishment and product value

This bundle distinguishes delivered outputs from consequential changes in
customer behavior, customer condition, or organizational results.[^outcomes]
That distinction complements Alleman's concern with meaningful measures; it
also prevents “performance” from becoming one label for unlike evidence.

In the rental example, passing integrated acceptance tests supports a claim
about behavior. Successful operation at the pilot depot supports a claim
about capability in that setting. Fewer unnecessary crew dispatches would
support the intended customer outcome. Improved retention or profitability
requires further evidence and an account of other influences.

Some projects can include operational-effectiveness evidence within their
completion criteria. Others finish before benefits can be observed reliably.
The completion boundary should state which situation applies and who will
follow the remaining outcome questions. A successful project report does not
by itself settle the product's value hypothesis.

## How this informs product engineering

The following connections interpret the approach within this bundle's
iterative lifecycle.[^overview] They do not prescribe adopting Alleman's full
management system or moving project management into the shipping section.

[Requirements and neighboring artifacts](../solution/requirements/foundations/requirements-and-neighboring-artifacts.md)
owns the boundary between exploratory meaning and accepted obligations.
Capability statements inform that work; the project plan should link to its
authority. [Analyzing and specifying requirement change](../solution/requirements/lifecycle/analyzing-requirement-impact.md)
provides the practical continuation when a revised commitment changes
behavior, scope, or acceptance evidence.

[Designing executable specifications](../engineering/designing-executable-specifications.md)
can supply part of the evidence of accomplishment. [Work items](../delivery/work-items/)
coordinate the changes that travel toward delivery. Neither a passing example
nor a closed ticket automatically establishes the whole project capability.

[Shape Up](shape-up.md#appetite-bounds-the-investment) distinguishes an appetite
for investment from an estimate of proposed work.[^shape-up] Our comparison is
that appetite asks what the organization is willing to spend, while a forecast
asks what the proposed scope is likely to require. The first constrains the
choice; the second helps assess whether the choice fits. A fixed appetite can
lead to a smaller solution when the forecast changes.

Two other terms need care. Shape Up's customer **baseline** is the current
experience against which an improvement is judged; the performance measurement
baseline records a project commitment. Its **hill chart** expresses the team's
understanding of how to complete scopes; it is not a calculated physical
completion measure.[^shape-up] These concepts can inform the same decision
without being interchangeable.

Tailoring is therefore a substantive choice. A small internal project may
answer the questions with a few explicit accomplishments, resource assumptions,
and regular evidence reviews. A project spanning suppliers, external deadlines,
and tightly coupled systems may need detailed dependency schedules and cost
controls. That is our application judgment. This explainer does not establish
compliance with any earned-value standard or contractual reporting requirement.

When solution feasibility is still unknown, [Buxton's design account](buxton-design.md)
helps explain exploration before commitment. The next funded effort might
aim to produce feasibility evidence instead of a deployable capability; its
completion claim should say so. For a wider reading route, continue through
[Check project commitments](../reading-product-engineering.md#check-project-commitments),
or return to [Outcomes and evidence](../problem/outcomes-and-evidence.md) when
the question is whether the resulting product made a difference.

[^principles]: Alleman, [5 Immutable Principles of Project Success](https://pmworldjournal.com/wp-content/uploads/2023/04/pmwj128-Apr2023-Alleman-5-Immutable-Principles-of-Project-Success.pdf), especially the five questions and the performance measures.
[^capabilities]: Alleman, [What Does Done Look Like?](https://www.projectmanagement.com/articles/267184/what-does-done-look-like-), public introductory excerpt.
[^planning]: Alleman, [Integrated Master Plan / Integrated Master Schedule Step-by-Step](https://www.research.fsu.edu/media/5277/impims-step-by-step.pdf), version 3.1.2; used for event-based planning and performance-informed forecasts, not its historical compliance rules.
[^risk]: Alleman, [All Risk Comes From Uncertainty](https://www.linkedin.com/pulse/all-risk-comes-from-uncertainty-glen-alleman), 2023.
[^pmb]: Alleman, Coonce, and Price, [Building a Credible Performance Measurement Baseline](https://pmworldlibrary.net/wp-content/uploads/2015/09/pmwj38-Sep2015-Alleman-Coonce-Price-CPM-Series-Article.pdf), 2015.
[^practices]: Alleman, [Principles of Performance-Based Project Management](https://www.projectmanagement.com/pdf/attask-project-leadership-lessons-from-40-ppm-experts.pdf), in *Project Leadership*, printed pages 57–58.
[^change]: Alleman, [Plan the Work, Work the Plan](https://www.linkedin.com/pulse/plan-work-glen-alleman-b68cc), especially “Managing in the Presence of Change.”
[^outcomes]: [Outcomes and evidence](../problem/outcomes-and-evidence.md).
[^shape-up]: [Shape Up](shape-up.md), especially “Appetite bounds the investment,” “Progress depends on resolving uncertainty,” and “Finishing requires deliberate scope decisions.”
[^overview]: [Product engineering overview](../overview.md), especially “Lifecycle and shared foundations.”
