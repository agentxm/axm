---
type: Checklist
title: Usability quality criteria
description: Use when assessing whether intended users can understand and operate the product to accomplish relevant goals with acceptable effort and error risk.
tags: [codebase-review, software-quality, usability, human-system-interaction, accessibility, reporting-review]
status: draft
sources:
- id: iso-25010
  resource: https://www.iso.org/standard/78176.html
  title: ISO/IEC 25010:2023 Systems and software Quality Requirements and Evaluation — Product quality model
- id: iso-25010-preview
  resource: https://www.en-standard.eu/publicdoc/iec_previews/3440529.pdf
  title: ISO/IEC 25010:2023 public preview
- id: iso-9241-11
  resource: https://www.iso.org/standard/63500.html
  title: ISO 9241-11:2018 Ergonomics of human-system interaction — Usability definitions and concepts
- id: wcag-22
  resource: https://www.w3.org/TR/WCAG22/
  title: Web Content Accessibility Guidelines 2.2
generated: { by: codex/gpt-5.6, at: 2026-09-01T17:48:27Z }
---

# Usability quality criteria

Use this list to judge whether intended users can accomplish their goals
through the product. “User” includes any person who directly operates an
interface, API, command, device, workflow, or other supported interaction; it
does not automatically include maintainers reasoning about implementation.
This is a candidate `reporting-review` checklist, not a prescribed usability
study or interface heuristic catalogue.[^iso-25010][^iso-9241-11]

Apply the shared assessment states and evidence rules in
[Reviewing a codebase](../reviewing-a-codebase.md). The pillar definition and
neighbor boundaries are in [Software quality
pillars](../software-quality-pillars.md); the typed relationships below use
[Cross-cutting concerns for software quality](../cross-cutting-concerns.md).

## Default cross-cutting relationships

`XC-01` Claim context constrains every criterion through intended users, goals,
abilities, environments, and consequences. `XC-08` Evidence must qualify every
judgment. Unless a criterion says otherwise, these list-level defaults apply:

| Concern | Default relationship to Usability |
| --- | --- |
| `XC-02` Specification | `EN·EV` — supplies accepted user, goal, interaction, accessibility, and error-risk obligations. |
| `XC-03` Structure | `(CTR·TR)` — information and interaction structure can help or impede use. |
| `XC-04` Lifecycle integrity | `(EN·TH)` — versions, configuration, and delivery can enable or impair the intended interaction. |
| `XC-05` Risk | `TH·CS·TR` — foreseeable error, exclusion, effort, and context condition the claim. |
| `XC-06` Assurance | `EN·EV` — representative human evaluation and complementary analysis can support judgments. |
| `XC-07` Feedback | `(EV·TR)` — user behavior and reported experience can reveal outcomes, while collection can affect the experience. |

## Criteria

### USE-01 — Goal effectiveness

**Outcome question:** Can intended users complete each
relevant goal accurately and completely through the product?[^iso-9241-11]

**Why it matters:** available functions do not establish usability when
users cannot turn them into a successful outcome.

**Applicability:** apply to accepted goals for each in-scope user class and
context of use. Use `Indeterminate` when those users or goals are unknown.

**Boundary:** this criterion owns success in use. Suitability owns whether
the required capability exists; Correctness owns whether product behavior
conforms to its accepted contract.

### USE-02 — Effort fitness

**Outcome question:** Can intended users achieve each relevant
goal with acceptable cognitive, physical, and temporal effort?[^iso-9241-11]

**Why it matters:** a technically achievable goal can remain practically
unusable when it imposes disproportionate user work.

**Applicability:** apply only against an intended user, goal, frequency, and
context; expertise and assistive technology can materially change the
judgment.

**Boundary:** this criterion owns human effort. Efficiency owns machine time,
capacity, resources, and cost; Evolvability owns maintainer change effort.

### USE-03 — Appropriateness recognition

**Outcome question:** Can intended users recognize
whether the product or a capability is appropriate for their current
need?[^iso-25010-preview]

**Why it matters:** users cannot choose or begin an effective interaction
when purpose, preconditions, or fit are opaque.

**Applicability:** apply where users select products, commands, operations,
options, or workflows. Autonomous behavior may make it `Not applicable` for
some surfaces.

**Boundary:** this criterion owns recognition by the user. Suitability owns
whether the capability is actually appropriate; Intelligibility owns a
maintainer's implementation model.

### USE-04 — Learnability

**Outcome question:** Can intended users reach the required level
of effective use within an acceptable learning burden?[^iso-25010-preview]

**Why it matters:** a product can be operable by experts while remaining
inaccessible to the users and frequency of use it was designed to serve.

**Applicability:** interpret the required proficiency, prior knowledge,
learning interval, and recurrence from claim context. Rare emergency use may
require retention without frequent practice.

**Boundary:** this criterion owns acquisition and retention of use knowledge.
`USE-06` owns understanding of the product's current state during use.

### USE-05 — Operability

**Outcome question:** Can intended users initiate, control, and
complete supported interactions with the required degree of agency?[^iso-25010-preview]

**Why it matters:** a visible capability is not usable when control is
unavailable, ambiguous, unexpectedly constrained, or impossible to stop.

**Applicability:** apply to the degree of control appropriate to the product;
a deliberately autonomous system need not expose manual control that its
contract excludes.

**Boundary:** this criterion owns user control. Correctness owns whether an
accepted command produces the contracted behavior; Safety can constrain
which controls may be available.

### USE-06 — Self-description

**Outcome question:** At each material interaction point, can intended users
understand the current situation well enough to choose the next
action?[^iso-25010-preview]

**Why it matters:** users cannot choose or correct actions when they must
infer hidden state or consequences from accidental cues.

**Applicability:** apply to information users need during interaction.
External manuals or support may contribute, but their existence does not
prove the product is understandable when needed.

**Boundary:** this criterion owns in-use explanation. Feedback owns the
engineering system's learning signals; Intelligibility owns maintainer
comprehension of the product's internals.

### USE-07 — Error protection

**Outcome question:** Does the product keep reasonably
foreseeable user mistakes from producing an unintended outcome beyond the
declared tolerance?[^iso-25010-preview]

**Why it matters:** ambiguous, irreversible, or easily confused interactions
can turn predictable human error into avoidable loss.

**Applicability:** apply to foreseeable mistakes for the intended users and
context, not every imaginable misuse. Consequence determines the required
strength of protection.

**Boundary:** this criterion owns prevention and containment of user error.
`USE-08` owns recovery after an error; Safety owns unacceptable harm and
Security owns adversarial misuse.

### USE-08 — Error recovery

**Outcome question:** After a declared recoverable interaction error, can
intended users resume the intended goal within its accepted recovery
tolerance?[^iso-25010-preview]

**Why it matters:** an error message or undo control is insufficient when it
does not restore the user's ability to complete the goal.

**Applicability:** apply where the product declares an error recoverable by
the user. Irreversible operations require protection and explicit consequence
rather than a fictional recovery path.

**Boundary:** this criterion owns recovery of the user's interaction.
Reliability owns restoration of product service or state after disruption;
Correctness owns failure semantics.

### USE-09 — Accessibility

**Outcome question:** Can intended users with relevant permanent,
temporary, or situational disabilities achieve their goals through supported
access modes and technologies?[^wcag-22]

**Why it matters:** a product that excludes part of its intended user
population does not achieve its usability outcome for that population.

**Applicability:** scope the abilities, technologies, content, devices, and
environments relevant to the product. WCAG is authoritative for web content
but is not a universal conformance proxy for every software surface.

**Boundary:** this criterion owns access in use. Compatibility owns technical
interoperation with assistive technology; Suitability owns whether required
accommodations exist in the capability set.

### USE-10 — Assistance fitness

**Outcome question:** Can intended users obtain the guidance needed to continue
an in-scope task when unaided use is insufficient?[^iso-25010-preview]

**Why it matters:** users can become blocked even when the ordinary interaction
is self-describing, especially during unfamiliar, infrequent, or exceptional
work.

**Applicability:** apply where intended users may need contextual guidance,
reference, explanation, escalation, or another supported source of assistance.
The appropriate form depends on the user and consequence.

**Boundary:** this criterion owns access to task-continuation guidance.
`USE-06` owns understanding of the current interaction; `USE-04` owns acquired
competence over time.

Completion means every applicable criterion has one assessment state and a
claim-bound record under [Reviewing a codebase](../reviewing-a-codebase.md).
Repository inspection alone will commonly leave some usability criteria
`Indeterminate`; completion is not a usability certification.

[^iso-25010]: ISO, [ISO/IEC 25010:2023 product quality model](https://www.iso.org/standard/78176.html).
[^iso-25010-preview]: ISO/IEC, [ISO/IEC 25010:2023 public preview](https://www.en-standard.eu/publicdoc/iec_previews/3440529.pdf).
[^iso-9241-11]: ISO, [ISO 9241-11:2018 usability definitions and concepts](https://www.iso.org/standard/63500.html).
[^wcag-22]: W3C, [Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/).
