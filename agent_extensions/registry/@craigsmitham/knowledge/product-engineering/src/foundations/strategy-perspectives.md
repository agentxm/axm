---
type: Explanation
title: Strategy perspectives and their relationships
description: How value-based strategy, Playing to Win, Wardley mapping, Cagan's product strategy, and Drucker's business assumptions and renewal disciplines inform different strategic questions, where they overlap, and why their answers remain distinct.
tags: [strategy, comparison, value-creation, strategic-choice, product-strategy, evolution, organizational-renewal, pe-foundations]
status: draft
sources:
  - id: value
    resource: value-based-strategy.md
    title: "Value-based strategy: Oberholzer-Gee's approach to creating and sharing value"
  - id: choices
    resource: playing-to-win.md
    title: "Playing to Win: Lafley and Martin's approach to strategy"
  - id: landscape
    resource: wardley-mapping/wardley-mapping.md
    title: Wardley mapping
  - id: product
    resource: cagan-product-strategy.md
    title: Marty Cagan's product strategy
  - id: theory
    resource: drucker-theory-of-the-business.md
    title: Drucker's theory of the business
  - id: renewal
    resource: drucker-organizational-renewal.md
    title: Drucker's four disciplines of organizational renewal
generated:
  by: codex/gpt-6
  at: 2026-09-09T15:55:58Z
---

# Strategy perspectives and their relationships

A product team can understand a customer's problem and still lack a reason to
invest in solving it. It can choose an attractive market and still lack the
capabilities to serve it. It can improve an existing offering while missing a
change that undermines its future. The strategy foundations examine different
parts of those judgments.

This explanation compares the accounts already developed in this bundle. The
relationships and rental example are editorial synthesis, not a combined method
claimed by the original authors. Each linked explainer owns its detailed
account and source basis; this document owns the comparison among them.

## Choose the question that remains open

| Perspective | Question it brings into focus | What its answer leaves to establish |
| --- | --- | --- |
| [Value-based strategy](value-based-strategy.md) | How could the exchange create more value for customers, employees, and suppliers, and how is that value shared? | Whether the proposed arena, capabilities, and competitive position form a sustainable strategy |
| [Playing to Win](playing-to-win.md) | Which choices of aspiration, arena, advantage, capabilities, and systems reinforce one another? | Evidence for the value, feasibility, and durability assumed by those choices |
| [Wardley mapping](wardley-mapping/wardley-mapping.md) | Which needs and dependencies shape the landscape, how are components evolving, and what moves fit the situation? | Whether a particular move creates sufficient value and can be executed responsibly |
| [Marty Cagan's product strategy](cagan-product-strategy.md) | Which team problems deserve focused effort, why, and how does management support progress and learning? | Whether solving those problems establishes the assumed business advantage and economics |
| [Drucker's theory of the business](drucker-theory-of-the-business.md) | Which assumptions about environment, mission, and core competencies make the organization's activities meaningful? | Whether those assumptions still fit reality and which commitments should change when they do not |
| [Drucker's renewal disciplines](drucker-organizational-renewal.md) | What should we stop, improve, extend, and create to sustain present performance and future possibilities? | Which specific commitments deserve resources, and how changes affect those who depend on existing arrangements |

The table selects an emphasis from each account; it does not define exclusive
territories for the authors. Value-based strategy also concerns competitive
choices, Playing to Win includes management systems, Wardley includes doctrine
and action, and Cagan includes insight and strategic revision. Drucker's
responsibilities concern institutions more broadly than software
products.[^value][^choices][^landscape][^product][^theory][^renewal]

## Follow one decision through several perspectives

Consider [Northbank Equipment](../northbank-equipment.md), the fictional rental
service used across the bundle.
Contractors need dependable equipment; a missed delivery can leave a crew idle.
Suppose the company is considering a more reliable reservation service. The
following questions can be investigated in any order and revisited together.

**Value:** Avoiding idle time may increase customer willingness to pay.
Predictable scheduling and coordinated maintenance may also improve the
exchange for staff and suppliers. The value stick separates expanding total
value from reallocating existing surplus. Investment, volume, and full service
costs still require assessment.[^value]

**Choice:** Serving time-sensitive contractors with reliable fulfillment
implies a different combination of fleet, delivery coverage, reserves, and
management systems from serving flexible renters at a low price. Both could
pursue repeat rentals, but the shared metric does not make their choices
equivalent. Playing to Win tests the coherence of the whole combination and
the conditions that would have to hold.[^choices]

**Landscape:** A reliability promise depends on allocation, scheduling, fleet
records, and provision beneath them. Some components may have standardized
alternatives while others remain uncertain. Wardley mapping makes those
differences and potential changes discussable; an evolution position does not
by itself settle a sourcing decision or establish advantage.[^landscape]

**Team focus:** Leaders might concentrate effort on failed first reservations
and give a team room to investigate inventory freshness, holds, substitution,
or confirmation. Cagan's account connects that focus to insight and continuing
management. Assigning a problem preserves a question that a predetermined
feature would close too early.[^product]

**Business assumptions:** The reservation investment assumes contractors can
turn dependable equipment access into productive work. If access increasingly
leaves them without an operator, the company needs to examine whether its
service promise and capabilities still support a worthwhile contribution. The
theory explainer follows this changed circumstance through a product
decision.[^theory]

**Renewal:** The company can reconsider an unproductive service, improve
current fulfillment, extend a successful depot practice, and pilot a new
offering. Drucker's disciplines distinguish these responsibilities without
requiring one to wait for the others. They do not supply a formula for dividing
the budget among them.[^renewal]

This example connects the explanations without making one diagram or artifact
the authority for every decision. For instance, a bounded context describes
model meaning; it is not the same unit as a value driver or an evolution stage.
[Domain-driven design](domain-driven-design.md#strategic-design-subdomains-and-classification)
develops that additional perspective on strategic importance and models.

## Preserve the differences that matter

### Value creation and coherent advantage

Oberholzer-Gee emphasizes reinforcing advantages and the strategic potential of
operational effectiveness. Improving work can support better service and
increase customer value; slowly diffusing management practices may contribute
to lasting advantage.[^value] Playing to Win develops a paired choice of arena
and advantage, supported by capabilities and systems.[^choices]

The value stick helps examine the economics of a proposed advantage. The choice
cascade helps examine whether the commitments supporting it fit together.
Neither conclusion follows from the other: a larger modeled surplus does not
prove a defensible position, and labeling an advantage does not quantify the
value it creates. Using both perspectives should preserve their different
emphases on advantage rather than conceal them behind shared terminology.

### Strategic context and team problems

Playing to Win and Cagan both connect choices, management, and learning.
Cagan's focus on team problems does not make product strategy merely the
execution of a completed business strategy.[^choices][^product] Learning that
reliable fulfillment is unaffordable can challenge the chosen advantage;
discovering a new customer circumstance can suggest a different arena.

In this bundle, [Where to play](../strategy/) owns participation and advantage,
while [What to solve](../problem/) owns problem and outcome evidence. Those
boundaries keep the questions distinguishable without requiring sequential
handoffs. Cagan's term *product delivery* spans concerns the bundle divides
between engineering and delivery; adopting his perspective does not rename
those sections.

### Business assumptions and renewal

[Drucker's theory of the business](drucker-theory-of-the-business.md) examines
assumptions about environment, mission, and core competencies. Those assumptions
explain why an organization's activities should contribute to its purpose and
require continuing examination.[^theory] His renewal disciplines distinguish
responsibilities for stopping, improving, extending, and creating.[^renewal]

These are related questions with different answers. If contractors begin
choosing operated services, the rental company's customer and competency
assumptions need examination. That evidence does not dictate whether it should
change its mission, retain its equipment-only focus, or explore a partnership.
The renewal disciplines help distinguish the possible responses; they do not
validate the assumptions behind a response.

Playing to Win also examines assumptions, with attention to the conditions
supporting a particular combination of choices.[^choices] Questioning whether
customers still want equipment access can reopen the arena and advantage
choices as well as the required capabilities. Renewal can generate evidence
too: a completion-service pilot might reveal demand that the current rental
mission leaves unserved. These relationships are this bundle's synthesis.

### Evolution and renewal

Wardley mapping examines evolution in a landscape, including changing provision
and inertia.[^landscape] Drucker distinguishes institutional responsibilities
for stopping, improving, extending, and creating.[^renewal] An evolution stage
does not assign an activity to one renewal discipline: a mature component may
still need improvement, and an established organization may innovate using
standardized provision.

[Maintenance](../maintenance/maintenance-and-the-life-of-software-products.md)
adds the responsibilities and situated knowledge involved in changing an
existing product. An investment argument alone does not settle how to care for
people who rely on the current service or how to end a commitment responsibly.

## Follow the investment into the engineering system

Northbank's [allocation change](../engineering/northbank-allocation-change.md)
connects a distinctive promise to owned rules, data, code, and verification.
Its [engineering-system change](../engineering/northbank-engineering-system.md)
examines tooling, CI/CD, infrastructure, and retirement. Those episodes need
separate decisions even though they contribute to the same offering.

A component's strategic role does not establish its evolution stage, a package
boundary, or an allowed import. A standard fleet product can support a custom
substitution policy. A useful custom adapter can survive a simplification.
Maps and classifications inform those decisions; behavior, migration, cost,
and operating evidence determine whether the particular intervention works.

## Let evidence reopen the right question

If reservations still fail, investigate the behavior and capabilities behind
the promise. If reliability improves but repeat use does not, revisit the
customer and value hypotheses. If customers return but the service loses money,
revisit the economics. If competitors match the service, reconsider the
relative advantage and landscape. These are interpretations of the illustrative
case, not diagnostic rules that identify a cause from a metric alone.

Read [Jobs to Be Done](jobs-to-be-done.md) when customer progress and alternatives
need investigation. Read [Outcomes and evidence](../problem/outcomes-and-evidence.md)
to distinguish observed results from the causal story attached to them. Neither
customer research nor a passing behavioral test settles all the strategic
questions in the table.

For a path through the individual explanations, follow the
[strategic choices reading route](../reading-product-engineering.md#strategic-choices).
For the move from a selected problem to behavior and evidence, continue with
[behavior and commitment](../reading-product-engineering.md#behavior-and-commitment).

[^value]: Value-based strategy: Oberholzer-Gee's approach to creating and sharing value, this bundle's explanation of his interviews and HBS accounts.
[^choices]: Playing to Win: Lafley and Martin's approach to strategy, this bundle's explanation of their public accounts.
[^landscape]: Wardley mapping, this bundle's explanation of the December 2020 book compilation.
[^product]: Marty Cagan's product strategy, this bundle's explanation of the 2020 SVPG articles.
[^renewal]: Drucker's four disciplines of organizational renewal, this bundle's explanation and source basis.
[^theory]: Drucker's theory of the business, this bundle's explanation of the 1994 article and Drucker Institute account.
