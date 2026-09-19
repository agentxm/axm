---
type: Explanation
title: "Value-based strategy: Oberholzer-Gee's approach to creating and sharing value"
description: How Felix Oberholzer-Gee's value-based strategy connects customer, employee, and supplier value through the value stick, value drivers, and competitive choices, distinguishing value creation from capture.
tags: [felix-oberholzer-gee, better-simpler-strategy, value-based-strategy, value-stick, value-maps, willingness-to-pay, willingness-to-sell, customer-surplus, employee-value, supplier-value, value-creation, value-capture, pe-foundations]
status: draft
sources:
  - id: interview
    resource: https://www.library.hbs.edu/working-knowledge/a-simple-question-that-can-guide-companies-to-epic-success
    title: Felix Oberholzer-Gee interviewed by Danielle Kost — A Simple Question That Can Guide Companies to Epic Success
  - id: frameworks
    resource: https://online.hbs.edu/podcast/felix-oberholzer-gee-on-the-frameworks-of-business-strategy
    title: Felix Oberholzer-Gee — The Frameworks of Business Strategy, Parlor Room transcript
  - id: value-stick
    resource: https://online.hbs.edu/blog/post/value-based-strategy
    title: Tim Stobierski, HBS Online — A Beginner's Guide to Value-Based Strategy
  - id: willingness
    resource: https://online.hbs.edu/blog/post/willingness-to-pay-vs-willingness-to-sell
    title: Catherine Cote, HBS Online — Willingness to Pay vs. Willingness to Sell
  - id: drivers
    resource: https://www.exed.hbs.edu/blog/best-strategies-create-value
    title: Felix Oberholzer-Gee — The Best Strategies Create Value
  - id: complements
    resource: https://online.hbs.edu/blog/post/complements-vs-substitutes
    title: Esther Han, HBS Online — Complements vs. Substitutes
  - id: playing-to-win
    resource: playing-to-win.md
    title: "Playing to Win: Lafley and Martin's approach to strategy"
  - id: cagan
    resource: cagan-product-strategy.md
    title: Marty Cagan's product strategy
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
---

# Value-based strategy: Oberholzer-Gee's approach to creating and sharing value

Felix Oberholzer-Gee's value-based strategy asks how an organization can create
more value for customers, employees, and suppliers. His argument in *Better,
Simpler Strategy* is that this question should discipline the choice of
initiatives: appealing activity is insufficient without a credible contribution
to value creation.[^interview]

This explanation is for product leaders and teams who want to distinguish
creating value from capturing it, understand the value stick, and reason about
which improvements deserve investment. It draws on Oberholzer-Gee's public
interviews and HBS explanations of his approach. His recommendations are
attributed perspectives, not a guarantee of performance. The rental examples,
numbers, and comparisons with this bundle's other approaches are illustrative
editorial reasoning.

For the customer, offering, and need behind a value claim, begin with the
[Value and demand model](../problem/value-and-demand-model.md). The account here
adds the economics of creating and sharing value.

## Strategy begins with value creation

[Northbank Equipment](../northbank-equipment.md), the fictional rental service,
could increase prices, improve reservation
reliability, introduce predictable shifts, or coordinate maintenance with its
suppliers. All might affect financial results, but through different mechanisms.
A higher price may transfer more of an existing transaction's value to the
business. More dependable equipment may make the service more valuable to a
contractor. Predictable work and easier supplier coordination may improve the
exchange for the people who make the service possible.

Oberholzer-Gee describes the customer side through **willingness to pay** and the
employee and supplier side through **willingness to sell**. They represent
thresholds for participating in an exchange, distinct from the actual payments
made.[^frameworks] This separates the question of what makes an offering or
relationship attractive from the question of how the resulting gains are shared.
Pricing is one decision within that larger strategy.

## The value stick: what is created, and who receives it

The value stick places four quantities on a common monetary scale. Its endpoints
describe the potential value of the exchange; the two interior points describe
its distribution.[^value-stick]

| Quantity | Meaning |
| --- | --- |
| Willingness to pay (WTP) | The customer's maximum payment for the specified offering, given the alternatives |
| Price (P) | The customer's actual payment |
| Cost (C) | The firm's payments for the inputs represented in the model |
| Willingness to sell (WTS) | The minimum payment that would induce those input providers to participate |

HBS applies WTS to employees as well as suppliers.[^willingness] When several
inputs are involved, the simplified stick needs a consistent aggregation of
their payments and reservation amounts. It is not the threshold of one employee
subtracted from the entire company's revenue.

```text
WTP ──┬── Customer's participation threshold
      │
      │   Customer surplus = WTP − P
      │
  P ──┼── Actual customer payment
      │
      │   Firm margin = P − C
      │
  C ──┼── Payments to the represented input providers
      │
      │   Employee/supplier surplus = C − WTS
      │
WTS ──┴── Input providers' participation threshold

Total value created = WTP − WTS
```

The diagram is schematic. In this simplified accounting, the three shares sum
to the total: `(WTP − P) + (P − C) + (C − WTS) = WTP − WTS`.
HBS calls the customer share *customer delight* and the upstream share *supplier
surplus*.[^value-stick] Those names describe economic surplus here; the diagram
does not measure happiness directly.

### A numerical example

Assume one completed rental, a defined package of inputs, and no change in
volume. The following dollar amounts are invented. The combined improvement
assumes better reliability raises customer WTP, while better working and supplier
conditions lower aggregate WTS. Actual input payments increase.

| Quantity per rental | Baseline | Price increase only | Combined improvement |
| --- | ---: | ---: | ---: |
| WTP | $150 | $150 | $180 |
| Price | $110 | $120 | $120 |
| Cost | $80 | $80 | $85 |
| WTS | $60 | $60 | $55 |
| Customer surplus | $40 | $30 | $60 |
| Firm margin | $30 | $40 | $35 |
| Employee/supplier surplus | $20 | $20 | $30 |
| Total value | $90 | $90 | $125 |

The price increase transfers $10 from the customer to the firm. The combined
improvement creates $35 more total value and, with these particular payments,
increases every party's share. That distribution is a choice, not an automatic
result of expanding the stick. The table also leaves investment, overhead,
capacity, and volume effects to a separate financial assessment; its firm margin
is not a complete profit or return-on-investment calculation.

## Three places to create value

### Customers: increase the value of the whole experience

WTP concerns the specified offering in its circumstances. HBS identifies
influences including service, expectations, competing products, and customers'
resources; a feature count alone cannot establish it.[^willingness]

For the rental service, a contractor may value a reliable early delivery because
it avoids paying an idle crew. The relevant experience includes booking,
availability, delivery, operation, substitution, and return. Improving one
screen may help, but a polished booking process followed by missing equipment
still fails the contractor's purpose. A flexible weekend renter may place much
less value on the same reliability guarantee.

### Employees: improve the exchange offered by work

Oberholzer-Gee explains WTS as the minimum compensation needed to make a job
acceptable. Job quality changes that threshold: risk and unattractive conditions
raise it; a more attractive job can lower it.[^frameworks]

Suppose a depot worker receives $200 per shift and would currently require at
least $180 to accept it. Their surplus in this simplified example is $20.
Predictable shifts and better task support might lower that threshold to $165.
Keeping actual pay at $200 increases their surplus to $35. Cutting pay to $185
without improving the job would instead leave only $5. These are different
changes, even though a narrow payroll view might favor the latter.

Lower WTS therefore does not prescribe a wage cut. It describes a better total
exchange under the example's assumptions. Whether the proposed schedule actually
helps requires employee evidence; preferences cannot be inferred from a
manager's enthusiasm for the policy.

### Suppliers: make collaboration more productive

HBS identifies working conditions and the quality of relationships as factors
that can change WTS.[^willingness] In the example, a maintenance supplier might
spend substantial time responding to incomplete fault reports, waiting for
equipment, and rearranging technicians after last-minute cancellations.

Coordinated maintenance windows and better diagnostics could reduce wasted
effort. The supplier might then serve the rental company profitably at a lower
payment while retaining more surplus. Demanding a discount for unchanged work
has a different effect: it transfers value unless something else about the
exchange changes. The distinction turns attention toward the supplier's actual
constraints and alternatives.

## How value creation can reinforce itself

In the rental example, predictable shifts could help retain experienced staff;
experienced staff could diagnose faults sooner; planned maintenance could reduce
failures and emergency callouts. That chain could improve customer experience
and lower the resources needed to deliver it. Each connection is a hypothesis:
the schedule change might be valuable to employees even if it has no detectable
effect on rental reliability.

**Complements** offer another mechanism. A complement raises the value of another
product or service. Its availability or affordability can influence customer
WTP for the focal offering.[^complements] Accessible transport, compatible
attachments, or useful operating instruction might make particular equipment
worth renting. Their strategic value may appear in the rental business even if
they produce little direct revenue themselves.

Oberholzer-Gee also discusses **network effects**: participation can make an
offering more valuable directly, or encourage complements that increase its
value.[^drivers] More customers at a single depot do not establish such an
effect. They could instead increase congestion. A rental marketplace might
benefit if more suppliers improve selection and availability, attracting more
renters in turn. The mechanism and the side receiving value need to be explicit.

## Value maps turn understanding into choices

The value stick explains the economic relationships. A **value map** identifies
the attributes that drive customer value, their relative importance, and the
company's performance against competitors. Oberholzer-Gee uses it to focus
investment on a few consequential drivers and expose where to stop investing.
The aim is a distinctive offering rather than catching up on every
attribute.[^drivers]

A fictional map for time-sensitive contractors could begin this way:

| Value driver | Hypothesized importance | Current service | Local alternative | Strategic implication to investigate |
| --- | --- | --- | --- | --- |
| Equipment arrives ready at the promised time | High | Inconsistent | Inconsistent | Potential basis for a reliability advantage |
| Replacement after a breakdown | High | Slow | Moderate | Requires fleet and response capability |
| Lowest advertised price | Medium | Moderate | Strong | A price war may undermine the reliability investment |
| Largest catalog | Low for this segment | Moderate | Strong | Consider selected equipment rather than matching breadth |

This is a qualitative illustration, not measured research or a scoring formula.
The importance column must come from the chosen segment; the performance columns
need comparative evidence. Changing the segment to flexible renters might move
price upward and rapid replacement downward. The same company could then face a
different investment choice.

The map also makes sacrifice concrete. Reliable substitution may require
limiting the catalog, holding reserves, or restricting geography. It cannot be
funded merely by declaring every driver a priority. Minimum safety and contractual
obligations remain constraints even when customers do not name them as purchase
drivers.

## Creating value, capturing value, and sustaining advantage

Holding the transaction and endpoints fixed, changing price or input payments
redistributes the available surplus. Raising WTP or lowering WTS expands the
total.[^value-stick] Outside that fixed illustration, payments can also affect
participation, quality, and future capacity. A price change is not proof that all
other quantities stayed constant.

For example, paying a maintenance supplier less might improve this month's
margin while causing it to assign fewer technicians next month. Customer WTP
could then fall as reliability deteriorates. Conversely, a higher payment might
fund dependable capacity that customers value. The relevant question is which
parts of the exchange actually change and over what period.

Advantage also depends on alternatives. Oberholzer-Gee stresses comparing value
creation with competitors and substitutes, rather than evaluating an isolated
stick.[^drivers] If every local rental provider can offer the same guarantee
at the same economics, the improvement may benefit customers without sustaining
a distinctive position. If better supplier coordination is difficult to copy,
it could help protect the service's performance. Neither outcome follows from
the diagram alone.

## Evidence, uncertainty, and the model's limits

The following implications are methodological cautions for using the model,
not additional steps claimed to come from Oberholzer-Gee's book.

WTP and WTS are not directly visible in a transaction price. Buying a rental at
$110 does not reveal whether the customer's maximum was $115 or $180. Accepting
a job at a stated salary similarly does not disclose the minimum acceptable
compensation. Interviews can reveal valued attributes and reasons; observed
choices and bounded trials can help examine behavior. Neither justifies treating
an estimated threshold as a universal constant.

Evidence needs to match the claim. Fewer failed reservations tests reliability.
Repeat bookings at a viable price inform customer choice. Staff reports about
scheduling, retention, and supplier time per maintenance job illuminate different
parts of the proposed mechanism. A change in one measure does not establish the
whole chain, and competing explanations remain possible.

Three boundaries keep the model useful:

- **Population and alternatives:** Different customers, employees, and suppliers
  have different thresholds. A segment average can hide people who are harmed
  or who would no longer participate.
- **Unit and time:** Define whether the stick concerns a rental, a contract, or
  a period. Include the relevant input package consistently. Investment costs,
  utilization, scale, and future effects need explicit treatment before drawing
  conclusions about business returns.
- **Welfare beyond the exchange:** WTP reflects ability to pay as well as
  preference. The modeled surplus does not by itself account for pollution,
  effects on nonparticipants, fairness, or rights. An attractive stick does not
  settle those judgments.

Suppose a rival opens a nearby depot with dependable pickup at a lower price.
The contractor's willingness to pay for delivery may decline because the
alternative improved. That changes the strategic judgment even if the original
service's reliability is unchanged. The example distinguishes executing an
improvement successfully from retaining its economic value over time.

## Connections and differences with other strategy approaches

Oberholzer-Gee challenges a rigid choice among cost leadership, differentiation,
and focus. He emphasizes that advantages can reinforce one another: better work
can support better service and higher customer WTP. He also assigns strategic
importance to operational effectiveness, arguing that valuable management
practices can diffuse slowly enough to support lasting advantage.[^interview]

[Strategy perspectives and their relationships](strategy-perspectives.md#value-creation-and-coherent-advantage)
compares this emphasis with Playing to Win's coherent choices and Cagan's
focused team problems.[^playing-to-win][^cagan] It owns the comparative account;
this explanation owns the value stick, its mechanisms, and its limits.
The bundle's [Where to play](../strategy/) section owns the resulting
participation, advantage, and value-capture decisions.

For the author's rationale, start with the 2021 Working Knowledge interview.
The Parlor Room transcript explains participation thresholds and job quality;
HBS marks that transcript as machine-generated. *The Best Strategies Create
Value* develops value drivers and comparative maps. The HBS Online articles
supply worked explanations of the stick, WTP/WTS, and complements. Their
occasional pricing-oriented framing is narrower than the strategy discussion
developed here.

## Follow the economics into engineering choices

Northbank might replace duplicated CI configuration or obsolete telemetry
plumbing to release engineering capacity for fulfillment work. That is a
hypothesis about the cost and opportunity of an intervention. Deleted lines
are not customer surplus, and a faster pipeline is not proof that the service
became more valuable. The [engineering-system case](../engineering/northbank-engineering-system.md)
keeps replacement evidence and observed maintenance effort separate from
Northbank's economic and demand claims.

The dollar amounts above are independent numerical exhibits under their stated
assumptions. They are not Northbank financial results or inputs to the project
budget and KPI examples elsewhere in the case.

## Continue exploring

- [Jobs to Be Done](jobs-to-be-done.md) investigates customer circumstances
  and alternatives behind a proposed value driver.
- [Outcomes and evidence](../problem/outcomes-and-evidence.md) examines the
  observed results and causal assumptions of a value hypothesis.
- The [value and evidence route](../reading-product-engineering.md#value-and-evidence)
  connects economic reasoning to product meaning and strategic choice.

[^interview]: Felix Oberholzer-Gee interviewed by Danielle Kost, [A Simple Question That Can Guide Companies to Epic Success](https://www.library.hbs.edu/working-knowledge/a-simple-question-that-can-guide-companies-to-epic-success), April 20, 2021.
[^frameworks]: Felix Oberholzer-Gee, [The Frameworks of Business Strategy](https://online.hbs.edu/podcast/felix-oberholzer-gee-on-the-frameworks-of-business-strategy), Parlor Room, December 2, 2024; HBS-provided machine-generated transcript.
[^value-stick]: Tim Stobierski, HBS Online, [A Beginner's Guide to Value-Based Strategy](https://online.hbs.edu/blog/post/value-based-strategy), November 10, 2022.
[^willingness]: Catherine Cote, HBS Online, [Willingness to Pay vs. Willingness to Sell](https://online.hbs.edu/blog/post/willingness-to-pay-vs-willingness-to-sell), December 15, 2022.
[^drivers]: Felix Oberholzer-Gee, [The Best Strategies Create Value](https://www.exed.hbs.edu/blog/best-strategies-create-value), June 30, 2025.
[^complements]: Esther Han, HBS Online, [Complements vs. Substitutes](https://online.hbs.edu/blog/post/complements-vs-substitutes), December 6, 2022.
[^playing-to-win]: [Playing to Win: Lafley and Martin's approach to strategy](playing-to-win.md), this bundle's explanation of the authors' public accounts.
[^cagan]: [Marty Cagan's product strategy](cagan-product-strategy.md), this bundle's explanation of Cagan's 2020 SVPG articles.
